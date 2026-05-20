// =============================================================================
// internal/server/server.go — HTTP Server & Router
// =============================================================================
//
// This package builds the HTTP server, registers all middleware,
// and mounts all feature module routes.
//
// The key design decision here is the MODULE REGISTRATION PATTERN:
// Each feature module (auth, metrics, terminal, etc.) will eventually
// have its own Handler struct with a Routes() method.
// The server just calls handler.Routes(r) for each module.
// Adding a new feature = create its handler, add one line here.
// This makes the server file stay small forever.
package server

import (
	"archive/tar"
	"compress/gzip"
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/nanofly/nanofly/internal/api/activity"
	"github.com/nanofly/nanofly/internal/api/docker"
	"github.com/nanofly/nanofly/internal/api/domains"
	"github.com/nanofly/nanofly/internal/api/files"
	"github.com/nanofly/nanofly/internal/api/projects"
	"github.com/nanofly/nanofly/internal/api/services"
	"github.com/nanofly/nanofly/internal/api/systemd"
	"github.com/nanofly/nanofly/internal/api/terminal"
	"github.com/nanofly/nanofly/internal/auth"
	"github.com/nanofly/nanofly/internal/config"
	"github.com/nanofly/nanofly/internal/db"
	"github.com/nanofly/nanofly/internal/metrics"
	"github.com/nanofly/nanofly/internal/proxy"
	"github.com/nanofly/nanofly/internal/response"
)

// Server holds the HTTP server and all module dependencies.
type Server struct {
	cfg          *config.Config
	db           *db.DB
	router       *chi.Mux
	httpSrv      *http.Server
	proxySrv     *proxy.Server
	authSvc      *auth.Service
	dockerMgr    *docker.Manager
	serviceMgr   *services.Manager
	updateStatus string // idle | pull | build_front | build_back | done | error
	updateLog    string
	updateMu     sync.Mutex
	backupMu     sync.Mutex
	backupLast   string
}

// New builds the server and wires all modules.
func New(cfg *config.Config, database *db.DB) (*Server, error) {
	s := &Server{
		cfg:          cfg,
		db:           database,
		updateStatus: "idle",
	}

	s.authSvc = auth.NewService(database, cfg.SecretKey)

	// Try to connect Docker (fails gracefully on Windows or if Docker not running)
	if dm, err := docker.New(); err == nil {
		s.dockerMgr = dm
	}
	s.serviceMgr = services.New(database, s.dockerMgr)

	// Build the router
	s.router = s.buildRouter()

	s.httpSrv = &http.Server{
		Addr:         fmt.Sprintf(":%d", cfg.Port),
		Handler:      s.router,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Start the domain reverse proxy on port 80 (non-blocking, best-effort)
	s.proxySrv = proxy.New(database.DB)
	go s.proxySrv.Start()
	go s.backupScheduler()

	return s, nil
}

func (s *Server) buildRouter() *chi.Mux {
	r := chi.NewRouter()

	// ── Global middleware ──────────────────────────────────────────────────
	r.Use(middleware.RequestID)
	r.Use(middleware.RealIP)
	r.Use(middleware.Logger)
	r.Use(middleware.Recoverer)
	r.Use(corsMiddleware)

	// ── Public endpoints ───────────────────────────────────────────────────
	r.Get("/health", s.handleHealth)
	r.Get("/api/setup/status", s.handleSetupStatus)
	r.Post("/api/setup/init", s.handleSetupInit)

	// ── Auth routes (public) ─────────────────────────────────────────────────
	authHandler := auth.NewHandler(s.authSvc)
	r.Mount("/api/v1/auth", authHandler.Routes())

	// ── Public webhook (GitHub push events) ──────────────────────────────────
	r.Post("/api/webhooks/{serviceID}", s.handleWebhook)

	// ── Protected API routes ───────────────────────────────────────────────
	r.Route("/api/v1", func(r chi.Router) {
		r.Use(s.authSvc.RequireAuth)

		// Metrics
		metricsHandler := metrics.NewHandler()
		r.Mount("/metrics", metricsHandler.Routes())

		// Projects CRUD
		projSvc := projects.NewService(s.db)
		projHandler := projects.NewHandler(projSvc)
		r.Route("/projects", func(r chi.Router) {
			projHandler.RegisterRoutes(r)
		})

		// Services (apps + databases within projects)
		svcHandler := services.NewHandler(s.serviceMgr)
		svcHandler.RegisterRoutes(r)

		// Terminal WebSocket
		r.Get("/terminal/ws", terminal.WS)
		r.Get("/terminal/status", s.handleTerminalStatus)

		// Systemd services (real)
		systemdHandler := systemd.NewHandler()
		systemdHandler.RegisterRoutes(r)

		// Domains CRUD
		domainHandler := domains.NewHandler(s.db.DB)
		domainHandler.RegisterRoutes(r)

		// Activity log
		activityHandler := activity.NewHandler(s.db.DB)
		activityHandler.RegisterRoutes(r)

		// File Manager
		fileHandler := files.NewHandler()
		r.Route("/files", func(r chi.Router) {
			fileHandler.RegisterRoutes(r)
		})

		// Panel updates
		r.Get("/settings", s.handleSettingsGet)
		r.Put("/settings", s.handleSettingsSave)
		r.Get("/settings/update/check", s.handleUpdateCheck)
		r.Post("/settings/update/apply", s.handleUpdateApply)
		r.Get("/settings/update/log", s.handleUpdateLog)
		r.Get("/settings/backups", s.handleBackupsList)
		r.Post("/settings/backups", s.handleBackupCreate)
		r.Get("/settings/backups/{name}/download", s.handleBackupDownload)
		r.Delete("/settings/backups/{name}", s.handleBackupDelete)
	})

	// ── SPA Static File Server ──────────────────────────────────────────────
	// Serve the pre-built React frontend from web/dist/.
	// Any route that doesn't match an API endpoint falls through to the SPA.
	distPath := "web/dist"
	if _, err := os.Stat(distPath); err == nil {
		fileServer := http.FileServer(http.Dir(distPath))
		r.Get("/*", func(w http.ResponseWriter, req *http.Request) {
			// If the requested file exists, serve it (JS, CSS, images, etc.)
			filePath := distPath + req.URL.Path
			if info, err := os.Stat(filePath); err == nil && !info.IsDir() {
				fileServer.ServeHTTP(w, req)
				return
			}
			// Otherwise, serve index.html for client-side routing (SPA fallback)
			http.ServeFile(w, req, distPath+"/index.html")
		})
		slog.Info("serving frontend from web/dist/")
	} else {
		slog.Warn("web/dist/ not found — frontend will not be served (use Vite dev server)")
	}

	return r
}

type serviceResource struct {
	ID        string `json:"id"`
	ProjectID string `json:"project_id"`
	Name      string `json:"name"`
	Type      string `json:"type"`
	Status    string `json:"status"`
	Port      *int   `json:"port,omitempty"`
	CreatedAt string `json:"created_at"`
	UpdatedAt string `json:"updated_at"`
}

type serviceRequest struct {
	ProjectID string `json:"project_id"`
	Name      string `json:"name"`
	Status    string `json:"status"`
	Port      *int   `json:"port"`
}

func (s *Server) registerServiceRoutes(r chi.Router, serviceType string) {
	r.Get("/", func(w http.ResponseWriter, r *http.Request) {
		services, err := s.listServices(r.Context(), serviceType)
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to list services")
			return
		}
		response.JSON(w, http.StatusOK, services)
	})

	r.Post("/", func(w http.ResponseWriter, r *http.Request) {
		var req serviceRequest
		if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
			response.Error(w, http.StatusBadRequest, "invalid JSON")
			return
		}
		if req.ProjectID == "" || req.Name == "" {
			response.Error(w, http.StatusBadRequest, "project_id and name are required")
			return
		}
		if req.Status == "" {
			req.Status = "stopped"
		}

		service, err := s.createService(r.Context(), serviceType, req)
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to create service")
			return
		}
		response.JSON(w, http.StatusCreated, service)
	})

	r.Get("/{id}", func(w http.ResponseWriter, r *http.Request) {
		service, err := s.getService(r.Context(), chi.URLParam(r, "id"), serviceType)
		if err != nil {
			if err == sql.ErrNoRows {
				response.Error(w, http.StatusNotFound, "service not found")
				return
			}
			response.Error(w, http.StatusInternalServerError, "failed to fetch service")
			return
		}
		response.JSON(w, http.StatusOK, service)
	})

	r.Delete("/{id}", func(w http.ResponseWriter, r *http.Request) {
		if err := s.deleteService(r.Context(), chi.URLParam(r, "id"), serviceType); err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to delete service")
			return
		}
		response.NoContent(w)
	})
}

func (s *Server) listServices(ctx context.Context, serviceType string) ([]serviceResource, error) {
	rows, err := s.db.QueryContext(ctx, `
		SELECT id, project_id, name, type, status, port, created_at, updated_at
		FROM services
		WHERE type = ?
		ORDER BY created_at DESC`, serviceType)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	services := make([]serviceResource, 0)
	for rows.Next() {
		service, err := scanService(rows)
		if err != nil {
			return nil, err
		}
		services = append(services, service)
	}
	return services, rows.Err()
}

func (s *Server) createService(ctx context.Context, serviceType string, req serviceRequest) (*serviceResource, error) {
	var port any
	if req.Port != nil {
		port = *req.Port
	}

	row := s.db.QueryRowContext(ctx, `
		INSERT INTO services (project_id, name, type, status, port)
		VALUES (?, ?, ?, ?, ?)
		RETURNING id, project_id, name, type, status, port, created_at, updated_at`,
		req.ProjectID, req.Name, serviceType, req.Status, port)

	service, err := scanService(row)
	if err != nil {
		return nil, err
	}
	return &service, nil
}

func (s *Server) getService(ctx context.Context, id, serviceType string) (*serviceResource, error) {
	row := s.db.QueryRowContext(ctx, `
		SELECT id, project_id, name, type, status, port, created_at, updated_at
		FROM services
		WHERE id = ? AND type = ?`, id, serviceType)

	service, err := scanService(row)
	if err != nil {
		return nil, err
	}
	return &service, nil
}

func (s *Server) deleteService(ctx context.Context, id, serviceType string) error {
	_, err := s.db.ExecContext(ctx, "DELETE FROM services WHERE id = ? AND type = ?", id, serviceType)
	return err
}

type rowScanner interface {
	Scan(dest ...any) error
}

func scanService(row rowScanner) (serviceResource, error) {
	var service serviceResource
	var port sql.NullInt64
	if err := row.Scan(
		&service.ID,
		&service.ProjectID,
		&service.Name,
		&service.Type,
		&service.Status,
		&port,
		&service.CreatedAt,
		&service.UpdatedAt,
	); err != nil {
		return service, err
	}
	if port.Valid {
		value := int(port.Int64)
		service.Port = &value
	}
	return service, nil
}

type domainResource struct {
	ID        string `json:"id"`
	ServiceID string `json:"service_id"`
	Domain    string `json:"domain"`
	TLSStatus string `json:"tls_status"`
	CreatedAt string `json:"created_at"`
}

type domainRequest struct {
	ServiceID string `json:"service_id"`
	Domain    string `json:"domain"`
	TLSStatus string `json:"tls_status"`
}

func (s *Server) registerDomainRoutes(r chi.Router) {
	r.Get("/", s.listDomains)
	r.Post("/", s.createDomain)
	r.Get("/{id}", s.getDomain)
	r.Delete("/{id}", s.deleteDomain)
}

func (s *Server) listDomains(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(), `
		SELECT id, service_id, domain, tls_status, created_at
		FROM domains
		ORDER BY created_at DESC`)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to list domains")
		return
	}
	defer rows.Close()

	domains := make([]domainResource, 0)
	for rows.Next() {
		domain, err := scanDomain(rows)
		if err != nil {
			response.Error(w, http.StatusInternalServerError, "failed to read domains")
			return
		}
		domains = append(domains, domain)
	}
	if err := rows.Err(); err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to read domains")
		return
	}
	response.JSON(w, http.StatusOK, domains)
}

func (s *Server) createDomain(w http.ResponseWriter, r *http.Request) {
	var req domainRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON")
		return
	}
	if req.ServiceID == "" || req.Domain == "" {
		response.Error(w, http.StatusBadRequest, "service_id and domain are required")
		return
	}
	if req.TLSStatus == "" {
		req.TLSStatus = "pending"
	}

	row := s.db.QueryRowContext(r.Context(), `
		INSERT INTO domains (service_id, domain, tls_status)
		VALUES (?, ?, ?)
		RETURNING id, service_id, domain, tls_status, created_at`,
		req.ServiceID, req.Domain, req.TLSStatus)

	domain, err := scanDomain(row)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to create domain")
		return
	}
	response.JSON(w, http.StatusCreated, domain)
}

func (s *Server) getDomain(w http.ResponseWriter, r *http.Request) {
	row := s.db.QueryRowContext(r.Context(), `
		SELECT id, service_id, domain, tls_status, created_at
		FROM domains
		WHERE id = ?`, chi.URLParam(r, "id"))

	domain, err := scanDomain(row)
	if err != nil {
		if err == sql.ErrNoRows {
			response.Error(w, http.StatusNotFound, "domain not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, "failed to fetch domain")
		return
	}
	response.JSON(w, http.StatusOK, domain)
}

func (s *Server) deleteDomain(w http.ResponseWriter, r *http.Request) {
	if _, err := s.db.ExecContext(r.Context(), "DELETE FROM domains WHERE id = ?", chi.URLParam(r, "id")); err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to delete domain")
		return
	}
	response.NoContent(w)
}

func scanDomain(row rowScanner) (domainResource, error) {
	var domain domainResource
	err := row.Scan(&domain.ID, &domain.ServiceID, &domain.Domain, &domain.TLSStatus, &domain.CreatedAt)
	return domain, err
}

func (s *Server) handleTerminalStatus(w http.ResponseWriter, r *http.Request) {
	shell := "/bin/sh"
	if runtime.GOOS == "windows" {
		shell = "powershell.exe"
	}
	response.Success(w, map[string]any{
		"available":  runtime.GOOS != "windows",
		"shell":      shell,
		"os":         runtime.GOOS,
		"home":       "/",
		"containers": terminal.Containers(),
	})
}

// POST /api/webhooks/{serviceID} — GitHub push webhook, triggers redeploy
func (s *Server) handleWebhook(w http.ResponseWriter, r *http.Request) {
	serviceID := chi.URLParam(r, "serviceID")
	if err := s.serviceMgr.HandleWebhook(r.Context(), serviceID, r.Body); err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, map[string]string{"status": "deployment triggered"})
}

// ── Setup Wizard ──────────────────────────────────────────────────────────────

type setupInitRequest struct {
	Email    string `json:"email"`
	Name     string `json:"name"`
	Password string `json:"password"`
}

// GET /api/setup/status
func (s *Server) handleSetupStatus(w http.ResponseWriter, r *http.Request) {
	isFirst, err := s.db.IsFirstRun()
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "database error")
		return
	}
	response.Success(w, map[string]bool{"setup_complete": !isFirst})
}

// POST /api/setup/init — create the first admin account (only once)
func (s *Server) handleSetupInit(w http.ResponseWriter, r *http.Request) {
	var req setupInitRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON")
		return
	}

	if req.Email == "" || req.Password == "" {
		response.Error(w, http.StatusBadRequest, "email and password are required")
		return
	}
	if req.Name == "" {
		req.Name = "Admin"
	}

	user, err := s.authSvc.CreateAdminUser(req.Email, req.Name, req.Password)
	if err != nil {
		response.Error(w, http.StatusBadRequest, err.Error())
		return
	}

	// Auto-login: return a token so the wizard can redirect immediately
	token, err := s.authSvc.GenerateToken(user)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "could not create session")
		return
	}

	response.Created(w, map[string]any{
		"message": "Setup complete! Welcome to NanoFly.",
		"token":   token,
		"user": map[string]string{
			"id":    user.ID,
			"email": user.Email,
			"name":  user.Name,
			"role":  user.Role,
		},
	})
}

// ── Health ────────────────────────────────────────────────────────────────────

// GET /health
func (s *Server) handleHealth(w http.ResponseWriter, r *http.Request) {
	response.Success(w, map[string]any{
		"status":  "ok",
		"version": s.getCurrentVersion(),
		"name":    "NanoFly",
	})
}

// ── CORS ──────────────────────────────────────────────────────────────────────

func corsMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Access-Control-Allow-Origin", "*")
		w.Header().Set("Access-Control-Allow-Methods", "GET, POST, PUT, PATCH, DELETE, OPTIONS")
		w.Header().Set("Access-Control-Allow-Headers", "Content-Type, Authorization")

		if r.Method == http.MethodOptions {
			w.WriteHeader(http.StatusNoContent)
			return
		}
		next.ServeHTTP(w, r)
	})
}

// ── Lifecycle ─────────────────────────────────────────────────────────────────

// Start begins listening (blocks until Stop() is called).
func (s *Server) Start() error {
	return s.httpSrv.ListenAndServe()
}

// Stop gracefully shuts down the server.
func (s *Server) Stop(ctx context.Context) error {
	if s.proxySrv != nil {
		s.proxySrv.Stop(ctx)
	}
	return s.httpSrv.Shutdown(ctx)
}

// ── Panel Updates ─────────────────────────────────────────────────────────────

const (
	githubRepo = "tamalmaity-dev/nanofly"
	// Use /releases (list) instead of /releases/latest so pre-release builds
	// (e.g. v0.3.0-beta) are also visible. We pick the first result which is
	// always the most-recently published release.
	githubReleases = "https://api.github.com/repos/" + githubRepo + "/releases?per_page=1"
)

type ghReleaseJSON struct {
	TagName    string `json:"tag_name"`
	Body       string `json:"body"`
	Prerelease bool   `json:"prerelease"`
	Assets     []struct {
		Name               string `json:"name"`
		BrowserDownloadURL string `json:"browser_download_url"`
	} `json:"assets"`
	PublishedAt string `json:"published_at"`
}

// parseSemver turns "v0.3.0-beta" → [0, 3, 0] (ignores pre-release suffix for ordering).
func parseSemver(v string) [3]int {
	v = strings.TrimPrefix(v, "v")
	// Strip pre-release suffix (anything after "-")
	if idx := strings.IndexByte(v, '-'); idx >= 0 {
		v = v[:idx]
	}
	var major, minor, patch int
	parts := strings.SplitN(v, ".", 3)
	if len(parts) > 0 {
		fmt.Sscanf(parts[0], "%d", &major)
	}
	if len(parts) > 1 {
		fmt.Sscanf(parts[1], "%d", &minor)
	}
	if len(parts) > 2 {
		fmt.Sscanf(parts[2], "%d", &patch)
	}
	return [3]int{major, minor, patch}
}

// semverGt returns true when a > b numerically.
func semverGt(a, b string) bool {
	av, bv := parseSemver(a), parseSemver(b)
	for i := 0; i < 3; i++ {
		if av[i] > bv[i] {
			return true
		}
		if av[i] < bv[i] {
			return false
		}
	}
	return false
}

func (s *Server) handleUpdateCheck(w http.ResponseWriter, r *http.Request) {
	currentVersion := s.getCurrentVersion()

	client := &http.Client{Timeout: 10 * time.Second}
	req, _ := http.NewRequestWithContext(r.Context(), "GET", githubReleases, nil)
	req.Header.Set("User-Agent", "NanoFly-Update-Checker")

	resp, err := client.Do(req)
	if err != nil {
		response.Success(w, map[string]any{
			"current_version": currentVersion,
			"latest_version":  currentVersion,
			"has_update":      false,
			"message":         "Unable to reach GitHub — check your internet connection",
		})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		response.Success(w, map[string]any{
			"current_version": currentVersion,
			"latest_version":  currentVersion,
			"has_update":      false,
			"message":         fmt.Sprintf("GitHub returned status %d", resp.StatusCode),
		})
		return
	}

	// GitHub returns a JSON array; we requested only 1 entry.
	var releases []ghReleaseJSON
	if err := json.NewDecoder(resp.Body).Decode(&releases); err != nil || len(releases) == 0 {
		response.Success(w, map[string]any{
			"current_version": currentVersion,
			"latest_version":  currentVersion,
			"has_update":      false,
			"message":         "No releases found on GitHub",
		})
		return
	}

	latest := releases[0]

	// has_update = latest tag is semantically newer than what we're running.
	hasUpdate := latest.TagName != "" && semverGt(latest.TagName, currentVersion)

	response.Success(w, map[string]any{
		"current_version": currentVersion,
		"latest_version":  latest.TagName,
		"has_update":      hasUpdate,
		"prerelease":      latest.Prerelease,
		"message":         latest.Body,
		"published_at":    latest.PublishedAt,
	})
}

// BuildVersion is set at startup by main via server.BuildVersion = Version.
// This lets -ldflags="-X main.Version=..." flow through to the server layer.
var BuildVersion string

func (s *Server) getCurrentVersion() string {
	// 1. Build-time ldflags version (highest priority — set by GitHub Actions)
	if BuildVersion != "" && BuildVersion != "dev" {
		return BuildVersion
	}
	// 2. Check for a VERSION file (written by installer or committed to repo)
	if data, err := os.ReadFile("VERSION"); err == nil {
		if v := strings.TrimSpace(string(data)); v != "" {
			return v
		}
	}
	// 3. Try exact git tag
	cmd := exec.Command("git", "describe", "--tags", "--exact-match")
	if out, err := cmd.Output(); err == nil {
		return strings.TrimSpace(string(out))
	}
	// 4. Fall back to git short SHA so it's always meaningful
	cmd = exec.Command("git", "rev-parse", "--short", "HEAD")
	if out, err := cmd.Output(); err == nil {
		return "dev-" + strings.TrimSpace(string(out))
	}
	return "dev"
}

func (s *Server) handleUpdateLog(w http.ResponseWriter, r *http.Request) {
	s.updateMu.Lock()
	defer s.updateMu.Unlock()
	response.Success(w, map[string]any{
		"status": s.updateStatus,
		"log":    s.updateLog,
	})
}

func (s *Server) handleSettingsGet(w http.ResponseWriter, r *http.Request) {
	rows, err := s.db.QueryContext(r.Context(), "SELECT key, value FROM settings")
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to load settings")
		return
	}
	defer rows.Close()
	settings := defaultSettings()
	for rows.Next() {
		var key, value string
		if err := rows.Scan(&key, &value); err == nil {
			settings[key] = value
		}
	}
	response.Success(w, settings)
}

func (s *Server) handleSettingsSave(w http.ResponseWriter, r *http.Request) {
	var settings map[string]string
	if err := json.NewDecoder(r.Body).Decode(&settings); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid settings payload")
		return
	}
	if err := s.saveSettings(r.Context(), settings); err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to save settings")
		return
	}
	response.Success(w, map[string]string{"status": "saved"})
}

func defaultSettings() map[string]string {
	return map[string]string{
		"panel.name":                  "NanoFly Panel",
		"panel.url":                   "",
		"security.session_duration":   "24h",
		"security.require_https":      "true",
		"security.rate_limit":         "true",
		"notifications.smtp_host":     "",
		"notifications.smtp_port":     "587",
		"notifications.smtp_user":     "",
		"notifications.smtp_pass":     "",
		"notifications.deploy_failed": "true",
		"notifications.high_cpu":      "false",
		"notifications.disk_warning":  "true",
		"notifications.new_login":     "false",
		"backup.auto_enabled":         "false",
		"backup.time":                 "02:00",
		"backup.retention":            "14",
		"backup.name_prefix":          "nanofly",
		"backup.description":          "Scheduled NanoFly backup",
	}
}

func (s *Server) saveSettings(ctx context.Context, settings map[string]string) error {
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback() //nolint:errcheck
	for key, value := range settings {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO settings (key, value, updated_at) VALUES (?, ?, CURRENT_TIMESTAMP)
			ON CONFLICT(key) DO UPDATE SET value=excluded.value, updated_at=CURRENT_TIMESTAMP
		`, key, value); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (s *Server) setting(ctx context.Context, key string) string {
	defaults := defaultSettings()
	value := defaults[key]
	_ = s.db.QueryRowContext(ctx, "SELECT value FROM settings WHERE key = ?", key).Scan(&value)
	return value
}

type backupMeta struct {
	Name        string `json:"name"`
	Description string `json:"description"`
	File        string `json:"file"`
	Size        int64  `json:"size"`
	SizeHuman   string `json:"size_human"`
	Status      string `json:"status"`
	Type        string `json:"type"`
	Error       string `json:"error,omitempty"`
	CreatedAt   string `json:"created_at"`
}

func (s *Server) backupsDir() string {
	return filepath.Join(s.cfg.DataDir, "backups")
}

func (s *Server) handleBackupsList(w http.ResponseWriter, r *http.Request) {
	backups, err := s.listBackups()
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to list backups")
		return
	}
	response.Success(w, backups)
}

func (s *Server) handleBackupCreate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Type        string `json:"type"`
	}
	_ = json.NewDecoder(r.Body).Decode(&req)
	if strings.TrimSpace(req.Name) == "" {
		req.Name = s.setting(r.Context(), "backup.name_prefix")
	}
	if strings.TrimSpace(req.Description) == "" {
		req.Description = "Manual NanoFly backup"
	}
	if req.Type == "" {
		req.Type = "manual"
	}
	meta, err := s.createBackup(r.Context(), req.Name, req.Description, req.Type)
	if err != nil {
		response.JSON(w, http.StatusInternalServerError, meta)
		return
	}
	response.Success(w, meta)
}

func (s *Server) handleBackupDownload(w http.ResponseWriter, r *http.Request) {
	name := filepath.Base(chi.URLParam(r, "name"))
	if !strings.HasSuffix(name, ".tar.gz") {
		name += ".tar.gz"
	}
	path := filepath.Join(s.backupsDir(), name)
	if _, err := os.Stat(path); err != nil {
		response.Error(w, http.StatusNotFound, "backup not found")
		return
	}
	w.Header().Set("Content-Disposition", `attachment; filename="`+name+`"`)
	http.ServeFile(w, r, path)
}

func (s *Server) handleBackupDelete(w http.ResponseWriter, r *http.Request) {
	base := strings.TrimSuffix(filepath.Base(chi.URLParam(r, "name")), ".json")
	base = strings.TrimSuffix(base, ".tar.gz")
	if base == "." || base == "" {
		response.Error(w, http.StatusBadRequest, "invalid backup name")
		return
	}
	_ = os.Remove(filepath.Join(s.backupsDir(), base+".tar.gz"))
	_ = os.Remove(filepath.Join(s.backupsDir(), base+".json"))
	response.NoContent(w)
}

func (s *Server) listBackups() ([]backupMeta, error) {
	dir := s.backupsDir()
	if err := os.MkdirAll(dir, 0755); err != nil {
		return nil, err
	}
	entries, err := os.ReadDir(dir)
	if err != nil {
		return nil, err
	}
	backups := []backupMeta{}
	for _, entry := range entries {
		if entry.IsDir() || !strings.HasSuffix(entry.Name(), ".json") {
			continue
		}
		data, err := os.ReadFile(filepath.Join(dir, entry.Name()))
		if err != nil {
			continue
		}
		var meta backupMeta
		if err := json.Unmarshal(data, &meta); err == nil {
			if info, err := os.Stat(filepath.Join(dir, meta.File)); err == nil {
				meta.Size = info.Size()
				meta.SizeHuman = humanBytesServer(info.Size())
			}
			backups = append(backups, meta)
		}
	}
	sort.Slice(backups, func(i, j int) bool { return backups[i].CreatedAt > backups[j].CreatedAt })
	return backups, nil
}

func (s *Server) createBackup(ctx context.Context, name, description, backupType string) (backupMeta, error) {
	s.backupMu.Lock()
	defer s.backupMu.Unlock()
	safeName := sanitizeBackupName(name)
	stamp := time.Now().Format("20060102-150405")
	base := safeName + "-" + stamp
	if err := os.MkdirAll(s.backupsDir(), 0755); err != nil {
		return backupMeta{}, err
	}
	meta := backupMeta{Name: safeName, Description: description, File: base + ".tar.gz", Status: "success", Type: backupType, CreatedAt: time.Now().Format(time.RFC3339)}
	path := filepath.Join(s.backupsDir(), meta.File)
	if err := s.writeBackupArchive(path); err != nil {
		meta.Status = "failed"
		meta.Error = err.Error()
		_ = s.writeBackupMeta(base, meta)
		return meta, err
	}
	if info, err := os.Stat(path); err == nil {
		meta.Size = info.Size()
		meta.SizeHuman = humanBytesServer(info.Size())
	}
	return meta, s.writeBackupMeta(base, meta)
}

func (s *Server) writeBackupMeta(base string, meta backupMeta) error {
	data, err := json.MarshalIndent(meta, "", "  ")
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(s.backupsDir(), base+".json"), data, 0644)
}

func (s *Server) writeBackupArchive(dest string) error {
	file, err := os.Create(dest)
	if err != nil {
		return err
	}
	defer file.Close()
	gz := gzip.NewWriter(file)
	defer gz.Close()
	tw := tar.NewWriter(gz)
	defer tw.Close()
	root, err := filepath.Abs(s.cfg.DataDir)
	if err != nil {
		return err
	}
	backupRoot, _ := filepath.Abs(s.backupsDir())
	return filepath.WalkDir(root, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		abs, _ := filepath.Abs(path)
		if abs == backupRoot || strings.HasPrefix(abs, backupRoot+string(os.PathSeparator)) {
			if d.IsDir() {
				return filepath.SkipDir
			}
			return nil
		}
		if d.IsDir() {
			return nil
		}
		info, err := d.Info()
		if err != nil || !info.Mode().IsRegular() {
			return err
		}
		rel, err := filepath.Rel(root, path)
		if err != nil {
			return err
		}
		header, err := tar.FileInfoHeader(info, "")
		if err != nil {
			return err
		}
		header.Name = filepath.ToSlash(filepath.Join("nanofly-data", rel))
		if err := tw.WriteHeader(header); err != nil {
			return err
		}
		src, err := os.Open(path)
		if err != nil {
			return err
		}
		_, copyErr := io.Copy(tw, src)
		closeErr := src.Close()
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	})
}

func (s *Server) backupScheduler() {
	ticker := time.NewTicker(time.Minute)
	defer ticker.Stop()
	for range ticker.C {
		ctx := context.Background()
		if s.setting(ctx, "backup.auto_enabled") != "true" {
			continue
		}
		when := s.setting(ctx, "backup.time")
		now := time.Now()
		if now.Format("15:04") != when {
			continue
		}
		key := now.Format("2006-01-02") + " " + when
		if s.backupLast == key {
			continue
		}
		s.backupLast = key
		_, _ = s.createBackup(ctx, s.setting(ctx, "backup.name_prefix"), s.setting(ctx, "backup.description"), "scheduled")
		s.pruneBackups(ctx)
	}
}

func (s *Server) pruneBackups(ctx context.Context) {
	retention := 14
	fmt.Sscanf(s.setting(ctx, "backup.retention"), "%d", &retention)
	if retention <= 0 {
		return
	}
	backups, err := s.listBackups()
	if err != nil || len(backups) <= retention {
		return
	}
	for _, backup := range backups[retention:] {
		base := strings.TrimSuffix(backup.File, ".tar.gz")
		_ = os.Remove(filepath.Join(s.backupsDir(), backup.File))
		_ = os.Remove(filepath.Join(s.backupsDir(), base+".json"))
	}
}

func sanitizeBackupName(name string) string {
	name = strings.ToLower(strings.TrimSpace(name))
	replacer := strings.NewReplacer(" ", "-", "/", "-", "\\", "-", ":", "-", "*", "-", "?", "-", `"`, "", "<", "", ">", "", "|", "-")
	name = replacer.Replace(name)
	name = strings.Trim(name, "-.")
	if name == "" {
		return "nanofly"
	}
	return name
}

func humanBytesServer(b int64) string {
	const kb = 1024
	const mb = 1024 * kb
	const gb = 1024 * mb
	switch {
	case b >= gb:
		return fmt.Sprintf("%.2f GB", float64(b)/gb)
	case b >= mb:
		return fmt.Sprintf("%.2f MB", float64(b)/mb)
	case b >= kb:
		return fmt.Sprintf("%.2f KB", float64(b)/kb)
	default:
		return fmt.Sprintf("%d B", b)
	}
}

func (s *Server) handleUpdateApply(w http.ResponseWriter, r *http.Request) {
	s.updateMu.Lock()
	if s.updateStatus != "idle" && s.updateStatus != "done" && s.updateStatus != "error" {
		s.updateMu.Unlock()
		response.Error(w, http.StatusBadRequest, "An update process is already running")
		return
	}
	s.updateStatus = "downloading"
	s.updateLog = ""
	s.updateMu.Unlock()

	go s.runUpdateLoop()

	response.Success(w, map[string]string{"status": "update_started"})
}

func (s *Server) runUpdateLoop() {
	logMsg := func(msg string) {
		s.updateMu.Lock()
		s.updateLog += fmt.Sprintf("[%s] %s\n", time.Now().Format("15:04:05"), msg)
		s.updateMu.Unlock()
	}

	setStatus := func(st string) {
		s.updateMu.Lock()
		s.updateStatus = st
		s.updateMu.Unlock()
	}

	fail := func(msg string) {
		logMsg("ERROR: " + msg)
		setStatus("error")
	}

	// 1. Fetch latest release info
	logMsg("Checking for latest release...")
	setStatus("downloading")

	client := &http.Client{Timeout: 30 * time.Second}
	req, _ := http.NewRequest("GET", githubReleases, nil)
	req.Header.Set("User-Agent", "NanoFly-Updater")

	resp, err := client.Do(req)
	if err != nil {
		fail(fmt.Sprintf("Failed to reach GitHub: %v", err))
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		fail(fmt.Sprintf("GitHub returned status %d", resp.StatusCode))
		return
	}

	var releaseList []ghReleaseJSON
	if err := json.NewDecoder(resp.Body).Decode(&releaseList); err != nil || len(releaseList) == 0 {
		fail(fmt.Sprintf("Failed to parse release data: %v", err))
		return
	}
	release := releaseList[0]

	logMsg(fmt.Sprintf("Latest release: %s", release.TagName))

	// 2. Find the right asset for this architecture
	arch := runtime.GOARCH
	if arch == "arm64" {
		arch = "arm64"
	}
	expectedAsset := fmt.Sprintf("nanofly-linux-%s.tar.gz", arch)

	var downloadURL string
	for _, asset := range release.Assets {
		if asset.Name == expectedAsset {
			downloadURL = asset.BrowserDownloadURL
			break
		}
	}

	if downloadURL == "" {
		fail(fmt.Sprintf("No release asset found for architecture: %s (looking for %s)", runtime.GOARCH, expectedAsset))
		return
	}

	logMsg(fmt.Sprintf("Downloading %s...", expectedAsset))

	// 3. Download the tarball with progress reporting
	dlClient := &http.Client{Timeout: 5 * time.Minute}
	dlResp, err := dlClient.Get(downloadURL)
	if err != nil {
		fail(fmt.Sprintf("Download failed: %v", err))
		return
	}
	defer dlResp.Body.Close()

	if dlResp.StatusCode != http.StatusOK {
		fail(fmt.Sprintf("Download returned HTTP %d", dlResp.StatusCode))
		return
	}

	totalSize := dlResp.ContentLength

	tmpFile := "/tmp/nanofly-update.tar.gz"
	outFile, err := os.Create(tmpFile)
	if err != nil {
		fail(fmt.Sprintf("Failed to create temp file: %v", err))
		return
	}

	// Download with progress reporting
	var downloaded int64
	buf := make([]byte, 32*1024)
	lastLog := time.Now()
	for {
		n, readErr := dlResp.Body.Read(buf)
		if n > 0 {
			if _, writeErr := outFile.Write(buf[:n]); writeErr != nil {
				outFile.Close()
				fail(fmt.Sprintf("Write error: %v", writeErr))
				return
			}
			downloaded += int64(n)
			// Log progress every 2 seconds
			if time.Since(lastLog) > 2*time.Second {
				if totalSize > 0 {
					pct := float64(downloaded) / float64(totalSize) * 100
					logMsg(fmt.Sprintf("  %.1f MB / %.1f MB (%.0f%%)", float64(downloaded)/1048576, float64(totalSize)/1048576, pct))
				} else {
					logMsg(fmt.Sprintf("  %.1f MB downloaded...", float64(downloaded)/1048576))
				}
				lastLog = time.Now()
			}
		}
		if readErr != nil {
			if readErr == io.EOF {
				break
			}
			outFile.Close()
			fail(fmt.Sprintf("Download interrupted: %v", readErr))
			return
		}
	}
	outFile.Close()

	logMsg(fmt.Sprintf("Download complete (%.1f MB)", float64(downloaded)/1048576))

	// 4. Extract to a temp directory first
	setStatus("extracting")
	logMsg("Extracting update...")

	tmpDir := "/tmp/nanofly-update"
	os.RemoveAll(tmpDir)
	os.MkdirAll(tmpDir, 0755)

	extractCmd := exec.Command("tar", "-xzf", tmpFile, "-C", tmpDir)
	if out, err := extractCmd.CombinedOutput(); err != nil {
		fail(fmt.Sprintf("Extraction failed: %s — %v", string(out), err))
		return
	}

	logMsg("Extraction complete")

	// 5. Replace binary and frontend
	setStatus("installing")
	logMsg("Installing update...")

	execPath, err := os.Executable()
	if err != nil {
		fail(fmt.Sprintf("Cannot determine binary path: %v", err))
		return
	}

	// Replace binary
	newBinary := tmpDir + "/nanofly"
	if _, err := os.Stat(newBinary); err == nil {
		// Backup current binary
		os.Rename(execPath, execPath+".bak")
		// Copy new binary
		cpCmd := exec.Command("cp", newBinary, execPath)
		if out, err := cpCmd.CombinedOutput(); err != nil {
			// Restore backup on failure
			os.Rename(execPath+".bak", execPath)
			fail(fmt.Sprintf("Binary replacement failed: %s — %v", string(out), err))
			return
		}
		os.Chmod(execPath, 0755)
		logMsg("Binary updated")
	}

	// Replace frontend
	newDist := tmpDir + "/web/dist"
	if _, err := os.Stat(newDist); err == nil {
		os.RemoveAll("web/dist")
		cpCmd := exec.Command("cp", "-r", newDist, "web/dist")
		if out, err := cpCmd.CombinedOutput(); err != nil {
			logMsg(fmt.Sprintf("Frontend update warning: %s — %v", string(out), err))
		} else {
			logMsg("Frontend updated")
		}
	}

	// Write version file
	os.WriteFile("VERSION", []byte(release.TagName), 0644)
	logMsg(fmt.Sprintf("Version updated to %s", release.TagName))

	// Cleanup
	os.RemoveAll(tmpDir)
	os.Remove(tmpFile)
	os.Remove(execPath + ".bak")

	setStatus("done")
	logMsg("==================================================")
	logMsg("Update complete! Restarting NanoFly in 3 seconds...")

	go func() {
		time.Sleep(3 * time.Second)
		// Try systemd restart first (preferred)
		restartCmd := exec.Command("systemctl", "restart", "nanofly")
		if err := restartCmd.Run(); err != nil {
			slog.Info("systemctl restart failed, trying in-place restart", "error", err)
			restartInPlace(execPath)
		}
	}()
}

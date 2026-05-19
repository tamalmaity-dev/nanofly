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
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"sync"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/go-chi/chi/v5/middleware"

	"github.com/nanofly/nanofly/internal/api/docker"
	"github.com/nanofly/nanofly/internal/api/projects"
	"github.com/nanofly/nanofly/internal/api/services"
	"github.com/nanofly/nanofly/internal/api/terminal"
	"github.com/nanofly/nanofly/internal/auth"
	"github.com/nanofly/nanofly/internal/config" 
	"github.com/nanofly/nanofly/internal/db"
	"github.com/nanofly/nanofly/internal/metrics"
	"github.com/nanofly/nanofly/internal/response"
)

// Server holds the HTTP server and all module dependencies.
type Server struct {
	cfg          *config.Config
	db           *db.DB
	router       *chi.Mux
	httpSrv      *http.Server
	authSvc      *auth.Service
	dockerMgr    *docker.Manager
	serviceMgr   *services.Manager
	updateStatus string // idle | pull | build_front | build_back | done | error
	updateLog    string
	updateMu     sync.Mutex
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

		// Panel updates
		r.Get("/settings/update/check", s.handleUpdateCheck)
		r.Post("/settings/update/apply", s.handleUpdateApply)
		r.Get("/settings/update/log", s.handleUpdateLog)

		// TODO: domains, SSH keys...
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
		"available": runtime.GOOS != "windows",
		"shell":     shell,
		"os":        runtime.GOOS,
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
		"version": "0.1.0",
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
	return s.httpSrv.Shutdown(ctx)
}

// ── Panel Updates ─────────────────────────────────────────────────────────────

type gitCommitJSON struct {
	SHA    string `json:"sha"`
	Commit struct {
		Message string `json:"message"`
		Author  struct {
			Date string `json:"date"`
		} `json:"author"`
	} `json:"commit"`
}

func (s *Server) handleUpdateCheck(w http.ResponseWriter, r *http.Request) {
	var currentCommit string
	cmd := exec.Command("git", "rev-parse", "--short", "HEAD")
	if out, err := cmd.Output(); err == nil {
		currentCommit = strings.TrimSpace(string(out))
	} else {
		currentCommit = "0.1.0"
	}

	client := &http.Client{Timeout: 5 * time.Second}
	req, _ := http.NewRequestWithContext(r.Context(), "GET", "https://api.github.com/repos/tamalmaity-dev/nanofly/commits/main", nil)
	req.Header.Set("User-Agent", "NanoFly-Update-Checker")
	
	resp, err := client.Do(req)
	if err != nil {
		response.Success(w, map[string]any{
			"current_commit": currentCommit,
			"latest_commit":  currentCommit,
			"has_update":     false,
			"latest_message": "Unable to check remote repository",
			"latest_date":    "",
		})
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		response.Success(w, map[string]any{
			"current_commit": currentCommit,
			"latest_commit":  currentCommit,
			"has_update":     false,
			"latest_message": fmt.Sprintf("GitHub returned status %d", resp.StatusCode),
			"latest_date":    "",
		})
		return
	}

	var ghCommit gitCommitJSON
	if err := json.NewDecoder(resp.Body).Decode(&ghCommit); err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to decode github response")
		return
	}

	latestSHA := ghCommit.SHA
	if len(latestSHA) > 7 {
		latestSHA = latestSHA[:7]
	}

	hasUpdate := currentCommit != latestSHA && currentCommit != "0.1.0"

	response.Success(w, map[string]any{
		"current_commit": currentCommit,
		"latest_commit":  latestSHA,
		"has_update":     hasUpdate,
		"latest_message": ghCommit.Commit.Message,
		"latest_date":    ghCommit.Commit.Author.Date,
	})
}

func (s *Server) handleUpdateLog(w http.ResponseWriter, r *http.Request) {
	s.updateMu.Lock()
	defer s.updateMu.Unlock()
	response.Success(w, map[string]any{
		"status": s.updateStatus,
		"log":    s.updateLog,
	})
}

func (s *Server) handleUpdateApply(w http.ResponseWriter, r *http.Request) {
	s.updateMu.Lock()
	if s.updateStatus != "idle" && s.updateStatus != "done" && s.updateStatus != "error" {
		s.updateMu.Unlock()
		response.Error(w, http.StatusBadRequest, "An update process is already running")
		return
	}
	s.updateStatus = "pull"
	s.updateLog = "Starting NanoFly update system...\n"
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

	runCmd := func(name string, args ...string) error {
		logMsg(fmt.Sprintf("Running: %s %s", name, strings.Join(args, " ")))
		cmd := exec.Command(name, args...)
		out, err := cmd.CombinedOutput()
		if len(out) > 0 {
			logMsg(string(out))
		}
		if err != nil {
			logMsg(fmt.Sprintf("Command failed: %v", err))
			return err
		}
		return nil
	}

	s.updateMu.Lock()
	s.updateStatus = "pull"
	s.updateMu.Unlock()

	if err := runCmd("git", "pull", "origin", "main"); err != nil {
		s.updateMu.Lock()
		s.updateStatus = "error"
		s.updateMu.Unlock()
		logMsg("Update failed during git pull")
		return
	}

	s.updateMu.Lock()
	s.updateStatus = "build_front"
	s.updateMu.Unlock()

	npmCmd := "npm"
	if runtime.GOOS == "windows" {
		npmCmd = "npm.cmd"
	}
	
	logMsg("Running npm install in web/...")
	installCmd := exec.Command(npmCmd, "install", "--no-audit", "--no-fund")
	installCmd.Dir = "./web"
	out, err := installCmd.CombinedOutput()
	if len(out) > 0 {
		logMsg(string(out))
	}
	if err != nil {
		s.updateMu.Lock()
		s.updateStatus = "error"
		s.updateMu.Unlock()
		logMsg(fmt.Sprintf("npm install failed: %v", err))
		return
	}

	logMsg("Running npm run build in web/...")
	buildCmd := exec.Command(npmCmd, "run", "build")
	buildCmd.Dir = "./web"
	out, err = buildCmd.CombinedOutput()
	if len(out) > 0 {
		logMsg(string(out))
	}
	if err != nil {
		s.updateMu.Lock()
		s.updateStatus = "error"
		s.updateMu.Unlock()
		logMsg(fmt.Sprintf("npm build failed: %v", err))
		return
	}

	s.updateMu.Lock()
	s.updateStatus = "build_back"
	s.updateMu.Unlock()

	goCmd := "go"
	outBinName := "nanofly"
	if runtime.GOOS == "windows" {
		outBinName = "nanofly.exe"
	}

	if err := runCmd(goCmd, "build", "-o", outBinName, "./cmd/nanofly"); err != nil {
		s.updateMu.Lock()
		s.updateStatus = "error"
		s.updateMu.Unlock()
		logMsg("Backend rebuild failed")
		return
	}

	s.updateMu.Lock()
	s.updateStatus = "done"
	s.updateMu.Unlock()
	logMsg("==================================================")
	logMsg("Update complete! NanoFly has been successfully rebuilt.")
	logMsg("Restarting the panel automatically in 3 seconds to apply changes...")

	// Spawn auto-restart in a separate thread so this thread returns, allowing final logs to be delivered to client
	go func() {
		time.Sleep(3 * time.Second)
		execPath, err := os.Executable()
		if err != nil {
			logMsg(fmt.Sprintf("Failed to get executable path: %v", err))
			slog.Error("failed to get executable path for restart", "error", err)
			return
		}
		slog.Info("Restarting NanoFly panel in place...", "executable", execPath)
		restartInPlace(execPath)
	}()
}


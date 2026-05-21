// internal/api/services/service.go — Service CRUD and deployment logic
package services

import (
	"context"
	"database/sql"
	"fmt"
	"io"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"sort"
	"strconv"
	"strings"
	"time"

	"github.com/nanofly/nanofly/internal/api/docker"
	"github.com/nanofly/nanofly/internal/db"
)

func parseSqliteTime(s string) time.Time {
	s = strings.TrimSpace(s)
	if t, err := time.Parse("2006-01-02 15:04:05", s); err == nil {
		return t
	}
	if t, err := time.Parse(time.RFC3339, s); err == nil {
		return t
	}
	// Try timezone stripped format
	clean := strings.Replace(s, "T", " ", 1)
	clean = strings.Split(clean, "Z")[0]
	clean = strings.Split(clean, "+")[0]
	clean = strings.Split(clean, ".")[0]
	if t, err := time.Parse("2006-01-02 15:04:05", clean); err == nil {
		return t
	}
	return time.Time{}
}

// ServiceType enumerates service kinds.
type ServiceType string

const (
	TypeApp      ServiceType = "app"
	TypeDatabase ServiceType = "database"
)

// Service represents a deployed service (app or database).
type Service struct {
	ID          string      `json:"id"`
	ProjectID   string      `json:"project_id"`
	Name        string      `json:"name"`
	Type        ServiceType `json:"type"`
	Status      string      `json:"status"`
	Image       string      `json:"image"`
	Port        int         `json:"port"`
	ContainerID string      `json:"container_id"`
	CreatedAt   time.Time   `json:"created_at"`
	UpdatedAt   time.Time   `json:"updated_at"`

	// Joined fields
	GitRepoURL       string `json:"git_repo_url,omitempty"`
	GitBranch        string `json:"git_branch,omitempty"`
	Builder          string `json:"git_builder,omitempty"`
	StartCommand     string `json:"start_command,omitempty"`
	InstallCommand   string `json:"install_command,omitempty"`
	AppDirectory     string `json:"app_directory,omitempty"`
	RunFile          string `json:"run_file,omitempty"`
	RequirementsFile string `json:"requirements_file,omitempty"`
	UseVenv          bool   `json:"use_venv"`
	ConnString       string `json:"conn_string,omitempty"` // databases only (encrypted stub)

	// Real-time resource metrics (populated in memory)
	CPUPercent  float64 `json:"cpu_percent"`
	MemoryUsage string  `json:"memory_usage"`
}

// EnvVar is a key=value pair stored encrypted in DB.
type EnvVar struct {
	Key   string `json:"key"`
	Value string `json:"value"`
}

// Deployment is a deployment record.
type Deployment struct {
	ID         string     `json:"id"`
	ServiceID  string     `json:"service_id"`
	Status     string     `json:"status"`
	CommitSHA  string     `json:"commit_sha"`
	CommitMsg  string     `json:"commit_msg"`
	Log        string     `json:"log"`
	StartedAt  time.Time  `json:"started_at"`
	FinishedAt *time.Time `json:"finished_at,omitempty"`
}

// Manager handles service operations.
type Manager struct {
	db     *db.DB
	docker *docker.Manager
}

// New creates a Manager. docker may be nil if Docker is unavailable.
func New(database *db.DB, dockerMgr *docker.Manager) *Manager {
	return &Manager{db: database, docker: dockerMgr}
}

type ContainerStats struct {
	CPUPercent  float64
	MemoryUsage string
}

func getContainerStats(ctx context.Context) map[string]ContainerStats {
	stats := make(map[string]ContainerStats)
	
	// Query stats with a short timeout to prevent blocking indefinitely if Docker is slow or offline
	ctx, cancel := context.WithTimeout(ctx, 3*time.Second)
	defer cancel()

	cmd := exec.CommandContext(ctx, "docker", "stats", "--no-stream", "--format", "{{.Name}}\t{{.CPUPerc}}\t{{.MemUsage}}")
	out, err := cmd.Output()
	if err != nil {
		return stats
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	for _, line := range lines {
		parts := strings.Split(line, "\t")
		if len(parts) >= 3 {
			name := strings.TrimSpace(parts[0])
			cpuStr := strings.TrimSuffix(strings.TrimSpace(parts[1]), "%")
			memUsage := strings.TrimSpace(parts[2])
			cpuVal, _ := strconv.ParseFloat(cpuStr, 64)
			stats[name] = ContainerStats{
				CPUPercent:  cpuVal,
				MemoryUsage: memUsage,
			}
		}
	}
	return stats
}

// List returns all services for a project.
func (m *Manager) List(ctx context.Context, projectID string) ([]Service, error) {
	rows, err := m.db.QueryContext(ctx, `
		SELECT s.id, s.project_id, s.name, s.type, s.status, 
		       COALESCE(s.port,0), COALESCE(s.updated_at,''), s.created_at,
		       COALESCE(g.repo_url,''), COALESCE(g.branch,'main'),
		       COALESCE(s.image,''), COALESCE(g.builder,'auto'),
		       COALESCE(s.start_command,''), COALESCE(s.install_command,''),
		       COALESCE(s.app_directory,''), COALESCE(s.run_file,''),
		       COALESCE(s.requirements_file,'requirements.txt'), COALESCE(s.use_venv,1)
		FROM services s
		LEFT JOIN git_sources g ON g.service_id = s.id
		WHERE s.project_id = ?
		ORDER BY s.created_at DESC
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	containerStats := getContainerStats(ctx)

	var svcs []Service
	for rows.Next() {
		var s Service
		var updatedAt, createdAt string
		if err := rows.Scan(
			&s.ID, &s.ProjectID, &s.Name, &s.Type, &s.Status,
			&s.Port, &updatedAt, &createdAt,
			&s.GitRepoURL, &s.GitBranch,
			&s.Image, &s.Builder, &s.StartCommand, &s.InstallCommand,
			&s.AppDirectory, &s.RunFile, &s.RequirementsFile, &s.UseVenv,
		); err != nil {
			return nil, err
		}
		s.CreatedAt = parseSqliteTime(createdAt)
		s.Type = ServiceType(string(s.Type))

		// Map stats
		cName := ""
		if s.Type == TypeDatabase {
			cName = "nf-db-" + s.Name
		} else {
			cName = "nf-app-" + s.Name
		}
		if st, ok := containerStats[cName]; ok {
			s.CPUPercent = st.CPUPercent
			s.MemoryUsage = st.MemoryUsage
		} else {
			s.MemoryUsage = "0 B"
		}

		svcs = append(svcs, s)
	}
	if svcs == nil {
		svcs = []Service{}
	}
	return svcs, nil
}

// Get returns a single service by ID.
func (m *Manager) Get(ctx context.Context, id string) (*Service, error) {
	var s Service
	var createdAt string
	err := m.db.QueryRowContext(ctx, `
		SELECT s.id, s.project_id, s.name, s.type, s.status,
		       COALESCE(s.port,0), s.created_at,
		       COALESCE(g.repo_url,''), COALESCE(g.branch,'main'),
		       COALESCE(s.image,''), COALESCE(g.builder,'auto'),
		       COALESCE(s.start_command,''), COALESCE(s.install_command,''),
		       COALESCE(s.app_directory,''), COALESCE(s.run_file,''),
		       COALESCE(s.requirements_file,'requirements.txt'), COALESCE(s.use_venv,1)
		FROM services s
		LEFT JOIN git_sources g ON g.service_id = s.id
		WHERE s.id = ?
	`, id).Scan(
		&s.ID, &s.ProjectID, &s.Name, &s.Type, &s.Status,
		&s.Port, &createdAt,
		&s.GitRepoURL, &s.GitBranch,
		&s.Image, &s.Builder, &s.StartCommand, &s.InstallCommand,
		&s.AppDirectory, &s.RunFile, &s.RequirementsFile, &s.UseVenv,
	)
	if err != nil {
		return nil, err
	}
	s.CreatedAt = parseSqliteTime(createdAt)
	s.Type = ServiceType(string(s.Type))

	// Map stats
	containerStats := getContainerStats(ctx)
	cName := ""
	if s.Type == TypeDatabase {
		cName = "nf-db-" + s.Name
	} else {
		cName = "nf-app-" + s.Name
	}
	if st, ok := containerStats[cName]; ok {
		s.CPUPercent = st.CPUPercent
		s.MemoryUsage = st.MemoryUsage
	} else {
		s.MemoryUsage = "0 B"
	}

	return &s, nil
}

// CreateAppReq defines what's needed to create an App service.
type CreateAppReq struct {
	ProjectID string
	Name      string
	Image     string // Docker image (e.g. nginx:alpine)
	Port      int
	EnvVars   []EnvVar

	// GitHub source (optional)
	GitRepoURL       string
	GitBranch        string
	GitToken         string // PAT for private repos
	Builder          string // auto, node, go, python, php, static, dockerfile
	StartCommand     string
	InstallCommand   string
	AppDirectory     string
	RunFile          string
	RequirementsFile string
	UseVenv          bool
}

// CreateApp creates an App service record (doesn't deploy yet).
func (m *Manager) CreateApp(ctx context.Context, req CreateAppReq) (*Service, error) {
	var id string
	err := m.db.QueryRowContext(ctx, `
		INSERT INTO services (
			project_id, name, type, status, port, image,
			start_command, install_command, app_directory, run_file, requirements_file, use_venv
		)
		VALUES (?, ?, 'app', 'idle', ?, ?, ?, ?, ?, ?, ?, ?)
		RETURNING id
	`, req.ProjectID, req.Name, req.Port, req.Image,
		req.StartCommand, req.InstallCommand, req.AppDirectory, req.RunFile,
		defaultRequirementsFile(req.RequirementsFile), req.UseVenv,
	).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("creating service: %w", err)
	}

	// Store git source if provided
	if req.GitRepoURL != "" {
		builderVal := req.Builder
		if builderVal == "" {
			builderVal = "auto"
		}
		_, err = m.db.ExecContext(ctx, `
			INSERT INTO git_sources (service_id, repo_url, branch, webhook_secret, builder)
			VALUES (?, ?, ?, ?, ?)
		`, id, req.GitRepoURL, req.GitBranch, docker.RandPassword(), builderVal)
		if err != nil {
			slog.Warn("storing git source", "err", err)
		}
	}

	// Store env vars
	for _, ev := range req.EnvVars {
		m.db.ExecContext(ctx, `
			INSERT INTO env_vars (service_id, key, value)
			VALUES (?, ?, ?)
			ON CONFLICT(service_id, key) DO UPDATE SET value=excluded.value
		`, id, ev.Key, ev.Value) //nolint:errcheck
	}

	return m.Get(ctx, id)
}

// CreateDBReq defines what's needed to create a managed database.
type CreateDBReq struct {
	ProjectID string
	Name      string
	DBType    string // postgres, mysql, redis, mongo
}

// CreateDatabase creates a managed Docker database.
func (m *Manager) CreateDatabase(ctx context.Context, req CreateDBReq) (*Service, error) {
	if m.docker == nil {
		return nil, fmt.Errorf("docker is not available on this server")
	}

	password := docker.RandPassword()
	dbName := strings.ReplaceAll(strings.ToLower(req.Name), "-", "_")

	var id string
	err := m.db.QueryRowContext(ctx, `
		INSERT INTO services (project_id, name, type, status, image)
		VALUES (?, ?, 'database', 'creating', ?)
		RETURNING id
	`, req.ProjectID, req.Name, req.DBType).Scan(&id)
	if err != nil {
		return nil, err
	}

	// Create container asynchronously
	go func() {
		bgCtx := context.Background()
		hostPort, connStr, err := m.docker.CreateDB(bgCtx, docker.DBConfig{
			ServiceID: id,
			DBType:    req.DBType,
			Name:      req.Name,
			Password:  password,
			DBName:    dbName,
		})
		if err != nil {
			slog.Error("creating DB container", "err", err)
			m.db.ExecContext(bgCtx, `UPDATE services SET status='error' WHERE id=?`, id) //nolint:errcheck
			return
		}

		// Store connection string as env var
		m.db.ExecContext(bgCtx, `
			INSERT INTO env_vars (service_id, key, value) VALUES (?, 'CONNECTION_STRING', ?)
			ON CONFLICT(service_id, key) DO UPDATE SET value=excluded.value
		`, id, connStr) //nolint:errcheck

		m.db.ExecContext(bgCtx, `UPDATE services SET status='running', port=? WHERE id=?`, hostPort, id) //nolint:errcheck
	}()

	return m.Get(ctx, id)
}

// Deploy triggers a new deployment for an app or database service.
// For apps, it clones and builds or pulls. For databases, it restarts/re-creates the container.
func (m *Manager) Deploy(ctx context.Context, serviceID string) (*Deployment, error) {
	svc, err := m.Get(ctx, serviceID)
	if err != nil {
		return nil, err
	}

	// Create deployment record
	var deployID string
	err = m.db.QueryRowContext(ctx, `
		INSERT INTO deployments (service_id, status) VALUES (?, 'building') RETURNING id
	`, serviceID).Scan(&deployID)
	if err != nil {
		return nil, err
	}

	// Update service status
	m.db.ExecContext(ctx, `UPDATE services SET status='deploying' WHERE id=?`, serviceID) //nolint:errcheck

	// Run deployment in background
	go func() {
		bgCtx := context.Background()
		var logBuf strings.Builder
		var finalStatus string

		log := func(line string) {
			slog.Info("[deploy]", "svc", svc.Name, "line", line)
			logBuf.WriteString(line + "\n")
			// Update log in DB periodically
			m.db.ExecContext(bgCtx, `UPDATE deployments SET log=? WHERE id=?`, logBuf.String(), deployID) //nolint:errcheck
		}

		defer func() {
			now := time.Now().Format("2006-01-02 15:04:05")
			m.db.ExecContext(bgCtx, `
				UPDATE deployments SET status=?, log=?, finished_at=? WHERE id=?
			`, finalStatus, logBuf.String(), now, deployID) //nolint:errcheck

			if finalStatus == "running" {
				m.db.ExecContext(bgCtx, `
					UPDATE deployments 
					SET status='completed', finished_at=? 
					WHERE service_id=? AND id != ? AND status IN ('running', 'building')
				`, now, serviceID, deployID) //nolint:errcheck
			}

			m.db.ExecContext(bgCtx, `UPDATE services SET status=? WHERE id=?`, finalStatus, serviceID) //nolint:errcheck
		}()

		m.logServiceDomains(bgCtx, svc, log)

		if svc.Type == TypeDatabase {
			if m.docker == nil {
				log("❌ Docker is not available. Cannot deploy database.")
				finalStatus = "error"
				return
			}
			log("💾 Starting database deployment: " + svc.Name)
			log("🗑️  Cleaning up any existing container...")
			m.docker.RemoveContainer(bgCtx, "nf-db-"+svc.Name) //nolint:errcheck

			password := ""
			var existingConn string
			m.db.QueryRowContext(bgCtx, `SELECT value FROM env_vars WHERE service_id = ? AND key = 'CONNECTION_STRING'`, svc.ID).Scan(&existingConn)
			if existingConn != "" {
				if strings.Contains(existingConn, "@") {
					parts := strings.Split(existingConn, "@")
					if len(parts) > 0 {
						uParts := strings.Split(parts[0], "://")
						userPass := uParts[len(uParts)-1]
						pParts := strings.Split(userPass, ":")
						if len(pParts) > 1 {
							password = pParts[1]
						}
					}
				}
			}
			if password == "" {
				password = docker.RandPassword()
			}
			dbName := strings.ReplaceAll(strings.ToLower(svc.Name), "-", "_")

			dbType := svc.Image
			if dbType == "" {
				if strings.HasPrefix(existingConn, "postgres://") {
					dbType = "postgres"
				} else if strings.HasPrefix(existingConn, "mysql://") {
					dbType = "mysql"
				} else if strings.HasPrefix(existingConn, "mongodb://") {
					dbType = "mongo"
				} else if strings.HasPrefix(existingConn, "redis://") {
					dbType = "redis"
				} else if strings.HasPrefix(existingConn, "clickhouse://") {
					dbType = "clickhouse"
				} else {
					nameLower := strings.ToLower(svc.Name)
					if strings.Contains(nameLower, "redis") {
						dbType = "redis"
					} else if strings.Contains(nameLower, "postgres") || strings.Contains(nameLower, "pg") {
						dbType = "postgres"
					} else if strings.Contains(nameLower, "mysql") {
						dbType = "mysql"
					} else if strings.Contains(nameLower, "mongo") {
						dbType = "mongo"
					} else if strings.Contains(nameLower, "clickhouse") {
						dbType = "clickhouse"
					} else if strings.Contains(nameLower, "mariadb") {
						dbType = "mariadb"
					} else {
						dbType = "redis"
					}
				}
				// Backfill the database
				m.db.ExecContext(bgCtx, `UPDATE services SET image = ? WHERE id = ?`, dbType, svc.ID) //nolint:errcheck
				svc.Image = dbType
			}

			log("🚀 Launching " + svc.Image + " container...")
			hostPort, connStr, err := m.docker.CreateDB(bgCtx, docker.DBConfig{
				ServiceID: svc.ID,
				DBType:    svc.Image, // stores dbType in s.Image
				Name:      svc.Name,
				Password:  password,
				DBName:    dbName,
			})
			if err != nil {
				log("❌ Database deployment failed: " + err.Error())
				finalStatus = "error"
				return
			}

			// Store connection string as env var
			m.db.ExecContext(bgCtx, `
				INSERT INTO env_vars (service_id, key, value) VALUES (?, 'CONNECTION_STRING', ?)
				ON CONFLICT(service_id, key) DO UPDATE SET value=excluded.value
			`, svc.ID, connStr) //nolint:errcheck

			m.db.ExecContext(bgCtx, `UPDATE services SET port=? WHERE id=?`, hostPort, svc.ID) //nolint:errcheck

			log("✅ Database deployment succeeded! Port: " + fmt.Sprintf("%d", hostPort))
			finalStatus = "running"
			return
		}

		if svc.GitRepoURL != "" {
			// Git-based deploy
			if err := m.gitDeploy(bgCtx, svc, log); err != nil {
				log("❌ Deploy failed: " + err.Error())
				finalStatus = "error"
				return
			}
		} else if svc.Image != "" {
			// Docker image deploy
			if m.docker == nil {
				log("⚠  Docker not available. Cannot deploy container.")
				finalStatus = "error"
				return
			}
			var envSlice []string
			rows, _ := m.db.QueryContext(bgCtx, `SELECT key, value FROM env_vars WHERE service_id=?`, serviceID)
			if rows != nil {
				for rows.Next() {
					var k, v string
					rows.Scan(&k, &v) //nolint:errcheck
					envSlice = append(envSlice, k+"="+v)
				}
				rows.Close()
			}

			log("📦 Pulling image: " + svc.Image)
			containerID, err := m.docker.DeployApp(bgCtx, serviceID, svc.Name, svc.Image, svc.Port, svc.Port, envSlice)
			if err != nil {
				log("❌ " + err.Error())
				finalStatus = "error"
				return
			}
			log("✅ Container started: " + containerID)
			m.db.ExecContext(bgCtx, `UPDATE services SET status='running' WHERE id=?`, serviceID) //nolint:errcheck
		}

		finalStatus = "running"
		log("🚀 Deployment complete!")
	}()

	return m.GetDeployment(ctx, deployID)
}

func (m *Manager) logServiceDomains(ctx context.Context, svc *Service, log func(string)) {
	rows, err := m.db.QueryContext(ctx, `
		SELECT domain, COALESCE(direction,'both')
		FROM domains_v2
		WHERE service = ?
		ORDER BY created_at DESC
	`, svc.Name)
	if err != nil {
		return
	}
	defer rows.Close()

	var domains []string
	for rows.Next() {
		var domain, direction string
		if err := rows.Scan(&domain, &direction); err == nil && domain != "" {
			domains = append(domains, domain+" ("+direction+")")
		}
	}
	if len(domains) > 0 {
		log("Domains: " + strings.Join(domains, ", "))
	}
}

// gitDeploy clones a repo and runs the app inside Docker.
// gitDeploy clones a repo and runs the app inside Docker.
func (m *Manager) gitDeploy(ctx context.Context, svc *Service, log func(string)) error {
	repoDir := filepath.Join(os.TempDir(), "nanofly-"+svc.ID)
	os.RemoveAll(repoDir) //nolint:errcheck

	log("📥 Cloning " + svc.GitRepoURL + " (" + svc.GitBranch + ")…")

	if svc.AppDirectory != "" {
		log("App directory: " + svc.AppDirectory)
	}
	if svc.RunFile != "" {
		log("Run file: " + svc.RunFile)
	}
	if svc.RequirementsFile != "" {
		log("Requirements file: " + svc.RequirementsFile)
	}

	if strings.HasPrefix(svc.GitRepoURL, "file://") {
		localPath := strings.TrimPrefix(svc.GitRepoURL, "file://")
		log("Using local folder " + localPath)
		if err := copyDir(localPath, repoDir); err != nil {
			return fmt.Errorf("copy local folder: %w", err)
		}
	} else {
		cloneURL := svc.GitRepoURL
		cmd := exec.CommandContext(ctx, "git", "clone", "--depth=1", "--branch", svc.GitBranch, cloneURL, repoDir)
		out, err := cmd.CombinedOutput()
		log(string(out))
		if err != nil {
			return fmt.Errorf("git clone: %w", err)
		}
	}

	// Dynamic detection and generation of Dockerfile if none exists
	if err := detectAndWriteDockerfile(repoDir, svc.Port, svc.Builder, svc.StartCommand, svc.InstallCommand, svc.AppDirectory, svc.RunFile, svc.RequirementsFile, svc.UseVenv, log); err != nil {
		return fmt.Errorf("generating Dockerfile: %w", err)
	}

	log("🔨 Building Docker image…")
	imageTag := "nf-" + svc.Name + ":latest"
	buildCmd := exec.CommandContext(ctx, "docker", "build", "-t", imageTag, repoDir)
	buildOut, err := buildCmd.CombinedOutput()
	log(string(buildOut))
	if err != nil {
		return fmt.Errorf("docker build: %w", err)
	}

	log("🚀 Starting container…")
	runArgs := []string{"run", "-d", "--restart=unless-stopped",
		"--name", "nf-app-" + svc.Name,
		"-l", "nanofly.service=" + svc.ID,
	}

	// Fetch environment variables from DB
	var envSlice []string
	rows, err := m.db.QueryContext(ctx, `SELECT key, value FROM env_vars WHERE service_id=?`, svc.ID)
	if err == nil && rows != nil {
		for rows.Next() {
			var k, v string
			if err := rows.Scan(&k, &v); err == nil {
				envSlice = append(envSlice, k+"="+v)
			}
		}
		rows.Close()
	}

	// Append env vars to docker run command
	for _, env := range envSlice {
		runArgs = append(runArgs, "-e", env)
	}

	if svc.Port > 0 {
		runArgs = append(runArgs, "-p", fmt.Sprintf("%d:%d", svc.Port, svc.Port))
		// Inject dynamic PORT env if not already defined
		hasPortEnv := false
		for _, env := range envSlice {
			if strings.HasPrefix(strings.ToUpper(env), "PORT=") {
				hasPortEnv = true
				break
			}
		}
		if !hasPortEnv {
			runArgs = append(runArgs, "-e", fmt.Sprintf("PORT=%d", svc.Port))
		}
	}
	runArgs = append(runArgs, imageTag)

	exec.CommandContext(ctx, "docker", "rm", "-f", "nf-app-"+svc.Name).Run() //nolint:errcheck
	runCmd := exec.CommandContext(ctx, "docker", runArgs...)
	runOut, err := runCmd.CombinedOutput()
	log(string(runOut))
	if err != nil {
		return fmt.Errorf("docker run: %w", err)
	}
	return nil
}

func copyDir(src, dst string) error {
	return filepath.WalkDir(src, func(path string, d os.DirEntry, walkErr error) error {
		if walkErr != nil {
			return walkErr
		}
		rel, err := filepath.Rel(src, path)
		if err != nil || rel == "." {
			return err
		}
		target := filepath.Join(dst, rel)
		if d.IsDir() {
			if d.Name() == ".git" || d.Name() == "node_modules" {
				return filepath.SkipDir
			}
			return os.MkdirAll(target, 0755)
		}
		info, err := d.Info()
		if err != nil {
			return err
		}
		if !info.Mode().IsRegular() {
			return nil
		}
		if err := os.MkdirAll(filepath.Dir(target), 0755); err != nil {
			return err
		}
		in, err := os.Open(path)
		if err != nil {
			return err
		}
		out, err := os.OpenFile(target, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, info.Mode().Perm())
		if err != nil {
			in.Close() //nolint:errcheck
			return err
		}
		_, copyErr := io.Copy(out, in)
		closeErr := out.Close()
		in.Close() //nolint:errcheck
		if copyErr != nil {
			return copyErr
		}
		return closeErr
	})
}

func defaultRequirementsFile(path string) string {
	path = cleanRelativePath(path)
	if path == "" {
		return "requirements.txt"
	}
	return path
}

func cleanRelativePath(path string) string {
	path = strings.TrimSpace(strings.ReplaceAll(path, "\\", "/"))
	path = strings.TrimPrefix(path, "/")
	path = filepath.Clean(path)
	path = strings.ReplaceAll(path, "\\", "/")
	if path == "." || strings.HasPrefix(path, "../") || path == ".." {
		return ""
	}
	return path
}

func dockerShellEscape(s string) string {
	s = strings.ReplaceAll(s, "\\", "\\\\")
	s = strings.ReplaceAll(s, `"`, `\"`)
	return s
}

func dockerWorkdir(appDirectory string) string {
	appDirectory = cleanRelativePath(appDirectory)
	if appDirectory == "" {
		return "/app"
	}
	return "/app/" + appDirectory
}

func findPythonRunFile(repoDir, appDirectory, runFile string) string {
	if clean := cleanRelativePath(runFile); clean != "" {
		return clean
	}

	searchDir := filepath.Join(repoDir, filepath.FromSlash(cleanRelativePath(appDirectory)))
	preferred := []string{"app.py", "main.py", "wsgi.py"}
	for _, name := range preferred {
		if _, err := os.Stat(filepath.Join(searchDir, name)); err == nil {
			return name
		}
	}

	entries, err := os.ReadDir(searchDir)
	if err != nil {
		return "main.py"
	}
	var names []string
	for _, entry := range entries {
		if !entry.IsDir() && strings.HasSuffix(strings.ToLower(entry.Name()), ".py") {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)
	if len(names) > 0 {
		return names[0]
	}
	return "main.py"
}

func pythonDockerfile(repoDir, portStr, startCommand, installCommand, appDirectory, runFile, requirementsFile string, useVenv bool) string {
	workdir := dockerWorkdir(appDirectory)
	runFile = findPythonRunFile(repoDir, appDirectory, runFile)
	requirementsFile = defaultRequirementsFile(requirementsFile)

	cmd := strings.TrimSpace(startCommand)
	if cmd == "" {
		cmd = "python " + runFile
	}

	install := strings.TrimSpace(installCommand)
	if install == "" {
		install = fmt.Sprintf(`if [ -f "%s" ]; then pip install --no-cache-dir -r "%s"; else echo "requirements file %s not found, skipping dependency install"; fi`, requirementsFile, requirementsFile, requirementsFile)
	}

	venvLines := ""
	if useVenv {
		venvLines = `RUN python -m venv /opt/venv
ENV PATH="/opt/venv/bin:$PATH"
`
	}

	return fmt.Sprintf(`FROM python:3.11-slim
WORKDIR /app
COPY . .
WORKDIR %s
%sRUN %s
ENV PORT=%s
EXPOSE %s
CMD ["sh", "-c", "%s"]
`, workdir, venvLines, install, portStr, portStr, dockerShellEscape(cmd))
}

// detectAndWriteDockerfile checks if a Dockerfile exists, and if not, detects the runtime and generates one.
func detectAndWriteDockerfile(repoDir string, svcPort int, builder, startCommand, installCommand, appDirectory, runFile, requirementsFile string, useVenv bool, log func(string)) error {
	dockerfilePath := filepath.Join(repoDir, "Dockerfile")
	if _, err := os.Stat(dockerfilePath); err == nil {
		log("ℹ️ Found existing Dockerfile in repository, using it.")
		return nil
	}

	portStr := "8080"
	if svcPort > 0 {
		portStr = fmt.Sprintf("%d", svcPort)
	}

	// 1. Manual selection triggers:
	if builder == "node" {
		log("ℹ️ Using NodeJS runtime template. Generating optimized Dockerfile…")
		install := strings.TrimSpace(installCommand)
		if install == "" {
			install = "npm install --production"
		}
		cmd := strings.TrimSpace(startCommand)
		if cmd == "" {
			cmd = "npm start"
		}
		content := fmt.Sprintf(`FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN %s
COPY . .
ENV PORT=%s
EXPOSE %s
CMD ["sh", "-c", "%s"]
`, install, portStr, portStr, dockerShellEscape(cmd))
		return os.WriteFile(dockerfilePath, []byte(content), 0644)
	}

	if builder == "go" {
		log("ℹ️ Using Go (Golang) runtime template. Generating optimized Dockerfile…")
		cmd := strings.TrimSpace(startCommand)
		if cmd == "" {
			cmd = "./main"
		}
		content := fmt.Sprintf(`FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod* go.sum* ./
RUN if [ -f go.mod ]; then go mod download; fi
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/main .
ENV PORT=%s
EXPOSE %s
CMD ["sh", "-c", "%s"]
`, portStr, portStr, dockerShellEscape(cmd))
		return os.WriteFile(dockerfilePath, []byte(content), 0644)
	}

	if builder == "python" {
		log("ℹ️ Using Python runtime template. Generating optimized Dockerfile…")
		content := pythonDockerfile(repoDir, portStr, startCommand, installCommand, appDirectory, runFile, requirementsFile, useVenv)
		return os.WriteFile(dockerfilePath, []byte(content), 0644)
	}

	if builder == "php" {
		log("ℹ️ Using PHP runtime template. Generating optimized Dockerfile…")
		content := fmt.Sprintf(`FROM php:8.2-apache
COPY . /var/www/html/
RUN a2enmod rewrite || true
RUN echo "Listen %s" > /etc/apache2/ports.conf && sed -i 's/<VirtualHost \\\*:80>/<VirtualHost *:%s>/g' /etc/apache2/sites-available/000-default.conf
EXPOSE %s
`, portStr, portStr, portStr)
		return os.WriteFile(dockerfilePath, []byte(content), 0644)
	}

	if builder == "static" {
		log("ℹ️ Using HTML/Static runtime template. Generating optimized Dockerfile…")
		content := fmt.Sprintf(`FROM nginx:alpine
COPY . /usr/share/nginx/html/
RUN sed -i 's/listen       80;/listen       %s;/g' /etc/nginx/conf.d/default.conf
EXPOSE %s
`, portStr, portStr)
		return os.WriteFile(dockerfilePath, []byte(content), 0644)
	}

	if builder == "dockerfile" {
		log("⚠️ Dockerfile builder selected but no Dockerfile was found in repository root.")
		return fmt.Errorf("no Dockerfile found in repository root")
	}

	// 2. Auto-detection fallback:
	// NodeJS
	if _, err := os.Stat(filepath.Join(repoDir, "package.json")); err == nil {
		log("ℹ️ Detected Node.js runtime. Generating optimized Dockerfile…")
		install := strings.TrimSpace(installCommand)
		if install == "" {
			install = "npm install --production"
		}
		cmd := strings.TrimSpace(startCommand)
		if cmd == "" {
			cmd = "npm start"
		}
		content := fmt.Sprintf(`FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN %s
COPY . .
ENV PORT=%s
EXPOSE %s
CMD ["sh", "-c", "%s"]
`, install, portStr, portStr, dockerShellEscape(cmd))
		return os.WriteFile(dockerfilePath, []byte(content), 0644)
	}

	cmd := strings.TrimSpace(startCommand)
	if cmd == "" {
		cmd = "./main"
	}

	// Go
	if _, err := os.Stat(filepath.Join(repoDir, "go.mod")); err == nil {
		log("ℹ️ Detected Go runtime. Generating optimized Dockerfile…")
		content := fmt.Sprintf(`FROM golang:1.22-alpine AS builder
WORKDIR /app
COPY go.mod* go.sum* ./
RUN if [ -f go.mod ]; then go mod download; fi
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -o main .

FROM alpine:latest
WORKDIR /app
COPY --from=builder /app/main .
ENV PORT=%s
EXPOSE %s
CMD ["sh", "-c", "%s"]
`, portStr, portStr, dockerShellEscape(cmd))
		return os.WriteFile(dockerfilePath, []byte(content), 0644)
	}

	// Python
	hasRequirements := false
	if _, err := os.Stat(filepath.Join(repoDir, "requirements.txt")); err == nil {
		hasRequirements = true
	}
	if hasRequirements || fileExistsWithExtension(repoDir, ".py") {
		log("ℹ️ Detected Python runtime. Generating optimized Dockerfile…")
		content := pythonDockerfile(repoDir, portStr, startCommand, installCommand, appDirectory, runFile, requirementsFile, useVenv)
		return os.WriteFile(dockerfilePath, []byte(content), 0644)
	}

	// PHP
	if _, err := os.Stat(filepath.Join(repoDir, "index.php")); err == nil || fileExistsWithExtension(repoDir, ".php") {
		log("ℹ️ Detected PHP runtime. Generating optimized Dockerfile…")
		content := fmt.Sprintf(`FROM php:8.2-apache
COPY . /var/www/html/
RUN a2enmod rewrite || true
RUN echo "Listen %s" > /etc/apache2/ports.conf && sed -i 's/<VirtualHost \\\*:80>/<VirtualHost *:%s>/g' /etc/apache2/sites-available/000-default.conf
EXPOSE %s
`, portStr, portStr, portStr)
		return os.WriteFile(dockerfilePath, []byte(content), 0644)
	}

	// Static Web
	if _, err := os.Stat(filepath.Join(repoDir, "index.html")); err == nil || fileExistsWithExtension(repoDir, ".html") {
		log("ℹ️ Detected HTML/Static website. Generating optimized Dockerfile…")
		content := fmt.Sprintf(`FROM nginx:alpine
COPY . /usr/share/nginx/html/
RUN sed -i 's/listen       80;/listen       %s;/g' /etc/nginx/conf.d/default.conf
EXPOSE %s
`, portStr, portStr)
		return os.WriteFile(dockerfilePath, []byte(content), 0644)
	}

	// Default fallback: assume Static / HTML
	log("ℹ️ No specific runtime files detected. Defaulting to HTML/Static web deployment…")
	content := fmt.Sprintf(`FROM nginx:alpine
COPY . /usr/share/nginx/html/
RUN sed -i 's/listen       80;/listen       %s;/g' /etc/nginx/conf.d/default.conf
EXPOSE %s
`, portStr, portStr)
	return os.WriteFile(dockerfilePath, []byte(content), 0644)
}

// Helper to check if any file with a specific extension exists in a directory
func fileExistsWithExtension(dir, ext string) bool {
	files, err := os.ReadDir(dir)
	if err != nil {
		return false
	}
	for _, f := range files {
		if !f.IsDir() && strings.HasSuffix(strings.ToLower(f.Name()), ext) {
			return true
		}
	}
	return false
}

// GetDeployment fetches a single deployment.
func (m *Manager) GetDeployment(ctx context.Context, deployID string) (*Deployment, error) {
	var d Deployment
	var startedAt string
	var finishedAt sql.NullString
	err := m.db.QueryRowContext(ctx, `
		SELECT id, service_id, status, COALESCE(commit_sha,''), COALESCE(commit_msg,''),
		       COALESCE(log,''), started_at, finished_at
		FROM deployments WHERE id=?
	`, deployID).Scan(
		&d.ID, &d.ServiceID, &d.Status, &d.CommitSHA, &d.CommitMsg,
		&d.Log, &startedAt, &finishedAt,
	)
	if err != nil {
		return nil, err
	}
	d.StartedAt = parseSqliteTime(startedAt)
	return &d, nil
}

// ListDeployments returns deployments for a service, newest first.
func (m *Manager) ListDeployments(ctx context.Context, serviceID string, limit int) ([]Deployment, error) {
	rows, err := m.db.QueryContext(ctx, `
		SELECT id, service_id, status, COALESCE(commit_sha,''), COALESCE(commit_msg,''),
		       COALESCE(log,''), started_at
		FROM deployments WHERE service_id=?
		ORDER BY started_at DESC LIMIT ?
	`, serviceID, limit)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var deps []Deployment
	for rows.Next() {
		var d Deployment
		var startedAt string
		rows.Scan(&d.ID, &d.ServiceID, &d.Status, &d.CommitSHA, &d.CommitMsg, &d.Log, &startedAt) //nolint:errcheck
		d.StartedAt = parseSqliteTime(startedAt)
		deps = append(deps, d)
	}
	if deps == nil {
		deps = []Deployment{}
	}
	return deps, nil
}

// GetEnvVars returns all env vars for a service.
func (m *Manager) GetEnvVars(ctx context.Context, serviceID string) ([]EnvVar, error) {
	rows, err := m.db.QueryContext(ctx, `SELECT key, value FROM env_vars WHERE service_id=? ORDER BY key`, serviceID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	var vars []EnvVar
	for rows.Next() {
		var ev EnvVar
		rows.Scan(&ev.Key, &ev.Value) //nolint:errcheck
		vars = append(vars, ev)
	}
	if vars == nil {
		vars = []EnvVar{}
	}
	return vars, nil
}

// UpsertEnvVar adds or updates a single env var.
func (m *Manager) UpsertEnvVar(ctx context.Context, serviceID, key, value string) error {
	_, err := m.db.ExecContext(ctx, `
		INSERT INTO env_vars (service_id, key, value) VALUES (?, ?, ?)
		ON CONFLICT(service_id, key) DO UPDATE SET value=excluded.value
	`, serviceID, key, value)
	return err
}

// DeleteEnvVar removes a single env var.
func (m *Manager) DeleteEnvVar(ctx context.Context, serviceID, key string) error {
	_, err := m.db.ExecContext(ctx, `DELETE FROM env_vars WHERE service_id=? AND key=?`, serviceID, key)
	return err
}

// Delete removes a service and its container (if running).
func (m *Manager) Delete(ctx context.Context, serviceID string) error {
	if m.docker != nil {
		// Try to remove any associated containers
		containers, _ := m.docker.ListByLabel(ctx, serviceID)
		for _, c := range containers {
			m.docker.RemoveContainer(ctx, c.ID) //nolint:errcheck
		}
	}
	_, err := m.db.ExecContext(ctx, `DELETE FROM services WHERE id=?`, serviceID)
	return err
}

// WebhookHandler processes incoming GitHub push webhooks and redeploys.
func (m *Manager) HandleWebhook(ctx context.Context, serviceID string, body io.Reader) error {
	svc, err := m.Get(ctx, serviceID)
	if err != nil {
		return err
	}
	if svc.GitRepoURL == "" {
		return fmt.Errorf("service has no git source")
	}
	_, err = m.Deploy(ctx, serviceID)
	return err
}

// DockerStatus queries Docker for the real status of a service's container.
func (m *Manager) DockerStatus(ctx context.Context, serviceID string) string {
	if m.docker == nil {
		return "unknown"
	}
	containers, err := m.docker.ListByLabel(ctx, serviceID)
	if err != nil || len(containers) == 0 {
		return "stopped"
	}
	return containers[0].State
}

// GetContainerLogs returns live container logs for the service.
func (m *Manager) GetContainerLogs(ctx context.Context, serviceID string) (string, error) {
	if m.docker == nil {
		return "", fmt.Errorf("docker not available")
	}
	containers, err := m.docker.ListByLabel(ctx, serviceID)
	if err != nil {
		return "", err
	}
	if len(containers) == 0 {
		return "No active container found for this resource. It might be stopped, erroring, or deleted.", nil
	}
	return m.docker.Logs(ctx, containers[0].ID, "100")
}

// UpdateServiceReq defines request parameters to edit service settings.
type UpdateServiceReq struct {
	Name             string `json:"name"`
	Image            string `json:"image"`
	Port             int    `json:"port"`
	GitRepoURL       string `json:"git_repo_url"`
	GitBranch        string `json:"git_branch"`
	Builder          string `json:"git_builder"`
	StartCommand     string `json:"start_command"`
	InstallCommand   string `json:"install_command"`
	AppDirectory     string `json:"app_directory"`
	RunFile          string `json:"run_file"`
	RequirementsFile string `json:"requirements_file"`
	UseVenv          bool   `json:"use_venv"`
}

// Update updates the service's details in DB and optional git sources.
func (m *Manager) Update(ctx context.Context, serviceID string, req UpdateServiceReq) (*Service, error) {
	_, err := m.db.ExecContext(ctx, `
		UPDATE services
		SET name = ?, image = ?, port = ?, start_command = ?, install_command = ?,
		    app_directory = ?, run_file = ?, requirements_file = ?, use_venv = ?,
		    updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, req.Name, req.Image, req.Port, req.StartCommand, req.InstallCommand,
		req.AppDirectory, req.RunFile, defaultRequirementsFile(req.RequirementsFile), req.UseVenv, serviceID)
	if err != nil {
		return nil, fmt.Errorf("updating service table: %w", err)
	}

	builderVal := req.Builder
	if builderVal == "" {
		builderVal = "auto"
	}

	// Update git sources if relevant
	var exists bool
	_ = m.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM git_sources WHERE service_id = ?)`, serviceID).Scan(&exists)
	if exists {
		if req.GitRepoURL == "" {
			_, _ = m.db.ExecContext(ctx, `DELETE FROM git_sources WHERE service_id = ?`, serviceID)
		} else {
			_, _ = m.db.ExecContext(ctx, `
				UPDATE git_sources
				SET repo_url = ?, branch = ?, builder = ?
				WHERE service_id = ?
			`, req.GitRepoURL, req.GitBranch, builderVal, serviceID)
		}
	} else if req.GitRepoURL != "" {
		_, _ = m.db.ExecContext(ctx, `
			INSERT INTO git_sources (service_id, repo_url, branch, webhook_secret, builder)
			VALUES (?, ?, ?, ?, ?)
		`, serviceID, req.GitRepoURL, req.GitBranch, docker.RandPassword(), builderVal)
	}

	return m.Get(ctx, serviceID)
}

// Stop stops a service container.
func (m *Manager) Stop(ctx context.Context, serviceID string) error {
	if m.docker != nil {
		containers, _ := m.docker.ListByLabel(ctx, serviceID)
		for _, c := range containers {
			_ = m.docker.StopContainer(ctx, c.ID)
		}
	}
	_, err := m.db.ExecContext(ctx, `UPDATE services SET status='stopped' WHERE id=?`, serviceID)
	return err
}

// Restart restarts a service container.
func (m *Manager) Restart(ctx context.Context, serviceID string) error {
	if m.docker == nil {
		return fmt.Errorf("docker not available")
	}
	containers, err := m.docker.ListByLabel(ctx, serviceID)
	if err != nil {
		return err
	}
	if len(containers) == 0 {
		// Not running / not deployed yet, deploy it
		_, err := m.Deploy(ctx, serviceID)
		return err
	}
	for _, c := range containers {
		_ = m.docker.RestartContainer(ctx, c.ID)
	}
	_, err = m.db.ExecContext(ctx, `UPDATE services SET status='running' WHERE id=?`, serviceID)
	return err
}

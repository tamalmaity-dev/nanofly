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
	"strings"
	"time"

	"github.com/nanofly/nanofly/internal/api/docker"
	"github.com/nanofly/nanofly/internal/db"
)

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
	GitRepoURL  string `json:"git_repo_url,omitempty"`
	GitBranch   string `json:"git_branch,omitempty"`
	ConnString  string `json:"conn_string,omitempty"` // databases only (encrypted stub)
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

// List returns all services for a project.
func (m *Manager) List(ctx context.Context, projectID string) ([]Service, error) {
	rows, err := m.db.QueryContext(ctx, `
		SELECT s.id, s.project_id, s.name, s.type, s.status, 
		       COALESCE(s.port,0), COALESCE(s.updated_at,''), s.created_at,
		       COALESCE(g.repo_url,''), COALESCE(g.branch,'main'),
		       COALESCE(s.image,'')
		FROM services s
		LEFT JOIN git_sources g ON g.service_id = s.id
		WHERE s.project_id = ?
		ORDER BY s.created_at DESC
	`, projectID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var svcs []Service
	for rows.Next() {
		var s Service
		var updatedAt, createdAt string
		if err := rows.Scan(
			&s.ID, &s.ProjectID, &s.Name, &s.Type, &s.Status,
			&s.Port, &updatedAt, &createdAt,
			&s.GitRepoURL, &s.GitBranch,
			&s.Image,
		); err != nil {
			return nil, err
		}
		s.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
		s.Type = ServiceType(string(s.Type))
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
		       COALESCE(s.image,'')
		FROM services s
		LEFT JOIN git_sources g ON g.service_id = s.id
		WHERE s.id = ?
	`, id).Scan(
		&s.ID, &s.ProjectID, &s.Name, &s.Type, &s.Status,
		&s.Port, &createdAt,
		&s.GitRepoURL, &s.GitBranch,
		&s.Image,
	)
	if err != nil {
		return nil, err
	}
	s.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	return &s, nil
}

// CreateAppReq defines what's needed to create an App service.
type CreateAppReq struct {
	ProjectID   string
	Name        string
	Image       string   // Docker image (e.g. nginx:alpine)
	Port        int
	EnvVars     []EnvVar

	// GitHub source (optional)
	GitRepoURL  string
	GitBranch   string
	GitToken    string // PAT for private repos
}

// CreateApp creates an App service record (doesn't deploy yet).
func (m *Manager) CreateApp(ctx context.Context, req CreateAppReq) (*Service, error) {
	var id string
	err := m.db.QueryRowContext(ctx, `
		INSERT INTO services (project_id, name, type, status, port, image)
		VALUES (?, ?, 'app', 'idle', ?, ?)
		RETURNING id
	`, req.ProjectID, req.Name, req.Port, req.Image).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("creating service: %w", err)
	}

	// Store git source if provided
	if req.GitRepoURL != "" {
		_, err = m.db.ExecContext(ctx, `
			INSERT INTO git_sources (service_id, repo_url, branch, webhook_secret)
			VALUES (?, ?, ?, ?)
		`, id, req.GitRepoURL, req.GitBranch, docker.RandPassword())
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
			m.db.ExecContext(bgCtx, `UPDATE services SET status=? WHERE id=?`, finalStatus, serviceID) //nolint:errcheck
		}()

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
			if err := gitDeploy(bgCtx, svc, log); err != nil {
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

// gitDeploy clones a repo and runs the app inside Docker.
func gitDeploy(ctx context.Context, svc *Service, log func(string)) error {
	repoDir := filepath.Join(os.TempDir(), "nanofly-"+svc.ID)
	os.RemoveAll(repoDir) //nolint:errcheck

	log("📥 Cloning " + svc.GitRepoURL + " (" + svc.GitBranch + ")…")

	cloneURL := svc.GitRepoURL
	cmd := exec.CommandContext(ctx, "git", "clone", "--depth=1", "--branch", svc.GitBranch, cloneURL, repoDir)
	out, err := cmd.CombinedOutput()
	log(string(out))
	if err != nil {
		return fmt.Errorf("git clone: %w", err)
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
	if svc.Port > 0 {
		runArgs = append(runArgs, "-p", fmt.Sprintf("%d:%d", svc.Port, svc.Port))
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
	d.StartedAt, _ = time.Parse("2006-01-02 15:04:05", startedAt)
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
		d.StartedAt, _ = time.Parse("2006-01-02 15:04:05", startedAt)
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
	Name       string `json:"name"`
	Image      string `json:"image"`
	Port       int    `json:"port"`
	GitRepoURL string `json:"git_repo_url"`
	GitBranch  string `json:"git_branch"`
}

// Update updates the service's details in DB and optional git sources.
func (m *Manager) Update(ctx context.Context, serviceID string, req UpdateServiceReq) (*Service, error) {
	_, err := m.db.ExecContext(ctx, `
		UPDATE services
		SET name = ?, image = ?, port = ?, updated_at = CURRENT_TIMESTAMP
		WHERE id = ?
	`, req.Name, req.Image, req.Port, serviceID)
	if err != nil {
		return nil, fmt.Errorf("updating service table: %w", err)
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
				SET repo_url = ?, branch = ?
				WHERE service_id = ?
			`, req.GitRepoURL, req.GitBranch, serviceID)
		}
	} else if req.GitRepoURL != "" {
		_, _ = m.db.ExecContext(ctx, `
			INSERT INTO git_sources (service_id, repo_url, branch, webhook_secret)
			VALUES (?, ?, ?, ?)
		`, serviceID, req.GitRepoURL, req.GitBranch, docker.RandPassword())
	}

	return m.Get(ctx, serviceID)
}

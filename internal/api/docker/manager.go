//go:build linux || darwin || freebsd
// +build linux darwin freebsd

// internal/api/docker/manager.go — Docker container lifecycle management (Linux/macOS only)
package docker

import (
	"context"
	"fmt"
	"io"
	"log/slog"
	"math/rand"
	"strings"

	dockertypes "github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
)

// Manager wraps the Docker client with NanoFly-specific helpers.
type Manager struct {
	cli *client.Client
}

// New creates a Manager connected to the local Docker daemon.
func New() (*Manager, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("connecting to docker: %w", err)
	}
	return &Manager{cli: cli}, nil
}

// Available returns true if the Docker daemon is reachable.
func (m *Manager) Available(ctx context.Context) bool {
	_, err := m.cli.Ping(ctx)
	return err == nil
}

// ContainerInfo describes a running or stopped container.
type ContainerInfo struct {
	ID      string `json:"id"`
	Name    string `json:"name"`
	Image   string `json:"image"`
	Status  string `json:"status"`
	State   string `json:"state"`
	Ports   string `json:"ports"`
	Created int64  `json:"created"`
}

// ListByLabel lists containers with label nanofly.service=<serviceID>.
func (m *Manager) ListByLabel(ctx context.Context, serviceID string) ([]ContainerInfo, error) {
	f := filters.NewArgs(filters.Arg("label", "nanofly.service="+serviceID))
	containers, err := m.cli.ContainerList(ctx, container.ListOptions{All: true, Filters: f})
	if err != nil {
		return nil, err
	}

	var out []ContainerInfo
	for _, c := range containers {
		name := ""
		if len(c.Names) > 0 {
			name = strings.TrimPrefix(c.Names[0], "/")
		}
		ports := ""
		for _, p := range c.Ports {
			if p.PublicPort > 0 {
				ports += fmt.Sprintf("%d→%d ", p.PublicPort, p.PrivatePort)
			}
		}
		out = append(out, ContainerInfo{
			ID:      c.ID[:12],
			Name:    name,
			Image:   c.Image,
			Status:  c.Status,
			State:   c.State,
			Ports:   strings.TrimSpace(ports),
			Created: c.Created,
		})
	}
	return out, nil
}

// DBConfig describes a managed database container.
type DBConfig struct {
	ServiceID string
	DBType    string // postgres, mysql, redis, mongo
	Name      string
	Password  string
	DBName    string
	HostPort  int
}

func imageFor(dbType string) (string, int, error) {
	// dbType format: "postgres", "postgres:15", "mysql:5.7", etc.
	// If no tag specified, default to latest stable.
	switch {
	// PostgreSQL
	case dbType == "postgres" || dbType == "postgres:16":
		return "postgres:16-alpine", 5432, nil
	case dbType == "postgres:15":
		return "postgres:15-alpine", 5432, nil
	case dbType == "postgres:14":
		return "postgres:14-alpine", 5432, nil
	case dbType == "postgres:13":
		return "postgres:13-alpine", 5432, nil

	// MySQL
	case dbType == "mysql" || dbType == "mysql:8":
		return "mysql:8.0", 3306, nil
	case dbType == "mysql:5.7":
		return "mysql:5.7", 3306, nil

	// MariaDB
	case dbType == "mariadb" || dbType == "mariadb:11":
		return "mariadb:11", 3306, nil
	case dbType == "mariadb:10":
		return "mariadb:10.11", 3306, nil

	// Redis
	case dbType == "redis" || dbType == "redis:7":
		return "redis:7-alpine", 6379, nil
	case dbType == "redis:6":
		return "redis:6-alpine", 6379, nil

	// MongoDB
	case dbType == "mongo" || dbType == "mongo:7":
		return "mongo:7.0", 27017, nil
	case dbType == "mongo:6":
		return "mongo:6.0", 27017, nil
	case dbType == "mongo:5":
		return "mongo:5.0", 27017, nil

	// KeyDB (Redis-compatible, multithreaded)
	case dbType == "keydb":
		return "eqalpha/keydb:latest", 6379, nil

	// ClickHouse (analytics)
	case dbType == "clickhouse":
		return "clickhouse/clickhouse-server:24-alpine", 8123, nil

	default:
		return "", 0, fmt.Errorf("unknown db type: %s", dbType)
	}
}


func randomPort() int {
	return 20000 + rand.Intn(10000)
}

// PullImage pulls a Docker image, writing progress to out.
func (m *Manager) PullImage(ctx context.Context, img string, out io.Writer) error {
	rc, err := m.cli.ImagePull(ctx, img, image.PullOptions{})
	if err != nil {
		return fmt.Errorf("pulling image %s: %w", img, err)
	}
	defer rc.Close()
	io.Copy(out, rc) //nolint:errcheck
	return nil
}

// CreateDB creates and starts a managed database container.
func (m *Manager) CreateDB(ctx context.Context, cfg DBConfig) (int, string, error) {
	img, containerPort, err := imageFor(cfg.DBType)
	if err != nil {
		return 0, "", err
	}

	rc, _ := m.cli.ImagePull(ctx, img, image.PullOptions{})
	if rc != nil {
		rc.Close()
	}

	hostPort := cfg.HostPort
	if hostPort == 0 {
		hostPort = randomPort()
	}

	portBinding := nat.PortMap{
		nat.Port(fmt.Sprintf("%d/tcp", containerPort)): []nat.PortBinding{
			{HostIP: "127.0.0.1", HostPort: fmt.Sprintf("%d", hostPort)},
		},
	}

	var env []string
	var connStr string

	switch {
	case cfg.DBType == "postgres" || strings.HasPrefix(cfg.DBType, "postgres:"):
		env = []string{
			"POSTGRES_USER=nanofly",
			"POSTGRES_PASSWORD=" + cfg.Password,
			"POSTGRES_DB=" + cfg.DBName,
		}
		connStr = fmt.Sprintf("postgres://nanofly:%s@localhost:%d/%s", cfg.Password, hostPort, cfg.DBName)
	case cfg.DBType == "mysql" || strings.HasPrefix(cfg.DBType, "mysql:") || cfg.DBType == "mariadb" || strings.HasPrefix(cfg.DBType, "mariadb:"):
		env = []string{
			"MYSQL_ROOT_PASSWORD=" + cfg.Password,
			"MYSQL_USER=nanofly",
			"MYSQL_PASSWORD=" + cfg.Password,
			"MYSQL_DATABASE=" + cfg.DBName,
		}
		connStr = fmt.Sprintf("mysql://nanofly:%s@localhost:%d/%s", cfg.Password, hostPort, cfg.DBName)
	case cfg.DBType == "redis" || strings.HasPrefix(cfg.DBType, "redis:") || cfg.DBType == "keydb":
		connStr = fmt.Sprintf("redis://:@localhost:%d", hostPort)
	case cfg.DBType == "mongo" || strings.HasPrefix(cfg.DBType, "mongo:"):
		env = []string{
			"MONGO_INITDB_ROOT_USERNAME=nanofly",
			"MONGO_INITDB_ROOT_PASSWORD=" + cfg.Password,
		}
		connStr = fmt.Sprintf("mongodb://nanofly:%s@localhost:%d/%s", cfg.Password, hostPort, cfg.DBName)
	case cfg.DBType == "clickhouse":
		env = []string{
			"CLICKHOUSE_USER=nanofly",
			"CLICKHOUSE_PASSWORD=" + cfg.Password,
			"CLICKHOUSE_DB=" + cfg.DBName,
		}
		connStr = fmt.Sprintf("clickhouse://nanofly:%s@localhost:%d/%s", cfg.Password, hostPort, cfg.DBName)
	}

	containerName := "nf-db-" + cfg.Name
	resp, err := m.cli.ContainerCreate(ctx, &container.Config{
		Image: img,
		Env:   env,
		Labels: map[string]string{
			"nanofly.service": cfg.ServiceID,
			"nanofly.type":    "database",
			"nanofly.db":      cfg.DBType,
		},
	}, &container.HostConfig{
		PortBindings:  portBinding,
		RestartPolicy: container.RestartPolicy{Name: "unless-stopped"},
	}, nil, nil, containerName)
	if err != nil {
		return 0, "", fmt.Errorf("creating container: %w", err)
	}

	if err := m.cli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return 0, "", fmt.Errorf("starting container: %w", err)
	}

	return hostPort, connStr, nil
}

// StopContainer stops a running container.
func (m *Manager) StopContainer(ctx context.Context, nameOrID string) error {
	timeout := 10
	return m.cli.ContainerStop(ctx, nameOrID, container.StopOptions{Timeout: &timeout})
}

// RemoveContainer stops and removes a container.
func (m *Manager) RemoveContainer(ctx context.Context, nameOrID string) error {
	m.StopContainer(ctx, nameOrID) //nolint:errcheck
	return m.cli.ContainerRemove(ctx, nameOrID, container.RemoveOptions{Force: true, RemoveVolumes: true})
}

// Logs returns the last N lines of container logs.
func (m *Manager) Logs(ctx context.Context, nameOrID string, tail string) (string, error) {
	if tail == "" {
		tail = "100"
	}
	rc, err := m.cli.ContainerLogs(ctx, nameOrID, container.LogsOptions{
		ShowStdout: true,
		ShowStderr: true,
		Tail:       tail,
		Timestamps: true,
	})
	if err != nil {
		return "", err
	}
	defer rc.Close()
	var sb strings.Builder
	io.Copy(&sb, rc) //nolint:errcheck
	return sb.String(), nil
}

// DeployApp deploys a Docker image as an app container.
func (m *Manager) DeployApp(ctx context.Context, serviceID, name, img string, hostPort, containerPort int, envVars []string) (string, error) {
	slog.Info("pulling image", "image", img)
	rc, err := m.cli.ImagePull(ctx, img, image.PullOptions{})
	if err != nil {
		return "", fmt.Errorf("pulling image: %w", err)
	}
	rc.Close()

	oldName := "nf-app-" + name
	m.RemoveContainer(ctx, oldName) //nolint:errcheck

	portBinding := nat.PortMap{}
	if hostPort > 0 && containerPort > 0 {
		portBinding[nat.Port(fmt.Sprintf("%d/tcp", containerPort))] = []nat.PortBinding{
			{HostIP: "0.0.0.0", HostPort: fmt.Sprintf("%d", hostPort)},
		}
	}

	resp, err := m.cli.ContainerCreate(ctx, &container.Config{
		Image: img,
		Env:   envVars,
		Labels: map[string]string{
			"nanofly.service": serviceID,
			"nanofly.type":    "app",
			"nanofly.name":    name,
		},
	}, &container.HostConfig{
		PortBindings:  portBinding,
		RestartPolicy: container.RestartPolicy{Name: "unless-stopped"},
	}, nil, nil, oldName)
	if err != nil {
		return "", fmt.Errorf("creating container: %w", err)
	}

	if err := m.cli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return "", fmt.Errorf("starting container: %w", err)
	}

	return resp.ID[:12], nil
}

// InspectContainer returns info about a single container.
func (m *Manager) InspectContainer(ctx context.Context, nameOrID string) (*dockertypes.ContainerJSON, error) {
	info, err := m.cli.ContainerInspect(ctx, nameOrID)
	if err != nil {
		return nil, err
	}
	return &info, nil
}


//go:build linux || darwin || freebsd
// +build linux darwin freebsd

// internal/api/docker/manager.go — Docker container lifecycle management (Linux/macOS only)
package docker

import (
	"context"
	"encoding/binary"
	"fmt"
	"io"
	"log/slog"
	"math/rand"
	"strings"
	"time"

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
	parts := strings.Split(dbType, ":")
	baseType := parts[0]
	version := ""
	if len(parts) > 1 {
		version = parts[1]
	}

	switch baseType {
	case "postgres":
		tag := "16-alpine"
		if version != "" {
			tag = version + "-alpine"
		}
		return "postgres:" + tag, 5432, nil
	case "mysql":
		tag := "8.0"
		if version != "" {
			tag = version
		}
		return "mysql:" + tag, 3306, nil
	case "mariadb":
		tag := "11"
		if version != "" {
			tag = version
		}
		return "mariadb:" + tag, 3306, nil
	case "redis":
		tag := "7-alpine"
		if version != "" {
			tag = version + "-alpine"
		}
		return "redis:" + tag, 6379, nil
	case "mongo":
		tag := "7.0"
		if version != "" {
			tag = version
		}
		return "mongo:" + tag, 27017, nil
	case "keydb":
		return "eqalpha/keydb:latest", 6379, nil
	case "clickhouse":
		return "clickhouse/clickhouse-server:24-alpine", 8123, nil
	case "dragonfly":
		return "docker.dragonflydb.io/dragonflydb/dragonfly:latest", 6379, nil
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

	rc, err := m.cli.ImagePull(ctx, img, image.PullOptions{})
	if err != nil {
		return 0, "", fmt.Errorf("pulling image %s: %w", img, err)
	}
	defer rc.Close()
	_, _ = io.Copy(io.Discard, rc)

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

// RestartContainer restarts a container.
func (m *Manager) RestartContainer(ctx context.Context, nameOrID string) error {
	timeout := 10
	return m.cli.ContainerRestart(ctx, nameOrID, container.StopOptions{Timeout: &timeout})
}

// RemoveContainer stops and removes a container.
func (m *Manager) RemoveContainer(ctx context.Context, nameOrID string) error {
	m.StopContainer(ctx, nameOrID) //nolint:errcheck
	return m.cli.ContainerRemove(ctx, nameOrID, container.RemoveOptions{Force: true, RemoveVolumes: true})
}

// Logs returns the last N lines of container logs, demultiplexed and formatted.
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
	header := make([]byte, 8)
	for {
		_, err := io.ReadFull(rc, header)
		if err != nil {
			break
		}
		// Stream type: header[0] (1 = stdout, 2 = stderr)
		length := binary.BigEndian.Uint32(header[4:8])
		payload := make([]byte, length)
		_, err = io.ReadFull(rc, payload)
		if err != nil {
			break
		}

		// Process the payload line by line to format the Docker RFC3339 timestamps
		lines := strings.Split(string(payload), "\n")
		for i, line := range lines {
			if line == "" && i == len(lines)-1 {
				continue
			}
			trimmed := strings.TrimSpace(line)
			// A line with Docker timestamp looks like: 2026-05-22T18:41:09.803493204Z actual_log_msg
			spaceIdx := strings.Index(trimmed, " ")
			if spaceIdx > 0 {
				tsStr := trimmed[:spaceIdx]
				rest := line[strings.Index(line, tsStr)+len(tsStr):]
				if t, parseErr := time.Parse(time.RFC3339Nano, tsStr); parseErr == nil {
					// Format nicely as: [2026-05-22 18:41:09] rest_of_line
					formattedTime := t.Local().Format("2006-01-02 15:04:05")
					sb.WriteString(fmt.Sprintf("[%s] %s\n", formattedTime, strings.TrimPrefix(rest, " ")))
					continue
				}
			}
			sb.WriteString(line + "\n")
		}
	}
	return sb.String(), nil
}

// DeployApp deploys a Docker image as an app container.
func (m *Manager) DeployApp(ctx context.Context, serviceID, name, img string, hostPort, containerPort int, envVars []string) (string, error) {
	slog.Info("pulling image", "image", img)
	rc, err := m.cli.ImagePull(ctx, img, image.PullOptions{})
	if err != nil {
		return "", fmt.Errorf("pulling image %s: %w", img, err)
	}
	defer rc.Close()
	_, _ = io.Copy(io.Discard, rc)

	oldName := "nf-app-" + name
	m.RemoveContainer(ctx, oldName) //nolint:errcheck

	// Inspect image config to detect exposed ports
	exposedPort := containerPort
	if inspect, err := m.cli.ImageInspect(ctx, img); err == nil {
		if inspect.Config != nil && len(inspect.Config.ExposedPorts) > 0 {
			for p := range inspect.Config.ExposedPorts {
				var portVal int
				if _, err := fmt.Sscanf(p.Port(), "%d", &portVal); err == nil && portVal > 0 {
					exposedPort = portVal
					break
				}
			}
		}
	}

	portBinding := nat.PortMap{}
	if hostPort > 0 && exposedPort > 0 {
		portBinding[nat.Port(fmt.Sprintf("%d/tcp", exposedPort))] = []nat.PortBinding{
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


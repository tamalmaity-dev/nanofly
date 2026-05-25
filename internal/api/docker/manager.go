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
	"os"
	"path/filepath"
	"strings"
	"time"

	dockertypes "github.com/docker/docker/api/types"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/events"
	"github.com/docker/docker/api/types/filters"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/client"
	"github.com/docker/go-connections/nat"
)

// OomEvent is delivered when Docker reports a container OOM-kill or crash.
type OomEvent struct {
	ContainerName string
	ExitCode      string // "137" means OOM-killed
	Action        string // "oom" | "die"
}

// Manager wraps the Docker client with NanoFly-specific helpers.
type Manager struct {
	cli        *client.Client
	dataDir    string
	OomHandler func(OomEvent) // optional: called from a background goroutine
}

// DataDir returns the NanoFly data directory path.
func (m *Manager) DataDir() string {
	return m.dataDir
}

// New creates a Manager connected to the local Docker daemon.
func New(dataDir string) (*Manager, error) {
	cli, err := client.NewClientWithOpts(client.FromEnv, client.WithAPIVersionNegotiation())
	if err != nil {
		return nil, fmt.Errorf("connecting to docker: %w", err)
	}
	m := &Manager{cli: cli, dataDir: dataDir}
	go m.WatchEvents(context.Background())
	return m, nil
}

// WatchEvents subscribes to Docker events and fires OomHandler for oom/die events.
// It runs for the lifetime of ctx. Reconnects automatically on error.
func (m *Manager) WatchEvents(ctx context.Context) {
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}

		f := filters.NewArgs()
		f.Add("type", "container")
		f.Add("event", "oom")
		f.Add("event", "die")

		evtCh, errCh := m.cli.Events(ctx, events.ListOptions{Filters: f})
		for {
			select {
			case evt := <-evtCh:
				if m.OomHandler == nil {
					continue
				}
				cName := evt.Actor.Attributes["name"]
				exitCode := evt.Actor.Attributes["exitCode"]
				m.OomHandler(OomEvent{
					ContainerName: cName,
					ExitCode:      exitCode,
					Action:        string(evt.Action),
				})
			case err := <-errCh:
				if err != nil && ctx.Err() == nil {
					slog.Warn("docker event stream interrupted, reconnecting", "error", err)
					time.Sleep(3 * time.Second)
				}
				goto reconnect
			}
		}
	reconnect:
	}
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

// DBConfig holds the configuration for a new database container.
type DBConfig struct {
	ServiceID    string
	DBType       string // "postgres", "mysql", "redis", "mongodb"
	Name         string
	Username     string
	Password     string
	DBName       string
	HostPort     int
	TierName     string
	CustomMemory int64   // Memory limit in bytes (0 = use tier default)
	CustomCPU    float64 // CPU limit (0.5 = 50% of 1 core, 2.0 = 2 full cores) (0 = use tier default)
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

	// Default username if not provided
	user := cfg.Username
	if user == "" {
		user = "nanofly"
	}

	switch {
	case cfg.DBType == "postgres" || strings.HasPrefix(cfg.DBType, "postgres:"):
		env = []string{
			"POSTGRES_USER=" + user,
			"POSTGRES_PASSWORD=" + cfg.Password,
			"POSTGRES_DB=" + cfg.DBName,
		}
		connStr = fmt.Sprintf("postgres://%s:%s@localhost:%d/%s", user, cfg.Password, hostPort, cfg.DBName)
	case cfg.DBType == "mysql" || strings.HasPrefix(cfg.DBType, "mysql:") || cfg.DBType == "mariadb" || strings.HasPrefix(cfg.DBType, "mariadb:"):
		env = []string{
			"MYSQL_ROOT_PASSWORD=" + cfg.Password,
			"MYSQL_USER=" + user,
			"MYSQL_PASSWORD=" + cfg.Password,
			"MYSQL_DATABASE=" + cfg.DBName,
		}
		connStr = fmt.Sprintf("mysql://%s:%s@localhost:%d/%s", user, cfg.Password, hostPort, cfg.DBName)
	case cfg.DBType == "redis" || strings.HasPrefix(cfg.DBType, "redis:") || cfg.DBType == "keydb":
		connStr = fmt.Sprintf("redis://:@localhost:%d", hostPort)
	case cfg.DBType == "mongo" || strings.HasPrefix(cfg.DBType, "mongo:"):
		env = []string{
			"MONGO_INITDB_ROOT_USERNAME=" + user,
			"MONGO_INITDB_ROOT_PASSWORD=" + cfg.Password,
		}
		connStr = fmt.Sprintf("mongodb://%s:%s@localhost:%d/%s", user, cfg.Password, hostPort, cfg.DBName)
	case cfg.DBType == "clickhouse":
		env = []string{
			"CLICKHOUSE_USER=" + user,
			"CLICKHOUSE_PASSWORD=" + cfg.Password,
			"CLICKHOUSE_DB=" + cfg.DBName,
		}
		connStr = fmt.Sprintf("clickhouse://%s:%s@localhost:%d/%s", user, cfg.Password, hostPort, cfg.DBName)
	}

	// Persistent Host Volume
	hostVol := filepath.Join(m.dataDir, "volumes", "db_"+cfg.ServiceID)
	os.MkdirAll(hostVol, 0755) //nolint:errcheck

	var containerVol string
	switch {
	case cfg.DBType == "postgres" || strings.HasPrefix(cfg.DBType, "postgres:"):
		containerVol = "/var/lib/postgresql/data"
	case cfg.DBType == "mysql" || strings.HasPrefix(cfg.DBType, "mysql:") || cfg.DBType == "mariadb" || strings.HasPrefix(cfg.DBType, "mariadb:"):
		containerVol = "/var/lib/mysql"
	case cfg.DBType == "redis" || strings.HasPrefix(cfg.DBType, "redis:") || cfg.DBType == "keydb":
		containerVol = "/data"
	case cfg.DBType == "mongo" || strings.HasPrefix(cfg.DBType, "mongo:"):
		containerVol = "/data/db"
	case cfg.DBType == "clickhouse":
		containerVol = "/var/lib/clickhouse"
	default:
		containerVol = "/data"
	}

	containerName := "nf-db-" + cfg.Name
	tier := GetTierWithCustom(cfg.TierName, cfg.CustomMemory, cfg.CustomCPU)

	resp, err := m.cli.ContainerCreate(ctx, &container.Config{
		Image: img,
		Env:   env,
		Labels: map[string]string{
			"nanofly.service": cfg.ServiceID,
			"nanofly.type":    "database",
			"nanofly.db":      cfg.DBType,
			"nanofly.name":    cfg.Name,
		},
	}, &container.HostConfig{
		PortBindings:  portBinding,
		Binds:         []string{hostVol + ":" + containerVol},
		RestartPolicy: container.RestartPolicy{Name: "on-failure", MaximumRetryCount: 5},
		Resources: container.Resources{
			Memory:     tier.Memory,
			MemorySwap: tier.MemorySwap,
			CPUQuota:   tier.CPUQuota,
			CPUPeriod:  tier.CPUPeriod,
		},
		Init:       boolPtr(true),
		CapDrop:    []string{"ALL"},
		CapAdd:     []string{"CHOWN", "SETUID", "SETGID", "DAC_OVERRIDE"},
		Privileged: false,
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
func (m *Manager) DeployApp(ctx context.Context, serviceID, name, img string, hostPort, containerPort int, envVars []string, domains []string, tierName string, customMemory int64, customCPU float64) (string, error) {
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

	labels := map[string]string{
		"nanofly.service": serviceID,
		"nanofly.type":    "app",
		"nanofly.name":    name,
	}

	if len(domains) > 0 {
		labels["traefik.enable"] = "true"
		labels[fmt.Sprintf("traefik.http.services.%s.loadbalancer.server.port", name)] = fmt.Sprintf("%d", exposedPort)
		
		var hostRules []string
		for _, d := range domains {
			hostRules = append(hostRules, fmt.Sprintf("Host(`%s`)", d))
		}
		
		rule := strings.Join(hostRules, " || ")
		labels[fmt.Sprintf("traefik.http.routers.%s.rule", name)] = rule
		labels[fmt.Sprintf("traefik.http.routers.%s.tls", name)] = "true"
		labels[fmt.Sprintf("traefik.http.routers.%s.tls.certresolver", name)] = "letsencrypt"
	}

	tier := GetTierWithCustom(tierName, customMemory, customCPU)

	resp, err := m.cli.ContainerCreate(ctx, &container.Config{
		Image: img,
		Env:   envVars,
		Labels: labels,
	}, &container.HostConfig{
		PortBindings:  portBinding,
		ExtraHosts:    []string{"host.docker.internal:host-gateway"},
		RestartPolicy: container.RestartPolicy{Name: "on-failure", MaximumRetryCount: 5},
		Resources: container.Resources{
			Memory:     tier.Memory,
			MemorySwap: tier.MemorySwap,
			CPUQuota:   tier.CPUQuota,
			CPUPeriod:  tier.CPUPeriod,
		},
		Init:       boolPtr(true),
		CapDrop:    []string{"ALL"},
		CapAdd:     []string{"NET_BIND_SERVICE", "CHOWN", "SETUID", "SETGID", "DAC_OVERRIDE"},
		Privileged: false,
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

// Exec runs a command inside a running container and returns its stdout.
func (m *Manager) Exec(ctx context.Context, containerID string, cmd []string, stdin io.Reader) (io.ReadCloser, error) {
	execConfig := container.ExecOptions{
		AttachStdout: true,
		AttachStderr: true,
		AttachStdin:  stdin != nil,
		Cmd:          cmd,
	}
	execIDResp, err := m.cli.ContainerExecCreate(ctx, containerID, execConfig)
	if err != nil {
		return nil, err
	}
	resp, err := m.cli.ContainerExecAttach(ctx, execIDResp.ID, container.ExecStartOptions{})
	if err != nil {
		return nil, err
	}

	if stdin != nil {
		go func() {
			io.Copy(resp.Conn, stdin)
			resp.CloseWrite()
		}()
	}

	return &hijackedCloser{Reader: resp.Reader, resp: resp}, nil
}

type hijackedCloser struct {
	io.Reader
	resp dockertypes.HijackedResponse
}

func (c *hijackedCloser) Close() error {
	c.resp.Close()
	return nil
}


func boolPtr(b bool) *bool {
	return &b
}

// InitTraefik initializes the Traefik reverse proxy.
func (m *Manager) InitTraefik(ctx context.Context, adminEmail string) error {
	img := "traefik:v3.0"
	slog.Info("initializing traefik proxy", "image", img)

	rc, err := m.cli.ImagePull(ctx, img, image.PullOptions{})
	if err != nil {
		return fmt.Errorf("pulling traefik image: %w", err)
	}
	defer rc.Close()
	_, _ = io.Copy(io.Discard, rc)

	// Remove any existing traefik container
	m.RemoveContainer(ctx, "nf-traefik") //nolint:errcheck

	hostVol := filepath.Join(m.dataDir, "certs")
	os.MkdirAll(hostVol, 0755) //nolint:errcheck

	portBinding := nat.PortMap{
		"80/tcp":  []nat.PortBinding{{HostIP: "0.0.0.0", HostPort: "80"}},
		"443/tcp": []nat.PortBinding{{HostIP: "0.0.0.0", HostPort: "443"}},
	}

	cmd := []string{
		"--providers.docker=true",
		"--providers.docker.exposedbydefault=false",
		"--entrypoints.web.address=:80",
		"--entrypoints.websecure.address=:443",
		"--entrypoints.web.http.redirections.entrypoint.to=websecure",
		"--entrypoints.web.http.redirections.entrypoint.scheme=https",
		"--certificatesresolvers.letsencrypt.acme.tlschallenge=true",
		"--certificatesresolvers.letsencrypt.acme.storage=/certs/acme.json",
	}
	if adminEmail != "" {
		cmd = append(cmd, "--certificatesresolvers.letsencrypt.acme.email="+adminEmail)
	}

	resp, err := m.cli.ContainerCreate(ctx, &container.Config{
		Image: img,
		Cmd:   cmd,
		Labels: map[string]string{
			"nanofly.type": "system",
			"nanofly.name": "traefik",
		},
	}, &container.HostConfig{
		PortBindings:  portBinding,
		Binds:         []string{
			hostVol + ":/certs",
			"//var/run/docker.sock:/var/run/docker.sock:ro",
		},
		RestartPolicy: container.RestartPolicy{Name: "always"},
		Resources: container.Resources{
			Memory: 64 * 1024 * 1024,
			CPUQuota: 50000,
		},
	}, nil, nil, "nf-traefik")
	if err != nil {
		return fmt.Errorf("creating traefik container: %w", err)
	}

	if err := m.cli.ContainerStart(ctx, resp.ID, container.StartOptions{}); err != nil {
		return fmt.Errorf("starting traefik container: %w", err)
	}

	slog.Info("traefik proxy started successfully")
	return nil
}
// PruneSystem cleans up dangling images, stopped containers, unused volumes, and unused networks.
func (m *Manager) PruneSystem(ctx context.Context) error {
	slog.Info("Running Docker system prune")
	_, err := m.cli.ContainersPrune(ctx, filters.Args{})
	if err != nil {
		slog.Error("Failed to prune containers", "error", err)
	}
	_, err = m.cli.ImagesPrune(ctx, filters.Args{})
	if err != nil {
		slog.Error("Failed to prune images", "error", err)
	}
	_, err = m.cli.VolumesPrune(ctx, filters.Args{})
	if err != nil {
		slog.Error("Failed to prune volumes", "error", err)
	}
	_, err = m.cli.NetworksPrune(ctx, filters.Args{})
	if err != nil {
		slog.Error("Failed to prune networks", "error", err)
	}
	return nil
}

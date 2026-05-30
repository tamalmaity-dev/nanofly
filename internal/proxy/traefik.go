// internal/api/proxy/proxy.go — Traefik Reverse Proxy Manager

package proxy

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

// nanoflyNet is the shared Docker bridge network name.
const nanoflyNet = "nanofly-network"

// ensureNanoflyNetwork creates the shared nanofly network if it doesn't exist.
func ensureNanoflyNetwork(ctx context.Context) {
	checkCmd := exec.CommandContext(ctx, "docker", "network", "inspect", nanoflyNet)
	if checkCmd.Run() == nil {
		return // already exists
	}
	createCmd := exec.CommandContext(ctx, "docker", "network", "create", "--driver", "bridge",
		"--label", "nanofly.type=system", nanoflyNet)
	if out, err := createCmd.CombinedOutput(); err != nil {
		slog.Warn("failed to create nanofly network", "error", err, "output", string(out))
	} else {
		slog.Info("created nanofly Docker network")
	}
}

// EnsureTraefik checks if the global nanofly-traefik container is running.
// If it is not, it starts it, binding to ports 80 and 443.
func EnsureTraefik(ctx context.Context, dataDir string) error {
	containerName := "nanofly-traefik"

	// Ensure the shared network exists first
	ensureNanoflyNetwork(ctx)

	// Ensure dynamic config and acme.json directories exist
	traefikDir := filepath.Join(dataDir, "traefik")
	dynamicDir := filepath.Join(traefikDir, "dynamic")
	if err := os.MkdirAll(dynamicDir, 0755); err != nil {
		return fmt.Errorf("failed to create traefik dynamic config dir: %w", err)
	}

	acmePath := filepath.Join(traefikDir, "acme.json")
	if _, err := os.Stat(acmePath); os.IsNotExist(err) {
		if err := os.WriteFile(acmePath, []byte("{}"), 0600); err != nil {
			return fmt.Errorf("failed to create acme.json: %w", err)
		}
	} else {
		os.Chmod(acmePath, 0600)
	}

	// Check if already running and has the dynamic mount
	checkCmd := exec.CommandContext(ctx, "docker", "inspect", "-f", "{{.State.Running}} {{range .Mounts}}{{.Destination}} {{end}}", containerName)
	out, err := checkCmd.CombinedOutput()
	inspectStr := string(out)
	isRunning := err == nil && strings.HasPrefix(inspectStr, "true")
	hasMount := err == nil && strings.Contains(inspectStr, "/etc/traefik/dynamic")

	if isRunning && hasMount {
		slog.Info("Traefik is already running with dynamic mount")
		connectCmd := exec.CommandContext(ctx, "docker", "network", "connect", nanoflyNet, containerName)
		connectCmd.Run() //nolint:errcheck
		return nil
	}

	slog.Info("Starting/Recreating Traefik reverse proxy...")

	// Stop and remove if it exists
	_ = exec.CommandContext(ctx, "docker", "rm", "-f", containerName).Run()

	// Use named pipe on Windows or unix socket on Unix-like OSes
	dockerSocket := "/var/run/docker.sock:/var/run/docker.sock:ro"
	if runtime.GOOS == "windows" {
		dockerSocket = "//./pipe/docker_engine://./pipe/docker_engine"
	}

	// Start Traefik — attach to the nanofly network so it can reach app containers
	runArgs := []string{
		"run", "-d",
		"--name", containerName,
		"--restart", "always",
		"--network", nanoflyNet,
		"--add-host", "host.docker.internal:host-gateway",
		"-p", "80:80",
		"-p", "443:443",
		"-v", dockerSocket,
		"-v", acmePath + ":/acme.json",
		"-v", dynamicDir + ":/etc/traefik/dynamic",
		"--memory=64m",
		"--cpus=0.5",
		"traefik:v3.0",
		"--api.insecure=false",
		"--providers.docker=true",
		"--providers.docker.exposedbydefault=false",
		"--providers.file.directory=/etc/traefik/dynamic",
		"--entrypoints.web.address=:80",
		"--entrypoints.websecure.address=:443",
		"--entrypoints.web.http.redirections.entrypoint.to=websecure",
		"--entrypoints.web.http.redirections.entrypoint.scheme=https",
		"--certificatesresolvers.letsencrypt.acme.tlschallenge=true",
		"--certificatesresolvers.letsencrypt.acme.email=admin@nanofly.io",
		"--certificatesresolvers.letsencrypt.acme.storage=/acme.json",
	}

	cmd := exec.CommandContext(ctx, "docker", runArgs...)
	startOut, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("failed to start Traefik: %s (error: %w)", string(startOut), err)
	}

	// Give it a moment to initialize
	time.Sleep(2 * time.Second)
	slog.Info("Traefik started successfully")

	return nil
}

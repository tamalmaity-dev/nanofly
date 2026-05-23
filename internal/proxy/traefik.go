// internal/api/proxy/proxy.go — Traefik Reverse Proxy Manager

package proxy

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strings"
	"time"
)

// EnsureTraefik checks if the global nanofly-traefik container is running.
// If it is not, it starts it, binding to ports 80 and 443.
func EnsureTraefik(ctx context.Context, dataDir string) error {
	containerName := "nanofly-traefik"

	// Check if already running
	checkCmd := exec.CommandContext(ctx, "docker", "inspect", "-f", "{{.State.Running}}", containerName)
	out, err := checkCmd.CombinedOutput()
	if err == nil && strings.TrimSpace(string(out)) == "true" {
		slog.Info("Traefik is already running")
		return nil
	}

	slog.Info("Starting Traefik reverse proxy...")

	// Stop and remove if it exists but is stopped/crashed
	_ = exec.CommandContext(ctx, "docker", "rm", "-f", containerName).Run()

	// Ensure acme.json exists with 0600 permissions
	traefikDir := filepath.Join(dataDir, "traefik")
	if err := os.MkdirAll(traefikDir, 0755); err != nil {
		return fmt.Errorf("failed to create traefik config dir: %w", err)
	}

	acmePath := filepath.Join(traefikDir, "acme.json")
	if _, err := os.Stat(acmePath); os.IsNotExist(err) {
		if err := os.WriteFile(acmePath, []byte("{}"), 0600); err != nil {
			return fmt.Errorf("failed to create acme.json: %w", err)
		}
	} else {
		// Enforce 0600 just in case
		os.Chmod(acmePath, 0600)
	}

	// Wait, Docker on Windows doesn't easily map /var/run/docker.sock the same way,
	// but NanoFly targets Linux primarily. We'll use the standard Linux socket.
	// If it fails on Windows desktop, it's expected as this is a server tool.

	// Start Traefik
	runArgs := []string{
		"run", "-d",
		"--name", containerName,
		"--restart", "always",
		"-p", "80:80",
		"-p", "443:443",
		"-v", "/var/run/docker.sock:/var/run/docker.sock:ro",
		"-v", acmePath + ":/acme.json",
		"traefik:v2.10",
		"--api.insecure=false",
		"--providers.docker=true",
		"--providers.docker.exposedbydefault=false",
		"--entrypoints.web.address=:80",
		"--entrypoints.websecure.address=:443",
		"--certificatesresolvers.myresolver.acme.tlschallenge=true",
		// Provide a generic email for Let's Encrypt (users can change this later if needed)
		"--certificatesresolvers.myresolver.acme.email=admin@nanofly.io",
		"--certificatesresolvers.myresolver.acme.storage=/acme.json",
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

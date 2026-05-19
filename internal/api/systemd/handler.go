//go:build linux || darwin || freebsd
// +build linux darwin freebsd

// internal/api/systemd/handler.go — Real systemd service management
package systemd

import (
	"fmt"
	"net/http"
	"os/exec"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/nanofly/nanofly/internal/response"
)

// ServiceInfo represents a systemd service.
type ServiceInfo struct {
	Name        string `json:"name"`
	Status      string `json:"status"` // running, stopped, failed
	Description string `json:"description"`
	PID         string `json:"pid"`
	Memory      string `json:"memory"`
	CPU         string `json:"cpu"`
	Since       string `json:"since"`
}

// Handler handles systemd service API requests.
type Handler struct{}

// NewHandler creates a new systemd handler.
func NewHandler() *Handler {
	return &Handler{}
}

// RegisterRoutes adds systemd routes to the router.
func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get("/services/systemd", h.List)
	r.Post("/services/systemd/{name}/start", h.Start)
	r.Post("/services/systemd/{name}/stop", h.Stop)
	r.Post("/services/systemd/{name}/restart", h.Restart)
}

// List returns all systemd services with their status.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	// Get all loaded services
	cmd := exec.Command("systemctl", "list-units", "--type=service", "--all", "--no-pager", "--no-legend")
	out, err := cmd.Output()
	if err != nil {
		response.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to list services: %v", err))
		return
	}

	var services []ServiceInfo
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")

	for _, line := range lines {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}

		// Parse systemctl list-units output
		// Format: UNIT LOAD ACTIVE SUB DESCRIPTION
		fields := strings.Fields(line)
		if len(fields) < 4 {
			continue
		}

		name := strings.TrimSuffix(fields[0], ".service")
		// Remove leading bullet character if present
		name = strings.TrimPrefix(name, "●")
		name = strings.TrimSpace(name)

		if name == "" {
			continue
		}

		active := fields[2] // active, inactive, failed
		sub := fields[3]    // running, dead, exited, failed

		status := "stopped"
		if sub == "running" {
			status = "running"
		} else if active == "failed" || sub == "failed" {
			status = "failed"
		}

		description := ""
		if len(fields) > 4 {
			description = strings.Join(fields[4:], " ")
		}

		svc := ServiceInfo{
			Name:        name,
			Status:      status,
			Description: description,
			PID:         "—",
			Memory:      "—",
			CPU:         "—",
			Since:       "—",
		}

		// Get details for running services
		if status == "running" {
			svc.PID, svc.Memory, svc.Since = getServiceDetails(name)
		}

		services = append(services, svc)
	}

	response.Success(w, services)
}

// getServiceDetails fetches PID, memory, and active time for a service.
func getServiceDetails(name string) (pid, memory, since string) {
	cmd := exec.Command("systemctl", "show", name+".service",
		"--property=MainPID,MemoryCurrent,ActiveEnterTimestamp",
		"--no-pager")
	out, err := cmd.Output()
	if err != nil {
		return "—", "—", "—"
	}

	pid = "—"
	memory = "—"
	since = "—"

	for _, line := range strings.Split(string(out), "\n") {
		parts := strings.SplitN(line, "=", 2)
		if len(parts) != 2 {
			continue
		}
		key := strings.TrimSpace(parts[0])
		val := strings.TrimSpace(parts[1])

		switch key {
		case "MainPID":
			if val != "0" && val != "" {
				pid = val
			}
		case "MemoryCurrent":
			if val != "[not set]" && val != "" && val != "18446744073709551615" {
				memory = humanizeBytes(val)
			}
		case "ActiveEnterTimestamp":
			if val != "" {
				since = val
			}
		}
	}
	return
}

// humanizeBytes converts a byte string to human-readable format.
func humanizeBytes(bytesStr string) string {
	var b uint64
	_, err := fmt.Sscanf(bytesStr, "%d", &b)
	if err != nil {
		return bytesStr
	}
	const (
		KB = 1024
		MB = 1024 * KB
		GB = 1024 * MB
	)
	switch {
	case b >= GB:
		return fmt.Sprintf("%.1f GB", float64(b)/float64(GB))
	case b >= MB:
		return fmt.Sprintf("%.1f MB", float64(b)/float64(MB))
	case b >= KB:
		return fmt.Sprintf("%.1f KB", float64(b)/float64(KB))
	default:
		return fmt.Sprintf("%d B", b)
	}
}

// Start starts a systemd service.
func (h *Handler) Start(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := runSystemctl("start", name); err != nil {
		response.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to start %s: %v", name, err))
		return
	}
	response.Success(w, map[string]string{"status": "started", "service": name})
}

// Stop stops a systemd service.
func (h *Handler) Stop(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := runSystemctl("stop", name); err != nil {
		response.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to stop %s: %v", name, err))
		return
	}
	response.Success(w, map[string]string{"status": "stopped", "service": name})
}

// Restart restarts a systemd service.
func (h *Handler) Restart(w http.ResponseWriter, r *http.Request) {
	name := chi.URLParam(r, "name")
	if err := runSystemctl("restart", name); err != nil {
		response.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to restart %s: %v", name, err))
		return
	}
	response.Success(w, map[string]string{"status": "restarted", "service": name})
}

func runSystemctl(action, service string) error {
	cmd := exec.Command("systemctl", action, service+".service")
	out, err := cmd.CombinedOutput()
	if err != nil {
		return fmt.Errorf("%s: %s", err, string(out))
	}
	return nil
}

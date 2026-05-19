//go:build linux || darwin || freebsd
// +build linux darwin freebsd

// internal/api/systemd/handler.go — Real systemd service management
package systemd

import (
	"fmt"
	"net/http"
	"os/exec"
	"sort"
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
	var servicesMap = make(map[string]ServiceInfo)

	// 1. Try to list all unit files
	cmdFiles := exec.Command("systemctl", "list-unit-files", "--type=service", "--all", "--no-pager", "--no-legend")
	outFiles, errFiles := cmdFiles.Output()
	if errFiles == nil {
		lines := strings.Split(strings.TrimSpace(string(outFiles)), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) < 2 {
				continue
			}
			unitName := fields[0]
			if !strings.HasSuffix(unitName, ".service") {
				continue
			}
			name := strings.TrimSuffix(unitName, ".service")
			name = strings.TrimLeft(name, "● \t\n\r*")
			if name == "" {
				continue
			}
			servicesMap[name] = ServiceInfo{
				Name:        name,
				Status:      "stopped",
				Description: "",
				PID:         "—",
				Memory:      "—",
				CPU:         "—",
				Since:       "—",
			}
		}
	}

	// 2. Query running/active units and update or append
	cmdUnits := exec.Command("systemctl", "list-units", "--type=service", "--all", "--no-pager", "--no-legend")
	outUnits, errUnits := cmdUnits.Output()
	if errUnits != nil {
		// If both list-unit-files and list-units failed, return the error
		if errFiles != nil {
			response.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to list services: %v", errUnits))
			return
		}
	} else {
		lines := strings.Split(strings.TrimSpace(string(outUnits)), "\n")
		for _, line := range lines {
			line = strings.TrimSpace(line)
			if line == "" {
				continue
			}
			fields := strings.Fields(line)
			if len(fields) == 0 {
				continue
			}
			startIdx := 0
			if fields[0] == "●" {
				startIdx = 1
			}
			if len(fields)-startIdx < 4 {
				continue
			}
			unitName := fields[startIdx]
			if !strings.HasSuffix(unitName, ".service") {
				continue
			}
			name := strings.TrimSuffix(unitName, ".service")
			name = strings.TrimLeft(name, "● \t\n\r*")
			if name == "" {
				continue
			}

			active := fields[startIdx+2]
			sub := fields[startIdx+3]

			status := "stopped"
			if sub == "running" {
				status = "running"
			} else if active == "failed" || sub == "failed" {
				status = "failed"
			}

			description := ""
			if len(fields) > startIdx+4 {
				description = strings.Join(fields[startIdx+4:], " ")
			}

			if svc, exists := servicesMap[name]; exists {
				svc.Status = status
				if description != "" {
					svc.Description = description
				}
				if status == "running" {
					svc.PID, svc.Memory, svc.Since = getServiceDetails(name)
				}
				servicesMap[name] = svc
			} else {
				svc := ServiceInfo{
					Name:        name,
					Status:      status,
					Description: description,
					PID:         "—",
					Memory:      "—",
					CPU:         "—",
					Since:       "—",
				}
				if status == "running" {
					svc.PID, svc.Memory, svc.Since = getServiceDetails(name)
				}
				servicesMap[name] = svc
			}
		}
	}

	var services = make([]ServiceInfo, 0, len(servicesMap))
	for _, svc := range servicesMap {
		services = append(services, svc)
	}

	sort.Slice(services, func(i, j int) bool {
		return services[i].Name < services[j].Name
	})

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

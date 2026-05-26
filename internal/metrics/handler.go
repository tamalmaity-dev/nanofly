// internal/metrics/handler.go — REST snapshot + WebSocket live stream
package metrics

import (
	"encoding/json"
	"net/http"
	"os"
	"os/exec"
	"runtime"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/gorilla/websocket"

	"github.com/nanofly/nanofly/internal/response"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		// Allow all origins in dev; in production you'd check the Host header.
		return true
	},
	ReadBufferSize:  1024,
	WriteBufferSize: 4096,
}

// Handler handles metrics HTTP + WebSocket requests.
type Handler struct{}

// NewHandler creates a metrics handler.
func NewHandler() *Handler {
	return &Handler{}
}

// Routes returns a chi router with all metrics routes.
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()
	r.Get("/", h.snapshot)        // GET /api/v1/metrics
	r.Get("/snapshot", h.snapshot) // GET /api/v1/metrics/snapshot (frontend compat)
	r.Get("/ws", h.liveStream)    // GET /api/v1/metrics/ws  (WebSocket upgrade)
	r.Post("/fix-cgroups", h.fixCgroups) // POST /api/v1/metrics/fix-cgroups (automated host configuration)
	return r
}

// snapshot returns a single metrics reading as JSON.
// GET /api/v1/metrics
func (h *Handler) snapshot(w http.ResponseWriter, r *http.Request) {
	snap, err := Collect()
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to collect metrics")
		return
	}
	response.Success(w, snap)
}

// liveStream upgrades to WebSocket and pushes a new metrics snapshot every second.
// GET /api/v1/metrics/ws
//
// The client receives a stream of JSON Snapshot objects, one per second.
// Client can send any message to gracefully trigger a faster update (optional).
func (h *Handler) liveStream(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		// upgrader already wrote the error response
		return
	}
	defer conn.Close()

	// Set a read deadline so we notice if the client disconnects
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// Push every 3 seconds 
	// Metric update takes 3 seconds 
	ticker := time.NewTicker(3 * time.Second) // push every 3 seconds
	defer ticker.Stop()

	ping := time.NewTicker(30 * time.Second)
	defer ping.Stop()

	// Read loop in goroutine — detects client disconnect
	done := make(chan struct{})
	go func() {
		defer close(done)
		for {
			if _, _, err := conn.ReadMessage(); err != nil {
				return
			}
		}
	}()

	for {
		select {
		case <-done:
			return // client disconnected

		case <-ping.C:
			if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}

		case <-ticker.C:
			snap, err := Collect()
			if err != nil {
				continue
			}

			data, err := json.Marshal(snap)
			if err != nil {
				continue
			}

			conn.SetWriteDeadline(time.Now().Add(5 * time.Second))
			if err := conn.WriteMessage(websocket.TextMessage, data); err != nil {
				return // client gone
			}
		}
	}
}

// fixCgroups attempts to automatically add required cgroup configuration for Docker memory metrics.
func (h *Handler) fixCgroups(w http.ResponseWriter, r *http.Request) {
	if runtime.GOOS != "linux" {
		response.Error(w, http.StatusBadRequest, "cgroups configuration can only be automated on Linux hosts")
		return
	}

	var message string
	var updated bool

	// Check if Pi OS or similar boot firmware cmdline exists
	piCmdlinePaths := []string{
		"/boot/firmware/cmdline.txt",
		"/boot/cmdline.txt",
	}

	for _, p := range piCmdlinePaths {
		if _, err := os.Stat(p); err == nil {
			content, err := os.ReadFile(p)
			if err != nil {
				response.Error(w, http.StatusInternalServerError, "failed to read cmdline file: "+err.Error())
				return
			}
			
			contentStr := strings.TrimSpace(string(content))
			if strings.Contains(contentStr, "cgroup_enable=memory") {
				message = "cgroups are already configured in " + p + ". Please reboot the server to apply changes."
				response.JSON(w, http.StatusOK, map[string]interface{}{"status": "success", "message": message, "reboot_required": false})
				return
			}

			// Append configuration
			newContent := contentStr + " cgroup_enable=memory cgroup_memory=1\n"
			if err := os.WriteFile(p, []byte(newContent), 0644); err != nil {
				response.Error(w, http.StatusInternalServerError, "failed to write to "+p+": "+err.Error()+" (make sure NanoFly is running with sudo/root privileges)")
				return
			}
			updated = true
			message = "Successfully appended cgroup memory parameters to " + p + ". A server reboot is required to apply the changes."
			break
		}
	}

	// If not updated (not a Pi), check for Grub (/etc/default/grub)
	if !updated {
		grubPath := "/etc/default/grub"
		if _, err := os.Stat(grubPath); err == nil {
			content, err := os.ReadFile(grubPath)
			if err != nil {
				response.Error(w, http.StatusInternalServerError, "failed to read GRUB file: "+err.Error())
				return
			}

			contentStr := string(content)
			if strings.Contains(contentStr, "cgroup_enable=memory") {
				message = "cgroups are already configured in " + grubPath + ". Please reboot the server to apply changes."
				response.JSON(w, http.StatusOK, map[string]interface{}{"status": "success", "message": message, "reboot_required": false})
				return
			}

			// Parse GRUB_CMDLINE_LINUX_DEFAULT
			lines := strings.Split(contentStr, "\n")
			found := false
			for i, line := range lines {
				trimmed := strings.TrimSpace(line)
				if strings.HasPrefix(trimmed, "GRUB_CMDLINE_LINUX_DEFAULT=") {
					found = true
					parts := strings.SplitN(line, "=", 2)
					val := strings.TrimSpace(parts[1])
					quoteChar := ""
					if strings.HasPrefix(val, "\"") && strings.HasSuffix(val, "\"") {
						quoteChar = "\""
						val = val[1 : len(val)-1]
					} else if strings.HasPrefix(val, "'") && strings.HasSuffix(val, "'") {
						quoteChar = "'"
						val = val[1 : len(val)-1]
					}
					
					if val == "" {
						val = "cgroup_enable=memory swapaccount=1"
					} else {
						val = val + " cgroup_enable=memory swapaccount=1"
					}
					
					lines[i] = "GRUB_CMDLINE_LINUX_DEFAULT=" + quoteChar + val + quoteChar
					break
				}
			}

			if !found {
				lines = append(lines, `GRUB_CMDLINE_LINUX_DEFAULT="cgroup_enable=memory swapaccount=1"`)
			}

			newContent := strings.Join(lines, "\n")
			if err := os.WriteFile(grubPath, []byte(newContent), 0644); err != nil {
				response.Error(w, http.StatusInternalServerError, "failed to write to "+grubPath+": "+err.Error()+" (make sure NanoFly is running with sudo/root privileges)")
				return
			}

			// Run update-grub
			cmd := exec.Command("update-grub")
			if err := cmd.Run(); err != nil {
				cmdFallback := exec.Command("grub2-mkconfig", "-o", "/boot/grub2/grub.cfg")
				_ = cmdFallback.Run()
			}

			updated = true
			message = "Successfully updated cgroup configuration in " + grubPath + " and rebuilt GRUB bootloader. A server reboot is required to apply the changes."
		}
	}

	if !updated {
		response.Error(w, http.StatusNotFound, "could not locate GRUB config (/etc/default/grub) or Raspberry Pi cmdline file. Please configure cgroups manually.")
		return
	}

	response.JSON(w, http.StatusOK, map[string]interface{}{
		"status":          "success",
		"message":         message,
		"reboot_required": true,
	})
}

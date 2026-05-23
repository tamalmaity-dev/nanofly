// internal/metrics/handler.go — REST snapshot + WebSocket live stream
package metrics

import (
	"encoding/json"
	"net/http"
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

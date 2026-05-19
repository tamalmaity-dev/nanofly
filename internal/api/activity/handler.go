// internal/api/activity/handler.go — Activity log backed by SQLite
package activity

import (
	"database/sql"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nanofly/nanofly/internal/response"
)

// Event represents an activity log entry.
type Event struct {
	ID        string `json:"id"`
	Type      string `json:"type"`      // login, project, deploy, settings, service, delete
	Title     string `json:"title"`
	Meta      string `json:"meta"`
	UserEmail string `json:"user_email"`
	CreatedAt string `json:"created_at"`
}

// Handler handles activity log requests.
type Handler struct {
	db *sql.DB
}

// NewHandler creates an activity handler and ensures the table exists.
func NewHandler(db *sql.DB) *Handler {
	db.Exec(`CREATE TABLE IF NOT EXISTS activity_log (
		id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		type       TEXT NOT NULL DEFAULT 'info',
		title      TEXT NOT NULL,
		meta       TEXT NOT NULL DEFAULT '',
		user_email TEXT NOT NULL DEFAULT '',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)
	return &Handler{db: db}
}

// RegisterRoutes adds activity routes.
func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get("/activity", h.List)
}

// List returns recent activity events.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(`SELECT id, type, title, meta, user_email, created_at FROM activity_log ORDER BY created_at DESC LIMIT 100`)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to list activity")
		return
	}
	defer rows.Close()

	var events []Event
	for rows.Next() {
		var e Event
		if err := rows.Scan(&e.ID, &e.Type, &e.Title, &e.Meta, &e.UserEmail, &e.CreatedAt); err != nil {
			continue
		}
		events = append(events, e)
	}

	if events == nil {
		events = []Event{}
	}
	response.Success(w, events)
}

// Log records a new activity event. Called from other handlers.
func Log(db *sql.DB, eventType, title, meta, email string) {
	db.Exec(
		`INSERT INTO activity_log (type, title, meta, user_email) VALUES (?, ?, ?, ?)`,
		eventType, title, meta, email,
	)
}

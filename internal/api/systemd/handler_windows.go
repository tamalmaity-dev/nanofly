//go:build windows
// +build windows

package systemd

import (
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nanofly/nanofly/internal/response"
)

type ServiceInfo struct {
	Name        string `json:"name"`
	Status      string `json:"status"`
	Description string `json:"description"`
	PID         string `json:"pid"`
	Memory      string `json:"memory"`
	CPU         string `json:"cpu"`
	Since       string `json:"since"`
}

type Handler struct{}

func NewHandler() *Handler { return &Handler{} }

func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get("/services/systemd", h.List)
	r.Post("/services/systemd/{name}/start", h.notAvailable)
	r.Post("/services/systemd/{name}/stop", h.notAvailable)
	r.Post("/services/systemd/{name}/restart", h.notAvailable)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	response.Success(w, []ServiceInfo{})
}

func (h *Handler) notAvailable(w http.ResponseWriter, r *http.Request) {
	response.Error(w, http.StatusNotImplemented, "systemd not available on Windows")
}

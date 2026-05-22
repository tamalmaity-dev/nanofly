// internal/api/services/handler.go — HTTP handlers for services API
package services

import (
	"database/sql"
	"encoding/json"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nanofly/nanofly/internal/response"
)

type Handler struct {
	mgr *Manager
}

func NewHandler(mgr *Manager) *Handler {
	return &Handler{mgr: mgr}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	// Services within a project
	r.Get("/projects/{projectID}/services", h.List)
	r.Post("/projects/{projectID}/services/app", h.CreateApp)
	r.Post("/projects/{projectID}/services/database", h.CreateDatabase)

	// Per-service operations
	r.Get("/services/{id}", h.Get)
	r.Put("/services/{id}", h.Update)
	r.Delete("/services/{id}", h.Delete)
	r.Post("/services/{id}/deploy", h.Deploy)
	r.Post("/services/{id}/stop", h.Stop)
	r.Post("/services/{id}/restart", h.Restart)
	r.Get("/services/{id}/logs", h.GetContainerLogs)
	r.Get("/services/{id}/deployments", h.ListDeployments)
	r.Get("/services/{id}/envvars", h.GetEnvVars)
	r.Post("/services/{id}/envvars", h.UpsertEnvVar)
	r.Delete("/services/{id}/envvars/{key}", h.DeleteEnvVar)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	svcs, err := h.mgr.List(r.Context(), chi.URLParam(r, "projectID"))
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to list services")
		return
	}
	response.JSON(w, http.StatusOK, svcs)
}

func (h *Handler) CreateApp(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name             string   `json:"name"`
		Image            string   `json:"image"`
		Port             int      `json:"port"`
		GitRepoURL       string   `json:"git_repo_url"`
		GitBranch        string   `json:"git_branch"`
		GitToken         string   `json:"git_token"`
		GitBuilder       string   `json:"git_builder"`
		LocalPath        string   `json:"local_path"`
		StartCommand     string   `json:"start_command"`
		InstallCommand   string   `json:"install_command"`
		AppDirectory     string   `json:"app_directory"`
		RunFile          string   `json:"run_file"`
		RequirementsFile string   `json:"requirements_file"`
		UseVenv          bool     `json:"use_venv"`
		DockerArgs       string   `json:"docker_args"`
		EnvVars          []EnvVar `json:"env_vars"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if req.Name == "" {
		response.Error(w, http.StatusBadRequest, "name is required")
		return
	}
	if req.GitBranch == "" {
		req.GitBranch = "main"
	}
	if req.LocalPath != "" {
		req.GitRepoURL = "file://" + req.LocalPath
	}

	svc, err := h.mgr.CreateApp(r.Context(), CreateAppReq{
		ProjectID:        chi.URLParam(r, "projectID"),
		Name:             req.Name,
		Image:            req.Image,
		Port:             req.Port,
		EnvVars:          req.EnvVars,
		GitRepoURL:       req.GitRepoURL,
		GitBranch:        req.GitBranch,
		GitToken:         req.GitToken,
		Builder:          req.GitBuilder,
		StartCommand:     req.StartCommand,
		InstallCommand:   req.InstallCommand,
		AppDirectory:     req.AppDirectory,
		RunFile:          req.RunFile,
		RequirementsFile: req.RequirementsFile,
		UseVenv:          req.UseVenv,
		DockerArgs:       req.DockerArgs,
	})
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.JSON(w, http.StatusCreated, svc)
}

func (h *Handler) CreateDatabase(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name   string `json:"name"`
		DBType string `json:"db_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if req.Name == "" || req.DBType == "" {
		response.Error(w, http.StatusBadRequest, "name and db_type required")
		return
	}

	svc, err := h.mgr.CreateDatabase(r.Context(), CreateDBReq{
		ProjectID: chi.URLParam(r, "projectID"),
		Name:      req.Name,
		DBType:    req.DBType,
	})
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.JSON(w, http.StatusCreated, svc)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	svc, err := h.mgr.Get(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		if err == sql.ErrNoRows {
			response.Error(w, http.StatusNotFound, "service not found")
			return
		}
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, svc)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	if err := h.mgr.Delete(r.Context(), chi.URLParam(r, "id")); err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) Deploy(w http.ResponseWriter, r *http.Request) {
	dep, err := h.mgr.Deploy(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.JSON(w, http.StatusAccepted, dep)
}

func (h *Handler) ListDeployments(w http.ResponseWriter, r *http.Request) {
	deps, err := h.mgr.ListDeployments(r.Context(), chi.URLParam(r, "id"), 20)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, deps)
}

func (h *Handler) GetEnvVars(w http.ResponseWriter, r *http.Request) {
	vars, err := h.mgr.GetEnvVars(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, vars)
}

func (h *Handler) UpsertEnvVar(w http.ResponseWriter, r *http.Request) {
	var req EnvVar
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if err := h.mgr.UpsertEnvVar(r.Context(), chi.URLParam(r, "id"), req.Key, req.Value); err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) DeleteEnvVar(w http.ResponseWriter, r *http.Request) {
	if err := h.mgr.DeleteEnvVar(r.Context(), chi.URLParam(r, "id"), chi.URLParam(r, "key")); err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) GetContainerLogs(w http.ResponseWriter, r *http.Request) {
	logs, err := h.mgr.GetContainerLogs(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, map[string]string{"logs": logs})
}

func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	var req UpdateServiceReq
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid payload")
		return
	}
	svc, err := h.mgr.Update(r.Context(), chi.URLParam(r, "id"), req)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, svc)
}

func (h *Handler) Stop(w http.ResponseWriter, r *http.Request) {
	err := h.mgr.Stop(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, map[string]string{"status": "stopped"})
}

func (h *Handler) Restart(w http.ResponseWriter, r *http.Request) {
	err := h.mgr.Restart(r.Context(), chi.URLParam(r, "id"))
	if err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	response.JSON(w, http.StatusOK, map[string]string{"status": "running"})
}

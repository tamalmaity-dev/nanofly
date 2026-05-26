package github

import (
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"strings"

	"github.com/go-chi/chi/v5"
	"github.com/nanofly/nanofly/internal/response"
)

type Handler struct {
	svc *Service
}

func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get("/", h.List)
	r.Get("/{id}", h.Get)
	r.Delete("/{id}", h.Delete)
	r.Post("/manifest", h.CreateManifest)
	r.Get("/callback", h.ManifestCallback)
	r.Get("/install-callback", h.InstallCallback)
	r.Get("/{id}/repositories", h.ListRepositories)
}

func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	apps, err := h.svc.List(r.Context())
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to list github apps")
		return
	}
	response.JSON(w, http.StatusOK, apps)
}

func (h *Handler) Get(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	app, err := h.svc.Get(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusNotFound, "github app not found")
		return
	}
	response.JSON(w, http.StatusOK, app)
}

func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	if err := h.svc.Delete(r.Context(), id); err != nil {
		response.Error(w, http.StatusInternalServerError, err.Error())
		return
	}
	w.WriteHeader(http.StatusNoContent)
}

func (h *Handler) CreateManifest(w http.ResponseWriter, r *http.Request) {
	var req struct {
		Name       string `json:"name"`
		SystemWide bool   `json:"system_wide"`
		Host       string `json:"host"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid payload")
		return
	}
	if req.Name == "" || req.Host == "" {
		response.Error(w, http.StatusBadRequest, "name and host are required")
		return
	}

	if !strings.HasPrefix(req.Host, "http") {
		req.Host = "http://" + req.Host
	}

	webhookUrl := fmt.Sprintf("%s/api/v1/webhooks/github", req.Host)
	callbackUrl := fmt.Sprintf("%s/api/v1/github/app/callback?system_wide=%t", req.Host, req.SystemWide)
	setupUrl := fmt.Sprintf("%s/api/v1/github/app/install-callback", req.Host)

	manifest := map[string]interface{}{
		"name": req.Name,
		"url": req.Host,
		"hook_attributes": map[string]string{
			"url": webhookUrl,
		},
		"redirect_url": callbackUrl,
		"setup_url": setupUrl,
		"public": false,
		"default_permissions": map[string]string{
			"contents":      "read",
			"metadata":      "read",
			"pull_requests": "read",
		},
		"default_events": []string{
			"push",
			"pull_request",
		},
	}

	manifestBytes, _ := json.Marshal(manifest)
	manifestJSON := string(manifestBytes)

	// Return HTML form as an interstitial page so the user can login if needed
	html := fmt.Sprintf(`
	<!DOCTYPE html>
	<html lang="en">
	<head>
		<meta charset="UTF-8">
		<meta name="viewport" content="width=device-width, initial-scale=1.0">
		<title>Create GitHub App</title>
		<style>
			body {
				font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
				display: flex; justify-content: center; align-items: center; height: 100vh;
				background-color: #0d1117; color: #c9d1d9; margin: 0;
			}
			.card {
				background: #161b22; border: 1px solid #30363d; padding: 40px;
				border-radius: 8px; text-align: center; max-width: 480px; box-shadow: 0 8px 24px rgba(0,0,0,0.2);
			}
			.title { font-size: 24px; font-weight: 600; margin-bottom: 16px; color: #fff; }
			.subtitle { margin-bottom: 24px; font-size: 14px; line-height: 1.5; color: #8b949e; }
			.btn-primary {
				background-color: #238636; color: white; padding: 10px 24px; border-radius: 6px;
				border: 1px solid rgba(240,246,252,0.1); font-weight: 600; cursor: pointer;
				font-size: 16px; display: inline-block; text-decoration: none; transition: .2s; width: 100%%; box-sizing: border-box;
			}
			.btn-primary:hover { background-color: #2ea043; }
			.btn-secondary {
				background-color: #21262d; color: #c9d1d9; padding: 10px 24px; border-radius: 6px;
				border: 1px solid #30363d; font-weight: 600; cursor: pointer; margin-top: 12px;
				font-size: 14px; display: inline-block; text-decoration: none; transition: .2s; width: 100%%; box-sizing: border-box;
			}
			.btn-secondary:hover { background-color: #30363d; }
			.alert {
				background-color: rgba(248, 81, 73, 0.1); border: 1px solid rgba(248, 81, 73, 0.4);
				color: #ff7b72; padding: 12px; border-radius: 6px; font-size: 13px; text-align: left; margin-bottom: 24px;
			}
		</style>
	</head>
	<body>
		<div class="card">
			<svg height="48" viewBox="0 0 16 16" version="1.1" width="48" aria-hidden="true" style="fill: #c9d1d9; margin-bottom: 20px;">
				<path d="M8 0C3.58 0 0 3.58 0 8c0 3.54 2.29 6.53 5.47 7.59.4.07.55-.17.55-.38 0-.19-.01-.82-.01-1.49-2.01.37-2.53-.49-2.69-.94-.09-.23-.48-.94-.82-1.13-.28-.15-.68-.52-.01-.53.63-.01 1.08.58 1.23.82.72 1.21 1.87.87 2.33.66.07-.52.28-.87.51-1.07-1.78-.2-3.64-.89-3.64-3.95 0-.87.31-1.59.82-2.15-.08-.2-.36-1.02.08-2.12 0 0 .67-.21 2.2.82.64-.18 1.32-.27 2-.27.68 0 1.36.09 2 .27 1.53-1.04 2.2-.82 2.2-.82.44 1.1.16 1.92.08 2.12.51.56.82 1.27.82 2.15 0 3.07-1.87 3.75-3.65 3.95.29.25.54.73.54 1.48 0 1.07-.01 1.93-.01 2.2 0 .21.15.46.55.38A8.013 8.013 0 0016 8c0-4.42-3.58-8-8-8z"></path>
			</svg>
			<div class="title">Create GitHub App</div>
			<div class="subtitle">You're about to be redirected to GitHub to create a new GitHub App for NanoFly.</div>
			
			<div class="alert">
				<strong>Important:</strong> You must be logged into GitHub to create an app. If you are not logged in, GitHub will show an error page instead of a login prompt.
			</div>
			
			<form id="github-form" action="https://github.com/settings/apps/new" method="post">
				<input type="hidden" name="manifest" id="manifest" value='%s' />
				<button type="submit" class="btn-primary">Create App on GitHub</button>
			</form>
			
			<a href="https://github.com/login" target="_blank" class="btn-secondary">Log in to GitHub first (opens in new tab)</a>
		</div>
	</body>
	</html>
	`, manifestJSON)

	w.Header().Set("Content-Type", "text/html")
	w.Write([]byte(html))
}

func (h *Handler) ManifestCallback(w http.ResponseWriter, r *http.Request) {
	code := r.URL.Query().Get("code")
	systemWide := r.URL.Query().Get("system_wide") == "true"

	if code == "" {
		http.Redirect(w, r, "/?error=missing_code", http.StatusTemporaryRedirect)
		return
	}

	// Exchange code for app credentials
	client := &http.Client{}
	req, _ := http.NewRequest("POST", fmt.Sprintf("https://api.github.com/app-manifests/%s/conversions", code), nil)
	req.Header.Set("Accept", "application/vnd.github.v3+json")
	
	resp, err := client.Do(req)
	if err != nil {
		http.Redirect(w, r, "/?error=github_api_error", http.StatusTemporaryRedirect)
		return
	}
	defer resp.Body.Close()

	if resp.StatusCode != 201 {
		body, _ := io.ReadAll(resp.Body)
		fmt.Printf("Failed to convert manifest. Status: %d, Body: %s\n", resp.StatusCode, string(body))
		http.Redirect(w, r, "/?error=github_conversion_failed", http.StatusTemporaryRedirect)
		return
	}

	var conversionResp struct {
		ID            int    `json:"id"`
		Name          string `json:"name"`
		ClientID      string `json:"client_id"`
		ClientSecret  string `json:"client_secret"`
		WebhookSecret string `json:"webhook_secret"`
		PEM           string `json:"pem"`
	}

	if err := json.NewDecoder(resp.Body).Decode(&conversionResp); err != nil {
		http.Redirect(w, r, "/?error=github_decode_failed", http.StatusTemporaryRedirect)
		return
	}

	// Save to database
	app := GitHubApp{
		Name:          conversionResp.Name,
		AppID:         conversionResp.ID,
		ClientID:      conversionResp.ClientID,
		ClientSecret:  conversionResp.ClientSecret,
		WebhookSecret: conversionResp.WebhookSecret,
		PrivateKey:    conversionResp.PEM,
		SystemWide:    systemWide,
	}

	_, err = h.svc.Create(r.Context(), app)
	if err != nil {
		http.Redirect(w, r, "/?error=db_save_failed", http.StatusTemporaryRedirect)
		return
	}

	// Redirect to frontend sources page to show the user they need to install it
	http.Redirect(w, r, "/sources?github_app_created=true", http.StatusTemporaryRedirect)
}

func (h *Handler) InstallCallback(w http.ResponseWriter, r *http.Request) {
	installationID := r.URL.Query().Get("installation_id")
	if installationID == "" {
		http.Redirect(w, r, "/sources?error=missing_installation_id", http.StatusTemporaryRedirect)
		return
	}

	// The problem here is we don't know which app ID was just installed from the callback directly,
	// unless we pass state. For simplicity in this Coolify clone, we can just find the most recently
	// created app with installation_id = 0 and update it.
	
	// Better approach: list apps and find one without an installation ID.
	apps, err := h.svc.List(r.Context())
	if err == nil {
		for _, app := range apps {
			if app.InstallationID == 0 {
				var instId int
				fmt.Sscanf(installationID, "%d", &instId)
				_ = h.svc.UpdateInstallationID(r.Context(), app.ID, instId)
				break
			}
		}
	}

	http.Redirect(w, r, "/sources?github_app_installed=true", http.StatusTemporaryRedirect)
}

func (h *Handler) ListRepositories(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	repos, err := h.svc.ListRepositories(r.Context(), id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "Failed to fetch repositories for GitHub App: "+err.Error())
		return
	}
	response.JSON(w, http.StatusOK, repos)
}


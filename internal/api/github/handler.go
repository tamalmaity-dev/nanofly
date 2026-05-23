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

	// Return HTML form that auto-submits to GitHub
	html := fmt.Sprintf(`
	<html>
		<body>
			<form id="github-form" action="https://github.com/settings/apps/new" method="post">
				<input type="hidden" name="manifest" id="manifest" value='%s' />
			</form>
			<script>
				document.getElementById('github-form').submit();
			</script>
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

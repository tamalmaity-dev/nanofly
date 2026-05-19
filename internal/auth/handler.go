// internal/auth/handler.go — HTTP handlers for auth endpoints
package auth

import (
	"encoding/json"
	"fmt"
	"net/http"

	"github.com/go-chi/chi/v5"
	"github.com/nanofly/nanofly/internal/api/activity"
	"github.com/nanofly/nanofly/internal/response"
)

// Handler wires HTTP routes for the auth module.
type Handler struct {
	svc *Service
}

// NewHandler creates an auth handler.
func NewHandler(svc *Service) *Handler {
	return &Handler{svc: svc}
}

// Routes returns a chi router with all auth routes mounted.
func (h *Handler) Routes() http.Handler {
	r := chi.NewRouter()

	r.Post("/login", h.login)
	r.Post("/logout", h.logout)
	r.Get("/me", h.svc.RequireAuth(http.HandlerFunc(h.me)).ServeHTTP)

	return r
}

// ─── Request / Response shapes ───────────────────────────────────────────────

type loginRequest struct {
	Email    string `json:"email"`
	Password string `json:"password"`
}

type loginResponse struct {
	Token string   `json:"token"`
	User  userView `json:"user"`
}

type userView struct {
	ID    string `json:"id"`
	Email string `json:"email"`
	Name  string `json:"name"`
	Role  string `json:"role"`
}

// ─── Handlers ────────────────────────────────────────────────────────────────

// POST /api/v1/auth/login
// Body: {"email":"...", "password":"..."}
// Returns: {"token":"...", "user":{...}}
func (h *Handler) login(w http.ResponseWriter, r *http.Request) {
	var req loginRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid JSON body")
		return
	}

	if req.Email == "" || req.Password == "" {
		response.Error(w, http.StatusBadRequest, "email and password are required")
		return
	}

	token, user, err := h.svc.Login(req.Email, req.Password)
	if err != nil {
		response.Error(w, http.StatusUnauthorized, err.Error())
		return
	}

	// Log successful login
	activity.Log(h.svc.db.DB, "login", "User logged in", fmt.Sprintf("%s · %s", user.Name, user.Email), user.Email)

	response.Success(w, loginResponse{
		Token: token,
		User: userView{
			ID:    user.ID,
			Email: user.Email,
			Name:  user.Name,
			Role:  user.Role,
		},
	})
}

// POST /api/v1/auth/logout
// Stateless JWT — client just discards the token.
// (In Phase 2 we can add token revocation via the sessions table.)
func (h *Handler) logout(w http.ResponseWriter, r *http.Request) {
	response.Success(w, map[string]string{"message": "logged out"})
}

// GET /api/v1/auth/me  (requires auth)
// Returns the currently authenticated user's profile.
func (h *Handler) me(w http.ResponseWriter, r *http.Request) {
	claims := ClaimsFromContext(r.Context())
	if claims == nil {
		response.Error(w, http.StatusUnauthorized, "not authenticated")
		return
	}

	user, err := h.svc.db.GetUserByID(claims.UserID)
	if err != nil || user == nil {
		response.Error(w, http.StatusNotFound, "user not found")
		return
	}

	response.Success(w, userView{
		ID:    user.ID,
		Email: user.Email,
		Name:  user.Name,
		Role:  user.Role,
	})
}

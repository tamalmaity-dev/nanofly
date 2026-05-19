// internal/auth/middleware.go — JWT authentication middleware
package auth

import (
	"context"
	"net/http"
	"strings"

	"github.com/nanofly/nanofly/internal/response"
)

// contextKey is a private type for context keys — prevents collisions.
type contextKey string

const claimsKey contextKey = "claims"

// RequireAuth is an HTTP middleware that validates the JWT Bearer token.
// Protected routes call this middleware. If the token is missing or invalid,
// the request is rejected with 401 Unauthorized.
func (s *Service) RequireAuth(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Extract "Authorization: Bearer <token>" header
		authHeader := r.Header.Get("Authorization")
		if authHeader == "" {
			response.Error(w, http.StatusUnauthorized, "missing Authorization header")
			return
		}

		parts := strings.SplitN(authHeader, " ", 2)
		if len(parts) != 2 || strings.ToLower(parts[0]) != "bearer" {
			response.Error(w, http.StatusUnauthorized, "Authorization header must be: Bearer <token>")
			return
		}

		claims, err := s.ValidateToken(parts[1])
		if err != nil {
			response.Error(w, http.StatusUnauthorized, "invalid or expired token")
			return
		}

		// Store claims in context so handlers can read user info
		ctx := context.WithValue(r.Context(), claimsKey, claims)
		next.ServeHTTP(w, r.WithContext(ctx))
	})
}

// RequireAdmin additionally checks that the authenticated user is an admin.
func (s *Service) RequireAdmin(next http.Handler) http.Handler {
	return s.RequireAuth(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		claims := ClaimsFromContext(r.Context())
		if claims == nil || claims.Role != "admin" {
			response.Error(w, http.StatusForbidden, "admin access required")
			return
		}
		next.ServeHTTP(w, r)
	}))
}

// ClaimsFromContext extracts the JWT claims stored by RequireAuth.
// Returns nil if not present (shouldn't happen on protected routes).
func ClaimsFromContext(ctx context.Context) *Claims {
	v := ctx.Value(claimsKey)
	if v == nil {
		return nil
	}
	c, _ := v.(*Claims)
	return c
}

// internal/response/response.go — JSON Response Helpers
package response

import (
	"encoding/json"
	"net/http"
)

// JSON writes any value as JSON with the given status code.
func JSON(w http.ResponseWriter, status int, data any) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	if err := json.NewEncoder(w).Encode(data); err != nil {
		http.Error(w, "encoding error", http.StatusInternalServerError)
	}
}

// Error writes {"error": "message"} with the given status.
func Error(w http.ResponseWriter, status int, message string) {
	JSON(w, status, struct {
		Error string `json:"error"`
	}{Error: message})
}

// Success writes 200 OK with data as JSON.
func Success(w http.ResponseWriter, data any) {
	JSON(w, http.StatusOK, data)
}

// Created writes 201 Created with data as JSON.
func Created(w http.ResponseWriter, data any) {
	JSON(w, http.StatusCreated, data)
}

// NoContent writes 204 No Content (for DELETE).
func NoContent(w http.ResponseWriter) {
	w.WriteHeader(http.StatusNoContent)
}

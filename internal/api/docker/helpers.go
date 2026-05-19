// internal/api/docker/helpers.go — Cross-platform helpers (no Docker imports)
package docker

import "math/rand"

// RandPassword generates a random 20-char password safe for all platforms.
func RandPassword() string {
	const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 20)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

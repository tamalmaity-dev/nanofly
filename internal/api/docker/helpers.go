// internal/api/docker/helpers.go — Cross-platform helpers (no Docker imports)
package docker

import (
	"fmt"
	"math/rand"
	"net"
)

// RandPassword generates a random 20-char password safe for all platforms.
func RandPassword() string {
	const chars = "abcdefghijkmnpqrstuvwxyzABCDEFGHJKLMNPQRSTUVWXYZ23456789"
	b := make([]byte, 20)
	for i := range b {
		b[i] = chars[rand.Intn(len(chars))]
	}
	return string(b)
}

// IsPortInUse reports whether something is already listening on the given TCP port.
func IsPortInUse(port int) bool {
	if port <= 0 || port > 65535 {
		return true
	}
	ln, err := net.Listen("tcp", fmt.Sprintf(":%d", port))
	if err != nil {
		return true
	}
	_ = ln.Close()
	return false
}

// ResolveHostPort returns preferred when free, otherwise the first available port in 20000–59999.
func ResolveHostPort(preferred int) int {
	if preferred > 0 && !IsPortInUse(preferred) {
		return preferred
	}
	for i := 0; i < 80; i++ {
		p := 20000 + rand.Intn(40000)
		if !IsPortInUse(p) {
			return p
		}
	}
	return 20000 + rand.Intn(40000)
}

// internal/api/docker/helpers.go — Cross-platform helpers (no Docker imports)
package docker

import (
	"fmt"
	"math/rand"
	"net"
	"strings"
)

// SafeName converts a user-facing service name into a Docker-compatible slug.
// Docker resource names are shared across projects, so callers should append
// their own project/service identifier when they need global uniqueness.
func SafeName(value string) string {
	value = strings.ToLower(strings.TrimSpace(value))
	var b strings.Builder
	lastSeparator := false

	for _, r := range value {
		switch {
		case (r >= 'a' && r <= 'z') || (r >= '0' && r <= '9') || r == '_' || r == '.' || r == '-':
			b.WriteRune(r)
			lastSeparator = r == '_' || r == '.' || r == '-'
		case !lastSeparator:
			b.WriteByte('-')
			lastSeparator = true
		}
	}

	slug := strings.Trim(b.String(), "-_.")
	if slug == "" {
		return "service"
	}
	// Keep the human-readable portion short enough that the identifier suffix
	// still fits comfortably within Docker and Compose name limits.
	if len(slug) > 48 {
		slug = strings.Trim(slug[:48], "-_.")
	}
	if slug == "" {
		return "service"
	}
	return slug
}

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

// PruneResult holds cleanup stats.
type PruneResult struct {
	ContainersDeleted int    `json:"containers_deleted"`
	ImagesDeleted     int    `json:"images_deleted"`
	VolumesDeleted    int    `json:"volumes_deleted"`
	NetworksDeleted   int    `json:"networks_deleted"`
	SpaceReclaimed    uint64 `json:"space_reclaimed"`
	ReclaimedHuman    string `json:"reclaimed_human"`
}

func FormatBytes(b uint64) string {
	const unit = 1000
	if b < unit {
		return fmt.Sprintf("%d B", b)
	}
	div, exp := int64(unit), 0
	for n := b / unit; n >= unit; n /= unit {
		div *= unit
		exp++
	}
	suffix := ""
	switch exp {
	case 0:
		suffix = "KB"
	case 1:
		suffix = "MB"
	case 2:
		suffix = "GB"
	case 3:
		suffix = "TB"
	default:
		suffix = "PB"
	}
	return fmt.Sprintf("%.2f %s", float64(b)/float64(div), suffix)
}

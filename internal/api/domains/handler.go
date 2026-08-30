// internal/api/domains/handler.go — Domain management with DNS verification
package domains

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"net"
	"net/http"
	"strings"
	"time"

	"github.com/go-chi/chi/v5"
	"github.com/nanofly/nanofly/internal/response"
)

// Domain represents a custom domain entry.
type Domain struct {
	ID        string `json:"id"`
	Domain    string `json:"domain"`
	Protocol  string `json:"protocol"`  // https or http
	Port      int    `json:"port"`      // target port, 0 = auto (443 for https, 80 for http)
	Path      string `json:"path"`      // optional path prefix
	ServiceID string `json:"service_id,omitempty"`
	Service   string `json:"service"`
	Project   string `json:"project"`
	TLSStatus string `json:"tls_status"` // pending, active, error
	DNSStatus string `json:"dns_status"` // verified, unverified
	Direction string `json:"direction"`
	CreatedAt string `json:"created_at"`
}

// Handler handles domain CRUD operations.
type Handler struct {
	db *sql.DB
}

// NewHandler creates a domain handler.
func NewHandler(db *sql.DB) *Handler {
	// Ensure domains_v2 table exists (standalone, no foreign key dependency)
	db.Exec(`CREATE TABLE IF NOT EXISTS domains_v2 (
		id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		domain     TEXT UNIQUE NOT NULL,
		protocol   TEXT NOT NULL DEFAULT 'https',
		port       INTEGER NOT NULL DEFAULT 0,
		path       TEXT NOT NULL DEFAULT '',
		service    TEXT NOT NULL DEFAULT '',
		project    TEXT NOT NULL DEFAULT '',
		tls_status TEXT NOT NULL DEFAULT 'pending',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)
	// Migrate columns
	db.Exec(`ALTER TABLE domains_v2 ADD COLUMN direction TEXT NOT NULL DEFAULT 'both'`)
	db.Exec(`ALTER TABLE domains_v2 ADD COLUMN protocol TEXT NOT NULL DEFAULT 'https'`)
	db.Exec(`ALTER TABLE domains_v2 ADD COLUMN port INTEGER NOT NULL DEFAULT 0`)
	db.Exec(`ALTER TABLE domains_v2 ADD COLUMN path TEXT NOT NULL DEFAULT ''`)
	return &Handler{db: db}
}

// RegisterRoutes adds domain routes.
func (h *Handler) RegisterRoutes(r chi.Router) {
	r.Get("/domains", h.List)
	r.Post("/domains", h.Create)
	r.Put("/domains/{id}", h.Update)
	r.Delete("/domains/{id}", h.Delete)
	r.Post("/domains/{id}/verify", h.VerifyDNS)
}

// List returns all configured domains.
func (h *Handler) List(w http.ResponseWriter, r *http.Request) {
	rows, err := h.db.Query(`SELECT id, domain, COALESCE(protocol,'https'), COALESCE(port,0), COALESCE(path,''), service, project, tls_status, direction, created_at FROM domains_v2 ORDER BY created_at DESC`)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to list domains")
		return
	}
	defer rows.Close()

	var domains []Domain
	for rows.Next() {
		var d Domain
		if err := rows.Scan(&d.ID, &d.Domain, &d.Protocol, &d.Port, &d.Path, &d.Service, &d.Project, &d.TLSStatus, &d.Direction, &d.CreatedAt); err != nil {
			continue
		}
		d.DNSStatus = "unverified"
		domains = append(domains, d)
	}

	if domains == nil {
		domains = []Domain{} // Return empty array not null
	}
	response.Success(w, domains)
}

// CreateRequest is the payload for adding a domain.
type CreateRequest struct {
	Domain    string `json:"domain"`
	Protocol  string `json:"protocol"`
	Port      int    `json:"port"`
	Path      string `json:"path"`
	Service   string `json:"service"`
	Project   string `json:"project"`
	Direction string `json:"direction"`
}

// Create adds a new domain.
func (h *Handler) Create(w http.ResponseWriter, r *http.Request) {
	var req CreateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Domain = cleanDomain(req.Domain)
	if req.Domain == "" {
		response.Error(w, http.StatusBadRequest, "domain is required")
		return
	}

	// Basic domain validation
	if !strings.Contains(req.Domain, ".") {
		response.Error(w, http.StatusBadRequest, "invalid domain format")
		return
	}

	if req.Protocol == "" {
		req.Protocol = "https"
	}
	if req.Port < 0 {
		req.Port = 0
	}
	req.Path = strings.TrimSpace(req.Path)

	if req.Direction == "" {
		req.Direction = "both"
	}

	var id string
	err := h.db.QueryRow(
		`INSERT INTO domains_v2 (domain, protocol, port, path, service, project, direction) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		req.Domain, req.Protocol, req.Port, req.Path, req.Service, req.Project, req.Direction,
	).Scan(&id)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			response.Error(w, http.StatusConflict, "domain already exists")
			return
		}
		response.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to add domain: %v", err))
		return
	}

	response.Success(w, map[string]string{"id": id, "domain": req.Domain, "status": "added"})
}

// UpdateRequest is the payload for updating a domain.
type UpdateRequest struct {
	Domain    string `json:"domain"`
	Protocol  string `json:"protocol"`
	Port      int    `json:"port"`
	Path      string `json:"path"`
	Service   string `json:"service"`
	Project   string `json:"project"`
	Direction string `json:"direction"`
}

// Update updates an existing domain's details.
func (h *Handler) Update(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	var req UpdateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		response.Error(w, http.StatusBadRequest, "invalid request body")
		return
	}

	req.Domain = cleanDomain(req.Domain)
	if req.Domain == "" {
		response.Error(w, http.StatusBadRequest, "domain is required")
		return
	}

	if req.Protocol == "" {
		req.Protocol = "https"
	}
	req.Path = strings.TrimSpace(req.Path)

	if req.Direction == "" {
		req.Direction = "both"
	}

	_, err := h.db.Exec(
		`UPDATE domains_v2 SET domain = ?, protocol = ?, port = ?, path = ?, service = ?, project = ?, direction = ? WHERE id = ?`,
		req.Domain, req.Protocol, req.Port, req.Path, req.Service, req.Project, req.Direction, id,
	)
	if err != nil {
		if strings.Contains(err.Error(), "UNIQUE") {
			response.Error(w, http.StatusConflict, "domain already exists")
			return
		}
		response.Error(w, http.StatusInternalServerError, fmt.Sprintf("failed to update domain: %v", err))
		return
	}

	response.Success(w, map[string]string{"status": "updated"})
}

// Delete removes a domain.
func (h *Handler) Delete(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")
	result, err := h.db.Exec(`DELETE FROM domains_v2 WHERE id = ?`, id)
	if err != nil {
		response.Error(w, http.StatusInternalServerError, "failed to delete domain")
		return
	}
	rows, _ := result.RowsAffected()
	if rows == 0 {
		response.Error(w, http.StatusNotFound, "domain not found")
		return
	}
	response.Success(w, map[string]string{"status": "deleted"})
}

// VerifyDNS checks if the domain's A record points to this server or Cloudflare proxy.
func (h *Handler) VerifyDNS(w http.ResponseWriter, r *http.Request) {
	id := chi.URLParam(r, "id")

	var domain string
	err := h.db.QueryRow(`SELECT domain FROM domains_v2 WHERE id = ?`, id).Scan(&domain)
	if err != nil {
		response.Error(w, http.StatusNotFound, "domain not found")
		return
	}

	// Resolve domain
	ips, err := net.LookupHost(domain)
	if err != nil {
		response.Success(w, map[string]any{
			"domain":   domain,
			"verified": false,
			"error":    fmt.Sprintf("DNS lookup failed: %v", err),
		})
		return
	}

	// Get this server's IPs
	serverIPs := getServerIPs()
	verified := false
	cloudflareProxied := false
	for _, ip := range ips {
		// Check direct server match
		for _, sip := range serverIPs {
			if ip == sip {
				verified = true
				break
			}
		}
		// Check if resolved via Cloudflare proxy (Coolify pattern)
		if isCloudflareIp(ip) {
			cloudflareProxied = true
			verified = true
		}
	}

	if verified {
		h.db.Exec(`UPDATE domains_v2 SET tls_status = 'active' WHERE id = ?`, id)
	}

	msg := "DNS does not point to this server."
	if verified && cloudflareProxied {
		msg = fmt.Sprintf("DNS points to Cloudflare proxy (%s). SSL will be handled by Traefik + Cloudflare.", ips[0])
	} else if verified {
		msg = fmt.Sprintf("DNS points to this server (%s).", ips[0])
	}

	response.Success(w, map[string]any{
		"domain":            domain,
		"verified":          verified,
		"cloudflare_proxy":  cloudflareProxied,
		"domain_ips":        ips,
		"server_ips":        serverIPs,
		"message":           msg,
	})
}

// getServerIPs returns all non-loopback IPs of this machine.
func getServerIPs() []string {
	var ips []string
	addrs, err := net.InterfaceAddrs()
	if err != nil {
		return ips
	}
	for _, addr := range addrs {
		if ipNet, ok := addr.(*net.IPNet); ok && !ipNet.IP.IsLoopback() {
			if ipNet.IP.To4() != nil {
				ips = append(ips, ipNet.IP.String())
			}
		}
	}
	return ips
}

// suppress unused import
var _ = time.Now

// cleanDomain strips http://, https://, trailing slashes/paths, and ports.
func cleanDomain(d string) string {
	d = strings.ToLower(strings.TrimSpace(d))
	d = strings.TrimPrefix(d, "https://")
	d = strings.TrimPrefix(d, "http://")
	// Strip everything after first / or :
	if idx := strings.IndexAny(d, "/:"); idx >= 0 {
		d = d[:idx]
	}
	return d
}

// cloudflareIPs contains Cloudflare's published IP CIDR ranges.
// Source: https://www.cloudflare.com/ips/
var cloudflareIPs = []string{
	"173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22",
	"141.101.64.0/18", "108.162.192.0/18", "190.93.240.0/20", "188.114.96.0/20",
	"197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
	"172.64.0.0/13", "131.0.72.0/22",
	"2400:cb00::/32", "2606:4700::/32", "2803:f800::/32",
	"2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
}

// isCloudflareIp checks if an IP address belongs to Cloudflare's CIDR ranges.
// This is used to detect Cloudflare-proxied domains (Coolify pattern).
func isCloudflareIp(ipStr string) bool {
	ip := net.ParseIP(ipStr)
	if ip == nil {
		return false
	}
	for _, cidr := range cloudflareIPs {
		_, network, err := net.ParseCIDR(cidr)
		if err != nil {
			continue
		}
		if network.Contains(ip) {
			return true
		}
	}
	return false
}

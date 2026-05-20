// internal/proxy/proxy.go — Built-in HTTP reverse proxy for custom domains
//
// This starts a lightweight HTTP server on port 80 (or a configurable port).
// For every incoming request it:
//   1. Strips the port from the Host header.
//   2. Looks up matching domain in domains_v2.
//   3. Looks up the service by name to get its container port.
//   4. Reverse-proxies the request to http://127.0.0.1:{port}.
//
// If no match is found, it returns a friendly 404 HTML page.
package proxy

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"net"
	"net/http"
	"net/http/httputil"
	"net/url"
	"strings"
	"time"
)

// Server is the reverse-proxy HTTP server.
type Server struct {
	db      *sql.DB
	httpSrv *http.Server
}

// New creates a proxy Server backed by the given *sql.DB.
func New(db *sql.DB) *Server {
	s := &Server{db: db}
	mux := http.NewServeMux()
	mux.HandleFunc("/", s.handle)
	s.httpSrv = &http.Server{
		Addr:         ":80",
		Handler:      mux,
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 60 * time.Second,
		IdleTimeout:  120 * time.Second,
	}
	return s
}

// Start begins listening on :80. It is non-fatal: if the port is in use
// (e.g. another web server), it logs a warning and returns nil.
func (s *Server) Start() {
	slog.Info("domain proxy starting", "addr", ":80")
	if err := s.httpSrv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
		slog.Warn("domain proxy could not start (port 80 may require root or be in use)",
			"err", err,
			"tip", "run 'sudo setcap cap_net_bind_service=+ep nanofly' or use a different port")
	}
}

// Stop gracefully shuts down the proxy.
func (s *Server) Stop(ctx context.Context) {
	s.httpSrv.Shutdown(ctx) //nolint:errcheck
}

// handle is the main reverse-proxy handler.
func (s *Server) handle(w http.ResponseWriter, r *http.Request) {
	// Strip port from host header (e.g. "myapp.1.2.3.4.sslip.io:80" → "myapp.1.2.3.4.sslip.io")
	host := r.Host
	if h, _, err := net.SplitHostPort(host); err == nil {
		host = h
	}
	host = strings.ToLower(strings.TrimSpace(host))

	if host == "" {
		http.Error(w, "Bad Request: missing Host header", http.StatusBadRequest)
		return
	}

	// Lookup domain → service name
	var serviceName, project string
	err := s.db.QueryRowContext(r.Context(),
		`SELECT service, project FROM domains_v2 WHERE LOWER(domain) = ? LIMIT 1`, host,
	).Scan(&serviceName, &project)
	if err == sql.ErrNoRows {
		s.notFound(w, host)
		return
	}
	if err != nil {
		slog.Error("proxy domain lookup", "err", err)
		http.Error(w, "Internal proxy error", http.StatusInternalServerError)
		return
	}

	if serviceName == "" {
		s.notFound(w, host)
		return
	}

	// Lookup service port
	var port int
	err = s.db.QueryRowContext(r.Context(),
		`SELECT COALESCE(port, 0) FROM services WHERE name = ? AND type = 'app' ORDER BY created_at DESC LIMIT 1`,
		serviceName,
	).Scan(&port)
	if err == sql.ErrNoRows || port == 0 {
		s.serviceDown(w, host, serviceName)
		return
	}
	if err != nil {
		slog.Error("proxy service lookup", "err", err)
		http.Error(w, "Internal proxy error", http.StatusInternalServerError)
		return
	}

	// Build target URL
	target, _ := url.Parse(fmt.Sprintf("http://127.0.0.1:%d", port))

	// Create reverse proxy
	proxy := httputil.NewSingleHostReverseProxy(target)
	proxy.ErrorHandler = func(w http.ResponseWriter, r *http.Request, err error) {
		slog.Warn("proxy upstream error", "host", host, "target", target, "err", err)
		s.upstreamError(w, host, serviceName, port, err)
	}

	// Rewrite the request
	r.URL.Host = target.Host
	r.URL.Scheme = target.Scheme
	r.Header.Set("X-Forwarded-Host", r.Host)
	r.Header.Set("X-Forwarded-For", r.RemoteAddr)
	r.Header.Set("X-Real-IP", r.RemoteAddr)
	r.Host = target.Host

	slog.Debug("proxy", "host", host, "service", serviceName, "port", port, "path", r.URL.Path)
	proxy.ServeHTTP(w, r)
}

func (s *Server) notFound(w http.ResponseWriter, host string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusNotFound)
	fmt.Fprintf(w, `<!DOCTYPE html>
<html>
<head><title>Domain Not Found — NanoFly</title>
<style>body{font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{text-align:center;padding:2rem}.emoji{font-size:4rem}.h{font-size:1.5rem;font-weight:700;margin:1rem 0 0.5rem}
.sub{color:#8b949e;font-size:0.95rem}.domain{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:0.4rem 1rem;display:inline-block;font-family:monospace;margin:1rem 0;color:#79c0ff}
</style></head>
<body><div class="box">
<div class="emoji">🚀</div>
<div class="h">Domain Not Registered</div>
<div class="domain">%s</div>
<div class="sub">This domain is not linked to any NanoFly service.<br>Add it in your NanoFly dashboard under <strong>Domains</strong>.</div>
</div></body></html>`, host)
}

func (s *Server) serviceDown(w http.ResponseWriter, host, service string) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusBadGateway)
	fmt.Fprintf(w, `<!DOCTYPE html>
<html>
<head><title>Service Offline — NanoFly</title>
<style>body{font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{text-align:center;padding:2rem}.emoji{font-size:4rem}.h{font-size:1.5rem;font-weight:700;margin:1rem 0 0.5rem}
.sub{color:#8b949e;font-size:0.95rem}.svc{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:0.4rem 1rem;display:inline-block;font-family:monospace;margin:1rem 0;color:#f0883e}
</style></head>
<body><div class="box">
<div class="emoji">💤</div>
<div class="h">Service Offline</div>
<div class="svc">%s</div>
<div class="sub">The service linked to <strong>%s</strong> is not running or has no port assigned.<br>Deploy or restart it from your NanoFly dashboard.</div>
</div></body></html>`, service, host)
}

func (s *Server) upstreamError(w http.ResponseWriter, host, service string, port int, err error) {
	w.Header().Set("Content-Type", "text/html; charset=utf-8")
	w.WriteHeader(http.StatusBadGateway)
	fmt.Fprintf(w, `<!DOCTYPE html>
<html>
<head><title>Bad Gateway — NanoFly</title>
<style>body{font-family:system-ui,sans-serif;background:#0d1117;color:#e6edf3;display:flex;align-items:center;justify-content:center;min-height:100vh;margin:0}
.box{text-align:center;padding:2rem}.emoji{font-size:4rem}.h{font-size:1.5rem;font-weight:700;margin:1rem 0 0.5rem}
.sub{color:#8b949e;font-size:0.95rem}.err{background:#161b22;border:1px solid #30363d;border-radius:8px;padding:0.4rem 1rem;display:inline-block;font-family:monospace;margin:1rem 0;color:#ff7b72;font-size:0.85rem}
</style></head>
<body><div class="box">
<div class="emoji">⚠️</div>
<div class="h">Bad Gateway</div>
<div class="err">%s → localhost:%d</div>
<div class="sub">Could not connect to service <strong>%s</strong>.<br>The container may be starting up — try again in a moment.<br><small style="color:#6e7681">%v</small></div>
</div></body></html>`, host, port, service, err)
}

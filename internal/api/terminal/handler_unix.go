//go:build linux || darwin || freebsd
// +build linux darwin freebsd

// internal/api/terminal/handler_unix.go
// Real PTY terminal over WebSocket — works on Linux (x86_64, arm64, armv7)
package terminal

import (
	"encoding/json"
	"log/slog"
	"net/http"
	"os"
	"os/exec"
	"strings"
	"time"

	"github.com/creack/pty"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

type resizeMsg struct {
	Type string `json:"type"`
	Rows uint16 `json:"rows"`
	Cols uint16 `json:"cols"`
}

// WS handles /api/v1/terminal/ws
// Protocol:
//   - binary frames → stdin to the shell
//   - text frames   → JSON resize: {"type":"resize","rows":24,"cols":80}
//   - server sends binary frames → stdout/stderr from the shell
//
// Keepalive: server sends WebSocket pings every 30s. If no pong is received
// within 60s the connection is closed. This prevents idle terminal sessions
// from being dropped by proxies, load balancers, or the OS TCP stack.
func WS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("terminal ws upgrade", "err", err)
		return
	}
	defer conn.Close()

	// ── Read deadline + pong handler (resets deadline on pong) ──────────
	conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	conn.SetPongHandler(func(string) error {
		conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	// ── Ping goroutine — sends pings every 30s to keep connection alive ─
	pingDone := make(chan struct{})
	go func() {
		ticker := time.NewTicker(30 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-pingDone:
				return
			case <-ticker.C:
				if err := conn.WriteMessage(websocket.PingMessage, nil); err != nil {
					return
				}
			}
		}
	}()
	defer close(pingDone)

	target := r.URL.Query().Get("target")
	containerID := r.URL.Query().Get("container")

	// For compose services the frontend passes the service ID; resolve to the
	// actual container via label (nf-<ID>_<svc>_1). Mirrors backup.go fix.
	if target == "container" && containerID != "" {
		// If it looks like a service ID (UUID without the nf-app- prefix), try label lookup
		if !strings.HasPrefix(containerID, "nf-") || len(containerID) == 36 || len(containerID) > 20 && strings.Contains(containerID, "-") {
			if out, err := exec.Command("docker", "ps", "--filter", "label=nanofly.service="+containerID, "--format", "{{.ID}}").CombinedOutput(); err == nil {
				if id := strings.TrimSpace(strings.Split(string(out), "\n")[0]); id != "" {
					containerID = id
				}
			}
		} else {
			// For non-compose, verify container exists; if not, try label fallback
			if err := exec.Command("docker", "inspect", containerID).Run(); err != nil {
				// Try to extract service ID from container name like nf-app-name-abcdefgh
				// and use label fallback (best-effort)
				if out, e := exec.Command("docker", "ps", "-a", "--format", "{{.ID}}\t{{.Names}}\t{{.Label \"nanofly.service\"}}").CombinedOutput(); e == nil {
					for _, line := range strings.Split(string(out), "\n") {
						parts := strings.SplitN(line, "\t", 3)
						if len(parts) == 3 && strings.TrimSpace(parts[1]) == containerID {
							if label := strings.TrimSpace(parts[2]); label != "" {
								if out2, e2 := exec.Command("docker", "ps", "--filter", "label=nanofly.service="+label, "--format", "{{.ID}}").CombinedOutput(); e2 == nil {
									if id := strings.TrimSpace(strings.Split(string(out2), "\n")[0]); id != "" {
										containerID = id
										break
									}
								}
							}
						}
					}
				}
			}
		}
	}

	shell := "/bin/bash"
	if _, err := os.Stat(shell); os.IsNotExist(err) {
		shell = "/bin/sh"
	}

	var cmd *exec.Cmd
	if target == "container" && containerID != "" {
		cmd = exec.Command("docker", "exec", "-it", containerID, "/bin/sh")
	} else {
		cmd = exec.Command(shell)
		cmd.Dir = "/"
		cmd.Env = append(os.Environ(),
			"TERM=xterm-256color",
			"NANOFLY_TERM_TARGET=host-root",
			`PS1=\[\033[1;32m\]\u@\h\[\033[0m\]:\[\033[1;34m\]\w\[\033[0m\]\$ `,
		)
	}
	cmd.Env = append(cmd.Env, "TERM=xterm-256color")

	ptmx, err := pty.Start(cmd)
	if err != nil {
		slog.Error("starting pty", "err", err)
		conn.WriteMessage(websocket.BinaryMessage, []byte("\r\n\x1b[31mFailed to start shell: "+err.Error()+"\x1b[0m\r\n"))
		return
	}
	defer ptmx.Close()
	defer cmd.Process.Kill() //nolint:errcheck

	if target != "container" {
		_, _ = ptmx.Write([]byte("export PS1='\\[\\033[1;32m\\]\\u@\\h\\[\\033[0m\\]:\\[\\033[1;34m\\]\\w\\[\\033[0m\\]\\\\$ '\ncd /\nclear\n"))
	}

	// PTY → WebSocket
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if err != nil {
				conn.Close()
				return
			}
			conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := conn.WriteMessage(websocket.BinaryMessage, buf[:n]); err != nil {
				return
			}
		}
	}()

	// WebSocket → PTY (stdin + resize)
	for {
		msgType, data, err := conn.ReadMessage()
		if err != nil {
			break
		}

		switch msgType {
		case websocket.BinaryMessage:
			ptmx.Write(data) //nolint:errcheck
		case websocket.TextMessage:
			var msg resizeMsg
			if err := json.Unmarshal(data, &msg); err == nil && msg.Type == "resize" {
				pty.Setsize(ptmx, &pty.Winsize{Rows: msg.Rows, Cols: msg.Cols}) //nolint:errcheck
			}
		}
	}
}

func Containers() []map[string]string {
	out, err := exec.Command("docker", "ps", "--format", "{{.ID}}\t{{.Names}}\t{{.Image}}\t{{.Status}}").Output()
	if err != nil {
		return []map[string]string{}
	}
	lines := strings.Split(strings.TrimSpace(string(out)), "\n")
	containers := make([]map[string]string, 0, len(lines))
	for _, line := range lines {
		if strings.TrimSpace(line) == "" {
			continue
		}
		parts := strings.SplitN(line, "\t", 4)
		for len(parts) < 4 {
			parts = append(parts, "")
		}
		containers = append(containers, map[string]string{
			"id":     parts[0],
			"name":   parts[1],
			"image":  parts[2],
			"status": parts[3],
		})
	}
	return containers
}

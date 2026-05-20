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
func WS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		slog.Error("terminal ws upgrade", "err", err)
		return
	}
	defer conn.Close()

	// Use bash if available, fall back to sh
	shell := "/bin/bash"
	if _, err := os.Stat(shell); os.IsNotExist(err) {
		shell = "/bin/sh"
	}

	cmd := exec.Command(shell)
	cmd.Env = append(os.Environ(), "TERM=xterm-256color")
	if home, err := os.UserHomeDir(); err == nil && home != "" {
		cmd.Dir = home
	}

	ptmx, err := pty.Start(cmd)
	if err != nil {
		slog.Error("starting pty", "err", err)
		conn.WriteMessage(websocket.BinaryMessage, []byte("\r\n\x1b[31mFailed to start shell: "+err.Error()+"\x1b[0m\r\n"))
		return
	}
	defer ptmx.Close()
	defer cmd.Process.Kill() //nolint:errcheck

	// PTY → WebSocket
	go func() {
		buf := make([]byte, 4096)
		for {
			n, err := ptmx.Read(buf)
			if err != nil {
				conn.Close()
				return
			}
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

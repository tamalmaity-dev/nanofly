//go:build windows
// +build windows

// internal/api/terminal/handler_windows.go
// Windows stub — PTY requires Linux/macOS.
// NanoFly is designed to run on Linux servers; this file just returns a friendly error.
package terminal

import (
	"net/http"

	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool { return true },
}

func WS(w http.ResponseWriter, r *http.Request) {
	conn, err := upgrader.Upgrade(w, r, nil)
	if err != nil {
		return
	}
	defer conn.Close()
	conn.WriteMessage(websocket.BinaryMessage, []byte( //nolint:errcheck
		"\r\n\x1b[33m⚠  NanoFly PTY Terminal is not available on Windows.\r\n"+
			"   Deploy NanoFly to a Linux server (Ubuntu, Debian, Raspberry Pi OS)\r\n"+
			"   and the real terminal will work automatically.\r\n\x1b[0m\r\n",
	))
}

func Containers() []map[string]string {
	return []map[string]string{}
}

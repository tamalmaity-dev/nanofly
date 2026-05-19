//go:build linux || darwin || freebsd
package server

import (
	"log/slog"
	"os"
	"syscall"
)

func restartInPlace(execPath string) {
	err := syscall.Exec(execPath, os.Args, os.Environ())
	if err != nil {
		slog.Error("failed to exec new binary in place", "error", err)
		os.Exit(1)
	}
}

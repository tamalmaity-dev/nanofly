//go:build windows
package server

import (
	"log/slog"
	"os"
	"os/exec"
)

func restartInPlace(execPath string) {
	cmd := exec.Command(execPath, os.Args[1:]...)
	cmd.Stdout = os.Stdout
	cmd.Stderr = os.Stderr
	cmd.Stdin = os.Stdin
	err := cmd.Start()
	if err != nil {
		slog.Error("failed to start new binary on windows", "error", err)
		os.Exit(1)
	}
	os.Exit(0)
}

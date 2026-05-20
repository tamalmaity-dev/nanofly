// cmd/nanofly/main.go — NanoFly Entry Point
package main

import (
	"context"
	"log/slog"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/nanofly/nanofly/internal/config"
	"github.com/nanofly/nanofly/internal/db"
	"github.com/nanofly/nanofly/internal/server"
)

// Version is set at build time via -ldflags="-X main.Version=v0.1.0"
var Version = "dev"

func main() {
	slog.SetDefault(slog.New(slog.NewTextHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	slog.Info("NanoFly starting", "version", Version)

	cfg, err := config.Load()
	if err != nil {
		slog.Error("failed to load config", "error", err)
		os.Exit(1)
	}
	slog.Info("config loaded", "port", cfg.Port, "data_dir", cfg.DataDir)

	database, err := db.Open(cfg.DataDir)
	if err != nil {
		slog.Error("failed to open database", "error", err)
		os.Exit(1)
	}
	defer database.Close()
	slog.Info("database ready")

	srv, err := server.New(cfg, database)
	if err != nil {
		slog.Error("failed to create server", "error", err)
		os.Exit(1)
	}

	// Pass build-time version to the server layer so the API returns it correctly.
	server.BuildVersion = Version

	go func() {
		slog.Info("NanoFly ready", "url", cfg.BaseURL())
		if err := srv.Start(); err != nil {
			slog.Error("server stopped", "error", err)
		}
	}()

	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)
	sig := <-quit
	slog.Info("shutdown signal received", "signal", sig)

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()

	if err := srv.Stop(ctx); err != nil {
		slog.Error("shutdown error", "error", err)
		os.Exit(1)
	}
	slog.Info("NanoFly stopped cleanly")
}

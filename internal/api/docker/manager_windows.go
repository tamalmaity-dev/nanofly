//go:build windows
// +build windows

// internal/api/docker/manager_windows.go — Windows stub.
// Docker management requires Linux. On Windows this compiles cleanly but returns an error.
package docker

import (
	"context"
	"fmt"
)

type Manager struct{}

func New() (*Manager, error) {
	return nil, fmt.Errorf("docker management is not available on Windows — deploy NanoFly to a Linux server")
}

func (m *Manager) Available(ctx context.Context) bool { return false }

type ContainerInfo struct {
	ID    string `json:"id"`
	Name  string `json:"name"`
	Image string `json:"image"`
	State string `json:"state"`
}

type DBConfig struct {
	ServiceID string
	DBType    string
	Name      string
	Password  string
	DBName    string
	HostPort  int
}

func (m *Manager) ListByLabel(ctx context.Context, serviceID string) ([]ContainerInfo, error) {
	return nil, fmt.Errorf("docker not available on Windows")
}

func (m *Manager) CreateDB(ctx context.Context, cfg DBConfig) (int, string, error) {
	return 0, "", fmt.Errorf("docker not available on Windows")
}

func (m *Manager) StopContainer(ctx context.Context, nameOrID string) error {
	return fmt.Errorf("docker not available on Windows")
}

func (m *Manager) RemoveContainer(ctx context.Context, nameOrID string) error {
	return fmt.Errorf("docker not available on Windows")
}

func (m *Manager) Logs(ctx context.Context, nameOrID string, tail string) (string, error) {
	return "", fmt.Errorf("docker not available on Windows")
}

func (m *Manager) DeployApp(ctx context.Context, serviceID, name, img string, hostPort, containerPort int, envVars []string) (string, error) {
	return "", fmt.Errorf("docker not available on Windows")
}

func (m *Manager) RestartContainer(ctx context.Context, nameOrID string) error {
	return fmt.Errorf("docker not available on Windows")
}

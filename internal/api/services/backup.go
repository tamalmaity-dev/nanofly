package services

import (
	"context"
	"fmt"
	"io"
	"strings"
	"time"
)

// BackupDatabase triggers a logical dump of a database service and saves it to its host volume.
func (m *Manager) BackupDatabase(ctx context.Context, serviceID string) (string, error) {
	svc, err := m.Get(ctx, serviceID)
	if err != nil {
		return "", err
	}
	containerName := svc.ContainerName()
	stamp := time.Now().Format("20060102-150405")
	backupFileName := fmt.Sprintf("backup_%s", stamp)

	var cmd []string
	if svc.Type == "app" {
		backupFileName += ".tar.gz"
		cmd = []string{"sh", "-c", fmt.Sprintf("tar -czf /app/%s -C /app .", backupFileName)}
	} else {
		backupFileName += ".sql"
		switch {
		case svc.Image == "postgres" || strings.HasPrefix(svc.Image, "postgres:"):
			cmd = []string{"sh", "-c", fmt.Sprintf("pg_dump -U %s %s > /var/lib/postgresql/data/%s", svc.DBUser, svc.DBName, backupFileName)}
		case svc.Image == "mysql" || strings.HasPrefix(svc.Image, "mysql:") || svc.Image == "mariadb" || strings.HasPrefix(svc.Image, "mariadb:"):
			cmd = []string{"sh", "-c", fmt.Sprintf("mysqldump -u %s -p%s %s > /var/lib/mysql/%s", svc.DBUser, svc.DBPassword, svc.DBName, backupFileName)}
		case svc.Image == "mongo" || strings.HasPrefix(svc.Image, "mongo:"):
			backupFileName = fmt.Sprintf("backup_%s.archive", stamp)
			cmd = []string{"sh", "-c", fmt.Sprintf("mongodump --archive=/data/db/%s", backupFileName)}
		case svc.Image == "redis" || strings.HasPrefix(svc.Image, "redis:") || svc.Image == "keydb":
			backupFileName = fmt.Sprintf("dump.rdb")
			cmd = []string{"sh", "-c", "redis-cli save"}
		default:
			return "", fmt.Errorf("logical backup not supported for %s", svc.Image)
		}
	}

	rc, err := m.docker.Exec(ctx, containerName, cmd, nil)
	if err != nil {
		return "", fmt.Errorf("failed to exec backup command: %w", err)
	}
	defer rc.Close()
	io.Copy(io.Discard, rc) // wait for it to finish (ignoring multiplexed output for now)

	// Return the relative path to the backup file in the volume
	return backupFileName, nil
}

// ImportDatabase imports a logical dump from the host volume into the database service.
func (m *Manager) ImportDatabase(ctx context.Context, serviceID, backupFileName string) error {
	svc, err := m.Get(ctx, serviceID)
	if err != nil {
		return err
	}
	containerName := svc.ContainerName()

	var cmd []string
	if svc.Type == "app" {
		cmd = []string{"sh", "-c", fmt.Sprintf("tar -xzf /app/%s -C /app", backupFileName)}
	} else {
		switch {
		case svc.Image == "postgres" || strings.HasPrefix(svc.Image, "postgres:"):
			cmd = []string{"sh", "-c", fmt.Sprintf("psql -U %s -d %s < /var/lib/postgresql/data/%s", svc.DBUser, svc.DBName, backupFileName)}
		case svc.Image == "mysql" || strings.HasPrefix(svc.Image, "mysql:") || svc.Image == "mariadb" || strings.HasPrefix(svc.Image, "mariadb:"):
			cmd = []string{"sh", "-c", fmt.Sprintf("mysql -u %s -p%s %s < /var/lib/mysql/%s", svc.DBUser, svc.DBPassword, svc.DBName, backupFileName)}
		case svc.Image == "mongo" || strings.HasPrefix(svc.Image, "mongo:"):
			cmd = []string{"sh", "-c", fmt.Sprintf("mongorestore --drop --archive=/data/db/%s", backupFileName)}
		default:
			return fmt.Errorf("logical import not supported for %s", svc.Image)
		}
	}

	rc, err := m.docker.Exec(ctx, containerName, cmd, nil)
	if err != nil {
		return fmt.Errorf("failed to exec import command: %w", err)
	}
	defer rc.Close()
	io.Copy(io.Discard, rc) // wait for it to finish

	return nil
}

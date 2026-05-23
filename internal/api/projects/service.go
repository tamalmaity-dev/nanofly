package projects

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/nanofly/nanofly/internal/db"
)
		
// Project represents a collection of services with shared settings.
type Project struct {
	ID              string    `json:"id"`
	Name            string    `json:"name"`
	Description     string    `json:"description"`
	BackupEnabled   int       `json:"backup_enabled"`
	BackupTime      string    `json:"backup_time"`
	BackupRetention int       `json:"backup_retention"`
	AppsCount       int       `json:"apps_count"`
	DbCount         int       `json:"db_count"`
	CreatedAt       time.Time `json:"created_at"`
}

// Service holds a reference to the database.
type Service struct {
	db *db.DB
}

func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

func (s *Service) List(ctx context.Context) ([]Project, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT p.id, p.name, COALESCE(p.description,''), p.backup_enabled, p.backup_time, p.backup_retention, p.created_at,
		        COUNT(CASE WHEN s.type = 'app' THEN 1 END) as apps_count,
		        COUNT(CASE WHEN s.type = 'database' THEN 1 END) as db_count
		 FROM projects p
		 LEFT JOIN services s ON p.id = s.project_id
		 GROUP BY p.id
		 ORDER BY p.created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("listing projects: %w", err)
	}
	defer rows.Close()

	var projs []Project
	for rows.Next() {
		var p Project
		var createdAt string
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &p.BackupEnabled, &p.BackupTime, &p.BackupRetention, &createdAt, &p.AppsCount, &p.DbCount); err != nil {
			return nil, err
		}
		p.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
		projs = append(projs, p)
	}
	if projs == nil {
		projs = []Project{}
	}
	return projs, nil
}

func (s *Service) Create(ctx context.Context, name, description string) (*Project, error) {
	var id string
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO projects (name, description) VALUES (?, ?) RETURNING id`,
		name, description,
	).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("creating project: %w", err)
	}
	return s.Get(ctx, id)
}

func (s *Service) Get(ctx context.Context, id string) (*Project, error) {
	var p Project
	var createdAt string
	err := s.db.QueryRowContext(ctx,
		`SELECT id, name, COALESCE(description,''), backup_enabled, backup_time, backup_retention, created_at FROM projects WHERE id = ?`, id,
	).Scan(&p.ID, &p.Name, &p.Description, &p.BackupEnabled, &p.BackupTime, &p.BackupRetention, &createdAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, sql.ErrNoRows
		}
		return nil, fmt.Errorf("fetching project: %w", err)
	}
	p.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	return &p, nil
}

// UpdateBackupSettings updates the automated backup schedule for a project.
func (s *Service) UpdateBackupSettings(ctx context.Context, id string, enabled int, time, retention string) error {
	_, err := s.db.ExecContext(ctx,
		`UPDATE projects SET backup_enabled = ?, backup_time = ?, backup_retention = ? WHERE id = ?`,
		enabled, time, retention, id,
	)
	return err
}

// Delete deletes a project and all its services.
func (s *Service) Delete(ctx context.Context, id string) error {
	// Prevent deletion if the project still contains active services
	var count int
	err := s.db.QueryRowContext(ctx, `SELECT count(*) FROM services WHERE project_id = ?`, id).Scan(&count)
	if err == nil && count > 0 {
		return fmt.Errorf("cannot delete project: please delete all %d service(s) first", count)
	}

	_, err = s.db.ExecContext(ctx, `DELETE FROM projects WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("deleting project: %w", err)
	}
	return nil
}

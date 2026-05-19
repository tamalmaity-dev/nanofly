package projects

import (
	"context"
	"database/sql"
	"fmt"
	"time"

	"github.com/nanofly/nanofly/internal/db"
)

type Project struct {
	ID          string    `json:"id"`
	Name        string    `json:"name"`
	Description string    `json:"description"`
	CreatedAt   time.Time `json:"created_at"`
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
		`SELECT id, name, COALESCE(description,''), created_at FROM projects ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("listing projects: %w", err)
	}
	defer rows.Close()

	var projs []Project
	for rows.Next() {
		var p Project
		var createdAt string
		if err := rows.Scan(&p.ID, &p.Name, &p.Description, &createdAt); err != nil {
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
		`SELECT id, name, COALESCE(description,''), created_at FROM projects WHERE id = ?`, id,
	).Scan(&p.ID, &p.Name, &p.Description, &createdAt)
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, sql.ErrNoRows
		}
		return nil, fmt.Errorf("fetching project: %w", err)
	}
	p.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	return &p, nil
}

func (s *Service) Delete(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM projects WHERE id = ?`, id)
	if err != nil {
		return fmt.Errorf("deleting project: %w", err)
	}
	return nil
}

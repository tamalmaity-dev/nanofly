package github

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"net/http"
	"time"

	"github.com/golang-jwt/jwt/v5"
	"github.com/nanofly/nanofly/internal/db"
)

type GitHubApp struct {
	ID             string    `json:"id"`
	Name           string    `json:"name"`
	AppID          int       `json:"app_id"`
	ClientID       string    `json:"client_id"`
	ClientSecret   string    `json:"client_secret,omitempty"`
	PrivateKey     string    `json:"private_key,omitempty"`
	WebhookSecret  string    `json:"webhook_secret,omitempty"`
	InstallationID int       `json:"installation_id"`
	SystemWide     bool      `json:"system_wide"`
	CreatedAt      time.Time `json:"created_at"`
}

type Service struct {
	db *db.DB
}

func NewService(database *db.DB) *Service {
	return &Service{db: database}
}

func (s *Service) Create(ctx context.Context, app GitHubApp) (*GitHubApp, error) {
	systemWide := 0
	if app.SystemWide {
		systemWide = 1
	}

	var id string
	err := s.db.QueryRowContext(ctx,
		`INSERT INTO github_apps (name, app_id, client_id, client_secret, private_key, webhook_secret, installation_id, system_wide) 
		VALUES (?, ?, ?, ?, ?, ?, ?, ?) RETURNING id`,
		app.Name, app.AppID, app.ClientID, app.ClientSecret, app.PrivateKey, app.WebhookSecret, app.InstallationID, systemWide,
	).Scan(&id)

	if err != nil {
		return nil, fmt.Errorf("creating github app: %w", err)
	}

	return s.Get(ctx, id)
}

func (s *Service) Get(ctx context.Context, id string) (*GitHubApp, error) {
	var a GitHubApp
	var sysWide int
	var createdAt string
	err := s.db.QueryRowContext(ctx,
		`SELECT id, name, app_id, client_id, client_secret, private_key, webhook_secret, installation_id, system_wide, created_at 
		FROM github_apps WHERE id = ?`, id,
	).Scan(&a.ID, &a.Name, &a.AppID, &a.ClientID, &a.ClientSecret, &a.PrivateKey, &a.WebhookSecret, &a.InstallationID, &sysWide, &createdAt)
	
	if err != nil {
		if err == sql.ErrNoRows {
			return nil, sql.ErrNoRows
		}
		return nil, fmt.Errorf("fetching github app: %w", err)
	}
	
	a.SystemWide = sysWide == 1
	a.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	return &a, nil
}

func (s *Service) List(ctx context.Context) ([]GitHubApp, error) {
	rows, err := s.db.QueryContext(ctx,
		`SELECT id, name, app_id, client_id, installation_id, system_wide, created_at FROM github_apps ORDER BY created_at DESC`,
	)
	if err != nil {
		return nil, fmt.Errorf("listing github apps: %w", err)
	}
	defer rows.Close()

	var apps []GitHubApp
	for rows.Next() {
		var a GitHubApp
		var sysWide int
		var createdAt string
		if err := rows.Scan(&a.ID, &a.Name, &a.AppID, &a.ClientID, &a.InstallationID, &sysWide, &createdAt); err != nil {
			return nil, err
		}
		a.SystemWide = sysWide == 1
		a.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
		// We omit secrets from list for security
		apps = append(apps, a)
	}
	if apps == nil {
		apps = []GitHubApp{}
	}
	return apps, nil
}

func (s *Service) Delete(ctx context.Context, id string) error {
	_, err := s.db.ExecContext(ctx, `DELETE FROM github_apps WHERE id = ?`, id)
	return err
}

func (s *Service) UpdateInstallationID(ctx context.Context, id string, installationID int) error {
	_, err := s.db.ExecContext(ctx, `UPDATE github_apps SET installation_id = ? WHERE id = ?`, installationID, id)
	return err
}

func (s *Service) GenerateInstallationToken(ctx context.Context, appID string) (string, error) {
	app, err := s.Get(ctx, appID)
	if err != nil {
		return "", err
	}

	key, err := jwt.ParseRSAPrivateKeyFromPEM([]byte(app.PrivateKey))
	if err != nil {
		return "", fmt.Errorf("parsing private key: %w", err)
	}

	claims := jwt.RegisteredClaims{
		IssuedAt:  jwt.NewNumericDate(time.Now().Add(-60 * time.Second)),
		ExpiresAt: jwt.NewNumericDate(time.Now().Add(10 * time.Minute)),
		Issuer:    fmt.Sprintf("%d", app.AppID),
	}

	token := jwt.NewWithClaims(jwt.SigningMethodRS256, claims)
	signedToken, err := token.SignedString(key)
	if err != nil {
		return "", fmt.Errorf("signing token: %w", err)
	}

	url := fmt.Sprintf("https://api.github.com/app/installations/%d/access_tokens", app.InstallationID)
	req, _ := http.NewRequestWithContext(ctx, "POST", url, nil)
	req.Header.Set("Authorization", "Bearer "+signedToken)
	req.Header.Set("Accept", "application/vnd.github.v3+json")

	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("fetching installation token: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusCreated {
		return "", fmt.Errorf("failed to get token, status: %d", resp.StatusCode)
	}

	var result struct {
		Token string `json:"token"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}

	return result.Token, nil
}

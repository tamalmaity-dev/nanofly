// internal/db/db.go — Database Layer (SQLite)
package db

import (
	"database/sql"
	"fmt"
	"os"
	"path/filepath"
	"time"

	_ "modernc.org/sqlite"
)

// DB wraps *sql.DB and exposes query helpers used by all modules.
type DB struct {
	*sql.DB
}

// Open creates the data dir, opens SQLite, and runs migrations.
func Open(dataDir string) (*DB, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("creating data directory %s: %w", dataDir, err)
	}

	dbPath := filepath.Join(dataDir, "nanofly.db")
	dsn := fmt.Sprintf("file:%s?_journal_mode=WAL&_foreign_keys=on&_busy_timeout=5000", dbPath)

	sqlDB, err := sql.Open("sqlite", dsn)
	if err != nil {
		return nil, fmt.Errorf("opening sqlite: %w", err)
	}

	// SQLite is single-writer — cap connections to avoid "database is locked"
	sqlDB.SetMaxOpenConns(1)

	if err := sqlDB.Ping(); err != nil {
		return nil, fmt.Errorf("connecting to sqlite: %w", err)
	}

	db := &DB{sqlDB}
	if err := db.migrate(); err != nil {
		return nil, fmt.Errorf("running migrations: %w", err)
	}

	return db, nil
}

func (db *DB) migrate() error {
	schema := `
	-- Users
	CREATE TABLE IF NOT EXISTS users (
		id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		email      TEXT UNIQUE NOT NULL,
		name       TEXT NOT NULL DEFAULT '',
		password   TEXT NOT NULL,
		role       TEXT NOT NULL DEFAULT 'member',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- Projects
	CREATE TABLE IF NOT EXISTS projects (
		id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		name        TEXT NOT NULL,
		description TEXT DEFAULT '',
		created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- Project membership
	CREATE TABLE IF NOT EXISTS project_members (
		project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
		user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		role       TEXT NOT NULL DEFAULT 'developer',
		PRIMARY KEY (project_id, user_id)
	);

	-- Services (apps/databases running in a project)
	CREATE TABLE IF NOT EXISTS services (
		id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		project_id TEXT NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
		name       TEXT NOT NULL,
		description TEXT DEFAULT '',
		type       TEXT NOT NULL,
		status     TEXT NOT NULL DEFAULT 'stopped',
		image      TEXT,
		port       INTEGER,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- Git sources for services
	CREATE TABLE IF NOT EXISTS git_sources (
		id             TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		service_id     TEXT UNIQUE NOT NULL REFERENCES services(id) ON DELETE CASCADE,
		repo_url       TEXT NOT NULL,
		branch         TEXT NOT NULL DEFAULT 'main',
		webhook_secret TEXT NOT NULL,
		created_at     DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- Domains → auto-HTTPS via Caddy
	CREATE TABLE IF NOT EXISTS domains (
		id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
		domain     TEXT UNIQUE NOT NULL,
		tls_status TEXT NOT NULL DEFAULT 'pending',
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- Environment variables (encrypted at rest)
	CREATE TABLE IF NOT EXISTS env_vars (
		id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		service_id TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
		key        TEXT NOT NULL,
		value      TEXT NOT NULL,
		UNIQUE(service_id, key)
	);

	-- Deployment history
	CREATE TABLE IF NOT EXISTS deployments (
		id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		service_id  TEXT NOT NULL REFERENCES services(id) ON DELETE CASCADE,
		status      TEXT NOT NULL DEFAULT 'running',
		commit_sha  TEXT DEFAULT '',
		commit_msg  TEXT DEFAULT '',
		log         TEXT DEFAULT '',
		started_at  DATETIME DEFAULT CURRENT_TIMESTAMP,
		finished_at DATETIME
	);

	-- Sessions (for JWT revocation)
	CREATE TABLE IF NOT EXISTS sessions (
		id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		user_id    TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
		token_hash TEXT UNIQUE NOT NULL,
		expires_at DATETIME NOT NULL,
		created_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);

	-- Settings (key/value store for panel-wide config)
	CREATE TABLE IF NOT EXISTS settings (
		key        TEXT PRIMARY KEY,
		value      TEXT NOT NULL,
		updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
	);
	`

	tx, err := db.Begin()
	if err != nil {
		return fmt.Errorf("starting migration transaction: %w", err)
	}
	defer tx.Rollback() //nolint:errcheck

	if _, err := tx.Exec(schema); err != nil {
		return fmt.Errorf("applying schema: %w", err)
	}

	// Dynamic migration for existing databases:
	_, _ = tx.Exec("ALTER TABLE services ADD COLUMN image TEXT")
	_, _ = tx.Exec("ALTER TABLE services ADD COLUMN start_command TEXT DEFAULT ''")
	_, _ = tx.Exec("ALTER TABLE services ADD COLUMN install_command TEXT DEFAULT ''")
	_, _ = tx.Exec("ALTER TABLE services ADD COLUMN app_directory TEXT DEFAULT ''")
	_, _ = tx.Exec("ALTER TABLE services ADD COLUMN run_file TEXT DEFAULT ''")
	_, _ = tx.Exec("ALTER TABLE services ADD COLUMN requirements_file TEXT DEFAULT 'requirements.txt'")
	_, _ = tx.Exec("ALTER TABLE services ADD COLUMN use_venv INTEGER DEFAULT 1")
	_, _ = tx.Exec("ALTER TABLE services ADD COLUMN docker_args TEXT DEFAULT ''")
	_, _ = tx.Exec("ALTER TABLE services ADD COLUMN dockerfile_content TEXT DEFAULT ''")
	_, _ = tx.Exec("ALTER TABLE services ADD COLUMN docker_compose_content TEXT DEFAULT ''")
	_, _ = tx.Exec("ALTER TABLE git_sources ADD COLUMN builder TEXT DEFAULT 'auto'")
	_, _ = tx.Exec("ALTER TABLE git_sources ADD COLUMN git_token TEXT DEFAULT ''")
	_, _ = tx.Exec("ALTER TABLE git_sources ADD COLUMN ssh_key TEXT DEFAULT ''")
	_, _ = tx.Exec("ALTER TABLE services ADD COLUMN description TEXT DEFAULT ''")

	return tx.Commit()
}

// ─── User queries ────────────────────────────────────────────────────────────

// User is the row shape returned from the users table.
type User struct {
	ID        string
	Email     string
	Name      string
	Password  string // bcrypt hash
	Role      string
	CreatedAt time.Time
}

// IsFirstRun returns true if no admin account exists yet.
func (db *DB) IsFirstRun() (bool, error) {
	var count int
	err := db.QueryRow(`SELECT COUNT(*) FROM users WHERE role = 'admin'`).Scan(&count)
	if err != nil {
		return false, fmt.Errorf("checking first run: %w", err)
	}
	return count == 0, nil
}

// CreateUser inserts a new user row. The password must already be hashed.
func (db *DB) CreateUser(email, name, hashedPassword, role string) (*User, error) {
	var id string
	err := db.QueryRow(
		`INSERT INTO users (email, name, password, role) VALUES (?, ?, ?, ?)
		 RETURNING id`,
		email, name, hashedPassword, role,
	).Scan(&id)
	if err != nil {
		return nil, fmt.Errorf("creating user: %w", err)
	}
	return db.GetUserByID(id)
}

// GetUserByEmail fetches a user by email address (used for login).
func (db *DB) GetUserByEmail(email string) (*User, error) {
	row := db.QueryRow(
		`SELECT id, email, name, password, role, created_at FROM users WHERE email = ?`,
		email,
	)
	u := &User{}
	var createdAt string
	if err := row.Scan(&u.ID, &u.Email, &u.Name, &u.Password, &u.Role, &createdAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil // not found
		}
		return nil, fmt.Errorf("fetching user by email: %w", err)
	}
	u.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	return u, nil
}

// GetUserByID fetches a user by primary key (used after login for /me).
func (db *DB) GetUserByID(id string) (*User, error) {
	row := db.QueryRow(
		`SELECT id, email, name, password, role, created_at FROM users WHERE id = ?`,
		id,
	)
	u := &User{}
	var createdAt string
	if err := row.Scan(&u.ID, &u.Email, &u.Name, &u.Password, &u.Role, &createdAt); err != nil {
		if err == sql.ErrNoRows {
			return nil, nil
		}
		return nil, fmt.Errorf("fetching user by id: %w", err)
	}
	u.CreatedAt, _ = time.Parse("2006-01-02 15:04:05", createdAt)
	return u, nil
}

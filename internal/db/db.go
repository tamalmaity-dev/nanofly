// internal/db/db.go — Database Layer (SQLite)
package db

import (
	"context"
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

// CleanupOldRecords prunes old deployment logs and activity entries to prevent
// unbounded database growth. It keeps the most recent deployments per service
// and the most recent activity log entries globally. Called periodically.
func (db *DB) CleanupOldRecords() {
	ctx := context.Background()

	// Keep only the last 20 deployment records per service (truncates the log of older ones)
	_, _ = db.ExecContext(ctx, `
		DELETE FROM deployments WHERE id NOT IN (
			SELECT id FROM (
				SELECT id, ROW_NUMBER() OVER (PARTITION BY service_id ORDER BY started_at DESC) AS rn
				FROM deployments
			) WHERE rn <= 20
		`)
	// Also truncate logs of retained deployments older than the most recent 5 to save space
	_, _ = db.ExecContext(ctx, `
		UPDATE deployments SET log = '' WHERE id NOT IN (
			SELECT id FROM (
				SELECT id, ROW_NUMBER() OVER (PARTITION BY service_id ORDER BY started_at DESC) AS rn
				FROM deployments
			) WHERE rn <= 5
		) AND log != '' AND LENGTH(log) > 0
	`)

	// Keep only the last 500 activity log entries
	_, _ = db.ExecContext(ctx, `
		DELETE FROM activity_log WHERE id NOT IN (
			SELECT id FROM (
				SELECT id, ROW_NUMBER() OVER (ORDER BY created_at DESC) AS rn
				FROM activity_log
			) WHERE rn <= 500
		)
	`)

	// Clean up expired sessions
	_, _ = db.ExecContext(ctx, `DELETE FROM sessions WHERE expires_at < datetime('now')`)

	// Periodic VACUUM to reclaim disk space (only runs when DB has grown)
	_, _ = db.ExecContext(ctx, `PRAGMA wal_checkpoint(TRUNCATE)`)
}

// Open creates the data dir, opens SQLite, and runs migrations.
func Open(dataDir string) (*DB, error) {
	if err := os.MkdirAll(dataDir, 0755); err != nil {
		return nil, fmt.Errorf("creating data directory %s: %w", dataDir, err)
	}

	dbPath := filepath.Join(dataDir, "nanofly.db")
	dsn := fmt.Sprintf("file:%s?_journal_mode=WAL&_auto_vacuum=FULL&_foreign_keys=on&_busy_timeout=5000", dbPath)

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
		db_user    TEXT DEFAULT '',
		db_password TEXT DEFAULT '',
		db_name    TEXT DEFAULT '',
		type       TEXT NOT NULL,
		status     TEXT NOT NULL DEFAULT 'stopped',
		image      TEXT,
		port       INTEGER,
		resource_tier TEXT NOT NULL DEFAULT 'micro',
		custom_memory INTEGER DEFAULT 0,
		custom_cpu INTEGER DEFAULT 0,
		dockerfile_location TEXT DEFAULT '',
		build_stage_target TEXT DEFAULT '',
		build_custom_options TEXT DEFAULT '',
		base_directory TEXT DEFAULT '',
		docker_registry_image TEXT DEFAULT '',
		docker_registry_tag TEXT DEFAULT '',
		ports_exposes INTEGER DEFAULT 0,
		port_mappings TEXT DEFAULT '',
		network_aliases TEXT DEFAULT '',
		build_watch_paths TEXT DEFAULT '',
		build_use_server INTEGER DEFAULT 0,
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

	-- GitHub Apps
	CREATE TABLE IF NOT EXISTS github_apps (
		id              TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		name            TEXT NOT NULL,
		app_id          INTEGER NOT NULL,
		client_id       TEXT NOT NULL,
		client_secret   TEXT NOT NULL,
		private_key     TEXT NOT NULL,
		webhook_secret  TEXT NOT NULL,
		installation_id INTEGER DEFAULT 0,
		system_wide     INTEGER DEFAULT 0,
		created_at      DATETIME DEFAULT CURRENT_TIMESTAMP
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
	if err := tx.Commit(); err != nil {
		return fmt.Errorf("committing schema: %w", err)
	}

	// ── Schema migrations ──────────────────────────────────────────────────────
	// Each ALTER TABLE runs outside a transaction so that a failure on one
	// (column already exists) does not roll back every subsequent migration.
	// This is safe because ADD COLUMN is idempotent — it errors if the column
	// exists and we silently ignore that error with _, _.
	migrate := func(stmt string) { _, _ = db.Exec(stmt) }

	// Core service fields
	migrate("ALTER TABLE services ADD COLUMN image TEXT")
	migrate("ALTER TABLE services ADD COLUMN start_command TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN install_command TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN app_directory TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN run_file TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN requirements_file TEXT DEFAULT 'requirements.txt'")
	migrate("ALTER TABLE services ADD COLUMN use_venv INTEGER DEFAULT 1")
	migrate("ALTER TABLE services ADD COLUMN docker_args TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN dockerfile_content TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN docker_compose_content TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN description TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN db_user TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN db_password TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN db_name TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN resource_tier TEXT DEFAULT 'micro'")
	migrate("ALTER TABLE services ADD COLUMN custom_memory INTEGER DEFAULT 0")
	migrate("ALTER TABLE services ADD COLUMN custom_cpu INTEGER DEFAULT 0")

	// Git source fields
	migrate("ALTER TABLE git_sources ADD COLUMN builder TEXT DEFAULT 'auto'")
	migrate("ALTER TABLE git_sources ADD COLUMN git_token TEXT DEFAULT ''")
	migrate("ALTER TABLE git_sources ADD COLUMN ssh_key TEXT DEFAULT ''")
	migrate("ALTER TABLE git_sources ADD COLUMN github_app_id TEXT REFERENCES github_apps(id) ON DELETE SET NULL")

	// Project fields
	migrate("ALTER TABLE projects ADD COLUMN backup_enabled INTEGER DEFAULT 0")
	migrate("ALTER TABLE projects ADD COLUMN backup_time TEXT DEFAULT '00:00'")
	migrate("ALTER TABLE projects ADD COLUMN backup_retention INTEGER DEFAULT 7")

	// Advanced configuration
	migrate("ALTER TABLE services ADD COLUMN dockerfile_location TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN build_stage_target TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN build_custom_options TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN base_directory TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN docker_registry_image TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN docker_registry_tag TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN ports_exposes INTEGER DEFAULT 0")
	migrate("ALTER TABLE services ADD COLUMN port_mappings TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN network_aliases TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN build_watch_paths TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN build_use_server INTEGER DEFAULT 0")
	migrate("ALTER TABLE services ADD COLUMN volumes TEXT DEFAULT '[]'")
	migrate("ALTER TABLE deployments ADD COLUMN trigger TEXT DEFAULT 'manual'")

	// Healthcheck
	migrate("ALTER TABLE services ADD COLUMN healthcheck_enabled INTEGER DEFAULT 0")
	migrate("ALTER TABLE services ADD COLUMN healthcheck_path TEXT DEFAULT ''")
	migrate("ALTER TABLE services ADD COLUMN healthcheck_port INTEGER DEFAULT 0")

	// Service name uniqueness per project
	if _, idxErr := db.Exec("CREATE UNIQUE INDEX IF NOT EXISTS idx_services_project_name ON services(project_id, name)"); idxErr != nil {
		fmt.Printf("WARN: idx_services_project_name could not be created (likely existing duplicate names): %v\n", idxErr)
	}

	// Webhook delivery log
	migrate(`CREATE TABLE IF NOT EXISTS webhook_deliveries (
		id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
		service_id  TEXT DEFAULT '',
		source      TEXT NOT NULL DEFAULT 'unknown',
		repo_url    TEXT DEFAULT '',
		branch      TEXT DEFAULT '',
		commit_sha  TEXT DEFAULT '',
		status      TEXT NOT NULL DEFAULT 'received',
		message     TEXT DEFAULT '',
		remote_addr TEXT DEFAULT '',
		created_at  DATETIME DEFAULT CURRENT_TIMESTAMP
	)`)

	// Normalize git_sources: strip .git suffix from repo_url for consistent webhook matching
	if _, normErr := db.Exec("UPDATE git_sources SET repo_url = rtrim(repo_url, '.git') WHERE repo_url LIKE '%.git'"); normErr != nil {
		fmt.Printf("WARN: git_sources URL normalization migration failed: %v\n", normErr)
	}

	return nil
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

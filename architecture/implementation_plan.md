# NanoFly — Full Implementation Plan
> A lightweight, self-hosted server management platform (Coolify/Cockpit alternative)
> Built with **Go (backend) + React (frontend)**, optimized for Raspberry Pi and low-end servers.

---

## What NanoFly Is

NanoFly is an **open-source, self-hosted control panel** that you install on any Linux server (including Raspberry Pi). After a one-line install from GitHub, users get a beautiful web UI to:

- Monitor server health (CPU, RAM, Disk, Temperature)
- Deploy apps and databases with one click
- Manage domains with automatic HTTPS (via Caddy)
- Connect GitHub repos and receive webhooks
- Use a live web terminal
- Isolate everything into separate Projects

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────┐
│                     Browser UI                       │
│        React + Vite (served by Go in prod)           │
└────────────────────┬────────────────────────────────┘
                     │  HTTP + WebSocket
┌────────────────────▼────────────────────────────────┐
│              NanoFly Daemon (Go binary)              │
│  ┌─────────┐ ┌──────────┐ ┌────────┐ ┌──────────┐  │
│  │  Auth   │ │ Metrics  │ │ Deploy │ │ Terminal │  │
│  └─────────┘ └──────────┘ └────────┘ └──────────┘  │
│  ┌──────────┐ ┌─────────┐ ┌────────────────────┐   │
│  │ Domains  │ │  Apps   │ │  GitHub / Webhooks  │   │
│  └──────────┘ └─────────┘ └────────────────────┘   │
│                     SQLite DB                        │
└────────────────────┬────────────────────────────────┘
                     │  manages
     ┌───────────────┼─────────────────────┐
     ▼               ▼                     ▼
  Docker/         Caddy               systemd
  Podman       (auto-HTTPS)           services
```

---

## Tech Stack

| Layer | Technology | Why |
|-------|-----------|-----|
| **Backend** | Go 1.22 | Fast, single binary, tiny RAM use (~15MB idle) |
| **Database** | SQLite (modernc) | Zero-config, no server, Raspberry Pi friendly |
| **Router** | chi v5 | Lightweight, middleware-friendly |
| **Frontend** | React + Vite | Modern, fast HMR, production bundle embedded in Go binary |
| **Terminal** | WebSocket + xterm.js | Browser-native terminal over WS |
| **Metrics** | gopsutil v3 | Cross-platform CPU/RAM/Disk/Temp |
| **Reverse Proxy** | Caddy | Auto-HTTPS, JSON config API |
| **Containers** | Docker Engine API | Deploy apps as containers |
| **Auth** | JWT + bcrypt | Stateless, lightweight |
| **Install** | Bash one-liner | Downloads binary from GitHub Releases |

---

## Full Feature Set

### 1. Authentication & Multi-user
- First-run setup wizard (set admin password)
- JWT-based login/logout
- Role system: **Owner**, **Member**, **Viewer**
- Session management (revoke tokens)

### 2. Dashboard / Server Overview
- Real-time CPU %, RAM %, Disk %, Network I/O
- CPU temperature (Raspberry Pi supported via `/sys/class/thermal`)
- System uptime, hostname, OS info
- WebSocket-powered live charts (no polling)

### 3. Projects
- Logical grouping of apps, databases, and domains
- Isolated environments per project
- Project-level members/permissions

### 4. App Deployment (Docker-based)
- Deploy from **GitHub repo** (clone + build Dockerfile)
- Deploy **pre-built Docker images** from Docker Hub
- Environment variables manager
- Port mapping, volume mounts
- Build logs streamed live
- Start / Stop / Restart / Delete
- Auto-restart on crash

### 5. Database Services (one-click install)
- **MySQL 8** — managed container
- **PostgreSQL 16** — managed container  
- **Redis 7** — managed container
- MongoDB 7 (optional)
- Connection string auto-generated and stored securely
- Backup/restore UI (dump to file)

### 6. GitHub Integration
- OAuth app or Personal Access Token
- Browse and select repositories
- Automatic webhook registration
- **Auto-deploy on push** (CD pipeline)
- Branch selection per app

### 7. Domains & Auto-HTTPS
- Add custom domain → Caddy config written via Admin API `:2019`
- Let's Encrypt cert issued automatically
- HTTP → HTTPS redirect
- Cert expiry shown in UI
- Wildcard support via DNS-01

### 8. Web Terminal
- Full PTY terminal in browser via xterm.js
- WebSocket connection to server's `/bin/bash`
- Resize support
- Per-container terminal (docker exec)

### 9. Service Management (systemd)
- List, start, stop, restart systemd services
- View service logs (journald)
- Enable/disable on boot

### 10. Notifications
- Email alerts (SMTP)
- Deployment success/failure
- Certificate expiry warnings
- Server threshold alerts (CPU > 90%, disk full, etc.)

### 11. Installer & Updates
- One-line install script (bash):
  ```bash
  curl -fsSL https://get.nanofly.dev | bash
  ```
- Downloads binary from GitHub Releases
- Creates systemd service, sets up Caddy
- In-panel update checker + one-click upgrade

---

## Project Structure

```
NanoFly/
├── cmd/
│   └── nanofly/
│       └── main.go                 # entry point (rename from paneld)
├── internal/
│   ├── config/
│   │   └── config.go               # ✅ exists
│   ├── db/
│   │   └── db.go                   # ✅ exists — add new migrations
│   ├── server/
│   │   └── server.go               # ✅ exists — add module mounts
│   ├── response/
│   │   └── response.go             # ✅ exists
│   ├── auth/
│   │   ├── handler.go              # JWT login/register/refresh
│   │   ├── middleware.go           # RequireAuth middleware
│   │   └── service.go              # bcrypt + JWT generation
│   ├── metrics/
│   │   ├── handler.go              # WebSocket /ws/metrics
│   │   └── collector.go            # gopsutil collector
│   ├── terminal/
│   │   └── handler.go              # WebSocket /ws/terminal
│   ├── projects/
│   │   ├── handler.go              # CRUD /api/v1/projects
│   │   └── service.go
│   ├── apps/
│   │   ├── handler.go              # deploy, start, stop, logs
│   │   ├── service.go              # docker API integration
│   │   └── deployer.go             # git clone + docker build
│   ├── databases/
│   │   ├── handler.go              # MySQL/PG/Redis management
│   │   └── service.go
│   ├── domains/
│   │   ├── handler.go              # domain CRUD
│   │   └── caddy.go               # Caddy Admin API client
│   ├── github/
│   │   ├── handler.go              # OAuth + webhook endpoints
│   │   └── service.go
│   └── services/
│       └── handler.go              # systemd management
├── web/                            # React + Vite frontend
│   ├── src/
│   │   ├── pages/
│   │   │   ├── Login.jsx
│   │   │   ├── Setup.jsx
│   │   │   ├── Dashboard.jsx       # server stats
│   │   │   ├── Projects.jsx
│   │   │   ├── Apps.jsx
│   │   │   ├── Databases.jsx
│   │   │   ├── Domains.jsx
│   │   │   ├── Terminal.jsx
│   │   │   └── Settings.jsx
│   │   ├── components/
│   │   │   ├── MetricsChart.jsx
│   │   │   ├── LogViewer.jsx
│   │   │   ├── AppCard.jsx
│   │   │   └── DBCard.jsx
│   │   └── api/                    # API client hooks
│   └── dist/                       # built → embedded in Go binary
├── scripts/
│   ├── install.sh                  # one-liner installer
│   └── update.sh
├── Makefile                        # ✅ exists
├── go.mod                          # ✅ exists
└── nanofly.yaml                    # config file
```

---

## Database Schema (SQLite)

```sql
-- Users & Auth
users (id, username, email, password_hash, role, created_at)
sessions (id, user_id, token_hash, expires_at, created_at)

-- Projects
projects (id, name, slug, description, owner_id, created_at)
project_members (project_id, user_id, role)

-- Apps
apps (id, project_id, name, type, status, image, repo_url, branch,
      env_vars_encrypted, port, created_at)
app_deployments (id, app_id, status, log, started_at, finished_at)

-- Databases
databases (id, project_id, name, type, status, port,
           password_encrypted, created_at)

-- Domains
domains (id, app_id, domain, tls_status, cert_expiry, created_at)

-- GitHub
github_connections (id, user_id, token_encrypted, username, created_at)
webhooks (id, app_id, secret, created_at)

-- Notifications
notification_settings (id, user_id, email, smtp_config, created_at)
```

---

## API Routes

```
GET    /health
GET    /api/setup/status
POST   /api/setup/init           ← first-run: create admin account

POST   /api/v1/auth/login
POST   /api/v1/auth/logout
GET    /api/v1/auth/me

GET    /api/v1/metrics            ← snapshot
WS     /ws/metrics                ← live stream
WS     /ws/terminal               ← PTY terminal
WS     /ws/logs/:app_id           ← live deploy logs

GET    /api/v1/projects
POST   /api/v1/projects
GET    /api/v1/projects/:id
DELETE /api/v1/projects/:id

GET    /api/v1/projects/:id/apps
POST   /api/v1/projects/:id/apps
GET    /api/v1/apps/:id
POST   /api/v1/apps/:id/deploy
POST   /api/v1/apps/:id/start
POST   /api/v1/apps/:id/stop
POST   /api/v1/apps/:id/restart
DELETE /api/v1/apps/:id

GET    /api/v1/projects/:id/databases
POST   /api/v1/projects/:id/databases
DELETE /api/v1/databases/:id

GET    /api/v1/domains
POST   /api/v1/domains
DELETE /api/v1/domains/:id

GET    /api/v1/github/repos
POST   /api/v1/github/connect
POST   /webhook/:app_id           ← GitHub webhook receiver

GET    /api/v1/systemd/services
POST   /api/v1/systemd/:name/start
POST   /api/v1/systemd/:name/stop
```

---

## Frontend Design

- **Dark mode** by default (like Coolify)
- Sidebar navigation: Dashboard, Projects, Databases, Domains, Terminal, Settings
- Real-time metrics gauges (animated SVG arcs)
- Log viewer with syntax-highlighted ANSI output
- xterm.js terminal embedded in `/terminal` page
- Toast notifications for deployment events
- Mobile-responsive

---

## Installation Flow

```bash
# User runs on their server:
curl -fsSL https://raw.githubusercontent.com/yourusername/nanofly/main/scripts/install.sh | bash
```

The script:
1. Detects OS/arch (amd64, arm64, armv7 for Pi)
2. Downloads the correct binary from GitHub Releases
3. Installs Caddy if not present
4. Creates `/etc/nanofly/nanofly.yaml` with a random secret key
5. Creates `/etc/systemd/system/nanofly.service`
6. Enables and starts the service
7. Prints: `NanoFly is running at http://<server-ip>:8080`

---

## Build System (Makefile targets)

```makefile
make dev       # run backend + frontend dev servers
make build     # build production binary with embedded frontend
make release   # cross-compile for linux/amd64, linux/arm64, linux/arm
make docker    # build Docker image
```

---

## Phase Roadmap

| Phase | Features | Status |
|-------|----------|--------|
| **Phase 1** | Auth, Setup Wizard, Metrics Dashboard, Live Charts | 🔨 Next |
| **Phase 2** | Projects, App Deployment (Docker), Logs, Terminal | ⏳ Planned |
| **Phase 3** | Databases (MySQL/PG/Redis), Environment Vars | ⏳ Planned |
| **Phase 4** | Domains + Auto-HTTPS (Caddy), GitHub OAuth | ⏳ Planned |
| **Phase 5** | Webhooks, Auto-Deploy, Notifications | ⏳ Planned |
| **Phase 6** | Systemd Manager, In-panel Updates, Install Script | ⏳ Planned |

---

## Open Questions

> [!IMPORTANT]
> **Module name**: Currently `go.mod` uses `github.com/yourname/paneld`. Should this be changed to `github.com/yourusername/nanofly`? What is your GitHub username?

> [!IMPORTANT]
> **Container runtime**: Should NanoFly use **Docker** (most common) or support **Podman** too (better for rootless/Pi setups)? Recommendation: Docker first, Podman later.

> [!IMPORTANT]
> **Frontend build**: Should the React frontend be **embedded directly inside the Go binary** (single-file deploy, easiest for users) or served separately? Recommendation: embedded using Go's `//go:embed` directive.

> [!NOTE]
> **Phase to start**: Should we start from **Phase 1** (Auth + Live Metrics dashboard — the most visible first milestone) or do you want to restructure the existing files first?

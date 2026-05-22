# NanoFly Version & Fixes Changelog

This document tracks all version iterations, key fixes, and feature additions chronologically.

---

## 🚀 v0.3.11-beta — UI Overhaul, Devicon Logos, Quick Access Sidebar, Build Progress & Mobile Responsiveness

### 🌟 Key Features
*   **UI Overhaul (Beta)**: Complete visual redesign with new typography, spacing, and a modern "Soft Edge" card aesthetic.
*   **Devicon Support**: Integrated Devicon CDN to automatically fetch official vector logos for Docker, Node.js, Python, and all supported databases (Postgres, MySQL, MongoDB, Redis, etc.). Fallback system icons included.
*   **Quick Access Sidebar**: The "Services" list now features a sidebar with one-click Start/Stop controls, "View Logs", and "Delete" actions, removing the need to navigate to detail pages for basic management.
*   **Real-Time Build Progress**: Enhanced build modals now display live progress indicators (percentage bars and status chips) during the build process.
*   **System Monitoring**: Live CPU/RAM usage is now displayed on the Dashboard Overview page with interactive charts.

### 🛠️ Bug Fixes & Enhancements
*   **Build Status Display**: Fixed an issue where the build card would only show "Building" status indefinitely. It now correctly shows the final state (Success/Failed) with elapsed time.
*   **Responsive Design**: Improved mobile layout and sidebar handling for smaller screens.
*   **Service Detail Navigation**: Added "Back to Services" breadcrumbs and removed the Terminal tab for databases.


## 🚀 v0.3.10 — Advanced Orchestration, Docker Compose, Git Deploy Keys & Real-Time Monitoring

### 🌟 Key Features
*   **Docker Compose Builder Support**: Full multi-container Docker Compose orchestration is now supported for both local folders and Git repository deployments. NanoFly dynamically translates Compose configurations, aggregates memory and CPU statistics, and handles custom `docker-compose.yml` inline definitions.
*   **Interactive Build Wizard**: Grouped service creations into "Git-Based", "Docker & Folder Based", and "Databases" columns. Selecting Dockerfile or Docker Compose builds shows a full-screen or inline monospaced code editor and automatically handles dependencies (like toggling python `useVenv` off).
*   **Git Deploy Keys & Private Repositories**: Supports repository access via GitHub Personal Access Tokens (PAT) and SSH Private Deploy Keys. Deployment keys are temporarily written to memory/disk and linked securely via `GIT_SSH_COMMAND` environment settings.
*   **Monospaced Code Editor**: Replaced standard configuration textareas with a scroll-synchronized code editor component that has line-number gutters.
*   **Real-Time System Monitoring**: Live-monitoring panel under service details showing memory usage, CPU load progress, and inbound/outbound Network traffic speeds dynamically queried via `docker stats --no-stream` API.

### 🛠️ Bug Fixes & Enhancements
*   **Automatic Container Port Detection**: Solved the "Bad Gateway" connectivity error (such as with WordPress) by dynamically inspecting the container image's configuration for exposed ports, and automatically routing the external proxy port mapping to it.
*   **Premium Database Detail View**: Added a high-fidelity "Connection Details" tab for database services displaying host/port details, database engine status, credentials with eye toggle/copy, and copyable connection URIs and CLI commands (e.g. `psql`, `mysql`, `redis-cli`, `mongosh`).
*   **Intelligent Tab Navigation**: Custom tab filters now hide irrelevant tabs (like Deployments, Terminal, Source Files) for databases and focus the initial dashboard view on connection credentials when clicked.


**Summary of Work Done:**
*   **Resolved compiler error on macOS/Linux (Darwin):** Updated internal/api/docker/manager.go to use the receiver field m.cli (specifically m.cli.ImageInspect) instead of the undefined Client package namespace, resolving the compiler error. We also verified this by successfully cross-compiling for Linux (GOOS=linux go build).
*   **Fixed WordPress Bad Gateway issue:** Updated the container deployment logic to dynamically inspect the Docker image config for exposed ports (e.g., port 80 for WordPress). NanoFly now automatically maps the public host port to the container's internal exposed port instead of matching them directly, correcting the container networking mismatch.
*   **Designed & built premium Database Connection Details panel:** Added a beautiful tab to database services in ProjectDetail.jsx showing engine name & status, host/port, database name, user, toggle-to-reveal password, raw connection URI, and copyable CLI connection commands (e.g., `psql`, `mysql`, `redis-cli`, `mongosh`).
*   **Intelligent Tab Navigation:** Updated the service list and tab controls to hide irrelevant tabs (Deployments, Terminal, Environment Variables) for databases and focus the initial dashboard view on connection credentials when clicked.
*   **Committed & Updated v0.3.10 on GitHub:** Committed all changes, updated the docs/changelog.md to document the fixes, pushed to main branch, deleted the old remote/local release tag, and pushed the updated release tag v0.3.10 to GitHub.






---

## 🚀 v0.3.1 — Frontend Fixes and Feature Additions

### 🌟 Key Features
*   **File Manager**: Added a file manager to the dashboard.
*   **Sign Out**: Added a sign out button to the dashboard.
*   **Sidebar**: Added a sidebar to the dashboard.
*   **Overview**: Added an overview to the dashboard.
*   **Projects**: Added a projects section to the dashboard.
*   **Resources**: Added a resources section to the dashboard.

### 🛠️ Changes Implemented

* **File Manager now shows files correctly by reading the actual API response shape**
* **File Manager shows files correctly in breadcrumbs, root path, delete logic, and upload handling.**
* **Sign out now opens a confirmation dialog, and logout API/token cleanup is fixed.**
* **Sidebar version now reads current_version from the backend, which comes from the root VERSION file when build metadata is not set.**
* **Overview network chart now shows live RX and TX pills, and System Information includes current RX/TX.**
* **Projects/resources now include Local Folder, WordPress, Python, and Node.js template options.**
* **Backend app creation now accepts local_path and git_builder; local folder deploy copies the folder into the build workspace and uses the existing optimized Dockerfile auto-detection/templates.**
* **Added low-overhead local copy behavior that skips .git and node_modules.**


## 🚀 v0.3.0 (Current) — Multi-Platform Build & Deployment

### 🌟 Key Features
*   **Cross-Platform Builds**: Added cross-compilation support for all major platforms using GitHub Actions.
*   **Linux Support**: Native builds for `amd64` (standard servers), `arm64` (Raspberry Pi 4/5), and `armv7` (Raspberry Pi 3/Zero 2).
*   **macOS Support**: Native builds for `amd64` (Intel Macs) and `arm64` (Apple Silicon Macs).
*   **Windows Support**: Native build for `amd64` (Windows).
*   **Automatic Asset Upload**: New binaries are automatically uploaded as release assets to GitHub on every version tag push. 

### 🛠️ Changes Implemented
* **Backend Build Logic**: Extended `Makefile` with cross-build targets for Linux, macOS, and Windows.
* **GitHub Actions**: Updated `.github/workflows/ci.yml` to run `go build` for all platforms and attach artifacts to releases.


## How to Fix :

Viewed release.yml:1-126
Viewed ci.yml:1-74

Now I'll update all three things simultaneously — `release.yml` (add macOS + Windows), `ci.yml` (add build checks), `Makefile` (add macOS/Windows targets), and `VERSION` (bump to `v0.3.0`):

Edited release.yml
Edited ci.yml
Edited Makefile

Now bump VERSION to `v0.3.0` (stable release):

Edited VERSION

Quick cross-compile sanity check for all 3 new targets from Windows PowerShell:

Ran command: `$env:GOOS='darwin'; $env:GOARCH='amd64'; go build -ldflags="-s -w -X main.Version=v0.3.0" -o nul ./cmd/nanofly 2>&1; $env:GOOS='darwin'; $env:GOARCH='arm64'; go build -ldflags="-s -w -X main.Version=v0.3.0" -o nul ./cmd/nanofly 2>&1; $env:GOOS='windows'; $env:GOARCH='amd64'; go build -ldflags="-s -w -X main.Version=v0.3.0" -o nul ./cmd/nanofly 2>&1; $env:GOOS=''; $env:GOARCH=''`

All three new platform targets compile clean. Now commit everything and push, then tag `v0.3.0`:

Ran command: `git add VERSION Makefile .github/workflows/release.yml .github/workflows/ci.yml`
Ran command: `git commit -m "feat: v0.3.0 stable — add macOS (Intel + Apple Silicon) and Windows release builds"`
Ran command: `git push origin main`
Ran command: `git tag v0.3.0 && git push origin v0.3.0`
Ran command: `git tag v0.3.0`
Ran command: `git push origin v0.3.0`

Now set up `v0.3.1-beta` for the next iteration:

Edited VERSION
Ran command: `git add VERSION`
Ran command: `git commit -m "chore: start v0.3.1-beta development cycle"`
Ran command: `git push origin main`

Everything is done. Here's the full summary:

---

### What was done

**Release `v0.3.0` is now building on GitHub Actions with 6 platform targets:**

| Platform | Artifact | Runner |
|---|---|---|
| Linux x86_64 | `nanofly-linux-amd64.tar.gz` | ubuntu-latest |
| Linux ARM64 (Pi 4/5) | `nanofly-linux-arm64.tar.gz` | ubuntu-latest |
| Linux ARMv7 (Pi 3) | `nanofly-linux-armv7.tar.gz` | ubuntu-latest |
| **macOS Intel** | `nanofly-macos-amd64.tar.gz` | macos-13 |
| **macOS Apple Silicon M1-M4** | `nanofly-macos-arm64.tar.gz` | macos-latest |
| **Windows x64** | `nanofly-windows-amd64.zip` | windows-latest |

**Key design decisions:**
- macOS builds run on **native macOS GitHub runners** (not cross-compiled) so CGO and system frameworks link correctly
- Windows is packaged as **`.zip`** (not `.tar.gz`) using PowerShell `Compress-Archive`
- `v0.3.0` has **no `-beta` suffix** → GitHub will mark it as a **stable release** (not pre-release)
- Tags with `-beta`/`-alpha`/`-rc` are auto-marked as pre-releases

**Version cycle going forward:**
```
v0.3.0        ← stable, released now
v0.3.1-beta   ← current dev version in VERSION file
```

When you're ready to release next time: `make release` will read `VERSION` and tag+push automatically.

----------------------------------------------------------------------------------------------------------------------------------------------------



## 🚀 v0.3.0-beta — Dockerfile Builder & Deployment Cleanup

### 🌟 Key Fixes
*   **Fixed Automatic Dockerfile Generation**: Restored and improved the logic that automatically generates optimal multi-stage Dockerfiles for detected programming languages (Go, Node.js, Python, PHP) and static sites.
*   **Fixed Deployment Cleanup**: Ensure that when a user clicks "Redeploy" or "Restart", the old Docker container is properly stopped and removed before the new one is built and started.
*   **Dependency Management**: Upgraded `sqlite` and `sqlite-mobile` packages to fix compilation issues and security vulnerabilities.
*   **Environment Variables**: Improved handling of `GOARM` setting for Raspberry Pi builds.

## 🚀 v0.2.9  — Built-in Proxy & Live Logs Enhancement

### 🌟 Key Enhancements
*   **Built-in HTTP Reverse Proxy**: Added an internal HTTP listener on port 80 (defined in `internal/proxy/proxy.go`) to automatically route incoming domain traffic to the corresponding Docker container ports.
*   **Live Build Log Streaming**: Upgraded the `DeploymentsPanel` with real-time streaming:
    *   Poll interval reduced to **1.5s** when active builds are running.
    *   Color-coded log output mapping terminal highlights (🔴 Errors, 🟢 Success/Completes, 🟡 Warnings, 🔵 Step indicators).
    *   Auto-scrolling terminal output to follow build logs.
    *   Live pulsing `Building...` indicator.
*   **Auto Domain Registration**: Creating an application service now automatically registers a wildcard `sslip.io` domain mapping to the host IP and triggers the first deploy.
*   **DNS Verification Handling**: Fixed JSON parsing of the `/domains/{id}/verify` endpoint, correcting the `undefined` values in IP diagnostics.


*   **Detailed Network Interfaces & Connections**: Integrated system-wide interface details and stats directly into the dashboard.
*   **Detailed Network Interfaces Overview**: Integrated a highly-detailed system networking overview on the server dashboard:
    *   Lists all connected physical and virtual network interfaces (e.g. `eth0`, `docker0`, `wlan0`).
    *   Tracks live traffic statistics per interface (Total Bytes Transmitted/Received in MB, Packets Sent/Received).
    *   Displays all active IPv4 and IPv6 addresses assigned to each interface.
    *   Provides live connection status pills (`Active` / `Down`), MAC address hardware identifiers, MTU limits, and interface flags (e.g. `loopback`, `multicast`).
*   **Built-in Interactive File Manager**: Integrated a full-featured system-level file browser and editor:
    *   **Directory Trees**: Double-click folder items to traverse sub-directories with live breadcrumbs navigation.
    *   **Visual File Attributes**: Shows names, human-readable file sizes (e.g., KB, MB, GB), permissions, last modification timestamps, and custom icon mappings.
    *   **Monospace Editor**: Open and edit plain text, code, configuration, or log files with live "Saved" vs "Modified" states and background write-backs.
    *   **Item Creation & Deletion**: Add new files or folders and remove existing entities via direct UI controls.
*   **System Detail & Graph Enhancements**:
    *   **Real-time Network Throughput History Graph**: Added a dual-line area chart plotting download (RX) and upload (TX) traffic speeds (KB/s and MB/s) calculated dynamically from successive snapshots.
    *   **Per-Core CPU Load Indicators**: Embedded a mini-grid displaying live core-by-core load progress bars directly within the CPU Usage metric card.
    *   **Comprehensive System Stats**: Extended the System Information panel with real-time Load Averages (1m, 5m, 15m), running Docker container counts, total active system processes, and lifetime network RX/TX totals.

### 🛠️ Changes Implemented

* **1. System Metrics Collector `(internal/metrics/collector.go)`:**:
    
    *   **Refactored** network metrics collection to query all active network interfaces `(stdnet.Interfaces())`.

    *   **Fetched** live transmission metrics `(Bytes Sent/Received, Packets Sent/Received)` for each interface by mapping standard net interface names to gopsutil IO counters.

    *   **Aggregated** flags `(e.g. up, loopback, multicast, broadcast)`, MTU settings, hardware MAC addresses, and assigned IP addresses `(both IPv4 and IPv6)`.

* **2. Dashboard UI Component `(web/src/pages/Dashboard.jsx)`:**
    
    *   **Added** a responsive grid panel showing cards for all network interfaces.

    *   **Rendered** visual indicators for connection status: green Active status pills for interfaces that are up, and gray Down pills for inactive ones.

    *   **Displayed** live network traffic stats (received/transmitted bandwidth in MB, packet count) dynamically per interface.
    
    *   **Exposed** MAC addresses, MTU limits, loopback flags, and IP addresses in styled labels.



---

## 🚀 v0.2.8 — sslip.io Integration & Domain Redirects

### 🌟 Key Enhancements
*   **sslip.io DNS Suffix**: Swapped the unresolvable `.nanofly.io` suffix for `sslip.io` wildcard DNS domains (e.g. `http://[random_string].[host_ip].sslip.io`).
*   **Domain Directionality**:
    *   Added database support (`direction` column in `domains_v2` table) to choose routing behaviors:
        *   `both`: Allows both `www` and `non-www` traffic.
        *   `www`: Redirects root domain to `www` sub-domain.
        *   `non-www`: Redirects `www` sub-domain to root domain.
*   **Domain Actions & PUT Route**: Implemented `PUT /api/v1/domains/{id}` API endpoints and settings action forms in `ProjectDetail.jsx` settings panel.

---

## 🚀 v0.2.7 — Active Tab Switching & Deployment De-duplication

### 🌟 Key Enhancements
*   **De-duplication of Runs**: Fixed bug where triggering redeploy spawned multiple concurrent containers/running labels.
*   **Automatic Tab Navigation**: Redeploying or restarting a service now shifts active UI focus immediately to "Deployments" or "Logs" panel.
*   **Initial sslip.io Generator**: Seeded random prefix algorithm for dev environment service URLs.

---

## 🚀 v0.2.6 — Container Stop & Restart Controls

### 🌟 Key Enhancements
*   **Docker Container Control**: Added Stop and Restart action buttons onto application/database lists and details headers.
*   **Deployed App Anchor Links**: Renders accessible external link tags to open running applications in new browser windows.

---

## 🚀 v0.2.5 — Manual Builder Selection & UI Redesign

### 🌟 Key Enhancements
*   **Manual Builders Selection**: Allowed explicitly selecting container build templates (`node`, `go`, `python`, `php`, `static`, `dockerfile`) instead of forcing autodetect.
*   **UI Layout Redesign**: Re-aligned service lists, stats overview panels, and settings layout to resemble premium cloud panels.

---

## 🚀 v0.2.4 — Environment Variables & Auto-Detection

### 🌟 Key Enhancements
*   **Automatic Dockerfile Generator**: Added directory content sniffers to auto-create optimized multi-stage Dockerfiles for Go, NodeJS, Python, PHP, and static projects.
*   **Environment Variable Passing**: Wired up environment variables upserted via database to be injected directly during `docker run` execution (`-e KEY=VALUE`).

---

## 🚀 v0.2.3 — Stream Reading & Docker Pull Fixes

### 🌟 Key Enhancements
*   **Docker Pull Fix**: Repaired issues reading stdout stream buffer chunks during asynchronous container pull processes.
*   **Database Version Selector**: Added dropdown options support for Postgres/MySQL major version pins.

---

## 🚀 v0.2.2 — Systemd Service Listing & DB Image Inference

### 🌟 Key Enhancements
*   **Systemd Listing**: Patched invalid argument flag errors thrown by `list-unit-files` command executes.
*   **DB Inference**: Patched DB container image resolution during initial deployment state.

---

## 🚀 v0.1.0 to v0.2.1 — Base Architecture

### 🌟 Key Features
*   **Binary Update System**: Built automatic self-updating capabilities parsing GitHub Releases, downloading, extracting, replacing the binary in-place, and calling systemd service restarts.
*   **Domains CRUD**: Implemented underlying `domains_v2` database tables and verification functions.
*   **Systemd Services Control**: API routes hook systemd binary command execution loops to manage daemon configurations.

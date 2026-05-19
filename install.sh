#!/usr/bin/env bash

# ─────────────────────────────────────────────────────────────────────────────
# NanoFly — Production Installer
# Self-hosted server control panel
# https://github.com/tamalmaity-dev/nanofly
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/tamalmaity-dev/nanofly/main/install.sh | sudo bash
# ─────────────────────────────────────────────────────────────────────────────

set -e
set -o pipefail

# ── Constants ────────────────────────────────────────────────────────────────
NANOFLY_REPO="https://github.com/tamalmaity-dev/nanofly.git"
NANOFLY_DIR="/opt/nanofly"
NANOFLY_DATA="/var/lib/nanofly"
NANOFLY_SERVICE="nanofly"
GO_VERSION="1.22.3"
NODE_VERSION="v20.13.1"
REQUIRED_SPACE_GB=2

# ── Colors ───────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
BOLD='\033[1m'
DIM='\033[2m'
NC='\033[0m'

# ── Helpers ──────────────────────────────────────────────────────────────────
log_info()    { echo -e "  ${BLUE}→${NC} $1"; }
log_success() { echo -e "  ${GREEN}✓${NC} $1"; }
log_warn()    { echo -e "  ${YELLOW}⚠${NC} $1"; }
log_error()   { echo -e "  ${RED}✗${NC} $1"; }

log_step() {
  echo ""
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
  echo -e "${BOLD}  $1${NC}"
  echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
}

command_exists() { command -v "$1" >/dev/null 2>&1; }

# Spinner for long-running background tasks
spinner() {
  local pid=$1
  local msg=$2
  local spin='⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏'
  local i=0
  while kill -0 "$pid" 2>/dev/null; do
    local c="${spin:i++%${#spin}:1}"
    printf "\r  ${BLUE}${c}${NC} ${msg}" >&2
    sleep 0.1
  done
  wait "$pid"
  local exit_code=$?
  printf "\r" >&2
  return $exit_code
}

# Run a command with a spinner, show output only on failure
run_with_spinner() {
  local msg=$1
  shift
  local logfile=$(mktemp)
  "$@" >"$logfile" 2>&1 &
  local pid=$!
  if spinner "$pid" "$msg"; then
    log_success "$msg"
    rm -f "$logfile"
    return 0
  else
    log_error "$msg — FAILED"
    echo ""
    echo -e "  ${DIM}── Error Output ──────────────────────────────────────${NC}"
    tail -20 "$logfile" | sed 's/^/    /'
    echo -e "  ${DIM}─────────────────────────────────────────────────────${NC}"
    rm -f "$logfile"
    return 1
  fi
}

# ── Banner ───────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}"
echo -e "    _   __                 ______ __      "
echo -e "   / | / /____ _ ____  ___ / ____// /__  __"
echo -e "  /  |/ // __ \`/ __ \\/ __ \\/ /_   / // / / /"
echo -e " / /|  // /_/ // / / / /_/ / __/  / // /_/ /"
echo -e "/_/ |_/ \\__,_//_/ /_/\\____/_/    /_/ \\__, /"
echo -e "                                    /____/ "
echo -e "${NC}"
echo -e "${GREEN}${BOLD}      Self-Hosted Server Control Panel${NC}"
echo -e "${DIM}      https://github.com/tamalmaity-dev/nanofly${NC}"
echo ""

# ── Pre-flight Checks ───────────────────────────────────────────────────────
log_step "Step 1/7 — Pre-flight checks"

# Root check
if [ "$EUID" -ne 0 ]; then
  log_error "Please run this script as root: curl ... | sudo bash"
  exit 1
fi

# OS Detection
if [ -f /etc/os-release ]; then
  OS_TYPE=$(grep -w "ID" /etc/os-release | cut -d "=" -f 2 | tr -d '"')
  OS_VERSION=$(grep -w "VERSION_ID" /etc/os-release | cut -d "=" -f 2 | tr -d '"' 2>/dev/null || echo "rolling")
  OS_NAME=$(grep -w "PRETTY_NAME" /etc/os-release | cut -d "=" -f 2 | tr -d '"')
else
  log_error "Cannot detect operating system. /etc/os-release not found."
  exit 1
fi

# Architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  GO_ARCH="amd64";  NODE_ARCH="x64"    ;;
  aarch64) GO_ARCH="arm64";  NODE_ARCH="arm64"   ;;
  armv7l)  GO_ARCH="armv6l"; NODE_ARCH="armv7l"  ;;
  *)
    log_error "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

# Disk space
AVAILABLE_SPACE=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$AVAILABLE_SPACE" -lt "$REQUIRED_SPACE_GB" ]; then
  log_warn "Low disk space: ${AVAILABLE_SPACE}GB available (${REQUIRED_SPACE_GB}GB recommended)"
  sleep 3
fi

# System info table
echo ""
echo -e "  ${DIM}┌──────────────────┬───────────────────────────────────┐${NC}"
echo -e "  ${DIM}│${NC}  ${BOLD}System${NC}           ${DIM}│${NC}  $OS_NAME"
echo -e "  ${DIM}│${NC}  ${BOLD}Architecture${NC}     ${DIM}│${NC}  $ARCH ($GO_ARCH)"
echo -e "  ${DIM}│${NC}  ${BOLD}Disk Free${NC}        ${DIM}│${NC}  ${AVAILABLE_SPACE}GB"
echo -e "  ${DIM}│${NC}  ${BOLD}Install Path${NC}     ${DIM}│${NC}  $NANOFLY_DIR"
echo -e "  ${DIM}│${NC}  ${BOLD}Data Path${NC}        ${DIM}│${NC}  $NANOFLY_DATA"
echo -e "  ${DIM}│${NC}  ${BOLD}Go${NC}               ${DIM}│${NC}  $GO_VERSION"
echo -e "  ${DIM}│${NC}  ${BOLD}Node.js${NC}          ${DIM}│${NC}  $NODE_VERSION"
echo -e "  ${DIM}└──────────────────┴───────────────────────────────────┘${NC}"
echo ""

log_success "Pre-flight checks passed"

# ── Clean Previous Broken Installs ──────────────────────────────────────────
log_step "Step 2/7 — Preparing system"

# Heal interrupted dpkg
dpkg --configure -a >/dev/null 2>&1 || true

# Remove old apt-installed Node.js to avoid conflicts with official binary
if dpkg -l nodejs 2>/dev/null | grep -q "^ii"; then
  log_info "Removing old apt-installed Node.js to avoid conflicts..."
  apt-get remove -y --purge nodejs npm 2>/dev/null || true
  apt-get autoremove -y -qq 2>/dev/null || true
  hash -r
  log_success "Old Node.js packages removed"
fi

# Remove old apt-installed golang to avoid conflicts with official binary
if dpkg -l golang 2>/dev/null | grep -q "^ii" || dpkg -l golang-go 2>/dev/null | grep -q "^ii"; then
  log_info "Removing old apt-installed Go to avoid conflicts..."
  apt-get remove -y --purge golang golang-go 2>/dev/null || true
  apt-get autoremove -y -qq 2>/dev/null || true
  hash -r
  log_success "Old Go packages removed"
fi

# Clean previous failed NanoFly installs in $HOME/nanofly (old path)
if [ -d "$HOME/nanofly" ] && [ "$HOME/nanofly" != "$NANOFLY_DIR" ]; then
  log_info "Removing old installation at $HOME/nanofly..."
  rm -rf "$HOME/nanofly"
  log_success "Old installation cleaned"
fi

log_success "System prepared"

# ── Dependencies ─────────────────────────────────────────────────────────────
log_step "Step 3/7 — Installing dependencies"

# Install base packages
run_with_spinner "Updating package lists" apt-get update -y -qq

BASE_PKGS=()
command_exists git  || BASE_PKGS+=("git")
command_exists curl || BASE_PKGS+=("curl")
command_exists tar  || BASE_PKGS+=("tar")
command_exists make || BASE_PKGS+=("make")
dpkg -s xz-utils >/dev/null 2>&1 || BASE_PKGS+=("xz-utils")

if [ ${#BASE_PKGS[@]} -ne 0 ]; then
  run_with_spinner "Installing base packages (${BASE_PKGS[*]})" apt-get install -y -qq "${BASE_PKGS[@]}"
fi

# ── Go ──
if command_exists go && [[ "$(go version 2>/dev/null)" == *"go1."* ]]; then
  log_success "Go already installed ($(go version | awk '{print $3}'))"
else
  log_info "Installing Go ${GO_VERSION}..."
  rm -rf /usr/local/go
  curl -fsSL "https://golang.org/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz" \
    | tar -xz -C /usr/local
  # System-wide PATH
  echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/golang.sh
  export PATH=$PATH:/usr/local/go/bin
  hash -r
  log_success "Go ${GO_VERSION} installed"
fi

# ── Node.js ──
if command_exists node && command_exists npm; then
  log_success "Node.js already installed ($(node --version))"
else
  log_info "Installing Node.js ${NODE_VERSION}..."
  curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
    | tar -xJ --strip-components=1 -C /usr/local
  hash -r
  log_success "Node.js $(node --version) + npm $(npm --version) installed"
fi

# ── Docker ──
if command_exists docker; then
  log_success "Docker already installed ($(docker --version | awk '{print $3}' | tr -d ','))"
else
  log_info "Installing Docker via official script..."
  curl -fsSL https://get.docker.com | sh >/dev/null 2>&1 || {
    log_warn "Official installer failed, trying apt..."
    apt-get install -y -qq docker.io >/dev/null 2>&1
  }
  systemctl start docker  >/dev/null 2>&1 || true
  systemctl enable docker >/dev/null 2>&1 || true
  log_success "Docker installed"
fi

# Add sudo user to docker group if applicable
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  usermod -aG docker "$SUDO_USER" 2>/dev/null || true
fi

# Verify all dependencies
echo ""
DEPS_OK=true
for dep in git go node npm docker; do
  if command_exists "$dep"; then
    printf "  ${GREEN}✓${NC} %-10s %s\n" "$dep" "$(command -v $dep)"
  else
    printf "  ${RED}✗${NC} %-10s %s\n" "$dep" "NOT FOUND"
    DEPS_OK=false
  fi
done
echo ""

if [ "$DEPS_OK" = false ]; then
  log_error "Some dependencies are missing. Cannot continue."
  exit 1
fi

log_success "All dependencies verified"

# ── Clone / Update Repository ───────────────────────────────────────────────
log_step "Step 4/7 — Fetching NanoFly source"

if [ -d "$NANOFLY_DIR/.git" ]; then
  log_info "Existing installation found — pulling latest..."
  cd "$NANOFLY_DIR"
  git fetch --all --quiet 2>/dev/null
  git reset --hard origin/main --quiet 2>/dev/null || git reset --hard origin/main
  log_success "Source updated to latest"
else
  # Remove directory if it exists but isn't a git repo (broken state)
  if [ -d "$NANOFLY_DIR" ]; then
    log_warn "Removing broken installation at $NANOFLY_DIR..."
    rm -rf "$NANOFLY_DIR"
  fi
  log_info "Cloning repository..."
  git clone --depth 1 "$NANOFLY_REPO" "$NANOFLY_DIR" 2>/dev/null
  cd "$NANOFLY_DIR"
  log_success "Repository cloned"
fi

# ── Build Frontend ───────────────────────────────────────────────────────────
log_step "Step 5/7 — Building frontend"

cd "$NANOFLY_DIR/web"

log_info "Installing npm packages..."
npm install --no-audit --no-fund --loglevel=error 2>&1 | grep -v "^$" | tail -5 | sed 's/^/    /'
log_success "npm packages installed"

log_info "Building production bundle (this may take a minute on ARM)..."
# Limit memory for Raspberry Pi / low-RAM devices
export NODE_OPTIONS="--max-old-space-size=768"
npm run build 2>&1 | grep -E "(vite|built|error|Error|✓|modules|chunks)" | sed 's/^/    /'
VITE_EXIT=${PIPESTATUS[0]}

if [ "$VITE_EXIT" -ne 0 ]; then
  log_error "Frontend build failed! Check errors above."
  exit 1
fi

cd "$NANOFLY_DIR"
log_success "Frontend built successfully"

# ── Build Backend ────────────────────────────────────────────────────────────
log_step "Step 6/7 — Compiling backend"

cd "$NANOFLY_DIR"

log_info "Downloading Go modules..."
go mod tidy 2>/dev/null

log_info "Compiling binary (this may take a few minutes on ARM)..."
CGO_ENABLED=0 go build -ldflags="-s -w" -o nanofly ./cmd/nanofly 2>&1 | sed 's/^/    /'
GO_EXIT=${PIPESTATUS[0]:-$?}

if [ "$GO_EXIT" -ne 0 ] || [ ! -f "$NANOFLY_DIR/nanofly" ]; then
  log_error "Backend compilation failed!"
  exit 1
fi

chmod +x nanofly
BINARY_SIZE=$(du -sh nanofly | awk '{print $1}')
log_success "Backend compiled — binary size: ${BINARY_SIZE}"

# ── Configure & Install Service ─────────────────────────────────────────────
log_step "Step 7/7 — Configuring & starting service"

# Create data directory
mkdir -p "$NANOFLY_DATA"

# Create config if missing
if [ ! -f "$NANOFLY_DIR/nanofly.yaml" ]; then
  log_info "Generating configuration with secure secret..."
  SECRET=$(openssl rand -base64 48 2>/dev/null || head -c 48 /dev/urandom | base64)
  cat <<EOF > "$NANOFLY_DIR/nanofly.yaml"
# NanoFly Configuration
# Docs: https://github.com/tamalmaity-dev/nanofly

port: 8080
host: ""
secret_key: "$SECRET"
data_dir: "$NANOFLY_DATA"
debug: false
EOF
  log_success "Configuration created"
else
  log_success "Existing configuration preserved"
fi

# Create systemd service
if command_exists systemctl; then
  log_info "Creating systemd service..."
  cat > /etc/systemd/system/${NANOFLY_SERVICE}.service <<EOF
[Unit]
Description=NanoFly — Self-Hosted Server Control Panel
Documentation=https://github.com/tamalmaity-dev/nanofly
After=network-online.target docker.service
Wants=network-online.target
Requires=docker.service

[Service]
Type=simple
WorkingDirectory=$NANOFLY_DIR
ExecStart=$NANOFLY_DIR/nanofly
Restart=always
RestartSec=5
StandardOutput=journal
StandardError=journal
SyslogIdentifier=nanofly
Environment=PATH=/usr/local/go/bin:/usr/local/bin:/usr/bin:/bin

[Install]
WantedBy=multi-user.target
EOF

  systemctl daemon-reload
  systemctl enable ${NANOFLY_SERVICE} >/dev/null 2>&1

  # Stop old instance if running
  systemctl stop ${NANOFLY_SERVICE} >/dev/null 2>&1 || true

  # Start fresh
  systemctl start ${NANOFLY_SERVICE}
  sleep 3

  if systemctl is-active --quiet ${NANOFLY_SERVICE}; then
    log_success "NanoFly service started and enabled on boot"
  else
    log_error "Service failed to start. Showing recent logs:"
    echo ""
    journalctl -u ${NANOFLY_SERVICE} --no-pager -n 15 | sed 's/^/    /'
    echo ""
    exit 1
  fi
else
  log_warn "systemctl not found — cannot create system service"
fi

# ── Complete ─────────────────────────────────────────────────────────────────
IP_ADDR=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")

echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  ✅ NanoFly is running!${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${GREEN}${BOLD}→ Panel: http://${IP_ADDR}:8080${NC}"
echo ""
echo -e "  ${DIM}┌──────────────────┬───────────────────────────────────┐${NC}"
echo -e "  ${DIM}│${NC} View logs        ${DIM}│${NC}  sudo journalctl -u nanofly -f"
echo -e "  ${DIM}│${NC} Restart          ${DIM}│${NC}  sudo systemctl restart nanofly"
echo -e "  ${DIM}│${NC} Stop             ${DIM}│${NC}  sudo systemctl stop nanofly"
echo -e "  ${DIM}│${NC} Status           ${DIM}│${NC}  sudo systemctl status nanofly"
echo -e "  ${DIM}│${NC} Config           ${DIM}│${NC}  $NANOFLY_DIR/nanofly.yaml"
echo -e "  ${DIM}│${NC} Data             ${DIM}│${NC}  $NANOFLY_DATA"
echo -e "  ${DIM}└──────────────────┴───────────────────────────────────┘${NC}"
echo ""
echo -e "  ${DIM}NanoFly will automatically start on system reboot.${NC}"
echo ""

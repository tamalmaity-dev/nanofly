#!/usr/bin/env bash

# ─────────────────────────────────────────────────────────────────────────────
# NanoFly — Production Installer
# Self-hosted server control panel
# https://github.com/tamalmaity-dev/nanofly
#
# Usage:
#   curl -sSL https://raw.githubusercontent.com/tamalmaity-dev/nanofly/main/install.sh | bash
# ─────────────────────────────────────────────────────────────────────────────

set -e
set -o pipefail

# ── Constants ────────────────────────────────────────────────────────────────
NANOFLY_REPO="https://github.com/tamalmaity-dev/nanofly.git"
NANOFLY_DIR="/opt/nanofly"
NANOFLY_DATA="/var/lib/nanofly"
NANOFLY_SERVICE="nanofly"
NANOFLY_USER="nanofly"
GO_VERSION="1.22.3"
NODE_VERSION="v20.13.1"
DATE=$(date +"%Y%m%d-%H%M%S")
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
log()         { echo -e "  ${DIM}[$(date '+%H:%M:%S')]${NC} $1"; }
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

# Root check
if [ "$EUID" -ne 0 ]; then
  if ! command_exists sudo; then
    log_error "This script requires root or sudo privileges."
    exit 1
  fi
  SUDO="sudo"
else
  SUDO=""
fi

# Disk space
AVAILABLE_SPACE=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$AVAILABLE_SPACE" -lt "$REQUIRED_SPACE_GB" ]; then
  log_warn "Low disk space: ${AVAILABLE_SPACE}GB available (${REQUIRED_SPACE_GB}GB recommended)"
  sleep 3
fi

# System info table
echo ""
echo -e "  ${DIM}┌──────────────────────────────────────────────┐${NC}"
echo -e "  ${DIM}│${NC}  ${BOLD}System${NC}         ${DIM}│${NC}  $OS_NAME"
echo -e "  ${DIM}│${NC}  ${BOLD}Architecture${NC}   ${DIM}│${NC}  $ARCH ($GO_ARCH)"
echo -e "  ${DIM}│${NC}  ${BOLD}Disk Free${NC}      ${DIM}│${NC}  ${AVAILABLE_SPACE}GB"
echo -e "  ${DIM}│${NC}  ${BOLD}Install Path${NC}   ${DIM}│${NC}  $NANOFLY_DIR"
echo -e "  ${DIM}│${NC}  ${BOLD}Data Path${NC}      ${DIM}│${NC}  $NANOFLY_DATA"
echo -e "  ${DIM}│${NC}  ${BOLD}Go Version${NC}     ${DIM}│${NC}  $GO_VERSION"
echo -e "  ${DIM}│${NC}  ${BOLD}Node Version${NC}   ${DIM}│${NC}  $NODE_VERSION"
echo -e "  ${DIM}└──────────────────────────────────────────────┘${NC}"
echo ""

log_success "Pre-flight checks passed"

# ── Dependencies ─────────────────────────────────────────────────────────────
log_step "Step 2/7 — Installing dependencies"

# Heal interrupted dpkg if on Debian/Ubuntu
if command_exists dpkg; then
  $SUDO dpkg --configure -a >/dev/null 2>&1 || true
fi

install_apt_packages() {
  local pkgs=("$@")
  if [ ${#pkgs[@]} -ne 0 ]; then
    log_info "Updating package lists..."
    $SUDO apt-get update -y -qq >/dev/null 2>&1
    log_info "Installing: ${pkgs[*]}"
    $SUDO apt-get install -y -qq "${pkgs[@]}" >/dev/null 2>&1
  fi
}

install_go() {
  if command_exists go; then
    log_success "Go is already installed ($(go version | awk '{print $3}'))"
    return
  fi
  log_info "Installing Go ${GO_VERSION} (official binary)..."
  $SUDO rm -rf /usr/local/go
  curl -fsSL "https://golang.org/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz" | $SUDO tar -xz -C /usr/local
  export PATH=$PATH:/usr/local/go/bin
  # Persist for future sessions
  if ! grep -q "/usr/local/go/bin" /etc/profile.d/golang.sh 2>/dev/null; then
    echo 'export PATH=$PATH:/usr/local/go/bin' | $SUDO tee /etc/profile.d/golang.sh >/dev/null
  fi
  log_success "Go ${GO_VERSION} installed"
}

install_node() {
  if command_exists node && command_exists npm; then
    log_success "Node.js is already installed ($(node --version))"
    return
  fi
  log_info "Installing Node.js ${NODE_VERSION} (official binary)..."
  curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
    | $SUDO tar -xJ --strip-components=1 -C /usr/local
  hash -r
  log_success "Node.js ${NODE_VERSION} installed"
}

install_docker() {
  if command_exists docker; then
    log_success "Docker is already installed ($(docker --version | awk '{print $3}' | tr -d ','))"
    return
  fi
  log_info "Installing Docker..."
  # Try official Docker install script first
  if curl -fsSL https://get.docker.com | $SUDO sh >/dev/null 2>&1; then
    log_success "Docker installed via get.docker.com"
  else
    # Fallback to apt
    log_warn "Official Docker installer failed, falling back to apt..."
    $SUDO apt-get install -y -qq docker.io >/dev/null 2>&1
  fi
  $SUDO systemctl start docker  >/dev/null 2>&1 || true
  $SUDO systemctl enable docker >/dev/null 2>&1 || true
  # Add current user to docker group
  if [ -n "${SUDO_USER:-}" ]; then
    $SUDO usermod -aG docker "$SUDO_USER" 2>/dev/null || true
  elif [ "$EUID" -ne 0 ] && [ -n "$USER" ]; then
    $SUDO usermod -aG docker "$USER" 2>/dev/null || true
  fi
  log_success "Docker installed and enabled"
}

# Install core packages needed for build tools
apt_base=()
if ! command_exists git;  then apt_base+=("git");     fi
if ! command_exists curl; then apt_base+=("curl");    fi
if ! command_exists tar;  then apt_base+=("tar");     fi
apt_base+=("xz-utils" "make" "gcc")

install_apt_packages "${apt_base[@]}"

install_go
install_node
install_docker

# Verify all deps
MISSING=()
command_exists git    || MISSING+=("git")
command_exists go     || MISSING+=("go")
command_exists node   || MISSING+=("node")
command_exists npm    || MISSING+=("npm")
command_exists docker || MISSING+=("docker")

if [ ${#MISSING[@]} -ne 0 ]; then
  log_error "Failed to install: ${MISSING[*]}"
  log_error "Please install them manually and re-run this script."
  exit 1
fi

log_success "All dependencies verified"

# ── Clone / Update Repository ───────────────────────────────────────────────
log_step "Step 3/7 — Fetching NanoFly source"

if [ -d "$NANOFLY_DIR/.git" ]; then
  log_info "Existing installation found. Pulling latest..."
  cd "$NANOFLY_DIR"
  git fetch --all --quiet
  git reset --hard origin/main --quiet 2>/dev/null || git reset --hard origin/main
  log_success "Updated to latest version"
else
  log_info "Cloning repository..."
  $SUDO mkdir -p "$NANOFLY_DIR"
  $SUDO chown "$(whoami):$(id -gn)" "$NANOFLY_DIR"
  git clone --depth 1 "$NANOFLY_REPO" "$NANOFLY_DIR" 2>/dev/null
  cd "$NANOFLY_DIR"
  log_success "Repository cloned"
fi

# ── Build Frontend ───────────────────────────────────────────────────────────
log_step "Step 4/7 — Building frontend"

cd "$NANOFLY_DIR/web"
log_info "Installing npm dependencies..."
npm install --no-audit --no-fund --loglevel=error 2>&1 | tail -1
log_info "Building production bundle..."
npm run build 2>&1 | tail -3
cd "$NANOFLY_DIR"

log_success "Frontend built successfully"

# ── Build Backend ────────────────────────────────────────────────────────────
log_step "Step 5/7 — Compiling backend"

cd "$NANOFLY_DIR"
log_info "Resolving Go modules..."
go mod tidy 2>/dev/null
log_info "Building optimized binary..."
CGO_ENABLED=0 go build -ldflags="-s -w" -o nanofly ./cmd/nanofly
chmod +x nanofly

log_success "Backend compiled ($(du -sh nanofly | awk '{print $1}'))"

# ── Configure ───────────────────────────────────────────────────────────────
log_step "Step 6/7 — Configuring NanoFly"

# Create data directory
$SUDO mkdir -p "$NANOFLY_DATA"
$SUDO chown "$(whoami):$(id -gn)" "$NANOFLY_DATA"

# Create config if missing
if [ ! -f "$NANOFLY_DIR/nanofly.yaml" ]; then
  log_info "Creating default configuration..."
  cat <<EOF > "$NANOFLY_DIR/nanofly.yaml"
# NanoFly Configuration
# Docs: https://github.com/tamalmaity-dev/nanofly

port: 8080
host: ""
secret_key: "$(openssl rand -base64 48 2>/dev/null || head -c 48 /dev/urandom | base64)"
data_dir: "$NANOFLY_DATA"
debug: false
EOF
  log_success "Configuration created with secure random secret"
else
  log_success "Existing configuration preserved"
fi

# ── Systemd Service ─────────────────────────────────────────────────────────
log_step "Step 7/7 — Setting up system service"

if command_exists systemctl; then
  log_info "Creating systemd service..."
  $SUDO tee /etc/systemd/system/${NANOFLY_SERVICE}.service >/dev/null <<EOF
[Unit]
Description=NanoFly - Self-Hosted Server Control Panel
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

  $SUDO systemctl daemon-reload
  $SUDO systemctl enable ${NANOFLY_SERVICE} >/dev/null 2>&1
  log_success "Systemd service created and enabled"
else
  log_warn "systemctl not found — skipping service creation"
fi

# ── Complete ─────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${GREEN}${BOLD}  ✅ NanoFly installed successfully!${NC}"
echo -e "${CYAN}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo -e "  ${BOLD}Quick Start:${NC}"
echo -e "  ${DIM}─────────────────────────────────────────────${NC}"
echo -e "  ${GREEN}Start the service:${NC}   sudo systemctl start nanofly"
echo -e "  ${GREEN}View logs:${NC}           sudo journalctl -u nanofly -f"
echo -e "  ${GREEN}Stop the service:${NC}    sudo systemctl stop nanofly"
echo -e "  ${GREEN}Restart:${NC}             sudo systemctl restart nanofly"
echo ""
echo -e "  ${BOLD}Manual Start:${NC}"
echo -e "  ${DIM}─────────────────────────────────────────────${NC}"
echo -e "  cd $NANOFLY_DIR && ./nanofly"
echo ""
echo -e "  ${BOLD}Paths:${NC}"
echo -e "  ${DIM}─────────────────────────────────────────────${NC}"
echo -e "  ${DIM}Binary:${NC}    $NANOFLY_DIR/nanofly"
echo -e "  ${DIM}Config:${NC}    $NANOFLY_DIR/nanofly.yaml"
echo -e "  ${DIM}Data:${NC}      $NANOFLY_DATA"
echo ""

# Ask if user wants to start now
read -p "  Start NanoFly now? (Y/n) " -n 1 -r < /dev/tty
echo ""
if [[ ! $REPLY =~ ^[Nn]$ ]]; then
  echo ""
  if command_exists systemctl; then
    $SUDO systemctl start ${NANOFLY_SERVICE}
    sleep 2
    if systemctl is-active --quiet ${NANOFLY_SERVICE}; then
      log_success "NanoFly is running!"
      echo ""
      IP_ADDR=$(hostname -I 2>/dev/null | awk '{print $1}' || echo "localhost")
      echo -e "  ${GREEN}${BOLD}→ Access your panel at: http://${IP_ADDR}:8080${NC}"
      echo ""
    else
      log_error "Service failed to start. Check logs: sudo journalctl -u nanofly -f"
    fi
  else
    cd "$NANOFLY_DIR"
    log_info "Starting NanoFly..."
    ./nanofly
  fi
fi

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
NANOFLY_REPO="tamalmaity-dev/nanofly"
NANOFLY_DIR="/opt/nanofly"
NANOFLY_DATA="/var/lib/nanofly"
NANOFLY_SERVICE="nanofly"
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
echo -e "${DIM}      https://github.com/${NANOFLY_REPO}${NC}"
echo ""

# ── Pre-flight Checks ───────────────────────────────────────────────────────
log_step "Step 1/5 — Pre-flight checks"

# Root check
if [ "$EUID" -ne 0 ]; then
  log_error "Please run as root: curl ... | sudo bash"
  exit 1
fi

# OS Detection
if [ -f /etc/os-release ]; then
  OS_NAME=$(grep -w "PRETTY_NAME" /etc/os-release | cut -d "=" -f 2 | tr -d '"')
else
  OS_NAME="Unknown"
fi

# Architecture
ARCH=$(uname -m)
case "$ARCH" in
  x86_64)  RELEASE_ARCH="linux-amd64" ;;
  aarch64) RELEASE_ARCH="linux-arm64" ;;
  *)
    log_error "Unsupported architecture: $ARCH"
    log_error "NanoFly supports x86_64 and arm64 (aarch64)."
    exit 1
    ;;
esac

# Disk space
AVAILABLE_SPACE=$(df -BG / | awk 'NR==2 {print $4}' | sed 's/G//')
if [ "$AVAILABLE_SPACE" -lt "$REQUIRED_SPACE_GB" ]; then
  log_warn "Low disk space: ${AVAILABLE_SPACE}GB available (${REQUIRED_SPACE_GB}GB recommended)"
  sleep 3
fi

# Detect latest release version (using redirect — no API rate limits)
log_info "Fetching latest release version..."
LATEST_VERSION=$(curl -sI "https://github.com/${NANOFLY_REPO}/releases/latest" 2>/dev/null \
  | grep -i '^location:' | sed 's|.*/tag/||' | tr -d '[:space:]') || true

if [ -z "$LATEST_VERSION" ]; then
  INSTALL_MODE="source"
  log_warn "No pre-built release found — will build from source"
else
  # Verify the asset exists by checking the download URL
  DOWNLOAD_URL="https://github.com/${NANOFLY_REPO}/releases/download/${LATEST_VERSION}/nanofly-${RELEASE_ARCH}.tar.gz"
  HTTP_CODE=$(curl -sL -o /dev/null -w "%{http_code}" "$DOWNLOAD_URL" 2>/dev/null) || true
  if [ "$HTTP_CODE" = "200" ] || [ "$HTTP_CODE" = "302" ]; then
    INSTALL_MODE="binary"
    log_success "Latest release: ${LATEST_VERSION}"
  else
    INSTALL_MODE="source"
    log_warn "Release ${LATEST_VERSION} found but asset missing for ${RELEASE_ARCH} — building from source"
  fi
fi

# System info table
echo ""
echo -e "  ${DIM}┌──────────────────┬───────────────────────────────────┐${NC}"
echo -e "  ${DIM}│${NC}  ${BOLD}System${NC}           ${DIM}│${NC}  $OS_NAME"
echo -e "  ${DIM}│${NC}  ${BOLD}Architecture${NC}     ${DIM}│${NC}  $ARCH ($RELEASE_ARCH)"
echo -e "  ${DIM}│${NC}  ${BOLD}Disk Free${NC}        ${DIM}│${NC}  ${AVAILABLE_SPACE}GB"
echo -e "  ${DIM}│${NC}  ${BOLD}Install Mode${NC}     ${DIM}│${NC}  $INSTALL_MODE"
echo -e "  ${DIM}│${NC}  ${BOLD}Install Path${NC}     ${DIM}│${NC}  $NANOFLY_DIR"
echo -e "  ${DIM}│${NC}  ${BOLD}Data Path${NC}        ${DIM}│${NC}  $NANOFLY_DATA"
echo -e "  ${DIM}└──────────────────┴───────────────────────────────────┘${NC}"
echo ""

log_success "Pre-flight checks passed"

# ── Install Dependencies ────────────────────────────────────────────────────
log_step "Step 2/5 — Installing dependencies"

# Heal interrupted dpkg
dpkg --configure -a >/dev/null 2>&1 || true

# Docker is the only runtime dependency
if command_exists docker; then
  log_success "Docker already installed ($(docker --version | awk '{print $3}' | tr -d ','))"
else
  log_info "Installing Docker..."
  # Install curl if missing
  if ! command_exists curl; then
    apt-get update -y -qq >/dev/null 2>&1
    apt-get install -y -qq curl >/dev/null 2>&1
  fi
  curl -fsSL https://get.docker.com | sh >/dev/null 2>&1 || {
    log_warn "Official installer failed, trying apt..."
    apt-get update -y -qq >/dev/null 2>&1
    apt-get install -y -qq docker.io >/dev/null 2>&1
  }
  systemctl start docker  >/dev/null 2>&1 || true
  systemctl enable docker >/dev/null 2>&1 || true
  log_success "Docker installed"
fi

# Add sudo user to docker group
if [ -n "${SUDO_USER:-}" ] && [ "$SUDO_USER" != "root" ]; then
  usermod -aG docker "$SUDO_USER" 2>/dev/null || true
fi

log_success "Dependencies ready"

# ── Download / Build NanoFly ────────────────────────────────────────────────
log_step "Step 3/5 — Installing NanoFly"

# Stop existing service if running
systemctl stop ${NANOFLY_SERVICE} >/dev/null 2>&1 || true

mkdir -p "$NANOFLY_DIR"

if [ "$INSTALL_MODE" = "binary" ]; then
  # ── Pre-built binary release (fast path) ──
  DOWNLOAD_URL="https://github.com/${NANOFLY_REPO}/releases/download/${LATEST_VERSION}/nanofly-${RELEASE_ARCH}.tar.gz"
  log_info "Downloading nanofly-${RELEASE_ARCH}.tar.gz..."
  
  if curl -fsSL "$DOWNLOAD_URL" -o /tmp/nanofly-release.tar.gz; then
    log_success "Downloaded ($(du -sh /tmp/nanofly-release.tar.gz | awk '{print $1}'))"
    
    log_info "Extracting to ${NANOFLY_DIR}..."
    tar -xzf /tmp/nanofly-release.tar.gz -C "$NANOFLY_DIR"
    rm -f /tmp/nanofly-release.tar.gz
    chmod +x "$NANOFLY_DIR/nanofly"
    echo "$LATEST_VERSION" > "$NANOFLY_DIR/VERSION"
    log_success "NanoFly ${LATEST_VERSION} installed"
  else
    log_warn "Download failed — falling back to source build"
    INSTALL_MODE="source"
  fi
fi

if [ "$INSTALL_MODE" = "source" ]; then
  # ── Build from source (fallback) ──
  log_info "Building from source (requires Go + Node.js)..."
  
  # Install build dependencies
  apt-get update -y -qq >/dev/null 2>&1
  apt-get install -y -qq git curl tar xz-utils make gcc >/dev/null 2>&1
  
  # Go
  if ! command_exists go; then
    log_info "Installing Go..."
    GO_VERSION="1.22.3"
    case "$ARCH" in
      x86_64)  GO_ARCH="amd64" ;;
      aarch64) GO_ARCH="arm64" ;;
    esac
    rm -rf /usr/local/go
    curl -fsSL "https://golang.org/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz" | tar -xz -C /usr/local
    export PATH=$PATH:/usr/local/go/bin
    echo 'export PATH=$PATH:/usr/local/go/bin' > /etc/profile.d/golang.sh
  fi
  
  # Node.js
  if ! command_exists node; then
    log_info "Installing Node.js..."
    NODE_VERSION="v20.13.1"
    case "$ARCH" in
      x86_64)  NODE_ARCH="x64" ;;
      aarch64) NODE_ARCH="arm64" ;;
    esac
    curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" \
      | tar -xJ --strip-components=1 -C /usr/local
    hash -r
  fi
  
  # Clone
  if [ -d "$NANOFLY_DIR/.git" ]; then
    cd "$NANOFLY_DIR"
    git fetch --all --quiet 2>/dev/null
    git reset --hard origin/main 2>/dev/null
  else
    rm -rf "$NANOFLY_DIR"
    git clone --depth 1 "https://github.com/${NANOFLY_REPO}.git" "$NANOFLY_DIR" 2>/dev/null
    cd "$NANOFLY_DIR"
  fi
  
  # Build frontend
  log_info "Building frontend..."
  cd "$NANOFLY_DIR/web"
  npm install --no-audit --no-fund --loglevel=error 2>&1 | tail -1
  export NODE_OPTIONS="--max-old-space-size=768"
  npm run build 2>&1 | tail -3
  
  # Build backend
  log_info "Compiling backend..."
  cd "$NANOFLY_DIR"
  go mod tidy 2>/dev/null
  CGO_ENABLED=0 go build -ldflags="-s -w" -o nanofly ./cmd/nanofly
  chmod +x nanofly
  
  log_success "NanoFly built from source"
fi

# ── Configure ───────────────────────────────────────────────────────────────
log_step "Step 4/5 — Configuring"

mkdir -p "$NANOFLY_DATA"

if [ ! -f "$NANOFLY_DIR/nanofly.yaml" ]; then
  log_info "Generating configuration..."
  SECRET=$(openssl rand -base64 48 2>/dev/null || head -c 48 /dev/urandom | base64)
  cat <<EOF > "$NANOFLY_DIR/nanofly.yaml"
# NanoFly Configuration
port: 8080
host: ""
secret_key: "$SECRET"
data_dir: "$NANOFLY_DATA"
debug: false
EOF
  log_success "Configuration created with secure secret"
else
  log_success "Existing configuration preserved"
fi

# ── Systemd Service ─────────────────────────────────────────────────────────
log_step "Step 5/5 — Starting service"

if command_exists systemctl; then
  cat > /etc/systemd/system/${NANOFLY_SERVICE}.service <<EOF
[Unit]
Description=NanoFly — Self-Hosted Server Control Panel
Documentation=https://github.com/${NANOFLY_REPO}
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
  systemctl start ${NANOFLY_SERVICE}
  sleep 3

  if systemctl is-active --quiet ${NANOFLY_SERVICE}; then
    log_success "NanoFly service is running"
  else
    log_error "Service failed to start:"
    journalctl -u ${NANOFLY_SERVICE} --no-pager -n 10 | sed 's/^/    /'
    exit 1
  fi
fi

# ── Done ─────────────────────────────────────────────────────────────────────
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
echo -e "  ${DIM}NanoFly starts automatically on reboot.${NC}"
echo ""

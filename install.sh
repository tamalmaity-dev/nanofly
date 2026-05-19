#!/usr/bin/env bash

# NanoFly Single-Line Installer & Setup Script
# Works on Linux and macOS. Installs dependencies, clones, builds, and starts NanoFly.

set -euo pipefail

# Style helpers
RED='\033[0;31m'
GREEN='\033[0;32m'
BLUE='\033[0;34m'
YELLOW='\033[1;33m'
NC='\033[0;35m' # No Color
NC_BOLD='\033[1m'
CLEAR='\033[0m'

echo -e "${BLUE}==============================================${CLEAR}"
echo -e "${GREEN}${NC_BOLD}           NanoFly Server Installer           ${CLEAR}"
echo -e "${BLUE}==============================================${CLEAR}"

# 1. Dependency checks
echo -e "\n${BLUE}[1/5] Checking dependencies...${CLEAR}"

deps_failed=0

check_dep() {
  if ! command -v "$1" &> /dev/null; then
    echo -e "${RED}✗ $1 is not installed.${CLEAR}"
    deps_failed=1
  else
    echo -e "${GREEN}✓ $1 is installed (${2:-$( "$1" --version | head -n 1 )})${CLEAR}"
  fi
}

check_dep "git" "Git"
check_dep "go" "Go ($(go version | awk '{print $3}'))"
check_dep "node" "Node.js ($(node -v))"
check_dep "npm" "NPM ($(npm -v))"
check_dep "docker" "Docker"

if [ $deps_failed -ne 0 ]; then
  echo -e "\n${RED}Error: Please install missing dependencies before running the installer.${CLEAR}"
  exit 1
fi

# 2. Clone Repository
echo -e "\n${BLUE}[2/5] Cloning NanoFly repository...${CLEAR}"
INSTALL_DIR="$HOME/nanofly"

if [ -d "$INSTALL_DIR" ]; then
  echo -e "${YELLOW}NanoFly directory already exists at $INSTALL_DIR. Pulling latest updates...${CLEAR}"
  cd "$INSTALL_DIR"
  git pull origin main
else
  git clone https://github.com/tamalmaity-dev/nanofly.git "$INSTALL_DIR"
  cd "$INSTALL_DIR"
fi

# 3. Build Frontend
echo -e "\n${BLUE}[3/5] Installing frontend dependencies & building...${CLEAR}"
cd "$INSTALL_DIR/web"
npm install --no-audit --no-fund
npm run build
cd "$INSTALL_DIR"

# 4. Build Backend Binary
echo -e "\n${BLUE}[4/5] Compiling Go backend binary...${CLEAR}"
go mod tidy
go build -ldflags="-s -w" -o nanofly ./cmd/nanofly

# Create data folder
mkdir -p "$INSTALL_DIR/data"

# Create a sample config if missing
if [ ! -f "$INSTALL_DIR/nanofly.yaml" ]; then
  echo -e "${BLUE}Creating default config nanofly.yaml...${CLEAR}"
  cat <<EOF > "$INSTALL_DIR/nanofly.yaml"
server:
  port: 8080
  data_dir: "./data"
EOF
fi

# 5. Start Server
echo -e "\n${GREEN}[5/5] NanoFly successfully built!${CLEAR}"
echo -e "${BLUE}==============================================${CLEAR}"
echo -e "${GREEN}To start NanoFly, run:${CLEAR}"
echo -e "  cd $INSTALL_DIR && ./nanofly"
echo -e "\n${GREEN}To keep it running in the background, run:${CLEAR}"
echo -e "  nohup ./nanofly > nanofly.log 2>&1 &"
echo -e "${BLUE}==============================================${CLEAR}"

# Ask if they want to run it right now
read -p "Would you like to start NanoFly now? (y/N) " -n 1 -r
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${GREEN}Starting NanoFly... (Access it at http://localhost:8080)${CLEAR}"
  ./nanofly
fi

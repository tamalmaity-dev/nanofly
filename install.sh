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

check_dep() {
  if ! command -v "$1" &> /dev/null; then
    return 1
  fi
  return 0
}

missing_deps=()
check_dep "git"    || missing_deps+=("git")
check_dep "docker" || missing_deps+=("docker")
check_dep "go"     || missing_deps+=("golang")
check_dep "node"   || missing_deps+=("nodejs")
check_dep "npm"    || missing_deps+=("npm")

if [ ${#missing_deps[@]} -ne 0 ]; then
  echo -e "${YELLOW}The following dependencies are missing: ${missing_deps[*]}${CLEAR}"
  
  # Check if we have apt-get (Ubuntu/Debian)
  if command -v apt-get &> /dev/null; then
    read -p "Would you like to automatically install these dependencies using apt? (y/N) " -n 1 -r < /dev/tty
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      echo -e "${BLUE}Updating system packages...${CLEAR}"
      sudo apt-get update -y
      
      echo -e "${BLUE}Installing missing packages...${CLEAR}"
      for pkg in "${missing_deps[@]}"; do
        if [ "$pkg" = "docker" ]; then
          sudo apt-get install -y docker.io
          sudo systemctl start docker || true
          sudo systemctl enable docker || true
          # Add current user to docker group if not root
          if [ "$USER" != "root" ]; then
            sudo usermod -aG docker "$USER" || true
            echo -e "${YELLOW}Notice: Added user $USER to docker group. You might need to log out and back in for Docker permissions to apply.${CLEAR}"
          fi
        elif [ "$pkg" = "golang" ]; then
          sudo apt-get install -y golang-go || sudo apt-get install -y golang
        elif [ "$pkg" = "nodejs" ]; then
          sudo apt-get install -y nodejs
        elif [ "$pkg" = "npm" ]; then
          sudo apt-get install -y npm
        else
          sudo apt-get install -y "$pkg"
        fi
      done
    else
      echo -e "${RED}Error: Installer aborted. Please install dependencies manually.${CLEAR}"
      exit 1
    fi
  else
    echo -e "${RED}Error: Unsupported package manager. Please manually install: ${missing_deps[*]}${CLEAR}"
    exit 1
  fi
else
  echo -e "${GREEN}✓ All dependencies are installed (git, docker, go, node, npm).${CLEAR}"
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
read -p "Would you like to start NanoFly now? (y/N) " -n 1 -r < /dev/tty
echo
if [[ $REPLY =~ ^[Yy]$ ]]; then
  echo -e "${GREEN}Starting NanoFly... (Access it at http://localhost:8080)${CLEAR}"
  ./nanofly
fi

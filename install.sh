#!/usr/bin/env bash

# NanoFly Single-Line Installer & Setup Script
# Works on Linux and macOS. Installs dependencies, clones, builds, and starts NanoFly.

set -euo pipefail

# Style helpers
RED='\033[0;31m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'
NC_BOLD='\033[1m'
CLEAR='\033[0m'

echo -e "${CYAN}"
echo -e "    _   __                 ______ __      "
echo -e "   / | / /____ _ ____  ___ / ____// /__  __"
echo -e "  /  |/ // __ \`/ __ \\/ __ \\/ /_   / // / / /"
echo -e " / /|  // /_/ // / / / /_/ / __/  / // /_/ /"
echo -e "/_/ |_/ \\__,_//_/ /_/\\____/_/    /_/ \\__, /"
echo -e "                                    /____/ "
echo -e "${GREEN}      ✨ Self-Hosted Server Control Panel ✨${NC}"
echo -e "${CYAN}------------------------------------------------${NC}"

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
    read -p "Would you like to automatically install these dependencies? (y/N) " -n 1 -r < /dev/tty
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
      ARCH=$(uname -m)
      apt_packages=()
      install_docker=false
      install_go_binary=false
      install_node_binary=false

      # Check which missing packages can be installed via optimized binaries vs apt
      for dep in "${missing_deps[@]}"; do
        if [ "$dep" = "docker" ]; then
          apt_packages+=("docker.io")
          install_docker=true
        elif [ "$dep" = "git" ]; then
          apt_packages+=("git")
        elif [ "$dep" = "golang" ]; then
          install_go_binary=true
        elif [ "$dep" = "nodejs" ] || [ "$dep" = "npm" ]; then
          install_node_binary=true
        else
          apt_packages+=("$dep")
        fi
      done

      # Add packages required for extracting official binaries
      if [ "$install_node_binary" = true ]; then
        apt_packages+=("xz-utils" "tar" "curl")
      fi
      if [ "$install_go_binary" = true ]; then
        apt_packages+=("tar" "curl")
      fi

      # 1. Install APT packages in one transaction (Git, Docker, xz-utils, etc.)
      if [ ${#apt_packages[@]} -ne 0 ]; then
        echo -e "${BLUE}Updating system package lists...${CLEAR}"
        sudo apt-get update -y
        echo -e "${BLUE}Installing system dependencies via apt...${CLEAR}"
        sudo apt-get install -y "${apt_packages[@]}"
      fi

      # 2. Install Go (optimized official binary extraction)
      if [ "$install_go_binary" = true ]; then
        echo -e "${BLUE}Installing Go language (official binary)...${CLEAR}"
        GO_VERSION="1.22.3"
        case "$ARCH" in
          x86_64) GO_ARCH="amd64" ;;
          aarch64) GO_ARCH="arm64" ;;
          armv7l) GO_ARCH="armv6l" ;;
          *) GO_ARCH="" ;;
        esac

        if [ -n "$GO_ARCH" ]; then
          sudo rm -rf /usr/local/go
          curl -fsSL "https://golang.org/dl/go${GO_VERSION}.linux-${GO_ARCH}.tar.gz" | sudo tar -xz -C /usr/local
          export PATH=$PATH:/usr/local/go/bin
          if ! grep -q "/usr/local/go/bin" ~/.profile 2>/dev/null; then
            echo 'export PATH=$PATH:/usr/local/go/bin' >> ~/.profile
          fi
        else
          echo -e "${YELLOW}Could not determine Go binary architecture for ${ARCH}, installing via apt...${CLEAR}"
          sudo apt-get install -y golang
        fi
      fi

      # 3. Install Node.js & npm (optimized official binary extraction)
      if [ "$install_node_binary" = true ]; then
        echo -e "${BLUE}Installing Node.js & npm (official binary)...${CLEAR}"
        NODE_VERSION="v20.13.1"
        case "$ARCH" in
          x86_64) NODE_ARCH="x64" ;;
          aarch64) NODE_ARCH="arm64" ;;
          armv7l) NODE_ARCH="armv7l" ;;
          *) NODE_ARCH="" ;;
        esac

        if [ -n "$NODE_ARCH" ]; then
          curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-${NODE_ARCH}.tar.xz" | sudo tar -xJ --strip-components=1 -C /usr/local
        else
          echo -e "${YELLOW}Could not determine Node.js binary architecture for ${ARCH}, installing via apt...${CLEAR}"
          sudo apt-get install -y nodejs npm
        fi
      fi

      # 4. Post-install Docker setup
      if [ "$install_docker" = true ]; then
        sudo systemctl start docker || true
        sudo systemctl enable docker || true
        if [ "$USER" != "root" ]; then
          sudo usermod -aG docker "$USER" || true
          echo -e "${YELLOW}Notice: Added user $USER to docker group. You might need to log out and back in for Docker permissions to apply.${CLEAR}"
        fi
      fi
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

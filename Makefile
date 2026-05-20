# NanoFly Makefile
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   make dev             — run backend in development mode
#   make build           — build for your current machine
#   make build-linux     — build for any Linux x86_64 server
#   make build-pi        — build for Raspberry Pi 4/5 (linux/arm64)
#   make build-pi32      — build for Raspberry Pi 3/Zero 2 (linux/armv7)
#   make build-mac       — build for macOS Intel (darwin/amd64)
#   make build-mac-arm   — build for macOS Apple Silicon (darwin/arm64)
#   make build-windows   — build for Windows x64 (windows/amd64)
#   make build-all       — build for all supported platforms
#   make release         — tag + push current VERSION to trigger GitHub release
#   make deps            — download all Go dependencies
#   make lint            — run go vet
#   make clean           — delete build artifacts

BINARY   := nanofly
MAIN     := ./cmd/nanofly
VERSION  := $(shell cat VERSION 2>/dev/null | tr -d '[:space:]' || echo dev)
LDFLAGS  := -ldflags="-s -w -X main.Version=$(VERSION)"

.PHONY: dev build build-linux build-pi build-pi32 build-mac build-mac-arm build-windows build-all release deps lint clean

## Run backend in development mode
dev:
	go run $(MAIN)

## Build for your current machine
build:
	@mkdir -p bin
	go build $(LDFLAGS) -o bin/$(BINARY) $(MAIN)
	@echo "✓ Built: bin/$(BINARY)  ($(VERSION))"

## Build for any Linux x86_64 server
build-linux:
	@mkdir -p bin
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o bin/$(BINARY)-linux-amd64 $(MAIN)
	@echo "✓ Built: bin/$(BINARY)-linux-amd64  ($(VERSION))"

## Build for Raspberry Pi 4/5 (64-bit ARM, linux/arm64)
build-pi:
	@mkdir -p bin
	GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o bin/$(BINARY)-linux-arm64 $(MAIN)
	@echo "✓ Built: bin/$(BINARY)-linux-arm64  ($(VERSION))"

## Build for Raspberry Pi 3 / Zero 2 (32-bit ARM, linux/armv7)
build-pi32:
	@mkdir -p bin
	GOOS=linux GOARCH=arm GOARM=7 go build $(LDFLAGS) -o bin/$(BINARY)-linux-armv7 $(MAIN)
	@echo "✓ Built: bin/$(BINARY)-linux-armv7  ($(VERSION))"

## Build for macOS Intel (darwin/amd64)
build-mac:
	@mkdir -p bin
	GOOS=darwin GOARCH=amd64 go build $(LDFLAGS) -o bin/$(BINARY)-macos-amd64 $(MAIN)
	@echo "✓ Built: bin/$(BINARY)-macos-amd64  ($(VERSION))"

## Build for macOS Apple Silicon M1/M2/M3/M4 (darwin/arm64)
build-mac-arm:
	@mkdir -p bin
	GOOS=darwin GOARCH=arm64 go build $(LDFLAGS) -o bin/$(BINARY)-macos-arm64 $(MAIN)
	@echo "✓ Built: bin/$(BINARY)-macos-arm64  ($(VERSION))"

## Build for Windows x64
build-windows:
	@mkdir -p bin
	GOOS=windows GOARCH=amd64 go build $(LDFLAGS) -o bin/$(BINARY)-windows-amd64.exe $(MAIN)
	@echo "✓ Built: bin/$(BINARY)-windows-amd64.exe  ($(VERSION))"

## Build for all supported platforms
build-all: build-linux build-pi build-pi32 build-mac build-mac-arm build-windows
	@echo "✓ All binaries built in bin/"

## Tag the current VERSION and push to GitHub to trigger the release workflow
release:
	@echo "Releasing $(VERSION)..."
	git tag $(VERSION)
	git push origin $(VERSION)
	@echo "✓ Tagged and pushed $(VERSION) — GitHub Actions will build all platforms and publish."

## Download all dependencies
deps:
	go mod tidy
	go mod download
	@echo "✓ Dependencies ready"

## Vet the code for common mistakes
lint:
	go vet ./...
	@echo "✓ No vet issues found"

## Delete all build output
clean:
	rm -rf bin/
	@echo "✓ Cleaned"
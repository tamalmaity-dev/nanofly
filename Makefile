# NanoFly Makefile
# ─────────────────────────────────────────────────────────────────────────────
# Usage:
#   make dev          — run backend in development mode
#   make build        — build for your current machine (reads VERSION file)
#   make build-pi     — build for Raspberry Pi 4/5 (linux/arm64)
#   make build-pi32   — build for Raspberry Pi 3/Zero 2 (linux/armv7)
#   make build-linux  — build for any Linux x86_64 server
#   make build-all    — build for all Linux targets
#   make release      — tag + push a new version (reads VERSION file)
#   make deps         — download all Go dependencies
#   make lint         — run go vet
#   make clean        — delete build artifacts

BINARY   := nanofly
MAIN     := ./cmd/nanofly
VERSION  := $(shell cat VERSION 2>/dev/null | tr -d '[:space:]' || echo dev)
LDFLAGS  := -ldflags="-s -w -X main.Version=$(VERSION)"

.PHONY: dev build build-pi build-pi32 build-linux build-all release deps lint clean

## Run backend in development mode
dev:
	go run $(MAIN)

## Build for your current machine
build:
	@mkdir -p bin
	go build $(LDFLAGS) -o bin/$(BINARY) $(MAIN)
	@echo "✓ Built: bin/$(BINARY)  ($(VERSION))"

## Build for Raspberry Pi 4/5 (64-bit ARM, linux/arm64)
build-pi:
	@mkdir -p bin
	GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o bin/$(BINARY)-arm64 $(MAIN)
	@echo "✓ Built: bin/$(BINARY)-arm64  ($(VERSION))"

## Build for Raspberry Pi 3 / Zero 2 (32-bit ARM, linux/armv7)
build-pi32:
	@mkdir -p bin
	GOOS=linux GOARCH=arm GOARM=7 go build $(LDFLAGS) -o bin/$(BINARY)-armv7 $(MAIN)
	@echo "✓ Built: bin/$(BINARY)-armv7  ($(VERSION))"

## Build for any Linux x86_64 server
build-linux:
	@mkdir -p bin
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o bin/$(BINARY)-amd64 $(MAIN)
	@echo "✓ Built: bin/$(BINARY)-amd64  ($(VERSION))"

## Build all Linux platforms
build-all: build-pi build-pi32 build-linux
	@echo "✓ All binaries in bin/"

## Tag the current VERSION and push to GitHub to trigger the release workflow
release:
	@echo "Releasing $(VERSION)..."
	git tag $(VERSION)
	git push origin $(VERSION)
	@echo "✓ Tagged $(VERSION) — GitHub Actions will build and publish the release."

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
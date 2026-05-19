# Makefile — your command center for building and running paneld
#
# NanoFly Makefile
# Usage:
#   make dev         — run backend for development
#   make build       — build for your current machine
#   make build-pi    — build for Raspberry Pi 4 (ARM64)
#   make build-pi32  — build for Raspberry Pi 3/Zero (ARMv7)
#   make build-linux — build for any Linux x86_64 server
#   make build-all   — build for all platforms
#   make deps        — download all Go dependencies
#   make clean       — delete build artifacts

BINARY  := nanofly
MAIN    := ./cmd/nanofly
LDFLAGS := -ldflags="-s -w"

.PHONY: dev build build-pi build-pi32 build-linux build-all deps lint clean

## Run backend in development mode (hot reload not included yet)
dev:
	go run $(MAIN)

## Build for your current machine
build:
	mkdir -p bin
	go build $(LDFLAGS) -o bin/$(BINARY) $(MAIN)
	@echo "Built: bin/$(BINARY)"

## Build for Raspberry Pi 4 / 5 (64-bit ARM)
build-pi:
	mkdir -p bin
	GOOS=linux GOARCH=arm64 go build $(LDFLAGS) -o bin/$(BINARY)-arm64 $(MAIN)
	@echo "Built: bin/$(BINARY)-arm64"

## Build for Raspberry Pi 3 / Zero 2 (32-bit ARM)
build-pi32:
	mkdir -p bin
	GOOS=linux GOARCH=arm GOARM=7 go build $(LDFLAGS) -o bin/$(BINARY)-armv7 $(MAIN)
	@echo "Built: bin/$(BINARY)-armv7"

## Build for any Linux x86_64 server
build-linux:
	mkdir -p bin
	GOOS=linux GOARCH=amd64 go build $(LDFLAGS) -o bin/$(BINARY)-amd64 $(MAIN)
	@echo "Built: bin/$(BINARY)-amd64"

## Build all platforms at once
build-all: build-pi build-pi32 build-linux
	@echo "All binaries in bin/"

## Download all dependencies
deps:
	go mod tidy
	go mod download
	@echo "Dependencies ready"

## Vet the code for common mistakes
lint:
	go vet ./...
	@echo "No issues found"

## Delete all build output
clean:
	rm -rf bin/
	@echo "Cleaned"
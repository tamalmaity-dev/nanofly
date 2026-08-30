package services

import (
	"os"
	"path/filepath"
	"reflect"
	"testing"

	"gopkg.in/yaml.v3"
)

func TestNormalizeComposeVolumesAddsOnlyNamedServiceVolumes(t *testing.T) {
	dir := t.TempDir()
	composePath := filepath.Join(dir, "docker-compose.yml")
	compose := `services:
  seaweedfs:
    image: chrislusf/seaweedfs:latest
    volumes:
      - seaweedfs-data:/data
      - type: volume
        source: filer-data
        target: /filer
      - ./config:/etc/seaweedfs:ro
    ports:
      - "8333:8333"
      - "8888:8888"
      - "9333:9333"
      - "23646:23646"
`
	if err := os.WriteFile(composePath, []byte(compose), 0644); err != nil {
		t.Fatal(err)
	}

	added, err := normalizeComposeVolumes(composePath)
	if err != nil {
		t.Fatalf("normalizeComposeVolumes() error = %v", err)
	}
	want := []string{"filer-data", "seaweedfs-data"}
	if !reflect.DeepEqual(added, want) {
		t.Fatalf("added volumes = %v, want %v", added, want)
	}

	data, err := os.ReadFile(composePath)
	if err != nil {
		t.Fatal(err)
	}
	var parsed struct {
		Volumes map[string]map[string]any `yaml:"volumes"`
	}
	if err := yaml.Unmarshal(data, &parsed); err != nil {
		t.Fatal(err)
	}
	if len(parsed.Volumes) != 2 || parsed.Volumes["seaweedfs-data"] == nil || parsed.Volumes["filer-data"] == nil {
		t.Fatalf("unexpected normalized volumes: %#v", parsed.Volumes)
	}
	for _, port := range []string{"8333", "8888", "9333", "23646"} {
		if _, found := parsed.Volumes[port]; found {
			t.Errorf("port %q was incorrectly added as a volume", port)
		}
	}
}

func TestNormalizeComposeVolumesLeavesDeclaredAndBindVolumesUntouched(t *testing.T) {
	dir := t.TempDir()
	composePath := filepath.Join(dir, "compose.yaml")
	compose := `services:
  app:
    image: nginx:alpine
    volumes:
      - app-data:/var/lib/app
      - /srv/app/config:/etc/app:ro
      - /tmp/cache
volumes:
  app-data:
    name: shared-app-data
`
	if err := os.WriteFile(composePath, []byte(compose), 0644); err != nil {
		t.Fatal(err)
	}

	added, err := normalizeComposeVolumes(composePath)
	if err != nil {
		t.Fatalf("normalizeComposeVolumes() error = %v", err)
	}
	if len(added) != 0 {
		t.Fatalf("added volumes = %v, want none", added)
	}
}

func TestFindComposeFileSupportsComposeYamlVariants(t *testing.T) {
	dir := t.TempDir()
	path := filepath.Join(dir, "compose.yaml")
	if err := os.WriteFile(path, []byte("services: {}\n"), 0644); err != nil {
		t.Fatal(err)
	}

	found, err := findComposeFile(dir)
	if err != nil {
		t.Fatalf("findComposeFile() error = %v", err)
	}
	if found != path {
		t.Fatalf("findComposeFile() = %q, want %q", found, path)
	}
}

func TestEnsureComposeServiceLabelsPreservesExistingLabels(t *testing.T) {
	dir := t.TempDir()
	composePath := filepath.Join(dir, "compose.yml")
	compose := `services:
  api:
    image: example/api
    labels:
      app.role: api
  worker:
    image: example/worker
    labels:
      - app.role=worker
`
	if err := os.WriteFile(composePath, []byte(compose), 0644); err != nil {
		t.Fatal(err)
	}

	updated, err := ensureComposeServiceLabels(composePath, "service-123")
	if err != nil {
		t.Fatalf("ensureComposeServiceLabels() error = %v", err)
	}
	if want := []string{"api", "worker"}; !reflect.DeepEqual(updated, want) {
		t.Fatalf("updated services = %v, want %v", updated, want)
	}

	data, err := os.ReadFile(composePath)
	if err != nil {
		t.Fatal(err)
	}
	var parsed struct {
		Services map[string]struct {
			Labels yaml.Node `yaml:"labels"`
		} `yaml:"services"`
	}
	if err := yaml.Unmarshal(data, &parsed); err != nil {
		t.Fatal(err)
	}
	apiLabels := parsed.Services["api"].Labels
	if apiLabels.Kind != yaml.MappingNode || mappingValue(&apiLabels, "nanofly.service") == nil {
		t.Fatal("mapping labels did not receive the NanoFly management label")
	}
	workerLabels := parsed.Services["worker"].Labels
	if workerLabels.Kind != yaml.SequenceNode || len(workerLabels.Content) != 2 || workerLabels.Content[1].Value != "nanofly.service=service-123" {
		t.Fatalf("unexpected sequence labels: %#v", workerLabels.Content)
	}
}

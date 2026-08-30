package services

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"testing"

	"github.com/nanofly/nanofly/internal/db"
)

func TestServiceResourceNamesAreScopedAndSafe(t *testing.T) {
	service := &Service{ID: "12345678-abcd", Name: "My API / Production", Type: TypeApp}
	if got, want := service.ContainerName(), "nf-app-my-api-production-12345678"; got != want {
		t.Fatalf("ContainerName() = %q, want %q", got, want)
	}
	if got, want := service.ImageTag(), "nf-app-my-api-production-12345678:latest"; got != want {
		t.Fatalf("ImageTag() = %q, want %q", got, want)
	}
}

func TestShouldInjectBuildEnvFiltersCredentials(t *testing.T) {
	t.Setenv("NANOFLY_BUILD_ALL_ENV", "")
	for _, key := range []string{"DATABASE_URL", "AUTH_SECRET", "GITHUB_TOKEN", "PRIVATE_KEY"} {
		if shouldInjectBuildEnv(key) {
			t.Errorf("shouldInjectBuildEnv(%q) = true, want false", key)
		}
	}
	for _, key := range []string{"NEXT_PUBLIC_API_URL", "NODE_ENV", "PORT"} {
		if !shouldInjectBuildEnv(key) {
			t.Errorf("shouldInjectBuildEnv(%q) = false, want true", key)
		}
	}
}

func TestShouldPullBaseImagesIsOptIn(t *testing.T) {
	for _, value := range []string{"", "0", "false", "no"} {
		t.Setenv("NANOFLY_BUILD_PULL", value)
		if shouldPullBaseImages() {
			t.Errorf("shouldPullBaseImages() = true for %q", value)
		}
	}
	for _, value := range []string{"1", "true", "yes", "on"} {
		t.Setenv("NANOFLY_BUILD_PULL", value)
		if !shouldPullBaseImages() {
			t.Errorf("shouldPullBaseImages() = false for %q", value)
		}
	}
}

func TestServiceBuildHashChangesWithBuildInputs(t *testing.T) {
	service := &Service{Builder: "node", InstallCommand: "npm ci", Port: 3000}
	first := serviceBuildHash(service, []buildEnvVar{{Key: "NEXT_PUBLIC_API_URL", Value: "https://one.example"}})
	second := serviceBuildHash(service, []buildEnvVar{{Key: "NEXT_PUBLIC_API_URL", Value: "https://two.example"}})
	if first == second {
		t.Fatal("serviceBuildHash() did not change when a build-time environment value changed")
	}
}

func TestSyncServicePortsKeepsContainerAndExposedPortsAligned(t *testing.T) {
	cases := []struct {
		name        string
		port        int
		exposed     int
		wantPort    int
		wantExposed int
	}{
		{name: "container port updates exposed port", port: 4000, exposed: 0, wantPort: 4000, wantExposed: 4000},
		{name: "exposed port fills missing container port", port: 0, exposed: 5000, wantPort: 5000, wantExposed: 5000},
		{name: "explicit values are preserved", port: 3000, exposed: 8080, wantPort: 3000, wantExposed: 8080},
	}
	for _, tc := range cases {
		t.Run(tc.name, func(t *testing.T) {
			port, exposed := syncServicePorts(tc.port, tc.exposed)
			if port != tc.wantPort || exposed != tc.wantExposed {
				t.Fatalf("syncServicePorts(%d, %d) = (%d, %d), want (%d, %d)", tc.port, tc.exposed, port, exposed, tc.wantPort, tc.wantExposed)
			}
		})
	}
}

func TestOptimizedNodeInstallCommandAddsCacheFriendlyFlags(t *testing.T) {
	command := optimizedNodeInstallCommand("npm ci --no-audit --no-fund 2>/dev/null || npm install --no-audit --no-fund")
	for _, invocation := range []string{"npm ci", "npm install"} {
		start := strings.Index(command, invocation)
		if start < 0 {
			t.Fatalf("optimized command %q does not contain %q", command, invocation)
		}
		end := len(command)
		for _, separator := range []string{"&&", "||", ";"} {
			if next := strings.Index(command[start+len(invocation):], separator); next >= 0 && start+len(invocation)+next < end {
				end = start + len(invocation) + next
			}
		}
		segment := command[start:end]
		for _, flag := range []string{"--prefer-offline", "--no-audit", "--no-fund", "--progress=false"} {
			if !strings.Contains(segment, flag) {
				t.Errorf("command segment %q does not contain %q", segment, flag)
			}
		}
	}
}

func TestBuildProgressStageIdentifiesQuietDockerSteps(t *testing.T) {
	cases := map[string]string{
		"#10 [deps 4/4] RUN npm ci --prefer-offline": "Dependency installation (npm ci)",
		"#13 [builder 5/5] RUN npm run build":        "Application compilation (Next.js)",
		"#6 [internal] load build context":           "Docker context transfer",
	}
	for line, want := range cases {
		if got := buildProgressStage(line); got != want {
			t.Errorf("buildProgressStage(%q) = %q, want %q", line, got, want)
		}
	}
}

func TestLogBuildContextSummaryReportsLargestFiles(t *testing.T) {
	root := t.TempDir()
	if err := os.WriteFile(filepath.Join(root, "small.txt"), []byte("small"), 0644); err != nil {
		t.Fatal(err)
	}
	if err := os.WriteFile(filepath.Join(root, "large.bin"), make([]byte, 4096), 0644); err != nil {
		t.Fatal(err)
	}

	var lines []string
	logBuildContextSummary(root, func(line string) { lines = append(lines, line) })
	joined := strings.Join(lines, "\n")
	if !strings.Contains(joined, "Build context: ") || !strings.Contains(joined, "2 files") {
		t.Fatalf("context summary = %q", joined)
	}
	if !strings.Contains(joined, "Build context largest file:") || !strings.Contains(joined, "large.bin") {
		t.Fatalf("context largest-file summary = %q", joined)
	}
}

func TestRecoverInterruptedDeployments(t *testing.T) {
	database, err := db.Open(t.TempDir())
	if err != nil {
		t.Fatal(err)
	}
	defer database.Close()

	ctx := context.Background()
	if _, err := database.ExecContext(ctx, `INSERT INTO projects (id, name) VALUES ('project-1', 'Test')`); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO services (id, project_id, name, type, status)
		VALUES ('service-1', 'project-1', 'web', 'app', 'deploying')
	`); err != nil {
		t.Fatal(err)
	}
	if _, err := database.ExecContext(ctx, `
		INSERT INTO deployments (id, service_id, status, log)
		VALUES ('deployment-1', 'service-1', 'building', 'before restart')
	`); err != nil {
		t.Fatal(err)
	}

	manager := New(database, nil)
	if count, err := manager.ActiveDeploymentCount(ctx); err != nil || count != 1 {
		t.Fatalf("ActiveDeploymentCount() = %d, %v; want 1, nil", count, err)
	}
	if err := manager.RecoverInterruptedDeployments(ctx); err != nil {
		t.Fatal(err)
	}
	if count, err := manager.ActiveDeploymentCount(ctx); err != nil || count != 0 {
		t.Fatalf("ActiveDeploymentCount() after recovery = %d, %v; want 0, nil", count, err)
	}

	var deploymentStatus, serviceStatus, log string
	if err := database.QueryRowContext(ctx, `SELECT status, log FROM deployments WHERE id='deployment-1'`).Scan(&deploymentStatus, &log); err != nil {
		t.Fatal(err)
	}
	if err := database.QueryRowContext(ctx, `SELECT status FROM services WHERE id='service-1'`).Scan(&serviceStatus); err != nil {
		t.Fatal(err)
	}
	if deploymentStatus != "error" || serviceStatus != "error" || !strings.Contains(log, "interrupted") {
		t.Fatalf("recovered deployment = status %q, service %q, log %q", deploymentStatus, serviceStatus, log)
	}

	// A Git Source panel updates only git_sources. Ensure that update is not
	// short-circuited by the service-column update path.
	if _, err := manager.Update(ctx, "service-1", UpdateServiceReq{
		GitRepoURL: "https://github.com/example/web.git",
		GitBranch:  "main",
	}); err != nil {
		t.Fatal(err)
	}
	var repoURL string
	if err := database.QueryRowContext(ctx, `SELECT repo_url FROM git_sources WHERE service_id='service-1'`).Scan(&repoURL); err != nil {
		t.Fatal(err)
	}
	if repoURL != "https://github.com/example/web.git" {
		t.Fatalf("saved git source URL = %q", repoURL)
	}
}

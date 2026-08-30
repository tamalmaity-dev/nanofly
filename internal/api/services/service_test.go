package services

import "testing"

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

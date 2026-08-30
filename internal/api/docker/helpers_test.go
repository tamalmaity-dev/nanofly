package docker

import "testing"

func TestSafeName(t *testing.T) {
	tests := map[string]string{
		"My API / Production": "my-api-production",
		"  --web__app--  ":    "web__app",
		"***":                 "service",
		"UPPER.case":          "upper.case",
	}
	for input, want := range tests {
		if got := SafeName(input); got != want {
			t.Errorf("SafeName(%q) = %q, want %q", input, got, want)
		}
	}
}

func TestSafeNameTruncatesLongNames(t *testing.T) {
	input := "this-is-a-service-name-that-is-longer-than-docker-needs-to-be"
	if got := SafeName(input); len(got) != 48 {
		t.Fatalf("SafeName() length = %d, want 48 (%q)", len(got), got)
	}
}

package cli

import (
	"slices"
	"testing"
)

func TestChildEnv(t *testing.T) {
	parent := []string{"PATH=/bin", "AKV_TOKEN=super-secret", "AKV_TOKEN_FILE=/x", "API_KEY=old", "HOME=/home/u"}
	secrets := map[string]string{"API_KEY": "new", "DB_URL": "postgres://x"}

	got := childEnv(parent, secrets)

	if slices.Contains(got, "AKV_TOKEN=super-secret") {
		t.Error("AKV_TOKEN must be stripped from the child environment")
	}
	if slices.Contains(got, "AKV_TOKEN_FILE=/x") {
		t.Error("AKV_TOKEN_FILE must be stripped from the child environment")
	}
	if slices.Contains(got, "API_KEY=old") {
		t.Error("secret must override the inherited value")
	}
	if !slices.Contains(got, "API_KEY=new") {
		t.Error("injected secret missing")
	}
	if !slices.Contains(got, "DB_URL=postgres://x") {
		t.Error("injected secret missing")
	}
	if !slices.Contains(got, "PATH=/bin") || !slices.Contains(got, "HOME=/home/u") {
		t.Error("unrelated inherited env must be preserved")
	}
}

func TestDotenvQuote(t *testing.T) {
	tests := []struct {
		in, want string
	}{
		{"simple", "simple"},
		{"has space", `"has space"`},
		{`has"quote`, `"has\"quote"`},
		{"a=b", `"a=b"`},
		{"with#hash", `"with#hash"`},
	}
	for _, tt := range tests {
		if got := dotenvQuote(tt.in); got != tt.want {
			t.Errorf("dotenvQuote(%q) = %q, want %q", tt.in, got, tt.want)
		}
	}
}

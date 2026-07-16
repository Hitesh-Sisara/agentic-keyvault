package api

import (
	"context"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestNewRejectsNonHTTPS(t *testing.T) {
	if _, err := New("http://vault.example.com", "t", 0); err == nil {
		t.Error("expected non-HTTPS URL to be rejected")
	}
	if _, err := New("http://localhost:8787", "t", 0); err != nil {
		t.Errorf("localhost http should be allowed, got %v", err)
	}
	if _, err := New("https://vault.example.com", "t", 0); err != nil {
		t.Errorf("https should be allowed, got %v", err)
	}
}

func TestClientSendsAuthAndParses(t *testing.T) {
	var gotAuth, gotPath string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		gotPath = r.URL.Path
		_ = json.NewEncoder(w).Encode(map[string]any{
			"projects": []map[string]string{{"id": "proj_1", "name": "A", "slug": "a"}},
		})
	}))
	defer srv.Close()

	c, err := New(srv.URL, "akv_secret", 0)
	if err != nil {
		t.Fatal(err)
	}
	projects, err := c.ListProjects(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if gotAuth != "Bearer akv_secret" {
		t.Errorf("Authorization = %q", gotAuth)
	}
	if gotPath != "/v1/projects" {
		t.Errorf("path = %q", gotPath)
	}
	if len(projects) != 1 || projects[0].ID != "proj_1" {
		t.Errorf("unexpected projects: %+v", projects)
	}
}

func TestClientTypedErrors(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusForbidden)
		_ = json.NewEncoder(w).Encode(map[string]string{"error": "read-only token"})
	}))
	defer srv.Close()

	c, _ := New(srv.URL, "t", 0)
	_, err := c.ListProjects(context.Background())
	if !IsStatus(err, 403) {
		t.Fatalf("expected 403 APIError, got %v", err)
	}
	if ae, ok := err.(*APIError); !ok || ae.Message != "read-only token" {
		t.Errorf("unexpected error: %v", err)
	}
}

func TestClientRejectsCrossOriginRedirect(t *testing.T) {
	other := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		// Would leak the token if followed.
		w.WriteHeader(200)
	}))
	defer other.Close()

	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		http.Redirect(w, r, other.URL+"/v1/projects", http.StatusFound)
	}))
	defer srv.Close()

	c, _ := New(srv.URL, "t", 0)
	if _, err := c.ListProjects(context.Background()); err == nil {
		t.Error("expected cross-origin redirect to be blocked")
	}
}

func TestExportSetsEnvQuery(t *testing.T) {
	var gotQuery string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotQuery = r.URL.RawQuery
		_ = json.NewEncoder(w).Encode(map[string]any{"secrets": []map[string]any{}})
	}))
	defer srv.Close()

	c, _ := New(srv.URL, "t", 0)
	_, err := c.ExportSecrets(context.Background(), "proj_1", ListSecretsOpts{EnvOnly: true, RepoSet: true, Repo: "none"})
	if err != nil {
		t.Fatal(err)
	}
	if !contains(gotQuery, "env=1") || !contains(gotQuery, "project=proj_1") || !contains(gotQuery, "repo=none") {
		t.Errorf("query = %q", gotQuery)
	}
}

func contains(s, sub string) bool {
	return len(s) >= len(sub) && (s == sub || indexOf(s, sub) >= 0)
}

func indexOf(s, sub string) int {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return i
		}
	}
	return -1
}

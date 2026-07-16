package config

import "testing"

func TestResolvePrecedence(t *testing.T) {
	cfg := &Config{
		ActiveProfile: "work",
		Profiles: map[string]Profile{
			"work": {APIURL: "https://work.example", Project: "proj_profile"},
		},
	}

	tests := []struct {
		name        string
		flags       Flags
		env         map[string]string
		wantURL     string
		wantProject string
	}{
		{
			name:        "profile provides defaults",
			wantURL:     "https://work.example",
			wantProject: "proj_profile",
		},
		{
			name:        "env overrides profile",
			env:         map[string]string{"AKV_PROJECT": "proj_env"},
			wantURL:     "https://work.example",
			wantProject: "proj_env",
		},
		{
			name:        "flag overrides env and profile",
			flags:       Flags{Project: "proj_flag"},
			env:         map[string]string{"AKV_PROJECT": "proj_env"},
			wantURL:     "https://work.example",
			wantProject: "proj_flag",
		},
		{
			name:        "flag url overrides profile url",
			flags:       Flags{APIURL: "https://flag.example"},
			wantURL:     "https://flag.example",
			wantProject: "proj_profile",
		},
	}

	for _, tt := range tests {
		t.Run(tt.name, func(t *testing.T) {
			getenv := func(k string) string { return tt.env[k] }
			got := Resolve(cfg, tt.flags, getenv)
			if got.APIURL != tt.wantURL {
				t.Errorf("APIURL = %q, want %q", got.APIURL, tt.wantURL)
			}
			if got.Project != tt.wantProject {
				t.Errorf("Project = %q, want %q", got.Project, tt.wantProject)
			}
		})
	}
}

func TestResolveDefaultsAuthStoreAndTimeout(t *testing.T) {
	cfg := &Config{ActiveProfile: "p", Profiles: map[string]Profile{"p": {APIURL: "https://x"}}}
	got := Resolve(cfg, Flags{}, func(string) string { return "" })
	if got.AuthStore != "keyring" {
		t.Errorf("AuthStore = %q, want keyring", got.AuthStore)
	}
	if got.Timeout.Seconds() != 15 {
		t.Errorf("Timeout = %v, want 15s", got.Timeout)
	}
}

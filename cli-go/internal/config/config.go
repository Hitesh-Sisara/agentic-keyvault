// Package config loads CLI configuration with explicit, testable precedence:
// flags > environment > selected profile > built-in defaults.
package config

import (
	"fmt"
	"os"
	"path/filepath"
	"time"

	toml "github.com/pelletier/go-toml/v2"
)

// Profile is a named environment (a Worker URL + default scope + auth policy).
type Profile struct {
	APIURL         string `toml:"api_url"`
	Project        string `toml:"project,omitempty"`
	Repo           string `toml:"repo,omitempty"`
	AuthStore      string `toml:"auth_store,omitempty"` // "keyring" | "file"
	TokenFile      string `toml:"token_file,omitempty"`
	TimeoutSeconds int    `toml:"timeout_seconds,omitempty"`
}

// Config is the on-disk file. It never stores tokens.
type Config struct {
	Version       int                `toml:"version"`
	ActiveProfile string             `toml:"active_profile"`
	Profiles      map[string]Profile `toml:"profiles"`
}

// Flags are the values parsed from command-line persistent flags.
type Flags struct {
	Profile string
	APIURL  string
	Project string
	Repo    string
}

// Resolved is the effective configuration for a command invocation.
type Resolved struct {
	Profile   string
	APIURL    string
	Project   string
	Repo      string
	AuthStore string
	TokenFile string
	Timeout   time.Duration
}

// Path returns the config file path, honoring AKV_CONFIG then os.UserConfigDir.
func Path(getenv func(string) string) (string, error) {
	if p := getenv("AKV_CONFIG"); p != "" {
		return p, nil
	}
	dir, err := os.UserConfigDir()
	if err != nil {
		return "", err
	}
	return filepath.Join(dir, "akv", "config.toml"), nil
}

// Load reads the config file. A missing file yields an empty config.
func Load(getenv func(string) string) (*Config, error) {
	path, err := Path(getenv)
	if err != nil {
		return nil, err
	}
	data, err := os.ReadFile(path)
	if os.IsNotExist(err) {
		return &Config{Version: 1, Profiles: map[string]Profile{}}, nil
	}
	if err != nil {
		return nil, err
	}
	var cfg Config
	if err := toml.Unmarshal(data, &cfg); err != nil {
		return nil, fmt.Errorf("parse config %s: %w", path, err)
	}
	if cfg.Profiles == nil {
		cfg.Profiles = map[string]Profile{}
	}
	return &cfg, nil
}

// Save writes the config atomically with 0600 permissions.
func Save(getenv func(string) string, cfg *Config) error {
	path, err := Path(getenv)
	if err != nil {
		return err
	}
	if err := os.MkdirAll(filepath.Dir(path), 0o700); err != nil {
		return err
	}
	data, err := toml.Marshal(cfg)
	if err != nil {
		return err
	}
	tmp := path + ".tmp"
	if err := os.WriteFile(tmp, data, 0o600); err != nil {
		return err
	}
	return os.Rename(tmp, path)
}

// ActiveProfileName resolves which profile to use: flag > env > file default.
func ActiveProfileName(cfg *Config, flags Flags, getenv func(string) string) string {
	if flags.Profile != "" {
		return flags.Profile
	}
	if p := getenv("AKV_PROFILE"); p != "" {
		return p
	}
	return cfg.ActiveProfile
}

// Resolve applies precedence: flags > env > profile > defaults.
func Resolve(cfg *Config, flags Flags, getenv func(string) string) Resolved {
	name := ActiveProfileName(cfg, flags, getenv)
	p := cfg.Profiles[name]

	pick := func(flag, env, profile string) string {
		if flag != "" {
			return flag
		}
		if env != "" {
			return env
		}
		return profile
	}

	r := Resolved{
		Profile:   name,
		APIURL:    pick(flags.APIURL, getenv("AKV_API_URL"), p.APIURL),
		Project:   pick(flags.Project, getenv("AKV_PROJECT"), p.Project),
		Repo:      pick(flags.Repo, getenv("AKV_REPO"), p.Repo),
		AuthStore: p.AuthStore,
		TokenFile: pick("", getenv("AKV_TOKEN_FILE"), p.TokenFile),
	}
	if r.AuthStore == "" {
		r.AuthStore = "keyring"
	}
	timeout := p.TimeoutSeconds
	if timeout <= 0 {
		timeout = 15
	}
	r.Timeout = time.Duration(timeout) * time.Second
	return r
}

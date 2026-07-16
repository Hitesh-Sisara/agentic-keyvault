// Package auth resolves and stores the access token.
//
// Resolution precedence (secure-by-default with CI/agent override):
//  1. AKV_TOKEN            — primary path for headless agents / CI
//  2. token file (0600)    — when the profile uses the "file" store
//  3. OS keychain          — default for interactive human logins
package auth

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/zalando/go-keyring"
)

const keyringService = "agentic-keyvault"

// Resolve returns the token for a profile, or an error if none is available.
func Resolve(getenv func(string) string, store, tokenFile, profile string) (string, error) {
	if t := strings.TrimSpace(getenv("AKV_TOKEN")); t != "" {
		return t, nil
	}
	if tokenFile != "" {
		data, err := os.ReadFile(tokenFile)
		if err != nil {
			return "", fmt.Errorf("read token file: %w", err)
		}
		return strings.TrimSpace(string(data)), nil
	}
	if store == "file" {
		return "", fmt.Errorf("no token: set AKV_TOKEN or configure token_file")
	}
	t, err := keyring.Get(keyringService, keyForProfile(profile))
	if err != nil {
		return "", fmt.Errorf("no token in keychain for profile %q — run `akv login` or set AKV_TOKEN", profile)
	}
	return t, nil
}

// Store persists a token per the profile's auth store.
func Store(store, tokenFile, profile, token string) error {
	if store == "file" {
		if tokenFile == "" {
			return fmt.Errorf("token_file must be set for the file auth store")
		}
		if err := os.MkdirAll(filepath.Dir(tokenFile), 0o700); err != nil {
			return err
		}
		return os.WriteFile(tokenFile, []byte(token+"\n"), 0o600)
	}
	return keyring.Set(keyringService, keyForProfile(profile), token)
}

// Delete removes a stored token (best-effort).
func Delete(store, tokenFile, profile string) error {
	if store == "file" {
		if tokenFile == "" {
			return nil
		}
		err := os.Remove(tokenFile)
		if os.IsNotExist(err) {
			return nil
		}
		return err
	}
	err := keyring.Delete(keyringService, keyForProfile(profile))
	if err == keyring.ErrNotFound {
		return nil
	}
	return err
}

func keyForProfile(profile string) string {
	if profile == "" {
		return "default"
	}
	return profile
}

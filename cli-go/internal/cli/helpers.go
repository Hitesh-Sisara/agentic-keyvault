package cli

import (
	"context"
	"fmt"
	"io"
	"os"

	"golang.org/x/term"

	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/api"
	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/output"
)

func table(a *App, headers []string, rows [][]string) {
	output.Table(a.Out, headers, rows)
}

// listOptsForRepo scopes to a repo id, or to general (repo-less) secrets.
func listOptsForRepo(repoID string) api.ListSecretsOpts {
	if repoID != "" {
		return api.ListSecretsOpts{RepoSet: true, Repo: repoID}
	}
	return api.ListSecretsOpts{RepoSet: true, Repo: "none"}
}

// readSecretValue gets a value without ever accepting it via argv.
func (a *App) readSecretValue(stdinFlag bool, fromFile string) (string, error) {
	if fromFile != "" {
		data, err := os.ReadFile(fromFile)
		if err != nil {
			return "", err
		}
		return string(data), nil
	}
	if !stdinFlag {
		if f, ok := a.In.(*os.File); ok && term.IsTerminal(int(f.Fd())) {
			fmt.Fprint(a.Err, "Value: ")
			b, err := term.ReadPassword(int(f.Fd()))
			fmt.Fprintln(a.Err)
			return string(b), err
		}
	}
	data, err := io.ReadAll(a.In)
	if err != nil {
		return "", err
	}
	// Trim a single trailing newline commonly added by echo/pipes.
	s := string(data)
	if len(s) > 0 && s[len(s)-1] == '\n' {
		s = s[:len(s)-1]
	}
	return s, nil
}

// resolveSecretID finds a secret's id by name within a scope.
func (a *App) resolveSecretID(ctx context.Context, c *api.Client, project, repoID, name string) (string, error) {
	opts := api.ListSecretsOpts{}
	if repoID != "" {
		opts.RepoSet = true
		opts.Repo = repoID
	} else {
		opts.RepoSet = true
		opts.Repo = "none"
	}
	list, err := c.ListSecrets(ctx, project, opts)
	if err != nil {
		return "", err
	}
	for _, s := range list {
		if s.Name == name {
			return s.ID, nil
		}
	}
	return "", fmt.Errorf("secret %q not found in the given scope", name)
}

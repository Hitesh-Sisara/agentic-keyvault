// Package cli builds the akv command tree with dependency injection so it is
// testable without touching the real filesystem, network, or os.Exit.
package cli

import (
	"context"
	"fmt"
	"io"
	"os/exec"
	"strings"

	"github.com/spf13/cobra"

	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/api"
	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/auth"
	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/config"
	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/output"
)

// App carries injected dependencies and global flag state.
type App struct {
	In     io.Reader
	Out    io.Writer
	Err    io.Writer
	Getenv func(string) string

	flagProfile string
	flagURL     string
	flagProject string
	flagRepo    string
	flagConfig  string
	jsonOut     bool
}

// getenv wraps App.Getenv, letting --config override AKV_CONFIG.
func (a *App) getenv(key string) string {
	if key == "AKV_CONFIG" && a.flagConfig != "" {
		return a.flagConfig
	}
	if a.Getenv == nil {
		return ""
	}
	return a.Getenv(key)
}

func (a *App) flags() config.Flags {
	return config.Flags{Profile: a.flagProfile, APIURL: a.flagURL, Project: a.flagProject, Repo: a.flagRepo}
}

func (a *App) resolve() (config.Resolved, error) {
	cfg, err := config.Load(a.getenv)
	if err != nil {
		return config.Resolved{}, err
	}
	return config.Resolve(cfg, a.flags(), a.getenv), nil
}

// client builds an authenticated API client from resolved config + token.
func (a *App) client() (*api.Client, config.Resolved, error) {
	r, err := a.resolve()
	if err != nil {
		return nil, r, err
	}
	if r.APIURL == "" {
		return nil, r, fmt.Errorf("no API URL — run `akv login --url <worker-url>` or set AKV_API_URL")
	}
	token, err := auth.Resolve(a.getenv, r.AuthStore, r.TokenFile, r.Profile)
	if err != nil {
		return nil, r, err
	}
	c, err := api.New(r.APIURL, token, r.Timeout)
	return c, r, err
}

// anonClient builds a tokenless client (for bootstrap/health).
func (a *App) anonClient(url string) (*api.Client, error) {
	if url == "" {
		r, err := a.resolve()
		if err != nil {
			return nil, err
		}
		url = r.APIURL
	}
	if url == "" {
		return nil, fmt.Errorf("provide --url or configure a profile")
	}
	return api.New(url, "", 0)
}

func (a *App) requireProject(r config.Resolved) (string, error) {
	if r.Project == "" {
		return "", fmt.Errorf("no project — pass --project, set AKV_PROJECT, or set one in your profile")
	}
	return r.Project, nil
}

// resolveRepoID maps repo/origin/auto flags to a repo id (or "" for general scope).
func (a *App) resolveRepoID(ctx context.Context, c *api.Client, projectID, repoID, origin string, auto bool) (string, error) {
	if repoID != "" {
		return repoID, nil
	}
	if origin == "" && auto {
		origin = detectGitOrigin()
	}
	if origin == "" {
		return "", nil
	}
	repos, err := c.ListRepos(ctx, projectID)
	if err != nil {
		return "", err
	}
	norm := strings.ToLower(strings.TrimSuffix(strings.TrimSpace(origin), ".git"))
	for _, r := range repos {
		if r.Origin == norm || (r.Name != "" && strings.HasSuffix(norm, "/"+r.Name)) {
			return r.ID, nil
		}
	}
	return "", fmt.Errorf("origin %q is not bound to project %s", origin, projectID)
}

func detectGitOrigin() string {
	out, err := exec.Command("git", "remote", "get-url", "origin").Output()
	if err != nil {
		return ""
	}
	return strings.TrimSpace(string(out))
}

func (a *App) emit(v any, table func()) error {
	if a.jsonOut {
		return output.JSON(a.Out, v)
	}
	table()
	return nil
}

// NewRootCommand assembles the full command tree.
func NewRootCommand(app *App) *cobra.Command {
	root := &cobra.Command{
		Use:           "akv",
		Short:         "agentic-keyvault — a secrets store your CLI and AI agents can read back",
		SilenceUsage:  true,
		SilenceErrors: true,
	}
	pf := root.PersistentFlags()
	pf.StringVar(&app.flagProfile, "profile", "", "config profile to use")
	pf.StringVar(&app.flagURL, "url", "", "Worker base URL (overrides profile)")
	pf.StringVar(&app.flagProject, "project", "", "project id (overrides profile)")
	pf.StringVar(&app.flagRepo, "repo", "", "repo id for scoping")
	pf.StringVar(&app.flagConfig, "config", "", "config file path")
	pf.BoolVar(&app.jsonOut, "json", false, "machine-readable JSON output")

	root.AddCommand(
		app.newLoginCmd(),
		app.newLogoutCmd(),
		app.newWhoAmICmd(),
		app.newBootstrapCmd(),
		app.newProjectCmd(),
		app.newRepoCmd(),
		app.newSecretCmd(),
		app.newExportCmd(),
		app.newRunCmd(),
		app.newTokenCmd(),
		app.newAuditCmd(),
		app.newKekCmd(),
		app.newCompletionCmd(root),
		app.newVersionCmd(),
	)
	return root
}

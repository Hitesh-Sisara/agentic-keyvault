package cli

import (
	"fmt"
	"io"
	"os"
	"strings"

	"github.com/spf13/cobra"
	"golang.org/x/term"

	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/api"
	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/auth"
	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/config"
)

// readToken reads a token from stdin (piped or prompted), never from argv.
func (a *App) readToken(stdinFlag bool) (string, error) {
	if stdinFlag {
		data, err := io.ReadAll(a.In)
		if err != nil {
			return "", err
		}
		return strings.TrimSpace(string(data)), nil
	}
	if f, ok := a.In.(*os.File); ok && term.IsTerminal(int(f.Fd())) {
		fmt.Fprint(a.Err, "Token: ")
		b, err := term.ReadPassword(int(f.Fd()))
		fmt.Fprintln(a.Err)
		return strings.TrimSpace(string(b)), err
	}
	data, err := io.ReadAll(a.In)
	if err != nil {
		return "", err
	}
	return strings.TrimSpace(string(data)), nil
}

func (a *App) saveProfileToken(url, store, tokenFile, profile, token string) error {
	if profile == "" {
		profile = "default"
	}
	cfg, err := config.Load(a.getenv)
	if err != nil {
		return err
	}
	p := cfg.Profiles[profile]
	if url != "" {
		p.APIURL = url
	}
	p.AuthStore = store
	if tokenFile != "" {
		p.TokenFile = tokenFile
	}
	cfg.Profiles[profile] = p
	cfg.ActiveProfile = profile
	cfg.Version = 1
	if err := config.Save(a.getenv, cfg); err != nil {
		return err
	}
	return auth.Store(store, tokenFile, profile, token)
}

func (a *App) newLoginCmd() *cobra.Command {
	var store, tokenFile string
	var stdin bool
	cmd := &cobra.Command{
		Use:   "login",
		Short: "save the Worker URL and an access token (token via stdin or prompt)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			if a.flagURL == "" {
				return fmt.Errorf("--url is required")
			}
			token, err := a.readToken(stdin)
			if err != nil {
				return err
			}
			if token == "" {
				return fmt.Errorf("empty token")
			}
			profile := a.flagProfile
			if profile == "" {
				profile = "default"
			}
			if err := a.saveProfileToken(a.flagURL, store, tokenFile, profile, token); err != nil {
				return err
			}
			c, err := api.New(a.flagURL, token, 0)
			if err != nil {
				return err
			}
			if _, err := c.WhoAmI(cmd.Context()); err != nil {
				return fmt.Errorf("token saved but validation failed: %w", err)
			}
			fmt.Fprintf(a.Err, "✓ logged in (profile %q)\n", profile)
			return nil
		},
	}
	cmd.Flags().StringVar(&store, "store", "keyring", "token store: keyring|file")
	cmd.Flags().StringVar(&tokenFile, "token-file", "", "token file path (for --store file)")
	cmd.Flags().BoolVar(&stdin, "token-stdin", false, "read token from stdin instead of prompting")
	return cmd
}

func (a *App) newLogoutCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "logout",
		Short: "remove the stored token for the active profile",
		RunE: func(_ *cobra.Command, _ []string) error {
			r, err := a.resolve()
			if err != nil {
				return err
			}
			if err := auth.Delete(r.AuthStore, r.TokenFile, r.Profile); err != nil {
				return err
			}
			fmt.Fprintln(a.Err, "✓ logged out")
			return nil
		},
	}
}

func (a *App) newWhoAmICmd() *cobra.Command {
	return &cobra.Command{
		Use:   "whoami",
		Short: "show the calling token's scope and permissions",
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, _, err := a.client()
			if err != nil {
				return err
			}
			who, err := c.WhoAmI(cmd.Context())
			if err != nil {
				return err
			}
			return a.emit(who, func() {
				scope := who.TokenType
				if who.Project != "" {
					scope += " · project " + who.Project
				}
				if who.CanWrite {
					scope += " · write"
				} else {
					scope += " · read-only"
				}
				fmt.Fprintln(a.Out, scope)
			})
		},
	}
}

func (a *App) newBootstrapCmd() *cobra.Command {
	var store, tokenFile string
	cmd := &cobra.Command{
		Use:   "bootstrap",
		Short: "create the first admin token (one-time; needs ALLOW_BOOTSTRAP=true)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			if a.flagURL == "" {
				return fmt.Errorf("--url is required")
			}
			c, err := a.anonClient(a.flagURL)
			if err != nil {
				return err
			}
			minted, err := c.Bootstrap(cmd.Context())
			if err != nil {
				return err
			}
			profile := a.flagProfile
			if profile == "" {
				profile = "default"
			}
			if err := a.saveProfileToken(a.flagURL, store, tokenFile, profile, minted.Token); err != nil {
				return err
			}
			fmt.Fprintln(a.Err, "✓ admin token created and stored (shown once):")
			fmt.Fprintln(a.Out, minted.Token)
			return nil
		},
	}
	cmd.Flags().StringVar(&store, "store", "keyring", "token store: keyring|file")
	cmd.Flags().StringVar(&tokenFile, "token-file", "", "token file path (for --store file)")
	return cmd
}

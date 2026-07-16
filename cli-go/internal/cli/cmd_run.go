package cli

import (
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/runner"
)

// childEnv builds the subprocess environment: inherited env minus this CLI's
// own credentials, plus the injected secrets (secrets win on conflict).
func childEnv(parent []string, secrets map[string]string) []string {
	stripped := map[string]bool{"AKV_TOKEN": true, "AKV_TOKEN_FILE": true}
	out := make([]string, 0, len(parent)+len(secrets))
	for _, kv := range parent {
		eq := strings.IndexByte(kv, '=')
		if eq > 0 && stripped[kv[:eq]] {
			continue
		}
		if eq > 0 {
			if _, ok := secrets[kv[:eq]]; ok {
				continue // secret overrides inherited value
			}
		}
		out = append(out, kv)
	}
	for k, v := range secrets {
		out = append(out, k+"="+v)
	}
	return out
}

func (a *App) newRunCmd() *cobra.Command {
	var origin string
	var auto bool
	cmd := &cobra.Command{
		Use:   "run [scope flags] -- <program> [args...]",
		Short: "run a command with the scope's env secrets injected (no shell)",
		RunE: func(cmd *cobra.Command, args []string) error {
			dash := cmd.ArgsLenAtDash()
			if dash < 0 || dash >= len(args) {
				return fmt.Errorf("provide the command after `--`, e.g. akv run -- node server.js")
			}
			argv := args[dash:]

			c, r, err := a.client()
			if err != nil {
				return err
			}
			project, err := a.requireProject(r)
			if err != nil {
				return err
			}
			repoID, err := a.scopeArgs(cmd.Context(), c, project, origin, auto)
			if err != nil {
				return err
			}
			opts := listOptsForRepo(repoID)
			opts.EnvOnly = true
			items, err := c.ExportSecrets(cmd.Context(), project, opts)
			if err != nil {
				return err
			}
			secrets := make(map[string]string, len(items))
			for _, it := range items {
				secrets[it.Name] = it.Value
			}

			code, err := runner.Run(cmd.Context(), childEnv(os.Environ(), secrets), argv, os.Stdin, os.Stdout, os.Stderr)
			if err != nil {
				return err
			}
			if code != 0 {
				os.Exit(code)
			}
			return nil
		},
	}
	addScopeFlags(cmd, &origin, &auto)
	return cmd
}

package cli

import (
	"context"
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/api"
)

// scopeArgs resolves the repo id from --origin/--auto (plus persistent --repo).
func (a *App) scopeArgs(ctx context.Context, c *api.Client, project, origin string, auto bool) (string, error) {
	return a.resolveRepoID(ctx, c, project, a.flagRepo, origin, auto)
}

func addScopeFlags(cmd *cobra.Command, origin *string, auto *bool) {
	cmd.Flags().StringVar(origin, "origin", "", "git origin bound to the project")
	cmd.Flags().BoolVar(auto, "auto", false, "use the current git repo's origin")
}

func (a *App) newSecretCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "secret", Short: "manage secrets"}
	cmd.AddCommand(
		a.secretPut(),
		a.secretGet(),
		a.secretList(),
		a.secretVersions(),
		a.secretRotate(),
		a.secretDelete(),
	)
	return cmd
}

func (a *App) secretPut() *cobra.Command {
	var origin, fromFile, desc string
	var auto, stdin, isEnv bool
	cmd := &cobra.Command{
		Use:   "put <name>",
		Short: "create a secret or add a new version (value via stdin/--from-file/prompt)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
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
			value, err := a.readSecretValue(stdin, fromFile)
			if err != nil {
				return err
			}
			meta, err := c.SetSecret(cmd.Context(), api.SetSecretInput{
				ProjectID: project, RepoID: repoID, Name: args[0], Value: value, IsEnv: isEnv, Description: desc,
			})
			if err != nil {
				return err
			}
			return a.emit(meta, func() {
				fmt.Fprintf(a.Out, "✓ %s saved (version %d)\n", meta.Name, meta.CurrentVersion)
			})
		},
	}
	addScopeFlags(cmd, &origin, &auto)
	cmd.Flags().BoolVar(&stdin, "stdin", false, "read value from stdin")
	cmd.Flags().StringVar(&fromFile, "from-file", "", "read value from a file")
	cmd.Flags().BoolVar(&isEnv, "env", false, "mark as an environment variable")
	cmd.Flags().StringVar(&desc, "desc", "", "description")
	return cmd
}

func (a *App) secretGet() *cobra.Command {
	var origin string
	var auto bool
	var versionN int
	cmd := &cobra.Command{
		Use:   "get <name>",
		Short: "print a secret value (pipeable)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
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
			id, err := a.resolveSecretID(cmd.Context(), c, project, repoID, args[0])
			if err != nil {
				return err
			}
			if versionN > 0 {
				val, err := c.GetSecretVersion(cmd.Context(), id, versionN)
				if err != nil {
					return err
				}
				fmt.Fprintln(a.Out, val)
				return nil
			}
			sv, err := c.GetSecret(cmd.Context(), id)
			if err != nil {
				return err
			}
			fmt.Fprintln(a.Out, sv.Value)
			return nil
		},
	}
	addScopeFlags(cmd, &origin, &auto)
	cmd.Flags().IntVar(&versionN, "version", 0, "fetch a specific version")
	return cmd
}

func (a *App) secretList() *cobra.Command {
	var general, envOnly bool
	cmd := &cobra.Command{
		Use:   "list",
		Short: "list secrets in a scope (metadata only)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, r, err := a.client()
			if err != nil {
				return err
			}
			project, err := a.requireProject(r)
			if err != nil {
				return err
			}
			opts := api.ListSecretsOpts{EnvOnly: envOnly}
			if general {
				opts.RepoSet, opts.Repo = true, "none"
			} else if a.flagRepo != "" {
				opts.RepoSet, opts.Repo = true, a.flagRepo
			}
			list, err := c.ListSecrets(cmd.Context(), project, opts)
			if err != nil {
				return err
			}
			return a.emit(list, func() {
				rows := make([][]string, 0, len(list))
				for _, s := range list {
					env := ""
					if s.IsEnv == 1 {
						env = "yes"
					}
					rows = append(rows, []string{s.Name, itoa(s.CurrentVersion), env, s.ID})
				}
				table(a, []string{"NAME", "V", "ENV", "ID"}, rows)
			})
		},
	}
	cmd.Flags().BoolVar(&general, "general", false, "only general (repo-less) secrets")
	cmd.Flags().BoolVar(&envOnly, "env", false, "only environment secrets")
	return cmd
}

func (a *App) secretVersions() *cobra.Command {
	var origin string
	var auto bool
	cmd := &cobra.Command{
		Use:   "versions <name>",
		Short: "show version history",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
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
			id, err := a.resolveSecretID(cmd.Context(), c, project, repoID, args[0])
			if err != nil {
				return err
			}
			vs, err := c.ListVersions(cmd.Context(), id)
			if err != nil {
				return err
			}
			return a.emit(vs, func() {
				rows := make([][]string, 0, len(vs))
				for _, v := range vs {
					rows = append(rows, []string{itoa(v.Version), itoa(v.KekVersion), v.Comment})
				}
				table(a, []string{"VERSION", "KEK", "COMMENT"}, rows)
			})
		},
	}
	addScopeFlags(cmd, &origin, &auto)
	return cmd
}

func (a *App) secretRotate() *cobra.Command {
	var origin, fromFile string
	var auto, stdin bool
	cmd := &cobra.Command{
		Use:   "rotate <name>",
		Short: "set a new value as the current version",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
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
			id, err := a.resolveSecretID(cmd.Context(), c, project, repoID, args[0])
			if err != nil {
				return err
			}
			value, err := a.readSecretValue(stdin, fromFile)
			if err != nil {
				return err
			}
			meta, err := c.Rotate(cmd.Context(), id, value, "rotate")
			if err != nil {
				return err
			}
			return a.emit(meta, func() {
				fmt.Fprintf(a.Out, "✓ %s rotated (version %d)\n", args[0], meta.CurrentVersion)
			})
		},
	}
	addScopeFlags(cmd, &origin, &auto)
	cmd.Flags().BoolVar(&stdin, "stdin", false, "read value from stdin")
	cmd.Flags().StringVar(&fromFile, "from-file", "", "read value from a file")
	return cmd
}

func (a *App) secretDelete() *cobra.Command {
	var origin string
	var auto bool
	cmd := &cobra.Command{
		Use:   "delete <name>",
		Short: "delete a secret (versions are retained server-side)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
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
			id, err := a.resolveSecretID(cmd.Context(), c, project, repoID, args[0])
			if err != nil {
				return err
			}
			if err := c.DeleteSecret(cmd.Context(), id); err != nil {
				return err
			}
			fmt.Fprintf(a.Err, "✓ %s deleted\n", args[0])
			return nil
		},
	}
	addScopeFlags(cmd, &origin, &auto)
	return cmd
}

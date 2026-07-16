package cli

import (
	"fmt"
	"strconv"

	"github.com/spf13/cobra"

	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/config"
)

func (a *App) newProjectCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "project", Short: "manage projects"}

	create := &cobra.Command{
		Use:   "create <name>",
		Short: "create a project",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, _, err := a.client()
			if err != nil {
				return err
			}
			desc, _ := cmd.Flags().GetString("desc")
			p, err := c.CreateProject(cmd.Context(), args[0], desc)
			if err != nil {
				return err
			}
			return a.emit(p, func() {
				fmt.Fprintf(a.Out, "✓ created %s\n  id:   %s\n  slug: %s\n", p.Name, p.ID, p.Slug)
			})
		},
	}
	create.Flags().String("desc", "", "description")

	list := &cobra.Command{
		Use:   "list",
		Short: "list projects",
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, _, err := a.client()
			if err != nil {
				return err
			}
			ps, err := c.ListProjects(cmd.Context())
			if err != nil {
				return err
			}
			return a.emit(ps, func() {
				rows := make([][]string, 0, len(ps))
				for _, p := range ps {
					rows = append(rows, []string{p.ID, p.Name, p.Slug})
				}
				table(a, []string{"ID", "NAME", "SLUG"}, rows)
			})
		},
	}

	use := &cobra.Command{
		Use:   "use <projectId>",
		Short: "set the active project for the current profile",
		Args:  cobra.ExactArgs(1),
		RunE: func(_ *cobra.Command, args []string) error {
			cfg, err := config.Load(a.getenv)
			if err != nil {
				return err
			}
			name := a.flagProfile
			if name == "" {
				name = cfg.ActiveProfile
			}
			if name == "" {
				name = "default"
			}
			p := cfg.Profiles[name]
			p.Project = args[0]
			cfg.Profiles[name] = p
			if err := config.Save(a.getenv, cfg); err != nil {
				return err
			}
			fmt.Fprintf(a.Err, "✓ active project for profile %q → %s\n", name, args[0])
			return nil
		},
	}

	cmd.AddCommand(create, list, use)
	return cmd
}

func (a *App) newRepoCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "repo", Short: "manage repo bindings"}

	add := &cobra.Command{
		Use:   "add [origin]",
		Short: "bind a git origin to the project (defaults to current repo's origin)",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, r, err := a.client()
			if err != nil {
				return err
			}
			project, err := a.requireProject(r)
			if err != nil {
				return err
			}
			origin := ""
			if len(args) == 1 {
				origin = args[0]
			} else {
				origin = detectGitOrigin()
			}
			if origin == "" {
				return fmt.Errorf("no origin given and not inside a git repo")
			}
			repo, err := c.BindRepo(cmd.Context(), project, origin)
			if err != nil {
				return err
			}
			return a.emit(repo, func() {
				fmt.Fprintf(a.Out, "✓ bound %s → %s\n  repo id: %s\n", repo.Origin, project, repo.ID)
			})
		},
	}

	list := &cobra.Command{
		Use:   "list",
		Short: "list repos bound to the project",
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, r, err := a.client()
			if err != nil {
				return err
			}
			project, err := a.requireProject(r)
			if err != nil {
				return err
			}
			repos, err := c.ListRepos(cmd.Context(), project)
			if err != nil {
				return err
			}
			return a.emit(repos, func() {
				rows := make([][]string, 0, len(repos))
				for _, rp := range repos {
					rows = append(rows, []string{rp.ID, rp.Origin, rp.Provider})
				}
				table(a, []string{"ID", "ORIGIN", "PROVIDER"}, rows)
			})
		},
	}

	cmd.AddCommand(add, list)
	return cmd
}

// itoa is a tiny helper for building table cells.
func itoa(n int) string { return strconv.Itoa(n) }

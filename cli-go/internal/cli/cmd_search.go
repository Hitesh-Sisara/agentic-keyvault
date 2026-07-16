package cli

import (
	"fmt"

	"github.com/spf13/cobra"
)

func (a *App) newSearchCmd() *cobra.Command {
	var types string
	cmd := &cobra.Command{
		Use:   "search <query>",
		Short: "search projects, repos, and secret names (metadata only)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, _, err := a.client()
			if err != nil {
				return err
			}
			res, err := c.Search(cmd.Context(), args[0], types)
			if err != nil {
				return err
			}
			return a.emit(res, func() {
				for _, p := range res.Projects {
					fmt.Fprintf(a.Out, "project  %s  %s\n", p.ID, p.Name)
				}
				for _, r := range res.Repos {
					fmt.Fprintf(a.Out, "repo     %s  %s\n", r.ID, r.Origin)
				}
				for _, s := range res.Secrets {
					fmt.Fprintf(a.Out, "secret   %s  %s\n", s.ID, s.Name)
				}
				if len(res.Projects)+len(res.Repos)+len(res.Secrets) == 0 {
					fmt.Fprintln(a.Out, "(no matches)")
				}
			})
		},
	}
	cmd.Flags().StringVar(&types, "type", "project,repo,secret", "comma-separated: project,repo,secret")
	return cmd
}

package cli

import (
	"fmt"
	"time"

	"github.com/spf13/cobra"

	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/api"
)

func (a *App) newTokenCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "token", Short: "manage access tokens (admin)"}

	create := &cobra.Command{
		Use:   "create <name>",
		Short: "mint a token (admin unless --project given)",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			admin, _ := cmd.Flags().GetBool("admin")
			project, _ := cmd.Flags().GetString("token-project")
			write, _ := cmd.Flags().GetBool("write")
			if !admin && project == "" {
				return fmt.Errorf("specify --admin or --token-project <id>")
			}
			c, _, err := a.client()
			if err != nil {
				return err
			}
			scope := "project"
			if admin {
				scope = "admin"
			}
			minted, err := c.MintToken(cmd.Context(), api.MintTokenInput{
				Name: args[0], Scope: scope, ProjectID: project, CanWrite: write,
			})
			if err != nil {
				return err
			}
			return a.emit(minted, func() {
				fmt.Fprintf(a.Err, "✓ minted %s token (shown once):\n", minted.Scope)
				fmt.Fprintln(a.Out, minted.Token)
			})
		},
	}
	create.Flags().Bool("admin", false, "mint an admin token")
	create.Flags().String("token-project", "", "restrict to a project")
	create.Flags().Bool("write", false, "allow writes (project tokens are read-only by default)")

	list := &cobra.Command{
		Use:   "list",
		Short: "list tokens",
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, _, err := a.client()
			if err != nil {
				return err
			}
			ts, err := c.ListTokens(cmd.Context())
			if err != nil {
				return err
			}
			return a.emit(ts, func() {
				rows := make([][]string, 0, len(ts))
				for _, t := range ts {
					w := ""
					if t.CanWrite == 1 {
						w = "yes"
					}
					rev := ""
					if t.Revoked == 1 {
						rev = "yes"
					}
					rows = append(rows, []string{t.ID, t.Name, t.Scope, w, rev})
				}
				table(a, []string{"ID", "NAME", "SCOPE", "WRITE", "REVOKED"}, rows)
			})
		},
	}

	revoke := &cobra.Command{
		Use:   "revoke <id>",
		Short: "revoke a token",
		Args:  cobra.ExactArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			c, _, err := a.client()
			if err != nil {
				return err
			}
			if err := c.RevokeToken(cmd.Context(), args[0]); err != nil {
				return err
			}
			fmt.Fprintf(a.Err, "✓ revoked %s\n", args[0])
			return nil
		},
	}

	exchange := &cobra.Command{
		Use:   "exchange",
		Short: "mint a short-lived, least-privilege child token (<=15m)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			project, _ := cmd.Flags().GetString("token-project")
			write, _ := cmd.Flags().GetBool("write")
			ttl, _ := cmd.Flags().GetInt("ttl")
			c, r, err := a.client()
			if err != nil {
				return err
			}
			if project == "" {
				project = r.Project
			}
			child, err := c.ExchangeToken(cmd.Context(), api.ExchangeInput{Project: project, CanWrite: write, TTLSeconds: ttl})
			if err != nil {
				return err
			}
			return a.emit(child, func() {
				fmt.Fprintf(a.Err, "✓ child token for project %s (write=%v), expires in %ds:\n", child.Project, child.CanWrite, ttl)
				fmt.Fprintln(a.Out, child.Token)
			})
		},
	}
	exchange.Flags().String("token-project", "", "project to scope to (defaults to active project)")
	exchange.Flags().Bool("write", false, "request write (only granted if the caller can write)")
	exchange.Flags().Int("ttl", 900, "lifetime in seconds (60-900)")

	cmd.AddCommand(create, list, revoke, exchange)
	return cmd
}

func (a *App) newAuditCmd() *cobra.Command {
	var limit int
	cmd := &cobra.Command{
		Use:   "audit",
		Short: "show recent audit log (admin)",
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, _, err := a.client()
			if err != nil {
				return err
			}
			entries, err := c.Audit(cmd.Context(), limit)
			if err != nil {
				return err
			}
			return a.emit(entries, func() {
				rows := make([][]string, 0, len(entries))
				for _, e := range entries {
					ts := time.UnixMilli(e.CreatedAt).UTC().Format("2006-01-02 15:04:05")
					rows = append(rows, []string{ts, e.Action, e.TargetID})
				}
				table(a, []string{"TIME", "ACTION", "TARGET"}, rows)
			})
		},
	}
	cmd.Flags().IntVar(&limit, "limit", 50, "max entries")
	return cmd
}

func (a *App) newKekCmd() *cobra.Command {
	cmd := &cobra.Command{Use: "kek", Short: "master key management (admin)"}
	rotate := &cobra.Command{
		Use:   "rotate",
		Short: "re-wrap all data keys to the active KEK version",
		RunE: func(cmd *cobra.Command, _ []string) error {
			c, _, err := a.client()
			if err != nil {
				return err
			}
			n, err := c.RotateKek(cmd.Context())
			if err != nil {
				return err
			}
			fmt.Fprintf(a.Err, "✓ re-wrapped %d secret version(s) to the active KEK\n", n)
			return nil
		},
	}
	cmd.AddCommand(rotate)
	return cmd
}

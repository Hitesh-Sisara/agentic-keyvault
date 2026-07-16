package cli

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"strings"

	"github.com/spf13/cobra"

	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/api"
)

func parseDotenv(data []byte) ([]api.BulkItem, error) {
	var items []api.BulkItem
	for _, raw := range strings.Split(string(data), "\n") {
		line := strings.TrimSpace(raw)
		if line == "" || strings.HasPrefix(line, "#") {
			continue
		}
		eq := strings.IndexByte(line, '=')
		if eq < 1 {
			continue
		}
		key := strings.TrimSpace(strings.TrimPrefix(line[:eq], "export "))
		val := strings.TrimSpace(line[eq+1:])
		if len(val) >= 2 && (val[0] == '"' && val[len(val)-1] == '"' || val[0] == '\'' && val[len(val)-1] == '\'') {
			val = strings.ReplaceAll(val[1:len(val)-1], `\"`, `"`)
		}
		items = append(items, api.BulkItem{Name: key, Value: val, IsEnv: true})
	}
	return items, nil
}

func (a *App) newImportCmd() *cobra.Command {
	var origin, format, onConflict string
	var auto bool
	cmd := &cobra.Command{
		Use:   "import [file]",
		Short: "bulk-import env secrets from a .env or JSON file",
		Args:  cobra.MaximumNArgs(1),
		RunE: func(cmd *cobra.Command, args []string) error {
			path := ".env"
			if len(args) == 1 {
				path = args[0]
			}
			data, err := os.ReadFile(path)
			if err != nil {
				return err
			}

			var items []api.BulkItem
			switch format {
			case "json":
				var m map[string]string
				if err := json.Unmarshal(data, &m); err != nil {
					return fmt.Errorf("parse json: %w", err)
				}
				for k, v := range m {
					items = append(items, api.BulkItem{Name: k, Value: v, IsEnv: true})
				}
			default:
				items, err = parseDotenv(data)
				if err != nil {
					return err
				}
			}
			if len(items) == 0 {
				return fmt.Errorf("no secrets found in %s", path)
			}

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

			if onConflict == "skip" || onConflict == "fail" {
				items, err = a.applyConflictPolicy(cmd.Context(), c, project, repoID, items, onConflict)
				if err != nil {
					return err
				}
			}
			if len(items) == 0 {
				fmt.Fprintln(a.Err, "nothing to import (all skipped)")
				return nil
			}

			results, err := c.BulkSet(cmd.Context(), api.BulkSetInput{
				ProjectID: project, RepoID: repoID, Items: items,
			}, randomKey())
			if err != nil {
				return err
			}
			return a.emit(results, func() {
				fmt.Fprintf(a.Out, "✓ imported %d secret(s)\n", len(results))
			})
		},
	}
	addScopeFlags(cmd, &origin, &auto)
	cmd.Flags().StringVar(&format, "format", "dotenv", "input format: dotenv|json")
	cmd.Flags().StringVar(&onConflict, "on-conflict", "overwrite", "overwrite|skip|fail")
	return cmd
}

// applyConflictPolicy filters/validates items against existing secret names.
func (a *App) applyConflictPolicy(ctx context.Context, c *api.Client, project, repoID string, items []api.BulkItem, policy string) ([]api.BulkItem, error) {
	existing, err := c.ListSecrets(ctx, project, listOptsForRepo(repoID))
	if err != nil {
		return nil, err
	}
	have := map[string]bool{}
	for _, s := range existing {
		have[s.Name] = true
	}
	var out []api.BulkItem
	for _, it := range items {
		if have[it.Name] {
			if policy == "fail" {
				return nil, fmt.Errorf("secret %q already exists (--on-conflict fail)", it.Name)
			}
			continue // skip
		}
		out = append(out, it)
	}
	return out, nil
}

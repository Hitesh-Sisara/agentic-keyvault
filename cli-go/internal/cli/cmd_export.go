package cli

import (
	"encoding/json"
	"fmt"
	"os"
	"regexp"
	"strings"

	"github.com/spf13/cobra"
)

var envQuoteNeeded = regexp.MustCompile(`[\s"'#=]`)

func dotenvQuote(v string) string {
	if envQuoteNeeded.MatchString(v) {
		return `"` + strings.ReplaceAll(v, `"`, `\"`) + `"`
	}
	return v
}

// yamlQuote emits a double-quoted YAML scalar (safe for any string value).
func yamlQuote(v string) string {
	v = strings.ReplaceAll(v, `\`, `\\`)
	v = strings.ReplaceAll(v, `"`, `\"`)
	v = strings.ReplaceAll(v, "\n", `\n`)
	return `"` + v + `"`
}

func (a *App) newExportCmd() *cobra.Command {
	var origin, format, out string
	var auto bool
	cmd := &cobra.Command{
		Use:   "export",
		Short: "export a scope's env secrets (dotenv|json) to stdout or a file",
		RunE: func(cmd *cobra.Command, _ []string) error {
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

			var rendered string
			switch format {
			case "dotenv", "env", "":
				var b strings.Builder
				for _, it := range items {
					fmt.Fprintf(&b, "%s=%s\n", it.Name, dotenvQuote(it.Value))
				}
				rendered = b.String()
			case "json":
				m := map[string]string{}
				for _, it := range items {
					m[it.Name] = it.Value
				}
				buf, _ := json.MarshalIndent(m, "", "  ")
				rendered = string(buf) + "\n"
			case "yaml", "yml":
				var b strings.Builder
				for _, it := range items {
					fmt.Fprintf(&b, "%s: %s\n", it.Name, yamlQuote(it.Value))
				}
				rendered = b.String()
			default:
				return fmt.Errorf("unknown --format %q (use dotenv|json|yaml)", format)
			}

			if out == "" {
				fmt.Fprint(a.Out, rendered)
				return nil
			}
			if _, err := os.Stat(out); err == nil {
				return fmt.Errorf("refusing to overwrite existing file %q", out)
			}
			if err := os.WriteFile(out, []byte(rendered), 0o600); err != nil {
				return err
			}
			fmt.Fprintf(a.Err, "✓ wrote %d secret(s) to %s\n", len(items), out)
			return nil
		},
	}
	addScopeFlags(cmd, &origin, &auto)
	cmd.Flags().StringVar(&format, "format", "dotenv", "output format: dotenv|json|yaml")
	cmd.Flags().StringVar(&out, "out", "", "write to a file (0600, refuses overwrite) instead of stdout")
	return cmd
}

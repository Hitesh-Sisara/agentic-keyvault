package cli

import (
	"fmt"

	"github.com/spf13/cobra"

	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/version"
)

func (a *App) newVersionCmd() *cobra.Command {
	return &cobra.Command{
		Use:   "version",
		Short: "print version information",
		RunE: func(_ *cobra.Command, _ []string) error {
			fmt.Fprintln(a.Out, version.String())
			return nil
		},
	}
}

func (a *App) newCompletionCmd(root *cobra.Command) *cobra.Command {
	return &cobra.Command{
		Use:       "completion [bash|zsh|fish|powershell]",
		Short:     "generate shell completion script",
		Args:      cobra.MatchAll(cobra.ExactArgs(1), cobra.OnlyValidArgs),
		ValidArgs: []string{"bash", "zsh", "fish", "powershell"},
		RunE: func(cmd *cobra.Command, args []string) error {
			switch args[0] {
			case "bash":
				return root.GenBashCompletionV2(a.Out, true)
			case "zsh":
				return root.GenZshCompletion(a.Out)
			case "fish":
				return root.GenFishCompletion(a.Out, true)
			case "powershell":
				return root.GenPowerShellCompletionWithDesc(a.Out)
			}
			return fmt.Errorf("unsupported shell %q", args[0])
		},
	}
}

package cli

import (
	"fmt"
	"strings"

	"github.com/spf13/cobra"

	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/selfupdate"
	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/version"
)

func (a *App) newUpgradeCmd() *cobra.Command {
	var check bool
	cmd := &cobra.Command{
		Use:   "upgrade",
		Short: "update akv to the latest GitHub release",
		RunE: func(cmd *cobra.Command, _ []string) error {
			tag, assetURL, err := selfupdate.Latest(cmd.Context())
			if err != nil {
				return err
			}
			latest := strings.TrimPrefix(tag, "v")
			if latest == version.Version {
				fmt.Fprintf(a.Err, "already on the latest version (%s)\n", version.Version)
				return nil
			}
			if check {
				fmt.Fprintf(a.Out, "current: %s\nlatest:  %s\n", version.Version, latest)
				return nil
			}
			if assetURL == "" {
				return fmt.Errorf("no downloadable asset for this platform; latest is %s", latest)
			}
			fmt.Fprintf(a.Err, "upgrading %s → %s …\n", version.Version, latest)
			if err := selfupdate.Apply(cmd.Context(), assetURL); err != nil {
				return err
			}
			fmt.Fprintf(a.Err, "✓ upgraded to %s\n", latest)
			return nil
		},
	}
	cmd.Flags().BoolVar(&check, "check", false, "only check for a newer version")
	return cmd
}

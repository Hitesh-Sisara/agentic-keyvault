// Package version holds build metadata, set via -ldflags at release time.
package version

import "fmt"

var (
	Version = "dev"
	Commit  = "none"
	Date    = "unknown"
)

func String() string {
	return fmt.Sprintf("akv %s (commit %s, built %s)", Version, Commit, Date)
}

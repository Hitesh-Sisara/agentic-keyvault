// Package output renders command results as human tables or stable JSON.
// Secret values are never rendered in tables.
package output

import (
	"encoding/json"
	"fmt"
	"io"
	"text/tabwriter"
)

// JSON writes v as indented JSON followed by a newline.
func JSON(w io.Writer, v any) error {
	enc := json.NewEncoder(w)
	enc.SetIndent("", "  ")
	return enc.Encode(v)
}

// Table writes a simple aligned table. Empty rows print "(none)".
func Table(w io.Writer, headers []string, rows [][]string) {
	if len(rows) == 0 {
		fmt.Fprintln(w, "(none)")
		return
	}
	tw := tabwriter.NewWriter(w, 0, 2, 2, ' ', 0)
	for i, h := range headers {
		if i > 0 {
			fmt.Fprint(tw, "\t")
		}
		fmt.Fprint(tw, h)
	}
	fmt.Fprintln(tw)
	for _, row := range rows {
		for i, cell := range row {
			if i > 0 {
				fmt.Fprint(tw, "\t")
			}
			fmt.Fprint(tw, cell)
		}
		fmt.Fprintln(tw)
	}
	_ = tw.Flush()
}

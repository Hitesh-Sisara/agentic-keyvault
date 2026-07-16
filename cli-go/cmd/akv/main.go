// Command akv is the agentic-keyvault command-line client.
package main

import (
	"context"
	"errors"
	"fmt"
	"os"
	"os/signal"
	"syscall"

	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/api"
	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/cli"
)

func main() {
	ctx, stop := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stop()

	app := &cli.App{
		In:     os.Stdin,
		Out:    os.Stdout,
		Err:    os.Stderr,
		Getenv: os.Getenv,
	}
	root := cli.NewRootCommand(app)

	if err := root.ExecuteContext(ctx); err != nil {
		fmt.Fprintln(os.Stderr, "error:", err)
		var ae *api.APIError
		if errors.As(err, &ae) {
			os.Exit(exitCodeFor(ae.Status))
		}
		os.Exit(1)
	}
}

// exitCodeFor maps API status classes to stable exit codes.
func exitCodeFor(status int) int {
	switch {
	case status == 401 || status == 403:
		return 3 // auth/permission
	case status == 404:
		return 4 // not found
	case status >= 500:
		return 5 // server
	default:
		return 1
	}
}

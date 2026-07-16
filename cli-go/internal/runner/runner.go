// Package runner executes a subprocess with injected secret env vars.
// It never uses a shell (no `sh -c`) and forwards signals + exit codes.
package runner

import (
	"context"
	"errors"
	"os"
	"os/exec"
	"os/signal"
	"syscall"
)

// Run executes argv[0] with argv[1:] and the given environment, forwarding
// stdio and signals. It returns the child's exit code.
func Run(ctx context.Context, env, argv []string, stdin *os.File, stdout, stderr *os.File) (int, error) {
	if len(argv) == 0 {
		return 1, errors.New("no command given after --")
	}

	cmd := exec.CommandContext(ctx, argv[0], argv[1:]...)
	cmd.Env = env
	cmd.Stdin = stdin
	cmd.Stdout = stdout
	cmd.Stderr = stderr

	if err := cmd.Start(); err != nil {
		return 1, err
	}

	// Forward common termination signals to the child.
	sigc := make(chan os.Signal, 1)
	signal.Notify(sigc, os.Interrupt, syscall.SIGTERM)
	defer signal.Stop(sigc)
	go func() {
		for s := range sigc {
			_ = cmd.Process.Signal(s)
		}
	}()

	err := cmd.Wait()
	if err == nil {
		return 0, nil
	}
	var exitErr *exec.ExitError
	if errors.As(err, &exitErr) {
		return exitErr.ExitCode(), nil
	}
	return 1, err
}

package cli

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"errors"
	"fmt"
	"os"
	"os/exec"
	"sort"
	"strings"
	"time"

	"github.com/spf13/cobra"

	"github.com/Hitesh-Sisara/agentic-keyvault/cli-go/internal/runner"
)

// childEnv builds the subprocess environment: inherited env minus this CLI's
// own credentials, plus the injected secrets (secrets win on conflict).
func childEnv(parent []string, secrets map[string]string) []string {
	stripped := map[string]bool{"AKV_TOKEN": true, "AKV_TOKEN_FILE": true}
	out := make([]string, 0, len(parent)+len(secrets))
	for _, kv := range parent {
		eq := strings.IndexByte(kv, '=')
		if eq > 0 && stripped[kv[:eq]] {
			continue
		}
		if eq > 0 {
			if _, ok := secrets[kv[:eq]]; ok {
				continue // secret overrides inherited value
			}
		}
		out = append(out, kv)
	}
	for k, v := range secrets {
		out = append(out, k+"="+v)
	}
	return out
}

func hashSecrets(secrets map[string]string) string {
	keys := make([]string, 0, len(secrets))
	for k := range secrets {
		keys = append(keys, k)
	}
	sort.Strings(keys)
	h := sha256.New()
	for _, k := range keys {
		h.Write([]byte(k))
		h.Write([]byte{0})
		h.Write([]byte(secrets[k]))
		h.Write([]byte{0})
	}
	return hex.EncodeToString(h.Sum(nil))
}

func (a *App) newRunCmd() *cobra.Command {
	var origin string
	var auto, watch bool
	var interval time.Duration
	cmd := &cobra.Command{
		Use:   "run [scope flags] -- <program> [args...]",
		Short: "run a command with the scope's env secrets injected (no shell)",
		RunE: func(cmd *cobra.Command, args []string) error {
			dash := cmd.ArgsLenAtDash()
			if dash < 0 || dash >= len(args) {
				return fmt.Errorf("provide the command after `--`, e.g. akv run -- node server.js")
			}
			argv := args[dash:]

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

			fetch := func(ctx context.Context) (map[string]string, error) {
				opts := listOptsForRepo(repoID)
				opts.EnvOnly = true
				items, err := c.ExportSecrets(ctx, project, opts)
				if err != nil {
					return nil, err
				}
				m := make(map[string]string, len(items))
				for _, it := range items {
					m[it.Name] = it.Value
				}
				return m, nil
			}

			if watch {
				return a.runWatch(cmd.Context(), fetch, argv, interval)
			}

			secrets, err := fetch(cmd.Context())
			if err != nil {
				return err
			}
			code, err := runner.Run(cmd.Context(), childEnv(os.Environ(), secrets), argv, os.Stdin, os.Stdout, os.Stderr)
			if err != nil {
				return err
			}
			if code != 0 {
				os.Exit(code)
			}
			return nil
		},
	}
	addScopeFlags(cmd, &origin, &auto)
	cmd.Flags().BoolVar(&watch, "watch", false, "restart the command when secrets change")
	cmd.Flags().DurationVar(&interval, "interval", 15*time.Second, "poll interval for --watch")
	return cmd
}

// runWatch runs argv, polling for secret changes and restarting on change.
func (a *App) runWatch(ctx context.Context, fetch func(context.Context) (map[string]string, error), argv []string, interval time.Duration) error {
	var cur *exec.Cmd
	var done chan error

	start := func(secrets map[string]string) {
		if cur != nil && cur.Process != nil {
			_ = cur.Process.Kill()
			<-done
		}
		child := exec.Command(argv[0], argv[1:]...)
		child.Env = childEnv(os.Environ(), secrets)
		child.Stdin, child.Stdout, child.Stderr = os.Stdin, os.Stdout, os.Stderr
		done = make(chan error, 1)
		if err := child.Start(); err != nil {
			done <- err
			return
		}
		cur = child
		go func(cc *exec.Cmd) { done <- cc.Wait() }(child)
	}

	secrets, err := fetch(ctx)
	if err != nil {
		return err
	}
	last := hashSecrets(secrets)
	start(secrets)

	ticker := time.NewTicker(interval)
	defer ticker.Stop()
	for {
		select {
		case werr := <-done:
			return childExit(werr)
		case <-ctx.Done():
			if cur != nil && cur.Process != nil {
				_ = cur.Process.Kill()
			}
			return ctx.Err()
		case <-ticker.C:
			s, ferr := fetch(ctx)
			if ferr != nil {
				fmt.Fprintln(a.Err, "watch: fetch error:", ferr)
				continue
			}
			if h := hashSecrets(s); h != last {
				last = h
				fmt.Fprintln(a.Err, "↻ secrets changed — restarting")
				start(s)
			}
		}
	}
}

func childExit(werr error) error {
	if werr == nil {
		return nil
	}
	var exitErr *exec.ExitError
	if errors.As(werr, &exitErr) {
		os.Exit(exitErr.ExitCode())
	}
	return werr
}

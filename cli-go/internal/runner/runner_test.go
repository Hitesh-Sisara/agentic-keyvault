package runner

import (
	"context"
	"io"
	"os"
	"strconv"
	"testing"
)

// TestHelperProcess is re-executed as the child under test.
func TestHelperProcess(t *testing.T) {
	if os.Getenv("GO_WANT_HELPER_PROCESS") != "1" {
		return
	}
	// Print a marker so the parent can verify env injection, then exit.
	_, _ = io.WriteString(os.Stdout, "API_KEY="+os.Getenv("API_KEY"))
	code, _ := strconv.Atoi(os.Getenv("HELPER_EXIT"))
	os.Exit(code)
}

func runHelper(t *testing.T, env []string) (string, int) {
	t.Helper()
	pr, pw, err := os.Pipe()
	if err != nil {
		t.Fatal(err)
	}
	argv := []string{os.Args[0], "-test.run=TestHelperProcess"}
	childEnv := append(os.Environ(), env...)

	code, err := Run(context.Background(), childEnv, argv, nil, pw, pw)
	pw.Close()
	if err != nil {
		t.Fatalf("Run error: %v", err)
	}
	out, _ := io.ReadAll(pr)
	return string(out), code
}

func TestRunInjectsEnvAndPropagatesExit(t *testing.T) {
	out, code := runHelper(t, []string{"GO_WANT_HELPER_PROCESS=1", "API_KEY=injected-value", "HELPER_EXIT=0"})
	if code != 0 {
		t.Errorf("exit code = %d, want 0", code)
	}
	if !contains(out, "API_KEY=injected-value") {
		t.Errorf("child did not see injected env; out=%q", out)
	}
}

func TestRunPropagatesNonZeroExit(t *testing.T) {
	_, code := runHelper(t, []string{"GO_WANT_HELPER_PROCESS=1", "HELPER_EXIT=7"})
	if code != 7 {
		t.Errorf("exit code = %d, want 7", code)
	}
}

func TestRunNoCommand(t *testing.T) {
	if _, err := Run(context.Background(), nil, nil, nil, os.Stdout, os.Stderr); err == nil {
		t.Error("expected error for empty argv")
	}
}

func contains(s, sub string) bool {
	for i := 0; i+len(sub) <= len(s); i++ {
		if s[i:i+len(sub)] == sub {
			return true
		}
	}
	return false
}

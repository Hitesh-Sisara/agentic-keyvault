// Package selfupdate updates the running akv binary from GitHub Releases.
// Stdlib-only: no external updater dependency.
package selfupdate

import (
	"archive/tar"
	"archive/zip"
	"compress/gzip"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"runtime"
	"strings"
	"time"
)

const releasesAPI = "https://api.github.com/repos/Hitesh-Sisara/agentic-keyvault/releases/latest"

type asset struct {
	Name string `json:"name"`
	URL  string `json:"browser_download_url"`
}

type release struct {
	TagName string  `json:"tag_name"`
	Assets  []asset `json:"assets"`
}

// Latest returns the newest release tag and the asset matching this OS/arch.
func Latest(ctx context.Context) (tag string, assetURL string, err error) {
	client := &http.Client{Timeout: 30 * time.Second}
	req, _ := http.NewRequestWithContext(ctx, "GET", releasesAPI, nil)
	req.Header.Set("Accept", "application/vnd.github+json")
	resp, err := client.Do(req)
	if err != nil {
		return "", "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return "", "", fmt.Errorf("github releases: status %d", resp.StatusCode)
	}
	var rel release
	if err := json.NewDecoder(resp.Body).Decode(&rel); err != nil {
		return "", "", err
	}

	ext := ".tar.gz"
	if runtime.GOOS == "windows" {
		ext = ".zip"
	}
	suffix := fmt.Sprintf("_%s_%s%s", runtime.GOOS, runtime.GOARCH, ext)
	for _, a := range rel.Assets {
		if strings.HasSuffix(a.Name, suffix) {
			return rel.TagName, a.URL, nil
		}
	}
	return rel.TagName, "", fmt.Errorf("no release asset for %s/%s", runtime.GOOS, runtime.GOARCH)
}

// Apply downloads the asset, extracts the akv binary, and atomically replaces
// the currently running executable.
func Apply(ctx context.Context, assetURL string) error {
	client := &http.Client{Timeout: 5 * time.Minute}
	req, _ := http.NewRequestWithContext(ctx, "GET", assetURL, nil)
	resp, err := client.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != 200 {
		return fmt.Errorf("download: status %d", resp.StatusCode)
	}

	tmp, err := os.CreateTemp("", "akv-dl-*")
	if err != nil {
		return err
	}
	tmpPath := tmp.Name()
	defer os.Remove(tmpPath)
	if _, err := io.Copy(tmp, resp.Body); err != nil {
		tmp.Close()
		return err
	}
	tmp.Close()

	binName := "akv"
	if runtime.GOOS == "windows" {
		binName = "akv.exe"
	}
	newBin, err := extractBinary(tmpPath, binName)
	if err != nil {
		return err
	}
	defer os.Remove(newBin)

	return replaceExecutable(newBin)
}

func extractBinary(archivePath, binName string) (string, error) {
	if strings.HasSuffix(archivePath, ".zip") || runtime.GOOS == "windows" {
		return extractZip(archivePath, binName)
	}
	return extractTarGz(archivePath, binName)
}

func writeExtracted(r io.Reader) (string, error) {
	out, err := os.CreateTemp("", "akv-bin-*")
	if err != nil {
		return "", err
	}
	defer out.Close()
	if _, err := io.Copy(out, r); err != nil {
		return "", err
	}
	if err := os.Chmod(out.Name(), 0o755); err != nil {
		return "", err
	}
	return out.Name(), nil
}

func extractTarGz(path, binName string) (string, error) {
	f, err := os.Open(path)
	if err != nil {
		return "", err
	}
	defer f.Close()
	gz, err := gzip.NewReader(f)
	if err != nil {
		return "", err
	}
	defer gz.Close()
	tr := tar.NewReader(gz)
	for {
		hdr, err := tr.Next()
		if err == io.EOF {
			break
		}
		if err != nil {
			return "", err
		}
		if filepath.Base(hdr.Name) == binName {
			return writeExtracted(tr)
		}
	}
	return "", fmt.Errorf("%s not found in archive", binName)
}

func extractZip(path, binName string) (string, error) {
	zr, err := zip.OpenReader(path)
	if err != nil {
		return "", err
	}
	defer zr.Close()
	for _, zf := range zr.File {
		if filepath.Base(zf.Name) == binName {
			rc, err := zf.Open()
			if err != nil {
				return "", err
			}
			defer rc.Close()
			return writeExtracted(rc)
		}
	}
	return "", fmt.Errorf("%s not found in archive", binName)
}

func replaceExecutable(newBin string) error {
	exe, err := os.Executable()
	if err != nil {
		return err
	}
	exe, err = filepath.EvalSymlinks(exe)
	if err != nil {
		return err
	}

	// Copy into the target directory first (rename across filesystems fails).
	staged := exe + ".new"
	if err := copyFile(newBin, staged); err != nil {
		return err
	}

	if runtime.GOOS == "windows" {
		_ = os.Rename(exe, exe+".old")
		return os.Rename(staged, exe)
	}
	return os.Rename(staged, exe)
}

func copyFile(src, dst string) error {
	in, err := os.Open(src)
	if err != nil {
		return err
	}
	defer in.Close()
	out, err := os.OpenFile(dst, os.O_CREATE|os.O_WRONLY|os.O_TRUNC, 0o755)
	if err != nil {
		return err
	}
	if _, err := io.Copy(out, in); err != nil {
		out.Close()
		return err
	}
	return out.Close()
}

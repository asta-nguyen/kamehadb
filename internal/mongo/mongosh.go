package mongo

import (
	"fmt"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"strings"
	"sync"
)

// Port of lib/mongosh.ts — resolve a local mongosh, else a bundled install
// under the data dir, else auto-install via npm (single-flight).

const mongoshInstallDirName = "tools/mongosh"

var exeSuffixes = []string{""}

func init() {
	if runtime.GOOS == "windows" {
		exeSuffixes = []string{"", ".exe", ".cmd"}
	}
}

// Command is the TS MongoshCommand — program plus leading args (used when
// the resolved binary is a .js script run through node).
type Command struct {
	Program    string
	ArgsPrefix []string
}

var (
	installMu     sync.Mutex
	installResult *Command
	installErr    error
	installing    bool
	installDone   chan struct{}
)

// ResolveMongosh mirrors resolveMongoshCommand: PATH → bundled → npm install.
func ResolveMongosh(dataDir string) (*Command, error) {
	if cmd := findMongoshOnPath(); cmd != nil {
		return cmd, nil
	}
	if cmd := findBundledMongosh(dataDir); cmd != nil {
		return cmd, nil
	}
	return installBundledMongosh(dataDir)
}

func executable(path string) bool {
	info, err := os.Stat(path)
	return err == nil && !info.IsDir() && info.Mode()&0o111 != 0
}

func fileExists(path string) bool {
	_, err := os.Stat(path)
	return err == nil
}

func findMongoshOnPath() *Command {
	if path := os.Getenv("PATH"); path != "" {
		for _, dir := range filepath.SplitList(path) {
			for _, suffix := range exeSuffixes {
				candidate := filepath.Join(dir, "mongosh"+suffix)
				if executable(candidate) {
					return &Command{Program: candidate}
				}
			}
		}
	}
	candidates := append([]string{
		"/opt/homebrew/bin/mongosh",
		"/usr/local/bin/mongosh",
	}, versionedMongoBinCandidates("/opt/homebrew/opt")...)
	candidates = append(candidates, versionedMongoBinCandidates("/usr/local/opt")...)
	for _, c := range candidates {
		if executable(c) {
			return &Command{Program: c}
		}
	}
	return nil
}

func versionedMongoBinCandidates(root string) []string {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var out []string
	for i := len(entries) - 1; i >= 0; i-- { // reverse, like the TS .reverse()
		e := entries[i]
		if strings.HasPrefix(e.Name(), "mongodb") || strings.HasPrefix(e.Name(), "mongosh") {
			out = append(out, filepath.Join(root, e.Name(), "bin", "mongosh"))
		}
	}
	return out
}

func bundledInstallDir(dataDir string) string {
	if dataDir == "" {
		dataDir = os.TempDir()
	}
	return filepath.Join(dataDir, mongoshInstallDirName)
}

func findBundledMongosh(dataDir string) *Command {
	baseDir := bundledInstallDir(dataDir)
	direct := []string{
		filepath.Join(baseDir, "node_modules", ".bin", "mongosh"),
		filepath.Join(baseDir, "node_modules", ".bin", "mongosh.cmd"),
		filepath.Join(baseDir, "node_modules", "mongosh", "bin", "mongosh"),
	}
	for _, c := range direct {
		if fileExists(c) {
			return &Command{Program: c}
		}
	}
	jsCandidate := filepath.Join(baseDir, "node_modules", "mongosh", "bin", "mongosh.js")
	if fileExists(jsCandidate) {
		if node := findExecutable("node"); node != "" {
			return &Command{Program: node, ArgsPrefix: []string{jsCandidate}}
		}
	}
	return nil
}

func installBundledMongosh(dataDir string) (*Command, error) {
	// Single-flight: one npm install at a time, concurrent callers share it.
	installMu.Lock()
	if installing {
		done := installDone
		installMu.Unlock()
		<-done
		installMu.Lock()
		res, err := installResult, installErr
		installMu.Unlock()
		return res, err
	}
	installing = true
	installDone = make(chan struct{})
	installMu.Unlock()

	res, err := doInstall(dataDir)

	installMu.Lock()
	installResult, installErr = res, err
	installing = false
	close(installDone)
	installMu.Unlock()
	return res, err
}

func doInstall(dataDir string) (*Command, error) {
	baseDir := bundledInstallDir(dataDir)
	if err := os.MkdirAll(baseDir, 0o755); err != nil {
		return nil, fmt.Errorf("mongosh is not installed and automatic install failed: %w", err)
	}
	npm, err := resolveNpmCommand()
	if err != nil {
		return nil, fmt.Errorf("mongosh is not installed and automatic install failed: %w", err)
	}
	args := append(append([]string{}, npm.ArgsPrefix...),
		"install", "mongosh", "--prefix", baseDir, "--no-package-lock", "--silent")
	cmd := exec.Command(npm.Program, args...)
	cmd.Env = append(os.Environ(), "npm_config_cache="+filepath.Join(baseDir, ".npm-cache"))
	if out, err := cmd.CombinedOutput(); err != nil {
		return nil, fmt.Errorf("mongosh is not installed and automatic install failed: %v: %s", err, strings.TrimSpace(string(out)))
	}
	installed := findBundledMongosh(dataDir)
	if installed == nil {
		return nil, fmt.Errorf("mongosh installed, but the binary could not be located")
	}
	return installed, nil
}

func resolveNpmCommand() (*Command, error) {
	if npm := findExecutable("npm"); npm != "" {
		return &Command{Program: npm}, nil
	}
	if cli := findNpmCliScript(); cli != "" {
		if node := findExecutable("node"); node != "" {
			return &Command{Program: node, ArgsPrefix: []string{cli}}, nil
		}
	}
	return nil, fmt.Errorf("npm was not found. Install Node.js/npm or install mongosh manually")
}

func findExecutable(name string) string {
	if path := os.Getenv("PATH"); path != "" {
		for _, dir := range filepath.SplitList(path) {
			for _, suffix := range exeSuffixes {
				candidate := filepath.Join(dir, name+suffix)
				if executable(candidate) {
					return candidate
				}
			}
		}
	}
	for _, c := range []string{
		"/opt/homebrew/bin/" + name,
		"/usr/local/bin/" + name,
	} {
		if executable(c) {
			return c
		}
	}
	return ""
}

func findNpmCliScript() string {
	var candidates []string
	if exe, err := os.Executable(); err == nil {
		candidates = append(candidates,
			filepath.Join(filepath.Dir(exe), "..", "lib", "node_modules", "npm", "bin", "npm-cli.js"))
	}
	candidates = append(candidates,
		"/opt/homebrew/lib/node_modules/npm/bin/npm-cli.js",
		"/usr/local/lib/node_modules/npm/bin/npm-cli.js")
	for _, c := range candidates {
		if fileExists(c) {
			return c
		}
	}
	return ""
}

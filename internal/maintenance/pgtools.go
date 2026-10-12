package maintenance

import (
	"errors"
	"os"
	"os/exec"
	"path/filepath"
	"runtime"
	"sort"
	"strconv"
	"strings"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// Port of src-tauri/src/postgres_tools/config.rs — program resolution and
// profile loading shared by the psql terminal and the backup/restore jobs.

// PostgresProfile is the resolved connection context for tool invocations.
type PostgresProfile struct {
	Host     string
	Port     int64
	Database string
	Username string
	Password string
	SSL      bool
}

// The PostgresToolError variants, as sentinel errors.
var (
	ErrMissingConnection = errors.New("The saved PostgreSQL connection was not found")
	ErrNotPostgres       = errors.New("Backup and restore are only available for PostgreSQL connections")
	ErrMissingHost       = errors.New("The saved PostgreSQL connection is missing a host")
	ErrMissingDatabase   = errors.New("The saved PostgreSQL connection is missing a database name")
	ErrMissingUsername   = errors.New("The saved PostgreSQL connection is missing a username")
)

// LoadPostgresProfile resolves a stored profile to a PostgresProfile with the
// same field validation as load_postgres_profile.
func LoadPostgresProfile(st *store.Store, connectionID string) (*PostgresProfile, error) {
	p, err := st.GetProfile(connectionID)
	if err != nil {
		return nil, err
	}
	if p == nil {
		return nil, ErrMissingConnection
	}
	if p.Kind != engines.KindPostgres {
		return nil, ErrNotPostgres
	}
	out := &PostgresProfile{Port: 5432, SSL: p.SSL}
	if p.Host != nil && *p.Host != "" {
		out.Host = *p.Host
	} else {
		return nil, ErrMissingHost
	}
	if p.Port != nil {
		out.Port = *p.Port
	}
	if p.Database != nil && *p.Database != "" {
		out.Database = *p.Database
	} else {
		return nil, ErrMissingDatabase
	}
	if p.Username != nil && *p.Username != "" {
		out.Username = *p.Username
	} else {
		return nil, ErrMissingUsername
	}
	password, err := st.GetProfilePassword(connectionID)
	if err != nil {
		return nil, err
	}
	out.Password = password
	return out, nil
}

// ResolvePostgresProgram mirrors resolve_postgres_program: absolute/relative
// paths pass through, then PATH, then the macOS Postgres install locations.
func ResolvePostgresProgram(program string) string {
	if filepath.IsAbs(program) || strings.ContainsRune(program, os.PathSeparator) {
		return program
	}
	if path, err := exec.LookPath(program); err == nil {
		return path
	}
	for _, candidate := range postgresProgramCandidates(program) {
		if info, err := os.Stat(candidate); err == nil && !info.IsDir() {
			return candidate
		}
	}
	return program
}

func postgresProgramCandidates(program string) []string {
	if runtime.GOOS == "windows" {
		return nil
	}
	candidates := []string{
		"/opt/homebrew/bin/" + program,
		"/usr/local/bin/" + program,
		"/Applications/Postgres.app/Contents/Versions/latest/bin/" + program,
	}
	for _, dir := range versionedPostgresBinDirs("/opt/homebrew/opt") {
		candidates = append(candidates, filepath.Join(dir, program))
	}
	for _, dir := range versionedPostgresBinDirs("/usr/local/opt") {
		candidates = append(candidates, filepath.Join(dir, program))
	}
	for _, dir := range postgresAppBinDirs() {
		candidates = append(candidates, filepath.Join(dir, program))
	}
	return candidates
}

// versionedPostgresBinDirs lists <root>/postgresql@<ver>/bin dirs, newest
// version first — homebrew's versioned kegs.
func versionedPostgresBinDirs(root string) []string {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	type dirVersion struct {
		path    string
		version []int
	}
	var dirs []dirVersion
	for _, entry := range entries {
		name := entry.Name()
		if !strings.HasPrefix(name, "postgresql") {
			continue
		}
		var nums []int
		for _, part := range strings.Split(strings.TrimPrefix(name, "postgresql@"), ".") {
			if n, err := strconv.Atoi(part); err == nil {
				nums = append(nums, n)
			}
		}
		dirs = append(dirs, dirVersion{filepath.Join(entry.Name(), "bin"), nums})
	}
	sort.Slice(dirs, func(i, j int) bool {
		a, b := dirs[i].version, dirs[j].version
		for k := 0; k < len(a) && k < len(b); k++ {
			if a[k] != b[k] {
				return a[k] > b[k]
			}
		}
		return len(a) > len(b)
	})
	out := make([]string, len(dirs))
	for i, d := range dirs {
		out[i] = filepath.Join(root, d.path)
	}
	return out
}

// postgresAppBinDirs lists Postgres.app version dirs, newest first.
func postgresAppBinDirs() []string {
	root := "/Applications/Postgres.app/Contents/Versions"
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	type dirVersion struct {
		path    string
		version []int
	}
	var dirs []dirVersion
	for _, entry := range entries {
		var nums []int
		for _, part := range strings.Split(entry.Name(), ".") {
			if n, err := strconv.Atoi(part); err == nil {
				nums = append(nums, n)
			}
		}
		dirs = append(dirs, dirVersion{filepath.Join(entry.Name(), "bin"), nums})
	}
	sort.Slice(dirs, func(i, j int) bool {
		a, b := dirs[i].version, dirs[j].version
		for k := 0; k < len(a) && k < len(b); k++ {
			if a[k] != b[k] {
				return a[k] > b[k]
			}
		}
		return len(a) > len(b)
	})
	out := make([]string, len(dirs))
	for i, d := range dirs {
		out[i] = filepath.Join(root, d.path)
	}
	return out
}

// ConnectionEnv mirrors connection_env — PGPASSWORD/PGSSLMODE only.
func (p *PostgresProfile) ConnectionEnv() []string {
	var env []string
	if p.Password != "" {
		env = append(env, "PGPASSWORD="+p.Password)
	}
	if p.SSL {
		env = append(env, "PGSSLMODE=require")
	}
	return env
}

// IdentifierPattern mirrors identifier_pattern — a double-quoted pg_dump
// pattern arg.
func IdentifierPattern(value string) string {
	return `"` + strings.ReplaceAll(value, `"`, `""`) + `"`
}

// CommandSpec is a resolved external tool invocation (program, args, env,
// started banner) — the Rust CommandSpec.
type CommandSpec struct {
	Program        string
	Args           []string
	Env            []string
	StartedMessage string
}

// StartBackupRequest mirrors the Tauri StartBackupRequest.
type StartBackupRequest struct {
	ConnectionID string      `json:"connectionId"`
	OutputPath   string      `json:"outputPath"`
	Format       string      `json:"format"` // plain | custom | tar
	Scope        BackupScope `json:"scope"`
}

// BackupScope mirrors the tagged enum — kind selects which field applies.
type BackupScope struct {
	Kind   string `json:"kind"` // database | schema | table
	Schema string `json:"schema,omitempty"`
	Table  string `json:"table,omitempty"`
}

// StartRestoreRequest mirrors the Tauri StartRestoreRequest.
type StartRestoreRequest struct {
	ConnectionID   string `json:"connectionId"`
	InputPath      string `json:"inputPath"`
	TargetDatabase string `json:"targetDatabase"`
	Clean          bool   `json:"clean"`
}

func (p *PostgresProfile) connectionArgs(database string) []string {
	return []string{
		"--host=" + p.Host,
		"--port=" + strconv.FormatInt(p.Port, 10),
		"--username=" + p.Username,
		"--dbname=" + database,
	}
}

// BuildBackupCommand ports build_backup_command.
func BuildBackupCommand(profile *PostgresProfile, req StartBackupRequest) CommandSpec {
	args := profile.connectionArgs(profile.Database)
	args = append(args, "--verbose", "--no-password",
		"--file="+req.OutputPath,
		"--format="+req.Format)

	var started string
	switch req.Scope.Kind {
	case "schema":
		args = append(args, "--schema="+IdentifierPattern(req.Scope.Schema))
		started = "Backing up schema " + req.Scope.Schema
	case "table":
		args = append(args, "--table="+IdentifierPattern(req.Scope.Schema)+"."+IdentifierPattern(req.Scope.Table))
		started = "Backing up table " + req.Scope.Schema + "." + req.Scope.Table
	default:
		started = "Backing up database " + profile.Database
	}
	return CommandSpec{
		Program:        ResolvePostgresProgram("pg_dump"),
		Args:           args,
		Env:            profile.ConnectionEnv(),
		StartedMessage: started,
	}
}

// BuildRestoreCommand ports build_restore_command: .sql/.psql → psql, other
// extensions → pg_restore.
func BuildRestoreCommand(profile *PostgresProfile, req StartRestoreRequest) (CommandSpec, error) {
	target := strings.TrimSpace(req.TargetDatabase)
	if target == "" {
		return CommandSpec{}, errors.New("Target database is required")
	}
	inputPath := strings.TrimSpace(req.InputPath)
	if info, err := os.Stat(inputPath); err != nil || info.IsDir() {
		return CommandSpec{}, errors.New("The selected dump file was not found")
	}

	program := "pg_restore"
	ext := strings.ToLower(strings.TrimPrefix(filepath.Ext(inputPath), "."))
	if ext == "sql" || ext == "psql" {
		program = "psql"
	}
	args := profile.connectionArgs(target)
	args = append(args, "--no-password")
	if program == "psql" {
		args = append(args, "--echo-errors", "-v", "ON_ERROR_STOP=1", "--file="+inputPath)
	} else {
		args = append(args, "--verbose")
		if req.Clean {
			args = append(args, "--clean", "--if-exists")
		}
		args = append(args, inputPath)
	}
	return CommandSpec{
		Program:        ResolvePostgresProgram(program),
		Args:           args,
		Env:            profile.ConnectionEnv(),
		StartedMessage: "Restoring into database " + target,
	}, nil
}

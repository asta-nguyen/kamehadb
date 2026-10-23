package main

import (
	"context"
	"os"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/asta-nguyen/kamehadb/internal/database"
	"github.com/asta-nguyen/kamehadb/internal/logs"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// App is the Wails application root. Bound services are registered
// alongside it in main.go so the generated bindings form one typed surface
// for the frontend.
type App struct {
	ctx   context.Context
	store *store.Store
	db    *database.DB
}

func NewApp() *App {
	return &App{}
}

func (a *App) setServices(s *store.Store, db *database.DB) {
	a.store = s
	a.db = db
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) shutdown(_ context.Context) {
	if a.db != nil {
		// Manager.Close reports provider teardown errors (including
		// constructions that finished during shutdown) — surface, don't drop.
		if err := a.db.Close(); err != nil {
			logs.Warn("app", "provider teardown reported errors: "+err.Error())
		}
	}
	if a.store != nil {
		a.store.Close()
	}
}

// FileFilter mirrors runtime.FileFilter for the dialog methods.
type FileFilter struct {
	DisplayName string `json:"displayName"`
	Pattern     string `json:"pattern"`
}

// PickSaveFile opens the native save dialog — replaces @tauri-apps/plugin-dialog's save().
func (a *App) PickSaveFile(defaultFilename, title string, filters []FileFilter) (string, error) {
	opts := wailsRuntime.SaveDialogOptions{
		DefaultFilename: defaultFilename,
		Title:           title,
	}
	for _, f := range filters {
		opts.Filters = append(opts.Filters, wailsRuntime.FileFilter{DisplayName: f.DisplayName, Pattern: f.Pattern})
	}
	return wailsRuntime.SaveFileDialog(a.ctx, opts)
}

// PickOpenFile opens the native open dialog — replaces @tauri-apps/plugin-dialog's open().
func (a *App) PickOpenFile(title string, filters []FileFilter) (string, error) {
	opts := wailsRuntime.OpenDialogOptions{Title: title}
	for _, f := range filters {
		opts.Filters = append(opts.Filters, wailsRuntime.FileFilter{DisplayName: f.DisplayName, Pattern: f.Pattern})
	}
	return wailsRuntime.OpenFileDialog(a.ctx, opts)
}

// SaveTextFile writes frontend-built export content to a destination chosen in
// the native save dialog, returning the path or "" when the user cancels.
// WebKitGTK has no download handling, so blob downloads silently do nothing.
func (a *App) SaveTextFile(defaultFilename, title, content string, filters []FileFilter) (string, error) {
	path, err := a.PickSaveFile(defaultFilename, title, filters)
	if err != nil || path == "" {
		return "", err
	}
	if err := os.WriteFile(path, []byte(content), 0o600); err != nil {
		return "", err
	}
	return path, nil
}

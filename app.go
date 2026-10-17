package main

import (
	"context"
	"os"

	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/asta-nguyen/kamehadb/internal/engines"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

// App is the Wails application root. Bound services are registered
// alongside it in main.go so the generated bindings form one typed surface
// for the frontend.
type App struct {
	ctx      context.Context
	store    *store.Store
	registry *engines.Registry
}

func NewApp() *App {
	return &App{}
}

func (a *App) setServices(s *store.Store, reg *engines.Registry) {
	a.store = s
	a.registry = reg
}

func (a *App) startup(ctx context.Context) {
	a.ctx = ctx
}

func (a *App) shutdown(_ context.Context) {
	if a.registry != nil {
		a.registry.Close()
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

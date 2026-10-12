package main

import (
	"context"
	"embed"
	"path/filepath"
	"runtime/debug"

	"github.com/wailsapp/wails/v2"
	"github.com/wailsapp/wails/v2/pkg/options"
	"github.com/wailsapp/wails/v2/pkg/options/assetserver"
	wailsRuntime "github.com/wailsapp/wails/v2/pkg/runtime"

	"github.com/asta-nguyen/kamehadb/internal/api"
	"github.com/asta-nguyen/kamehadb/internal/engines"
	_ "github.com/asta-nguyen/kamehadb/internal/engines/clickhouse"
	_ "github.com/asta-nguyen/kamehadb/internal/engines/duckdb"
	_ "github.com/asta-nguyen/kamehadb/internal/engines/mysql"
	_ "github.com/asta-nguyen/kamehadb/internal/engines/oracle"
	_ "github.com/asta-nguyen/kamehadb/internal/engines/postgres"
	_ "github.com/asta-nguyen/kamehadb/internal/engines/sqlite"
	_ "github.com/asta-nguyen/kamehadb/internal/engines/sqlserver"
	"github.com/asta-nguyen/kamehadb/internal/logs"
	"github.com/asta-nguyen/kamehadb/internal/mcp"
	"github.com/asta-nguyen/kamehadb/internal/store"
)

//go:embed all:apps/desktop/dist
var assets embed.FS

func main() {
	// Restrict Go heap target to 128MB and run GC at 50% growth to quickly
	// return unused memory pages back to the OS via MADV_DONTNEED. (How / Why / What)
	debug.SetMemoryLimit(128 * 1024 * 1024)
	debug.SetGCPercent(50)

	metadata, err := store.Open("")
	if err != nil {
		println("Error opening metadata store:", err.Error())
		return
	}
	// Log files live beside the metadata DB, like the Tauri app_data_dir/logs.
	if err := logs.Init(filepath.Dir(metadata.Path())); err != nil {
		println("Error initializing logs:", err.Error())
	}
	registry := engines.NewRegistry(metadata)

	app := NewApp()
	app.setServices(metadata, registry)
	emit := func(event string, data any) {
		if app.ctx != nil {
			wailsRuntime.EventsEmit(app.ctx, event, data)
		}
	}
	mcpRuntime, err := mcp.NewRuntime(metadata)
	if err != nil {
		logs.Error("mcp", "runtime init failed: "+err.Error())
	}
	services := api.NewServices(metadata, registry, emit, mcpRuntime)

	err = wails.Run(&options.App{
		Title:  "KamehaDB",
		Width:  1440,
		Height: 900,
		AssetServer: &assetserver.Options{
			Assets: assets,
		},
		OnStartup: func(ctx context.Context) {
			app.startup(ctx)
			services.Health.Start(ctx)
			services.Watcher.ResumeAll()
			if mcpRuntime != nil {
				mcpRuntime.Start()
			}
		},
		OnShutdown: func(ctx context.Context) {
			if mcpRuntime != nil {
				mcpRuntime.Close()
			}
			services.Watcher.StopAll()
			services.Mongo.Shutdown()
			services.Redis.Shutdown()
			services.Health.Stop()
			app.shutdown(ctx)
		},
		Bind: append([]interface{}{app}, services.Bound()...),
	})
	if err != nil {
		println("Error:", err.Error())
	}
}

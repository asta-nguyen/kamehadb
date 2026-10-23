# dbcore

Reusable, transport-independent database provider core extracted from the
KamehaDB desktop app (plan #110). `dbcore` owns the provider lifecycle and the
driver-free operation contracts; it does **not** know about Wails, the app
metadata store, HTTP routes, or any transport. It lives in the existing Go
module — it is not an independently versioned release.

## Layout

```
dbcore/
  provider.go       Provider, Factory, Config, ConfigCheck, sentinel errors
  registry.go       Registry: instance-local kind -> factory map
  manager.go        Manager: one provider entry per connection id
  capabilities.go   dbcore.SQL / dbcore.Mongo / dbcore.Redis accessors
  engines/          shared SQL contract (SQLAdapter) + kind metadata/helpers
  mongo/            driver-free mongo.Operations contract + request/result types
  redis/            driver-free redis.Operations / RequestOperations contract
  sqlsafety/        read-only SQL classification helpers
  duckdriver/       the managed DuckDB native helper protocol
  providers/<name>/ the ten live providers (postgres, mysql, sqlite, sqlserver,
                    oracle, clickhouse, duckdb, mariadb, mongo, redis)
  providers/all/    all.New: registers all ten kinds, constructs nothing
```

## Two assembly modes

**Selective.** Register only the kinds a caller needs, then either manage
providers or open uncached probes:

```go
reg := dbcore.NewRegistry()
sqlite.Register(reg)
p, err := reg.Open(ctx, engines.KindSQLite, dbcore.Config{FilePath: f})
```

`Registry.Open` is the explicit probe path: it constructs a provider on the
caller's context, caches nothing, and the **caller owns the returned provider**
and must `Close()` it.

**All-in-one.** `all.New(opts)` registers all ten live kinds without
constructing providers, connecting, or downloading anything:

```go
reg, _ := all.New(all.Options{DuckDBRuntimeDir: dirFn, DuckDBLog: logf})
m := dbcore.NewManager(loader, reg)
p, err := m.Get(ctx, connectionID, acceptConfig)
```

`Manager` resolves `Config` through a `ProfileLoader`, caches one entry per
connection id, and shares construction across concurrent waiters. The
**manager owns managed providers**: callers never `Close()` them;
`Manager.Invalidate(id)` retires one entry (cancelling in-flight construction
or closing a completed provider) and `Manager.Close()` tears everything down.
Provider `Close()` is therefore scoped per session/entry — it is not a global
runtime shutdown.

`Manager.GetWithGuard` passes the entry's exact cached or newly loaded config
to a caller-supplied guard and holds its returned release function until the
lookup finishes. The guard runs outside manager locks, so app integrations can
coordinate file opens with maintenance without reloading profiles on cache
hits.

## Capabilities

`Provider` exposes only `TestConnection` and `Close`. Family operations go
through typed accessors that return `ErrCapabilityUnsupported` on the wrong
family:

```go
sqlAdapter, err := dbcore.SQL(p)     // engines.SQLAdapter
mongoOps,  err := dbcore.Mongo(p)    // mongo.Operations
redisOps,  err := dbcore.Redis(p)    // redis.Operations
```

`redis.Operations.ForRequest` returns the per-request `RequestOperations`
(scan, key/value reads, paged value reads, commands, cursor release); request
cleanup stays request-scoped while cursor leases can outlive it.

## Errors and lifecycle

- `ErrProviderNotRegistered` — no factory for the kind.
- `ErrDuplicateProvider` — duplicate `Register`.
- `ErrProviderRetired` — the entry was invalidated or closed while waiting.
- `ErrCapabilityUnsupported` — wrong family accessor.
- A caller's context bounds only that caller's wait; the managed factory runs
  on an entry-owned context. The last canceled waiter retires unfinished
  construction. Construction failure is not cached — the next `Get` retries.
- `acceptConfig` rejects wrong-family or stale configs before any factory
  runs; when every waiter rejects, no construction happens at all.

## Execution modes and exclusions

Native Go drivers are the only SQL/MongoDB/Redis execution mode. DuckDB
additionally uses the existing managed native helper (`duckdriver`), which is
lazily initialized: `all.New` and `Manager.Get` do not spawn it, create files,
or touch its spill directory — only a real DuckDB query path does, and only
after `duckdb.ConfigureRuntime(dir, logf)` supplies the runtime directory.
Shared worker runtimes, JDBC/JRE, downloadable providers, and runtime
capability negotiation remain explicitly out of scope.

## Boundary guarantees

`dependency_boundary_test.go` enforces them mechanically: no package under
`dbcore/` imports `internal/` or Wails, and the root/contract packages
(`dbcore`, `engines`, `mongo`, `redis`, `sqlsafety`) import no concrete
driver. External consumers can depend on the contracts and fake them
interface-only. See `example_test.go` for runnable selective and all-in-one
usage.

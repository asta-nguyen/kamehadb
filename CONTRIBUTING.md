# Contributing to KamehaDB

Thanks for contributing to KamehaDB. This guide covers the expected workflow for code, documentation, and bug fixes.

## Before You Start

- Search existing issues and pull requests before starting substantial work.
- Keep changes focused on one problem or feature.
- For large features or architectural changes, open an issue first to align on scope and approach.
- Never include database credentials, API keys, local metadata databases, or other secrets in commits.

## Development Setup

Requirements:

- Node.js and pnpm
- Go and the Wails CLI (`go install github.com/wailsapp/wails/v2/cmd/wails@v2.16.0`)
- Docker for the local development databases
- Platform webview prerequisites for `wails build`/`wails dev` (on Linux: `libgtk-3` and `webkit2gtk-4.1` dev packages)

Install dependencies and start the development environment:

```bash
pnpm install
docker compose up -d
pnpm dev
```

Useful development commands:

```bash
pnpm dev:desktop   # frontend-only Vite dev server
pnpm build         # wails build → build/bin/
pnpm typecheck
pnpm lint
pnpm test          # frontend vitest
pnpm test:go       # Go backend tests
```

The `landing/` directory is managed separately with npm:

```bash
npm --prefix landing run dev
npm --prefix landing run build
npm --prefix landing run lint
```

Do not use pnpm commands to manage `landing/` dependencies.

## Repository Boundaries

- `packages/shared/src/index.ts` is the frontend-facing contract for shared schemas and types.
- `internal/` owns the Go backend: database adapters, the SQLite metadata store, Wails-bound services, MCP, and AI provider integrations.
- `apps/desktop/` owns the React desktop experience plus the generated Wails bindings in `wailsjs/`.
- `main.go`/`app.go` and `wails.json` hold the Wails entrypoint and project config.
- `landing/` is the separate marketing and documentation site.

When frontend and backend data shapes change, update the Go service signature first, regenerate bindings (`wails generate module`), and keep `packages/shared` shapes aligned.

## Making Changes

- Follow existing patterns and keep the implementation scoped to the requested behavior.
- Use explicit TypeScript types for exported functions, public APIs, and component props.
- Do not use `any`; use `unknown` and narrow it.
- Prefer shared schemas and types over duplicating data shapes.
- Add focused tests for bug fixes and behavior changes.
- Avoid unrelated refactors or formatting churn.

All user-facing changes must be added to `CHANGELOG.md` under `[Unreleased]`.

## Verification

Run checks appropriate to the change before opening a pull request.

For most workspace changes:

```bash
pnpm typecheck
pnpm --dir apps/desktop exec tsc --noEmit
pnpm test
pnpm test:go
go build ./...
```

For desktop UI changes:

```bash
pnpm --filter @kamehadb/desktop test
pnpm --filter @kamehadb/desktop build
```

For landing-site changes:

```bash
npm --prefix landing run lint
npm --prefix landing run build
```

Document any checks you could not run and why.

## Commits and Pull Requests

Commits follow Conventional Commits:

```text
feat: add connection health badges
fix: invalidate redis key cache after commands
docs: add contribution guide
```

Pull requests should:

- Explain the problem and the chosen solution.
- Keep the diff focused and free of unrelated changes.
- Include screenshots or recordings for visible UI changes.
- Include tests or a clear verification description.
- Update `CHANGELOG.md` for user-facing changes.

## Reporting Bugs

Bug reports should include:

- Steps to reproduce.
- Expected and actual behavior.
- Database engine and version.
- Operating system and KamehaDB version.
- Relevant logs or screenshots with secrets removed.

## License

By submitting a contribution, you agree that your contribution is provided under the project's [Apache-2.0 license](./LICENSE).

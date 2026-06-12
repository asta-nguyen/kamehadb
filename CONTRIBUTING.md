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
- Docker for the local development databases
- Rust and Tauri prerequisites when working on desktop packaging

Install dependencies and start the development environment:

```bash
pnpm install
docker compose up -d
pnpm dev
```

Useful development commands:

```bash
pnpm dev:desktop
pnpm dev:sidecar
pnpm build
pnpm typecheck
pnpm lint
pnpm test
```

The `landing/` directory is managed separately with npm:

```bash
npm --prefix landing run dev
npm --prefix landing run build
npm --prefix landing run lint
```

Do not use pnpm commands to manage `landing/` dependencies.

## Repository Boundaries

- `packages/shared/src/index.ts` is the source of truth for shared schemas, types, and adapter contracts.
- `apps/sidecar/` owns database adapters, HTTP routes, metadata persistence, and AI provider integrations.
- `apps/desktop/` owns the Tauri and React desktop experience.
- `packages/ui/` contains reusable workspace UI utilities and components.
- `landing/` is the separate marketing and documentation site.

When frontend and backend data shapes change, update the shared contract first and verify both consumers.

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
pnpm test
pnpm build
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

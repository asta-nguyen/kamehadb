---
mapped_at: 2026-06-27
last_mapped_commit:pending
focus: quality
---

# Code Conventions

## File Naming

- **All TypeScript files:** kebab-case (e.g., `sql-editor.tsx`, `metadata-store.ts`, `route-utils.ts`)
- **Rust files:** snake_case (e.g., `app_logs.rs`, `main.rs`)
- **Config files:** dotfiles or kebab-case (e.g., `.prettierrc`, `commitlint.config.cjs`)

## Export Conventions

- **React components:** PascalCase named exports (e.g., `export function SqlEditor()`)
- **Hooks:** `use*` prefix with camelCase (e.g., `useConnections`, `useQueryHistory`)
- **Utility functions:** camelCase (e.g., `safeErrorMessage`, `quoteSqlIdentifier`)
- **Constants:** camelCase or UPPER_SNAKE (e.g., `apiBase`, `THEME_OPTIONS`)
- **Types:** PascalCase (e.g., `WorkspaceTab`, `AppStoreState`, `ConnectionProfile`)

## TypeScript Style

- **Strict mode:** Enabled in all packages (`"strict": true`)
- **No `as any`:** ESLint enforces banning `as any` — use `unknown` with proper type narrowing
- **No `console.log`:** Banned in both sidecar and desktop via ESLint
  - Sidecar: Use pino logger (`log.info()`, `log.warn()`, `log.error()`)
  - Exception: `console.log('KAMEHADB_SIDECAR_PORT=...')` in `index.ts` with inline eslint-disable
- **No unused locals/params:** Enforced by `tsconfig.json` (`noUnusedLocals`, `noUnusedParameters`)
- **ESM modules:** `"type": "module"` in all package.json files
- **Import extensions:** Sidecar uses `.js` extensions in imports (TS ESM style); desktop uses bundler resolution (no extensions needed)
- **Path alias:** Desktop uses `@/` → `./src/` (configured in `tsconfig.json` and `vite.config.ts`)

## Prettier Configuration

```json
{
  "semi": true,
  "singleQuote": true,
  "tabWidth": 2,
  "trailingComma": "all",
  "printWidth": 120,
  "bracketSpacing": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```

## ESLint Rules

### Shared Custom Rule (`packages/shared/eslint/no-restricted-syntax.mjs`)

Uses `@ast-grep/napi` for AST-based pattern matching (handles JSX correctly).

### Sidecar Rules (`apps/sidecar/eslint.config.mjs`)

| Banned Pattern    | Message                                  |
| ----------------- | ---------------------------------------- |
| `as any`          | Use `unknown` with proper type narrowing |
| `console.log()`   | Use pino logger instead                  |
| `console.warn()`  | Use pino logger instead                  |
| `console.error()` | Use pino logger instead                  |

### Desktop Rules (`apps/desktop/eslint.config.mjs`)

| Banned Pattern  | Message                                  |
| --------------- | ---------------------------------------- |
| `as any`        | Use `unknown` with proper type narrowing |
| `console.log()` | Use proper logger or debug utility       |
| `<button>`      | Use shadcn `<Button>`                    |
| `<input>`       | Use shadcn `<Input>`                     |
| `<textarea>`    | Use shadcn `<Textarea>`                  |
| `<label>`       | Use shadcn `<Label>`                     |
| `<table>`       | Use shadcn `<Table>`                     |
| `<select>`      | Use shadcn `<Select>`                    |
| `<thead>`       | Use shadcn `<TableHeader>`               |
| `<tbody>`       | Use shadcn `<TableBody>`                 |
| `<tr>`          | Use shadcn `<TableRow>`                  |
| `<th>`          | Use shadcn `<TableHead>`                 |
| `<td>`          | Use shadcn `<TableCell>`                 |

## UI Component Conventions

- **shadcn/ui** is the component library — raw HTML elements that have shadcn equivalents are banned
- **Tailwind CSS v4** for styling (via `@tailwindcss/vite` plugin)
- **`class-variance-authority`** for variant-based component styling
- **`cnfast`** for className merging
- **`lucide-react`** for icons
- **`sonner`** for toast notifications
- **`cmdk`** for command palette

## Error Handling

### Sidecar

- **`httpError(message, statusCode)`** — Creates error with HTTP status code (`apps/sidecar/src/lib/route-utils.ts`)
- **`handleError(c, err, context)`** — Unified error handler: logs with pino, returns structured JSON `{ error, message }`
- **`safeErrorMessage(err, fallback)`** — Safe extraction from unknown error values
- **Hono `app.onError()`** — Global catch-all returning JSON (never HTML/text)
- **Status codes:** 4xx → `BAD_REQUEST`, 5xx → `INTERNAL_ERROR`

### Desktop

- **TanStack Query** handles error states in hooks
- **`error-boundary.tsx`** for React error boundaries
- **`toast`** (sonner) for user-facing error notifications
- **`app-logs.ts`** forwards frontend errors to Tauri log store

## Logging Conventions

### Sidecar (pino)

- Import: `import { log } from '../lib/logger.js';`
- Use `log.info()`, `log.warn()`, `log.error()`, `log.debug()`
- **Never use `console.log`** — ESLint enforces this
- Pino redacts sensitive fields: `password`, `secret`, `token`, `apiKey`, `authorization`, `cookie`, `connectionString` (with nested wildcards)
- Multistream: stdout + file (`${KAMEHADB_DATA_DIR}/logs/sidecar.log`)
- Request logging middleware in `index.ts` logs all HTTP requests with duration

### Desktop

- Frontend errors → `app-logs.ts` → Tauri `appendFrontendLog` → `frontend.log`
- Tauri Rust → `append_tauri_log()` → `tauri.log`
- Combined view via `readAppLogs()` Tauri command → in-app Logs page

## Git Conventions

### Commit Messages

- **Format:** Conventional Commits (`@commitlint/config-conventional`)
- **Allowed types:** `feat`, `fix`, `debug`, `chore`, `docs`, `style`, `refactor`, `perf`, `test`, `build`, `ci`, `revert`
- **Header max length:** 200 chars
- **Enforced by:** `commit-msg` hook via Husky

### Git Hooks

| Hook         | Command                          | Purpose                       |
| ------------ | -------------------------------- | ----------------------------- |
| `pre-commit` | `pnpm exec lint-staged`          | Format + lint changed files   |
| `commit-msg` | `pnpm exec commitlint --edit $1` | Enforce conventional commits  |
| `pre-push`   | `pnpm typecheck && pnpm lint`    | Type check + lint before push |

### lint-staged

- `*.{json,css,md}` → `prettier --write`
- `apps/desktop/**/*.{ts,tsx}` → `eslint --fix` + `prettier --write`
- `apps/sidecar/**/*.ts` → `eslint --fix` + `prettier --write`
- `packages/shared/**/*.ts` → `eslint --fix` + `prettier --write`
- `landing/**/*.{js,jsx,ts,tsx}` → `eslint --fix` + `prettier --write`

## State Management

- **TanStack Store** for global app state (`apps/desktop/src/store/state.ts`)
- **TanStack Query** for server state (all hooks in `apps/desktop/src/hooks/`)
- **localStorage** for persistence (tabs, active tab, theme, pinned connections)
- State mutations via exported functions (e.g., `setActiveConnection()`, `openTab()`)
- Components read state via `useStore(appStore, selector)`

## API Client Pattern

- All API calls go through `apps/desktop/src/lib/api.ts` → `api-client.ts`
- `request<T>(method, path, body?, useSidecar?, signal?)` — generic fetch wrapper
- Error handling: reads body as text first, parses JSON, throws on non-2xx
- Query keys centralized in `apps/desktop/src/lib/query-keys.ts`

## Security Conventions

- **Keyring** for credential storage (Rust `keyring` crate)
- **Pino redaction** for log sanitization
- **SQL identifier quoting** via `quoteSqlIdentifier()` to prevent injection
- **Zod validation** on all API inputs (via `@hono/zod-validator`)
- **CORS** allows all origins (local-only server on 127.0.0.1)
- **CSV injection prevention** in `apps/desktop/src/lib/export.ts` (escapes `=+\-@` prefixes)

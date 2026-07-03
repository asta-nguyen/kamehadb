---
description: Bump app version across all package files and update CHANGELOG
---

# Bump Version

This workflow updates the KamehaDB app version across all files that contain it, and updates the CHANGELOG.

## Version locations

The version string must be updated in **all** of these files (they must stay in sync):

| #   | File                                     | Field                               |
| --- | ---------------------------------------- | ----------------------------------- |
| 1   | `package.json`                           | `"version"`                         |
| 2   | `apps/desktop/package.json`              | `"version"`                         |
| 3   | `apps/sidecar/package.json`              | `"version"`                         |
| 4   | `packages/shared/package.json`           | `"version"`                         |
| 5   | `apps/desktop/src-tauri/tauri.conf.json` | `"version"`                         |
| 6   | `apps/desktop/src-tauri/Cargo.toml`      | `version = "..."` under `[package]` |

> **Note:** `landing/package.json` has its own independent version (`0.1.0`) — do NOT touch it.

## Steps

### 1. Determine the new version

Run these commands to inspect recent commits since the last version:

```bash
# Show the current version
grep '"version"' package.json | head -1

# Show commits since the last version tag
git log --oneline $(git describe --tags --abbrev=0 2>/dev/null || echo HEAD~50)..HEAD --oneline 2>/dev/null || git log --oneline -30
```

Use [Semantic Versioning](https://semver.org/) rules:

- **Patch** (e.g. `1.4.0` → `1.4.1`): bug fixes only, no new features.
- **Minor** (e.g. `1.4.0` → `1.5.0`): new features added, backward compatible.
- **Major** (e.g. `1.4.0` → `2.0.0`): breaking changes.

If the user specifies a version, use that. Otherwise, analyze the commit messages:

- Commits with `feat:` or `feat(scope):` → at least a **minor** bump.
- Commits with `fix:` or `fix(scope):` only → **patch** bump.
- Commits with `BREAKING CHANGE` or `!:` → **major** bump.

Ask the user to confirm the target version before proceeding.

### 2. Update version in all 6 files

Edit each file listed in the table above. Replace the old version string with the new one.

Example for `package.json`:

```json
"version": "1.5.0"
```

Example for `Cargo.toml`:

```toml
version = "1.5.0"
```

Example for `tauri.conf.json`:

```json
"version": "1.5.0"
```

### 3. Update CHANGELOG.md

Read `CHANGELOG.md` and find the `## [Unreleased]` section (just below the header).

Replace `## [Unreleased]` with the new version and today's date, then add a fresh `## [Unreleased]` section above it.

The format should be:

```markdown
## [Unreleased]

---

## [v1.5.0] — 2026-07-10

### Added

- **Feature name** — brief description.

### Changed

- **Change name** — brief description.

### Fixed

- **Fix name** — brief description.
```

To fill in the changelog content, analyze the git log since the previous version tag:

```bash
git log --oneline $(git describe --tags --abbrev=0 2>/dev/null)..HEAD
```

Categorize commits into:

- **Added** — `feat:` commits
- **Changed** — `refactor:`, `perf:`, or behavior-changing commits
- **Fixed** — `fix:` commits
- **Removed** — `revert:` or removal commits (if any)

Write concise, user-facing descriptions (not raw commit messages). Use the `**Feature name** — description.` pattern from existing entries.

If there are no commits in a category, omit that section entirely.

### 4. Verify

Run a quick check that all files have the same version:

```bash
# // turbo
grep -r '"1.5.0"' package.json apps/desktop/package.json apps/sidecar/package.json packages/shared/package.json apps/desktop/src-tauri/tauri.conf.json
grep 'version = "1.5.0"' apps/desktop/src-tauri/Cargo.toml
```

(Replace `1.5.0` with the actual new version.)

### 5. Summary

Present to the user:

- The old version → new version
- List of files updated
- A preview of the CHANGELOG entry
- Suggest committing with: `git add -A && git commit -m "chore: bump version to vX.Y.Z"`

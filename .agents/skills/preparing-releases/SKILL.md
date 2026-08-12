---
name: preparing-releases
description: Use when preparing, validating, tagging, or publishing a KamehaDB desktop release, including version bumps, release changelogs, release artifacts, and GitHub release workflow checks.
---

# Preparing Releases

Prepare a releasable commit first. Tag, push, and publish only with direct user instruction.

## Release checklist

1. Inspect `git status --short`, the intended diff, local/remote `v*` tags, and all six app-version files. If the worktree has unrelated changes or an existing tag conflicts with a manifest version, stop and ask for the intended release scope/version; never move or reuse an existing tag.
2. Confirm the SemVer target with the user. Use `bump-version` to update exactly `package.json`, the desktop/sidecar/shared package files, `tauri.conf.json`, and `Cargo.toml`. Never update `landing/package.json`.
3. Turn `[Unreleased]` into `vX.Y.Z` with today’s date and add a fresh `[Unreleased]`. Keep entries concise and user-facing; remove empty, duplicate, dependency-only, and internal implementation notes.
4. For new engines, major workflows, or product-description changes, update the five public surfaces in `AGENTS.md`: landing hero, landing metadata, OG card, compare screenshots, and `README.md`. Regenerate visual assets only when their source changed.
5. Verify release scope and quality:

   ```bash
   pnpm typecheck
   pnpm --filter @kamehadb/desktop test
   pnpm build
   git diff --check
   ```

   Run `cargo test --quiet` in `apps/desktop/src-tauri` after Rust/native changes. Run `npm --prefix landing run build` after landing or README changes. Confirm all six versions are identical and stage only intentional release files.

6. Request explicit approval before committing, pushing, creating `vX.Y.Z`, or triggering/publishing any release. After an explicitly authorized pushed tag, monitor `.github/workflows/release.yml`: it creates a draft release with macOS DMGs, Windows EXE/MSI, and Linux DEB/RPM. Do not expect an AppImage; publish the draft only with explicit final approval.

## Guardrails

- A release tag is immutable: correct the next version instead of force-moving an existing tag.
- A dirty worktree is not a release candidate until its unrelated changes are separated or approved.
- Do not claim a release is ready without fresh command output from the checklist.

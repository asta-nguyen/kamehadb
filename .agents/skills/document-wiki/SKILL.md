---
name: document-wiki
description: Use when a repository has no LLM wiki yet, when the wiki is only a skeleton, or when existing pages need verification against current source.
---

# Document Wiki

Create or refresh the target repository's `docs/llm/` from verified source
code. This is the one-stop wiki workflow: do not hand the user off to the
other wiki skills.

## Completion contract

An inventory of routes, files, or modules is baseline coverage, not deep
feature documentation. A selected feature is complete only when its page
explains current business behavior and its material claims are traceable to
source or tests read in the current run. Mark `[x]` only after verifying that
evidence. Use `[~]` for either a `verification limit` or a
`confirmed content gap`, state which one and why, and do not treat those states
as equivalent.
Never call unverified coverage current.

## Workflow

1. Resolve the target repository from the user's path or the current directory
   and read its root `AGENTS.md`. Compare its wiki-maintenance rules with this
   workflow. If `docs/llm/` exists, read only `docs/llm/AGENTS.md` next and
   compare its active instructions too, before opening other wiki pages. If
   either `AGENTS.md` requires reading or writing `LOG.md`, source commits,
   hashes, or snapshots, or otherwise conflicts with current-source
   verification, report the exact conflicting paths and lines. For such a
   conflict, continue without asking again when the user has already explicitly
   chosen current-source verification without a log for this task: do not read
   or write `LOG.md`, preserve the existing instructions, and report that they
   need an update. Without that user decision, stop before setup, opening
   `LOG.md`, or modifying wiki pages, and ask the user to resolve the conflict.
   If `docs/llm/` is missing after this preflight, run the repository's
   `setup-codebase` procedure inline. Preserve every existing file. Before
   writing links, follow the shared relative Markdown link rule in
   `using-devkit` (read it if it is not loaded). Link internal wiki pages
   relative to the file containing the link; do not link to process artifacts
   from `docs/llm/`. No Obsidian vault or app is required.
2. After the instruction preflight in step 1 succeeds, read `INDEX.md` and all
   existing wiki content pages. Treat the wiki as **empty** when it is missing,
   contains only the setup skeleton, or its pages still contain placeholder text
   such as `Populate this page` or `No pages yet`. If a legacy
   `docs/llm/LOG.md` exists, preserve it byte-for-byte and do not open, read, or
   use it as evidence. Scan all wiki pages for legacy `[[...]]` links. During
   this wiki pass, convert every
   resolvable internal wikilink in `docs/llm/` to a relative Markdown link,
   including links on pages whose business content is not being refreshed.
   Resolve a legacy target from the nearest ancestor containing `.obsidian/`
   when present, or from the `docs/llm/` root otherwise. Confirm the exact
   target file, then write the new link relative to the source page. This
   mechanical migration preserves page content and does not require feature
   selection. Report missing or ambiguous targets; do not claim migration is
   complete while a legacy wikilink remains. If the repository has no
   application source, report that no verified behavior exists, preserve the
   skeleton, and stop; do not create overview or feature pages from proposed
   specs or plans.
3. Build a domain map and current feature list from behavior, not filenames.
   Inspect routes, commands, scripts, workers/jobs, public APIs, manifests,
   tests, and README instructions. Use the Locate → Expand → Confirm → Read
   tool table in `read-codebase-context` (read it if it is not loaded); search
   results are navigation, and direct source is evidence. Group behavior by
   product domain such as authentication, billing, projects, or administration
   only when repository evidence establishes that boundary. For the inventory,
   inspect enough evidence to establish each user-visible behavior and entry point;
   reserve the end-to-end trace for features selected in step 6.
4. Determine coverage before writing deep feature pages. For each existing
   content page, use its `## Sources` as starting points, open the current
   source and relevant tests, and compare every material claim with that
   evidence. Trace additional callers or flow stages as needed. Continue all
   feasible checks before assigning a final status; an unchecked source or
   caller is not yet evidence of a content gap. The current working tree is
   authoritative, including uncommitted changes; file existence or Git history
   alone does not establish freshness.

   Mark `[x]` only when the page is complete and all required claims have been
   checked against current source/tests in this run. Use `[~]` with an explicit
   reason and classify each applicable cause as:
   - `verification limit` — checks remain incomplete or required evidence is
     inaccessible. State what remains unchecked and continue other feasible
     checks. This is not a refresh candidate because the page may be correct.
   - `confirmed content gap` — completed checks prove a material omission or a
     claim that contradicts source. This is a refresh candidate.

   A source change alone does not make a still-accurate page stale. Report the
   repository's **domain map** and a **feature inventory**:

   ```text
   Domain: <name> — <scope, or "not established by repository evidence">

   [ ] / [x] / [~] Feature — what a user or operator can do
       Entry: <route, command, job, or API>
       Sources: <repository paths>
       Wiki: <page or "missing">
       Reason: <verification limit and/or confirmed content gap> — <exact reason, required for [~]>
   ```

   Use `[ ]` for undocumented features, `[x]` for coverage fully verified in
   this run, and `[~]` for an existing page with a verification limit or
   confirmed content gap. Do not report only page names; the domain, feature,
   and entry point are required.

5. Create or refresh the baseline map before deep documentation. If
   `architecture/overview.md` is missing, create it. Refresh an existing
   overview only when completed current-source checks confirm a content gap or
   contradiction. If verification is blocked, keep the existing content, mark
   it `[~]` with a `verification limit` reason, and report the exact missing
   evidence. Write the smallest source-grounded page containing the repository
   purpose, major entry points, a domain table, cross-domain dependencies, and
   `## Sources`.
   Update `INDEX.md` to link this overview and list every discovered domain.
   The baseline map is automatic even for an empty wiki; it is an orientation
   page, not permission to document every feature in depth.
6. Present `[ ]` undocumented features and `[~]` features classified as
   `confirmed content gap` as selectable create/refresh candidates, grouped by
   domain. Do not offer `[~]` items whose only cause is a `verification limit`
   for rewriting. Continue feasible checks before presenting the list; if a check is
   blocked, report the exact missing evidence and ask only for the access or
   information needed, not for a rewrite decision. Do not create or refresh deep
   pages until the user selects eligible candidates; a generic request to
   document the repository is not selection. Apply this gate even when the wiki
   was empty. If the user says “all”, select all eligible candidates. Record the
   selected features and verification-limited items separately in the final report.
7. Group selected behavior into the smallest set of evidence-backed categories.
   Use only categories that have a real page to contain:

   | Category        | Use for                                                |
   | --------------- | ------------------------------------------------------ |
   | `architecture/` | Cross-cutting structure, boundaries, and API topology  |
   | `domains/`      | Domain concepts, state models, and business rules      |
   | `workflows/`    | User or operator flows across multiple components      |
   | `integrations/` | Stripe, storage, email, and other external systems     |
   | `operations/`   | Jobs, cron, deployment, maintenance, and runbooks      |
   | `decisions/`    | Source-backed architectural decisions or existing ADRs |

   A page belongs in the category that best describes its primary subject; link
   related categories instead of duplicating the page. Create a folder only
   when writing its first real page; never create placeholder folders. For
   small repositories, `architecture/`, `decisions/` and `workflows/` may be sufficient.
   When documenting or refreshing a selected feature, read
   `references/evidence-matrix-and-page-template.md` before continuing.

8. Update `docs/llm/INDEX.md` with working links. Each wiki page keeps its
   business content and a `## Sources` section containing exact source/test file
   paths. Do not create or update a source log or snapshot for wiki freshness.
   Update `docs/llm/FEATURES.md` only if that file already exists; do not create
   a second tracking system.
9. Verify that every listed source path exists as a file, every internal
   relative Markdown link resolves from the file containing it, and no legacy
   `[[...]]` links remain in `docs/llm/`. Every index link must resolve; every
   `Tests: none found` claim has a recorded search with no matching result, and
   `git diff --check` passes. For a confirmed omission or contradiction, mark
   `[~]` as `confirmed content gap` and report the source evidence. For a check
   that remains incomplete or blocked, mark `[~]` as `verification limit`, name
   the exact missing evidence, and do not offer a rewrite. Never silently repair
   claims or report unverified coverage as current. The final report must repeat
   the domain map, feature inventory, selected candidates, verification-limited
   items, baseline and deep pages documented, verified features skipped,
   unresolved evidence questions, and verification results. Never report only
   “pages updated”. For every selected feature, include the evidence matrix
   result: each row must name its exact source/test path or explicitly say that
   the repository does not establish it.

Do not modify application code, install dependencies, or invent architecture.
Do not document proposed specs or implementation plans here; `docs/llm/`
describes only verified current behavior grounded in source and tests.

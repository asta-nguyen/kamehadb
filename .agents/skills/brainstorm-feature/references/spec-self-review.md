# Spec self-review

Use `docs/agent-devkit/INDEX.md` as the process-artifact index. Link a new
change folder from `## Changes` after joint approval (legacy designs stay linked
from `## Designs`).
Follow the shared artifact naming rule in `using-devkit` (read it if it is not
loaded). Follow its shared process-artifact link and wiki-boundary rules too. A
design's `## Related context` may link only to existing `docs/llm/` pages read
during brainstorming; write `None` when there was no verified wiki context.

For a follow-up to an archived change or a completed legacy plan, require a
`## Previous work` section with relative Markdown links to the prior artifacts.
Verify that every target exists. Keep these links out of `## Related context`,
which is only for verified wiki pages.

After writing `design.md` and `delta.md`, self-review the delta: every entry has
a unique `<PREFIX>-<slug>` ID whose prefix is already registered in
`## Requirement prefixes`; an `ADDED` ID is absent from `docs/llm/` and from
`## Retired requirement IDs`; each four-backtick block is a complete
requirement; the metadata matches its section (`ADDED` has `Page:` as a path and
`Search:`; `MODIFIED` keeps the ID with `Baseline:` and `Replacement:`;
`REMOVED` has `Reason:` and `Baseline:`); and no other open change in this branch
targets the same ID. A delta only targets a page already in the
`## Requirements` format.

Every architectural spec must include a top-level `## Impact map` section from
`read-codebase-context` with these exact fields, including the source baseline:

```text
Entry: <file + symbol>
Flow: <caller → implementation → dependency>
State changes: <persistence or "none found">
External effects: <storage/job/event/email/notification or "none found">
Change candidates: <files likely to modify>
Verification: <tests/checks to run>
Verified at: <output of `git rev-parse HEAD`, or "no commit exists">
```

If the planned entry point or flow does not exist yet, keep these fields and
write `Entry: no existing source; planned entry: <design file + symbol>` and
`Flow: no existing flow; planned flow: <design flow>`. Use planned files,
effects, and verification only from the written design, labeling planned values
`pending approval` before joint approval. Label unspecified behavior
`not specified in design`. Do not invent callers or present planned files as
traced source impact; this map does not authorize implementation.

Capture `Verified at` from the repository's `HEAD` when the map is created. If
there is no commit, write `no commit exists`; consumers must re-trace existing
source. If the planned source does not exist yet, they use the source-less map
rule in `read-codebase-context` and rebuild planned fields from the written
design instead of tracing a nonexistent flow.

Flag and fix only issues that could change approved behavior, scope, plan
correctness, or execution. Do not block on wording preferences, stylistic
polish, or uneven detail that does not create ambiguity.

After writing the spec, review it with fresh eyes:

1. **Placeholder scan** — fix `TBD`, `TODO`, incomplete sections, and vague
   requirements.
2. **Internal consistency** — resolve contradictions and align architecture
   with feature descriptions.
3. **Scope check** — confirm it fits one implementation plan or decompose it.
4. **Ambiguity check** — make each requirement admit one interpretation.

Fix issues inline. Then call `plan-feature`; it writes `tasks.md` and presents
`design.md`, `tasks.md`, and any `delta.md` for one joint approval. There is no
separate chat or design-only approval, and the index link is created only after
that approval.

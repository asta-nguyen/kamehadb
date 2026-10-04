# Spec self-review

Use `docs/agent-devkit/INDEX.md` as the process-artifact index. Link every
design from `## Designs`. Follow the shared artifact naming rule in
`using-devkit` (read it if it is not loaded). Follow its shared process-artifact
link and wiki-boundary rules too. The spec's `## Related context` may link only
to existing `docs/llm/` pages read during brainstorming; write `None` when
there was no verified wiki context.

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
write `Entry: no existing source; planned entry: <approved file + symbol>` and
`Flow: no existing flow; planned flow: <approved flow>`. Use planned files,
effects, and verification only from the approved design; label unspecified
behavior `not specified in approved design`. Do not invent callers or present
planned files as traced source impact.

Capture `Verified at` from the repository's `HEAD` when the map is created. If
there is no commit, write `no commit exists`; consumers must re-trace existing
source. If the planned source does not exist yet, they use the source-less map
rule in `read-codebase-context` and rebuild planned fields from the approved
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

Fix issues inline. Then present the spec and wait for the user's approval
before creating or updating the index link; after approval, tell the user to
invoke `plan-feature`.

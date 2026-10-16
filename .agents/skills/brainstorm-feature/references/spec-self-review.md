# Spec self-review

Name the change folder per `using-devkit`'s `## Shared rules` (an issue ID only
when one is provided), index it per `## Change lifecycle`, and keep process
artifacts out of `docs/llm/`. A
design's `## Related context` may link only to existing `docs/llm/` pages read
during brainstorming; write `None` when there was no verified wiki context.

For a follow-up to an archived change or a completed legacy plan, require a
`## Previous work` section with relative Markdown links to the prior artifacts.
Verify that every target exists. Keep these links out of `## Related context`,
which is only for verified wiki pages.

After writing `design.md` and `delta.md`, self-review the delta per
`delta-format.md`'s `## Self-review`.

`design.md` has these headings, in this order: `## Goal`, `## Scope`,
`## Behavior`, `## Edge cases`, `## Interfaces`, `## Verification`, and
`## Related context`. The impact map lives only in `tasks.md`
(`plan-feature` writes it); a design carries none. Label unspecified behavior
`not specified in design`. The rule applies to designs written from now on;
older designs keep their structure.

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

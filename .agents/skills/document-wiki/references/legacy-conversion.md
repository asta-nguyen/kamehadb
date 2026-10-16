# Convert a legacy target page

Read this when a design or bug fix must write a delta against a page that still
uses `## Business rules`. It runs before the delta is written and before any code
exists; the task's named affected page is its selection. Conversion changes
format only, not behavior, so it needs no other approval.

1. Apply the instruction preflight in `SKILL.md`'s `## Workflow` step 1 and read
   the page, `docs/llm/INDEX.md`, and the page's current sources and tests.
2. Verify each existing rule against current source. If any rule cannot be
   verified, mark the page `[~]` as a `verification limit`, leave it unchanged,
   and return the exact missing evidence; the caller stops.
3. Convert the verified page per `evidence-matrix-and-page-template.md`, reusing
   or registering its prefix as `SKILL.md`'s `## Workflow` step 8 describes, and
   record any dropped ID as retired. A rule that is contradicted by source is a
   `confirmed content gap`: report it to the caller; do not silently fix it.
4. Run the checks in `SKILL.md`'s `## Verify the wiki` on the page, then return
   the new requirement IDs to the caller, which writes `delta.md` against them.

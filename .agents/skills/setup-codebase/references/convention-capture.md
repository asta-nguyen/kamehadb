# Convention capture

After the step 4 preflight finds no stored conventions, gather evidence in this
order: declared repository configuration, consistently observed code, then web
or general practice only when neither yields a signal.

Classify each candidate as declared, observed, or adopted and apply the full
admission filter:

- Keep a declared rule only with an authoritative repository-owned source that
  explicitly requires it, is not a language/framework default, and makes
  deviation violate repository behavior, a tooling contract, compatibility,
  or a documented workflow.
- Keep an observed rule only with at least two consistent in-repository paths
  in scope, no counterexample there, not a language/framework default, and a
  repository behavior, tooling contract, compatibility requirement, or
  documented workflow that deviation would violate.
- Keep an adopted rule only when the repository has no signal, it is not a
  language/framework default, and the user confirms it as policy with a named
  source and approval date.

Drop generic advice and candidates that fail the filter. If an external rule
conflicts with declared or observed repository behavior, report it as rejected
with the reason; do not persist or apply it. If no candidate passes, report
that there is no convention to record.

For each passing candidate, present its type, repository-relative scope,
evidence paths, contradictory examples checked, why it is not a
language/framework default, and approval status. Present exact lines and wait
for explicit user approval before writing. By default append one
`## Conventions` section to `AGENTS.md`; declared or observed rules include
scope and evidence paths. Add `## Adopted conventions (not yet evidenced in
code)` only when needed, with its source link and `user-approved YYYY-MM-DD`
date.

Use root `CONVENTIONS.md` only when proposed rules exceed 40 non-empty rule
lines (excluding headings and blank lines) or apply per area. In split storage,
keep exactly one pointer in `AGENTS.md`, put all rules in `CONVENTIONS.md`, use
repository-relative scopes, and never duplicate a rule. When multiple area
rules match, the most specific scope wins; report same-scope conflicts for the
user instead of resolving them silently. Create or update either file only
after approval; preserve all other existing content byte-for-byte.

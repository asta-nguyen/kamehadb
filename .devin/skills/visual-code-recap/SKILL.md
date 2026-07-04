# visual-code-recap

Turn a git branch, PR, commit, or diff into a self-contained, local HTML file with visual diagrams and line-by-line code annotations. No external services, no npm packages, no internet required.

## When to use

- User asks for a "visual recap" of a branch/PR/commit
- User wants to understand what changed and why, with visuals
- User says "explain this branch visually" or "make a visual summary"
- User wants to onboard someone to a feature branch
- User wants a code walkthrough they can open in a browser

## When NOT to use

- User just wants a quick text summary (use a normal response)
- User wants a PR description (use gh pr create)
- User wants a code review (use the review skill)
- User wants a markdown-only explanation (just write it inline)

## Parameters

The skill accepts these user preferences. Ask for any that aren't provided, or infer from context. None are required — all have sensible defaults.

### `scope` (required, but usually inferred)

What to recap. Usually obvious from the request.

- **branch** (default): compare `main...HEAD`
- **commit**: recap a specific commit hash
- **PR**: recap a PR number or `main...pr-branch`
- **tag**: recap everything between two tags

Example: `"recap the last 3 commits"`, `"recap PR #42"`, `"recap commit abc1234"`

### `unfamiliar_languages` (optional, but ASK if unsure)

Languages the user is NOT comfortable with. Controls which language primer sections to generate and which concept callouts to add to annotations.

- **Default**: none (assume user knows all languages in the repo)
- **How to ask**: "Are there any languages in the codebase you're not familiar with? I'll add beginner explanations for those."
- **Effect**: For each listed language, generates a primer cheat sheet section AND adds "Language concept" callouts to every annotated code block.

Example: `"I'm new to Rust"`, `"I know Python but not Go"`, `"explain TypeScript parts like I'm a backend dev"`

### `focus` (optional)

Which layer(s) to emphasize. Controls annotation depth.

- **all** (default): equal depth across all layers
- **backend**: deeper annotations on server/native code, lighter on frontend
- **frontend**: deeper annotations on UI code, lighter on backend
- **specific files**: user names specific files they care about most

Example: `"focus on the Rust backend"`, `"I mostly care about the React components"`, `"skip the lock files and config"`

### `depth` (optional)

How detailed the annotations should be.

- **line-by-line** (default): annotate every highlighted line range with what + why
- **high-level**: one annotation per file, no line-by-line breakdown
- **exhaustive**: line-by-line + language concepts + edge cases + alternatives considered

Example: `"just give me the high-level picture"`, `"go deep on every file"`

### `sections` (optional)

Which sections to include or skip. Default: all sections included.

- **include**: list of section names to include (others skipped)
- **exclude**: list of section names to skip
- Available sections: `architecture`, `dataflow`, `wireframes`, `commands`, `filetree`, `primer`, `code`, `state`, `tests`, `deps`, `e2e`

Example: `"skip the wireframes and state machine"`, `"just architecture and code"`, `"no tests section"`

### `output` (optional)

Output format.

- **html** (default): self-contained HTML file, opened in browser
- **markdown**: single .md file with ASCII diagrams instead of CSS visuals
- **both**: HTML for visuals + MD for text search

Example: `"give me markdown instead"`, `"I want both HTML and markdown"`

### `notes` (optional, free-text)

Any other preferences the user states. Pass-through — the agent incorporates these into the recap.

- Things to highlight or call out specifically
- Audience considerations ("this is for a junior dev", "this is for a tech lead review")
- Comparison requests ("compare how this handles X vs the old approach")

Example: `"highlight any security implications"`, `"this is for onboarding a new team member"`, `"call out anything that might break in production"`

## How to collect parameters

When the skill is invoked, check the user's message for any of these parameters. If critical ones are missing (especially `unfamiliar_languages`), ask BEFORE generating:

> "Before I generate the recap — are there any languages in the codebase you're not familiar with? I'll add beginner-friendly explanations for those."

Do NOT ask about parameters that have sensible defaults. Only ask when the answer would materially change the output. Specifically:

- ALWAYS ask about `unfamiliar_languages` if the repo uses 2+ languages and the user hasn't stated their background — this is the highest-impact parameter
- Ask about `focus` only if the branch is large (20+ files) and spans multiple layers
- Never ask about `output`, `depth`, or `sections` — use defaults unless the user specifies

## What it produces

A single `.html` file in the repo root, named `<branch-name>-recap.html`. Self-contained: all CSS is inline, no external dependencies, no JavaScript frameworks. Opens in any browser via `xdg-open`.

If `output=markdown` or `output=both`, also produces a `.md` file with the same content in text form.

## Token-efficient workflow (JSON + script + git extraction)

**CRITICAL: Do NOT write HTML directly. Do NOT paste code into the JSON.**

The agent writes a compact JSON spec (file paths + line ranges + annotations only), then a Python script reads the actual code from git and renders the full HTML. This cuts token consumption by ~85% compared to writing HTML directly, and ~70% compared to putting code in the JSON.

**The agent never outputs code.** It only outputs:

- File paths (e.g., `"apps/desktop/src-tauri/src/session.rs"`)
- Git refs (e.g., `"5d3b1a9"` or `"HEAD"`)
- Line ranges (e.g., `"line_start": 14, "line_end": 25`)
- Annotations (line refs + labels + explanations)
- Diagram specs (architecture, data flow, state machine)

The script does the rest: reads code from git, renders HTML, applies CSS, handles tab switching.

### Step 1: Identify the changes

```bash
# For a branch: compare against main
git log --oneline main..HEAD
git diff --numstat main...HEAD

# For a specific commit:
git show --stat <commit>
git diff <commit>~1..<commit> --numstat

# For a PR:
git diff main...HEAD --numstat
```

Record: total files, total insertions/deletions, commit hash, branch name.

### Step 2: Read ALL changed files

Read every file that was changed. Do not skip "trivial" files — the user asked for all files. For each file:

- If it's a new file: read the full content
- If it's a modified file: read the diff (`git diff main...HEAD -- <file>`)
- If it's a lock file: note it but don't read line by line

Categorize files into layers:

- Backend layer (Rust, Go, Python, etc.)
- Frontend layer (React, Vue, etc.)
- Bridge/IPC layer (Tauri commands, API clients, etc.)
- Shared types / contracts
- Tests
- Config / dependencies
- Docs / lock files

### Step 3: Write a compact JSON spec file

Write a JSON file to `/tmp/<branch-name>-recap.json`. **Do NOT include code in the JSON** — use `git_ref` + `file_path` + `line_start`/`line_end` to tell the script where to read code from.

**Minimal JSON spec (git-based, ~3-5K tokens for 28 files):**

```json
{
  "title": "feat/branch-name — Visual Recap",
  "subtitle": "One-paragraph summary",
  "repo_path": ".",
  "sections": [
    {
      "type": "stats",
      "items": [
        { "value": "28", "label": "Files" },
        { "value": "abc1234", "label": "Commit" }
      ]
    },
    {
      "type": "callout",
      "callout_type": "decision",
      "title": "Key decision: ...",
      "body": "Why. <strong>HTML ok</strong>."
    },
    {
      "type": "toc",
      "items": [
        { "ref": "arch", "text": "1. Architecture" },
        { "ref": "rust", "text": "2. Rust code" }
      ]
    },
    { "type": "heading", "level": 2, "text": "Architecture", "id": "arch" },
    {
      "type": "architecture",
      "layers": [
        { "label": "Frontend", "boxes": [{ "class": "react", "name": "Comp", "desc": "desc" }], "arrow": "↓ IPC" },
        { "label": "Backend", "boxes": [{ "class": "rust", "name": "mod", "desc": "desc" }] }
      ]
    },
    { "type": "heading", "level": 2, "text": "Data flow", "id": "flow" },
    {
      "type": "data-flow",
      "steps": [
        { "num": "1", "title": "Action", "detail": "detail" },
        { "num": "2", "title": "Response", "detail": "detail", "direction": "output" }
      ]
    },
    { "type": "heading", "level": 2, "text": "Wireframes", "id": "wf" },
    {
      "type": "wireframe",
      "label": "After",
      "sidebar": [{ "label": "conn", "active": true }],
      "tabs": [{ "label": "Tab", "active": true }],
      "terminal": "output here"
    },
    { "type": "heading", "level": 2, "text": "Commands", "id": "cmd" },
    {
      "type": "command-table",
      "headers": ["Command", "Dir", "Purpose"],
      "rows": [[{ "code": "cmd_name" }, { "text": "JS→Rust" }, { "text": "desc" }]]
    },
    { "type": "heading", "level": 2, "text": "File tree", "id": "tree" },
    {
      "type": "file-tree",
      "entries": [
        { "name": "src/", "dir": true, "indent": 0 },
        { "name": "file.rs", "indent": 1, "badge": "add", "note": "desc" }
      ]
    },
    { "type": "heading", "level": 2, "text": "Rust primer", "id": "primer" },
    {
      "type": "primer",
      "title": "Rust cheat sheet",
      "entries": [
        { "syntax": "<span class='kw'>let mut</span>", "explanation": "mutable var" },
        { "syntax": "<span class='kw'>?</span>", "explanation": "error propagation" }
      ],
      "concepts": [{ "label": "Ownership", "note": "One owner, auto-freed." }]
    },
    { "type": "heading", "level": 2, "text": "Rust code", "id": "rust" },
    {
      "type": "tabbed-code",
      "id": "rust-tabs",
      "tabs": [
        {
          "label": "session.rs",
          "file_path": "apps/desktop/src-tauri/src/terminal_sessions/session.rs",
          "git_ref": "abc1234",
          "lang": "Rust",
          "line_start": 14,
          "line_end": 25,
          "annotations": [
            { "lines": "Line 14-18", "label": "Handles", "note": "3 Arc<Mutex> handles." },
            {
              "lines": "Rust concept",
              "label": "Arc<Mutex<T>>",
              "note": "Shared mutable state.",
              "type": "lang-concept"
            }
          ]
        },
        {
          "label": "mod.rs",
          "file_path": "apps/desktop/src-tauri/src/postgres_psql/mod.rs",
          "git_ref": "abc1234",
          "lang": "Rust",
          "line_start": 1,
          "line_end": 30,
          "annotations": [{ "lines": "Line 1", "label": "Tauri command", "note": "Callable from React." }]
        }
      ]
    },
    { "type": "heading", "level": 2, "text": "Diffs", "id": "diffs" },
    {
      "type": "tabbed-code",
      "id": "diff-tabs",
      "tabs": [
        {
          "label": "App.tsx",
          "file_path": "apps/desktop/src/App.tsx",
          "git_base": "main",
          "git_head": "HEAD",
          "lang": "Diff",
          "annotations": [{ "lines": "Line 15", "label": "New import", "note": "Added component." }]
        }
      ]
    },
    { "type": "heading", "level": 2, "text": "State machine", "id": "state" },
    {
      "type": "state-machine",
      "rows": [
        { "nodes": [{ "state": "idle", "label": "Idle" }], "arrow": "→", "arrow_label": "click" },
        { "nodes": [{ "state": "running", "label": "Running" }], "arrow": "→", "arrow_label": "close" },
        { "nodes": [{ "state": "closed", "label": "Closed" }] }
      ]
    }
  ],
  "footer": { "lines": ["Branch: x | Commit: abc1234"] }
}
```

**Key difference from before:** Code blocks use `file_path` + `git_ref` instead of `code`. The script runs `git show <ref>:<path>` to read the code. For diffs, use `git_base` + `git_head` instead.

### Step 4: Run the script

```bash
python3 .devin/skills/visual-code-recap/generate-recap.py /tmp/<branch-name>-recap.json <branch-name>-recap.html
```

The script is self-contained Python 3 — no dependencies, no pip install needed.

### Step 5: Open in browser

```bash
xdg-open <branch-name>-recap.html
```

## JSON spec reference

### Code block fields (for tabbed-code tabs or standalone code-block)

| Field         | Required        | Purpose                                                               |
| ------------- | --------------- | --------------------------------------------------------------------- |
| `file_path`   | Yes (git mode)  | Path to file in repo (e.g., `apps/desktop/src/main.rs`)               |
| `git_ref`     | Yes (full file) | Git ref to read from (e.g., `HEAD`, `abc1234`, `feat/branch`)         |
| `git_base`    | Yes (diff mode) | Base ref for diff (e.g., `main`). Use instead of `git_ref` for diffs. |
| `git_head`    | Optional        | Head ref for diff (default: `HEAD`)                                   |
| `line_start`  | Optional        | First line to show (1-based). If omitted, shows full file.            |
| `line_end`    | Optional        | Last line to show.                                                    |
| `filename`    | Optional        | Display name (defaults to `file_path`)                                |
| `lang`        | Optional        | Language tag for display (e.g., `Rust`, `TypeScript`, `Diff`)         |
| `code`        | Fallback        | Plain text code (use ONLY if git extraction isn't possible)           |
| `code_html`   | Fallback        | Pre-highlighted HTML (use ONLY for syntax highlighting)               |
| `annotations` | Yes             | Array of annotation objects (see below)                               |

**Priority:** `code_html` > `code` > `git_ref`+`file_path` > `git_base`+`file_path`

### Annotation fields

| Field   | Purpose                                                                                        |
| ------- | ---------------------------------------------------------------------------------------------- |
| `lines` | Line reference: `"Line 14-18"`, `"Line 47"`, `"Rust concept"`, or `[{"start": 14, "end": 18}]` |
| `label` | Bold label for the annotation                                                                  |
| `note`  | Explanation (HTML allowed — use `<strong>`, `<code>`, etc.)                                    |
| `type`  | Set to `"lang-concept"` for language concept callouts (gets cyan styling)                      |

### Section types

| `type`          | Purpose                      | Key fields                                                                                                                  |
| --------------- | ---------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| `stats`         | File/line/commit stats       | `items[].value`, `items[].label`                                                                                            |
| `callout`       | Highlighted decision/note    | `callout_type` (decision/warning), `title`, `body` (HTML allowed)                                                           |
| `toc`           | Table of contents            | `items[].ref`, `items[].text`                                                                                               |
| `heading`       | Section heading with anchor  | `level` (2-4), `text`, `id`                                                                                                 |
| `architecture`  | Layered architecture diagram | `layers[].label`, `layers[].boxes[].class` (rust/react/bridge/external/shared)                                              |
| `data-flow`     | Numbered flow steps          | `steps[].num`, `steps[].title`, `steps[].detail`, `steps[].direction` (output for return path)                              |
| `wireframe`     | UI mockup                    | `label`, `sidebar[].label`, `sidebar[].active`, `tabs[].label`, `tabs[].active`, `terminal`                                 |
| `command-table` | API/IPC contract table       | `headers[]`, `rows[][].code` or `rows[][].text`                                                                             |
| `file-tree`     | File tree with badges        | `entries[].name`, `entries[].indent`, `entries[].badge` (add/mod), `entries[].note`, `entries[].dir`                        |
| `primer`        | Language cheat sheet         | `entries[].syntax` (HTML), `entries[].explanation`, `concepts[].label`, `concepts[].note`                                   |
| `code-block`    | Single annotated code block  | See code block fields above                                                                                                 |
| `tabbed-code`   | Multiple code blocks in tabs | `id`, `tabs[]` (code block fields + `label`)                                                                                |
| `state-machine` | State machine diagram        | `rows[].nodes[].state` (idle/starting/running/exiting/closed), `rows[].nodes[].label`, `rows[].arrow`, `rows[].arrow_label` |
| `html`          | Raw HTML passthrough         | `html`                                                                                                                      |
| `paragraph`     | Simple paragraph             | `text` (HTML allowed)                                                                                                       |

### Top-level spec fields

| Field       | Required | Purpose                         |
| ----------- | -------- | ------------------------------- |
| `title`     | Yes      | Page title                      |
| `subtitle`  | Optional | Subtitle under title            |
| `repo_path` | Optional | Path to git repo (default: `.`) |
| `sections`  | Yes      | Array of section objects        |
| `footer`    | Optional | `{lines: ["text", "text"]}`     |

## HTML structure and styling

The CSS is embedded in `generate-recap.py` — you don't need to write any CSS. The script handles:

- Dark theme with CSS variables
- Architecture diagram boxes (color-coded per layer)
- Data flow numbered steps
- Wireframe mockups
- Command tables
- File tree with ADD/MOD badges
- Tabbed code blocks with annotations panel
- State machine nodes
- Language primer cheat sheets
- Callout boxes (decision/warning)
- Responsive layout (annotations stack below code on narrow screens)
- Tab switching JavaScript

If you need to customize the CSS, edit the `CSS` variable at the top of `generate-recap.py`.

### Syntax highlighting

Use colored spans (no highlight.js or Prism):

- `.kw` — keywords (purple): `let`, `fn`, `use`, `pub`, `struct`, `enum`, `match`, `if`, `for`, `move`, `async`, `await`, `return`, `const`, `type`, `import`, `export`
- `.type` — types (cyan): `String`, `Vec`, `Result`, `Option`, `Arc`, `Mutex`, `Box`, custom types
- `.fn` — function names (blue): `spawn_session`, `lock`, `clone`, `write_all`
- `.str` — strings (green): `"text"`, `'text'`
- `.cmt` — comments (muted italic): `// comment`, `/* comment */`

## Rules

1. **ALL files must be covered** — never skip files. If a file is trivial (lock file, one-line module), explain it in a "trivial files" section with a brief note.
2. **Line-by-line annotations** — every highlighted code block must have annotations explaining what it does AND why it's written that way.
3. **Language concept callouts** — if the user is new to a language, add concept callouts for every non-obvious syntax element.
4. **No external dependencies** — the HTML must work offline. No CDN links, no npm packages, no external fonts (use system fonts or CSS @import from local node_modules).
5. **Self-contained** — single file, all CSS and JS inline (handled by generate-recap.py).
6. **Dark theme** — handled by generate-recap.py. Dark background, light text.
7. **Responsive annotations** — code on left, annotations on right (340px). On narrow screens, annotations stack below. (Handled by script.)
8. **Honest scope** — if you only cover 10 of 28 files, say so. Don't claim full coverage unless you actually did it.
9. **Verify before claiming** — if you say "this supports multiple shells", verify by grepping the codebase. Don't make aspirational claims.
10. **Open in browser when done** — always run `xdg-open` at the end.
11. **Use the script, not raw HTML** — always write JSON and run generate-recap.py. Never write HTML directly. This saves ~60-70% tokens.
12. **Large JSON = split writes** — if the JSON spec is large (>20K chars), write it in multiple appends to a temp file, then run the script. Don't try to write 50K chars in one shot.

## File naming

`<branch-or-commit>-recap.html` in the repo root.

Examples:

- `feat-postgres-psql-tool-recap.html`
- `abc1234-recap.html`
- `pr-42-recap.html`

## Adding to .gitignore

These recap files are temporary artifacts. Add to `.gitignore`:

```
*-recap.html
```

Or delete after the user is done reviewing.

## Example usage

### Example 1: Simple branch recap

```
User: "make a visual recap of feat/auth branch"
Agent: "Before I start — the repo uses TypeScript and Go. Are you familiar
        with both, or should I add beginner explanations for either?"
User: "I know TypeScript, never touched Go"
Agent: [reads all files, writes /tmp/feat-auth-recap.json with Go primer +
        Go concept callouts, runs generate-recap.py, opens in browser]
Agent: "Done. feat-auth-recap.html is open in your browser. 15 files covered,
        with a Go primer and concept callouts on all Go code blocks."
```

### Example 2: With focus and depth

```
User: "recap the last commit, focus on the backend, go deep"
Agent: [writes JSON with exhaustive backend annotations, lighter frontend,
        runs generate-recap.py, opens in browser]
Agent: "Done. abc1234-recap.html is open. Backend files have exhaustive
        annotations including edge cases. Frontend files have high-level
        summaries only."
```

### Example 3: With section exclusions

```
User: "visual recap of PR #42, skip wireframes and tests"
Agent: [writes JSON without wireframe or test sections, runs script, opens]
Agent: "Done. pr-42-recap.html is open. Architecture, data flow, code
        annotations, and deps sections included. Wireframes and tests
        skipped per your request."
```

### Example 4: With notes

```
User: "recap feat/security-overhaul, highlight anything that could break
       in production, this is for a tech lead review"
Agent: [writes JSON with production-risk callout sections and annotations
        framed for a senior reviewer, runs script, opens]
Agent: "Done. feat-security-overhaul-recap.html is open. I've added
        production-risk callouts on the auth middleware and session
        handling, and framed the annotations for a tech lead audience."
```

## Token consumption comparison

| Approach                  | Skill file | Reading files | Generating output                 | Total (28-file branch) |
| ------------------------- | ---------- | ------------- | --------------------------------- | ---------------------- |
| Old (agent writes HTML)   | 3,500      | 15-25K        | 45-60K (full HTML)                | 70-100K                |
| JSON + code in JSON       | 3,500      | 15-25K        | 10-15K (JSON+code)                | 35-50K                 |
| **JSON + git extraction** | 3,500      | 15-25K        | **3-5K** (paths+annotations only) | **25-35K**             |
| visual-plan (hosted MCP)  | 20,500     | 15-25K        | 5-10K (MCP calls)                 | 50-70K                 |

**Our skill is 30-50% cheaper than visual-plan** while being fully local with zero external dependencies. The key insight: the agent never outputs code — it only outputs file paths, line ranges, and annotations. The script reads code from git at runtime.

Measured: the test JSON spec for 5 git-based code blocks was 3.9KB (~1K tokens). The script generated 38.6KB of HTML from it. For 28 files, expect ~5-8K tokens of JSON output.

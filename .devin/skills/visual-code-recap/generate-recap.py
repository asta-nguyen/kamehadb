#!/usr/bin/env python3
"""
generate-recap.py — Convert a JSON recap spec into a self-contained HTML file.

Usage:
    python3 generate-recap.py input.json output.html

The JSON spec format is documented in the SKILL.md. The script handles all
HTML/CSS generation. Code blocks can reference git refs — the script reads
code directly from the repo, so the agent never outputs code in the JSON.
This keeps agent output to ~3-5K tokens (just paths, line ranges, annotations).
"""

import json
import sys
import html
import subprocess
from pathlib import Path


CSS = """
:root {
  --bg: #0a0a0b; --surface: #131316; --surface2: #1a1a1f;
  --border: #2a2a30; --text: #e4e4e7; --muted: #71717a;
  --accent: #6366f1; --green: #22c55e; --red: #ef4444;
  --yellow: #eab308; --blue: #3b82f6; --orange: #f97316;
  --purple: #a855f7; --cyan: #06b6d4;
}
* { margin: 0; padding: 0; box-sizing: border-box; }
body { background: var(--bg); color: var(--text); font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 14px; line-height: 1.6; }
.container { max-width: 1400px; margin: 0 auto; padding: 24px; }
h1 { font-size: 28px; margin-bottom: 8px; }
h2 { font-size: 22px; margin: 40px 0 16px; padding-bottom: 8px; border-bottom: 1px solid var(--border); }
h3 { font-size: 16px; margin: 24px 0 12px; color: var(--muted); }
a { color: var(--accent); text-decoration: none; }
a:hover { text-decoration: underline; }
.muted { color: var(--muted); }
.stats { display: flex; gap: 24px; margin: 16px 0; flex-wrap: wrap; }
.stat { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 12px 16px; }
.stat-value { font-size: 24px; font-weight: 700; color: var(--accent); }
.stat-label { font-size: 12px; color: var(--muted); text-transform: uppercase; letter-spacing: 0.5px; }
.toc { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 20px; margin: 24px 0; }
.toc a { display: block; padding: 4px 0; color: var(--text); }
.toc a:hover { color: var(--accent); }
.callout { background: var(--surface); border-left: 4px solid var(--accent); border-radius: 0 8px 8px 0; padding: 16px 20px; margin: 24px 0; }
.callout .title { font-weight: 700; margin-bottom: 8px; color: var(--accent); }
.callout.decision { border-left-color: var(--yellow); }
.callout.decision .title { color: var(--yellow); }
.callout.warning { border-left-color: var(--red); }
.callout.warning .title { color: var(--red); }
/* Architecture diagram */
.arch-diagram { display: flex; flex-direction: column; gap: 16px; margin: 24px 0; }
.arch-layer { display: flex; gap: 12px; flex-wrap: wrap; align-items: center; }
.arch-layer-label { font-size: 12px; font-weight: 700; text-transform: uppercase; color: var(--muted); min-width: 100px; text-align: right; }
.arch-box { border: 2px solid; border-radius: 8px; padding: 12px 16px; min-width: 160px; }
.arch-box .name { font-weight: 700; font-size: 13px; }
.arch-box .desc { font-size: 11px; color: var(--muted); margin-top: 4px; }
.arch-box.rust { border-color: var(--orange); background: rgba(249,115,22,0.08); }
.arch-box.react { border-color: var(--blue); background: rgba(59,130,246,0.08); }
.arch-box.bridge { border-color: var(--purple); background: rgba(168,85,247,0.08); }
.arch-box.external { border-color: var(--green); background: rgba(34,197,94,0.08); }
.arch-box.shared { border-color: var(--cyan); background: rgba(6,182,212,0.08); }
.arch-arrow { text-align: center; color: var(--muted); font-size: 20px; margin: -8px 0; }
/* Data flow */
.flow-step { display: flex; gap: 16px; margin: 12px 0; align-items: flex-start; }
.flow-num { width: 32px; height: 32px; border-radius: 50%; background: var(--accent); color: white; display: flex; align-items: center; justify-content: center; font-weight: 700; font-size: 14px; flex-shrink: 0; }
.flow-num.output { background: var(--green); }
.flow-content { flex: 1; }
.flow-content .title { font-weight: 600; }
.flow-content .detail { font-size: 13px; color: var(--muted); margin-top: 4px; }
/* Wireframe */
.wireframe { border: 1px solid var(--border); border-radius: 8px; padding: 16px; margin: 16px 0; background: var(--surface); }
.wireframe-label { font-size: 12px; color: var(--muted); margin-bottom: 8px; }
.wf-window { border: 1px solid var(--border); border-radius: 4px; display: flex; height: 200px; overflow: hidden; }
.wf-sidebar { width: 200px; border-right: 1px solid var(--border); padding: 8px; font-size: 11px; }
.wf-sidebar-item { padding: 4px 8px; border-radius: 4px; margin-bottom: 4px; }
.wf-sidebar-item.active { background: var(--accent); color: white; }
.wf-main { flex: 1; padding: 8px; }
.wf-tabbar { display: flex; gap: 4px; border-bottom: 1px solid var(--border); padding-bottom: 4px; margin-bottom: 8px; }
.wf-tab { padding: 4px 12px; border-radius: 4px 4px 0 0; font-size: 11px; border: 1px solid var(--border); border-bottom: none; }
.wf-tab.active { background: var(--accent); color: white; }
.wf-terminal { background: #000; color: #0f0; font-family: monospace; font-size: 11px; padding: 8px; flex: 1; border-radius: 4px; }
/* Command table */
table { width: 100%; border-collapse: collapse; margin: 16px 0; }
th { text-align: left; padding: 10px 12px; background: var(--surface); border-bottom: 2px solid var(--border); font-size: 12px; text-transform: uppercase; color: var(--muted); }
td { padding: 10px 12px; border-bottom: 1px solid var(--border); }
tr:hover td { background: var(--surface); }
td code { background: var(--surface2); padding: 2px 6px; border-radius: 4px; font-size: 12px; }
/* File tree */
.file-tree { background: var(--surface); border: 1px solid var(--border); border-radius: 8px; padding: 16px; font-family: 'SF Mono', Monaco, monospace; font-size: 13px; line-height: 1.8; }
.file-tree .dir { color: var(--accent); font-weight: 600; }
.file-tree .file { color: var(--text); }
.file-tree .badge { font-size: 10px; padding: 1px 6px; border-radius: 4px; margin-left: 8px; font-weight: 700; }
.file-tree .badge.add { background: var(--green); color: white; }
.file-tree .badge.mod { background: var(--yellow); color: black; }
.file-tree .note { color: var(--muted); }
/* Tabs */
.tabs { display: flex; gap: 0; border-bottom: 2px solid var(--border); margin: 24px 0 0; flex-wrap: wrap; }
.tab { padding: 10px 16px; cursor: pointer; border-bottom: 2px solid transparent; margin-bottom: -2px; font-size: 13px; color: var(--muted); }
.tab:hover { color: var(--text); }
.tab.active { color: var(--accent); border-bottom-color: var(--accent); }
.tab-content { display: none; }
.tab-content.active { display: block; }
/* Code blocks */
.code-block { border: 1px solid var(--border); border-radius: 8px; margin: 16px 0; overflow: hidden; }
.code-header { display: flex; justify-content: space-between; align-items: center; padding: 10px 16px; background: var(--surface); border-bottom: 1px solid var(--border); }
.code-header .filename { font-family: monospace; font-size: 13px; }
.code-header .lang { font-size: 11px; color: var(--muted); text-transform: uppercase; }
.code-body { display: flex; }
.code-lines { flex: 1; overflow-x: auto; padding: 12px 0; font-family: 'SF Mono', Monaco, monospace; font-size: 13px; line-height: 1.6; }
.code-line { display: flex; }
.code-linenum { width: 40px; text-align: right; padding-right: 12px; color: var(--muted); user-select: none; flex-shrink: 0; }
.code-linecontent { white-space: pre; }
.code-line.hl { background: rgba(99,102,241,0.1); border-left: 3px solid var(--accent); padding-left: 6px; }
.code-annotations { width: 340px; flex-shrink: 0; border-left: 1px solid var(--border); padding: 12px 16px; background: var(--surface); }
.annotation { margin-bottom: 16px; padding-bottom: 16px; border-bottom: 1px solid var(--border); }
.annotation:last-child { border-bottom: none; }
.annotation .lines { font-size: 11px; color: var(--muted); font-weight: 700; text-transform: uppercase; margin-bottom: 4px; }
.annotation .label { font-weight: 700; font-size: 13px; margin-bottom: 4px; }
.annotation .note { font-size: 12px; color: var(--muted); line-height: 1.5; }
.annotation.lang-concept .label { color: var(--cyan); }
.annotation.lang-concept { background: rgba(6,182,212,0.05); padding: 12px; border-radius: 6px; }
/* State machine */
.state-machine { display: flex; flex-direction: column; gap: 16px; margin: 24px 0; }
.state-row { display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
.state-node { border: 2px solid; border-radius: 8px; padding: 8px 16px; font-size: 13px; font-weight: 600; }
.state-node.idle { border-color: var(--muted); color: var(--muted); }
.state-node.starting { border-color: var(--yellow); color: var(--yellow); }
.state-node.running { border-color: var(--green); color: var(--green); }
.state-node.exiting { border-color: var(--orange); color: var(--orange); }
.state-node.closed { border-color: var(--red); color: var(--red); }
.state-arrow { color: var(--muted); font-size: 18px; }
.state-label { font-size: 11px; color: var(--muted); }
/* Syntax highlighting */
.kw { color: var(--purple); }
.type { color: var(--cyan); }
.fn { color: var(--blue); }
.str { color: var(--green); }
.cmt { color: var(--muted); font-style: italic; }
/* Footer */
.footer { margin-top: 60px; padding-top: 20px; border-top: 1px solid var(--border); color: var(--muted); font-size: 12px; }
@media (max-width: 900px) {
  .code-body { flex-direction: column; }
  .code-annotations { width: 100%; border-left: none; border-top: 1px solid var(--border); }
  .arch-layer-label { min-width: auto; text-align: left; }
}
"""


def esc(text):
    """HTML-escape text."""
    return html.escape(str(text), quote=False)


def render_syntax_highlight(code):
    """Apply basic syntax highlighting via span tags.
    This is a simplified version — the agent can pre-highlight code in the JSON
    by passing already-highlighted HTML in the 'code_html' field instead of 'code'.
    """
    return esc(code)


def git_show(repo_path, git_ref, file_path):
    """Read file content from a git ref. Returns string or None on error."""
    try:
        result = subprocess.run(
            ["git", "show", f"{git_ref}:{file_path}"],
            capture_output=True, text=True, cwd=repo_path, timeout=10
        )
        if result.returncode == 0:
            return result.stdout
    except Exception:
        pass
    return None


def git_diff_file(repo_path, base_ref, head_ref, file_path):
    """Read a diff for a file between two refs. Returns string or None."""
    try:
        result = subprocess.run(
            ["git", "diff", f"{base_ref}..{head_ref}", "--", file_path],
            capture_output=True, text=True, cwd=repo_path, timeout=10
        )
        if result.returncode == 0:
            return result.stdout
    except Exception:
        pass
    return None


def extract_code_from_git(block, spec):
    """Extract code from git based on block's git_ref and file_path.
    
    Supports:
    - git_ref + file_path → full file content at that ref
    - git_base + git_head + file_path → diff output
    - line_start + line_end → extract only those lines from the file
    """
    repo_path = spec.get("repo_path", ".")
    git_ref = block.get("git_ref")
    git_base = block.get("git_base")
    git_head = block.get("git_head", "HEAD")
    file_path = block.get("file_path", "")
    
    code = None
    
    if git_base and file_path:
        # Diff mode
        code = git_diff_file(repo_path, git_base, git_head, file_path)
    elif git_ref and file_path:
        # Full file at ref
        code = git_show(repo_path, git_ref, file_path)
    
    if code is None:
        return None
    
    # Extract line range if specified
    line_start = block.get("line_start")
    line_end = block.get("line_end")
    if line_start and line_end:
        lines = code.split("\n")
        # Adjust for 0-indexed
        start_idx = max(0, int(line_start) - 1)
        end_idx = min(len(lines), int(line_end))
        code = "\n".join(lines[start_idx:end_idx])
    
    return code


def parse_highlight_lines(annotations):
    """Extract which lines should be highlighted from annotations.
    
    Supports formats:
    - "Line 14-18" → lines 14-18
    - "Line 47" → line 47
    - "Lines 10-20" → lines 10-20
    - [{"start": 14, "end": 18}] → lines 14-18
    - [14, 15, 16] → individual lines
    - "Rust concept" → no lines (concept callout, not line-specific)
    """
    highlight = set()
    for ann in annotations:
        lines_field = ann.get("lines", "")
        
        if isinstance(lines_field, list):
            for item in lines_field:
                if isinstance(item, int):
                    highlight.add(item)
                elif isinstance(item, dict):
                    start = item.get("start")
                    end = item.get("end", start)
                    if start:
                        for n in range(int(start), int(end) + 1):
                            highlight.add(n)
        elif isinstance(lines_field, str):
            import re
            # Match "Line 14-18", "Lines 10-20", "Line 47"
            m = re.match(r'[Ll]ines?\s+(\d+)(?:\s*[-–]\s*(\d+))?', lines_field)
            if m:
                start = int(m.group(1))
                end = int(m.group(2)) if m.group(2) else start
                for n in range(start, end + 1):
                    highlight.add(n)
    
    return highlight


def render_code_block(block, spec=None):
    """Render a single code block with annotations.
    
    Code can come from:
    1. block["code_html"] — pre-highlighted HTML (highest priority)
    2. block["code"] — plain text code
    3. block["git_ref"] + block["file_path"] — read from git (most token-efficient)
    4. block["git_base"] + block["file_path"] — read diff from git
    """
    parts = []
    parts.append('<div class="code-block">')

    # Header
    filename = esc(block.get("filename", block.get("file_path", "")))
    lang = esc(block.get("lang", ""))
    parts.append(f'<div class="code-header"><span class="filename">{filename}</span><span class="lang">{lang}</span></div>')

    parts.append('<div class="code-body">')

    # Code lines — try git extraction first, then fall back to inline code
    parts.append('<div class="code-lines">')
    
    code = block.get("code_html") or block.get("code", "")
    
    # If no inline code, try git extraction
    if not code and spec:
        git_code = extract_code_from_git(block, spec)
        if git_code:
            code = git_code
    
    if not block.get("code_html"):
        code = esc(code)

    highlight_lines = parse_highlight_lines(block.get("annotations", []))

    # If using git extraction with line_start, adjust line numbers
    line_offset = 0
    if block.get("line_start") and (block.get("git_ref") or block.get("git_base")):
        line_offset = int(block.get("line_start")) - 1

    lines = code.split("\n")
    for i, line in enumerate(lines, 1):
        cls = "code-line"
        actual_line_num = i + line_offset
        if actual_line_num in highlight_lines:
            cls += " hl"
        parts.append(f'<div class="{cls}"><span class="code-linenum">{actual_line_num}</span><span class="code-linecontent">{line}</span></div>')

    parts.append('</div>')  # code-lines

    # Annotations
    annotations = block.get("annotations", [])
    if annotations:
        parts.append('<div class="code-annotations">')
        for ann in annotations:
            lines_str = esc(str(ann.get("lines", "")))
            label = esc(ann.get("label", ""))
            note = ann.get("note", "")  # note can contain HTML
            ann_cls = "annotation"
            if ann.get("type") == "lang-concept":
                ann_cls += " lang-concept"
            parts.append(f'<div class="{ann_cls}">')
            parts.append(f'<div class="lines">{lines_str}</div>')
            parts.append(f'<div class="label">{label}</div>')
            parts.append(f'<div class="note">{note}</div>')
            parts.append('</div>')
        parts.append('</div>')  # code-annotations
    else:
        parts.append('<div class="code-annotations"><div class="annotation"><div class="note">No annotations</div></div></div>')

    parts.append('</div>')  # code-body
    parts.append('</div>')  # code-block
    return "\n".join(parts)


def render_tabs(tabs_id, tabs, spec=None):
    """Render a tabbed section. tabs is a list of code block dicts."""
    if not tabs:
        return ""

    parts = []
    parts.append(f'<div class="tabs" id="{tabs_id}">')
    for i, tab in enumerate(tabs):
        label = esc(tab.get("label", ""))
        content_id = f"{tabs_id}-content-{i}"
        cls = "tab active" if i == 0 else "tab"
        parts.append(f'<div class="{cls}" onclick="switchTab(\'{tabs_id}\',\'{content_id}\')">{label}</div>')
    parts.append('</div>')

    for i, tab in enumerate(tabs):
        content_id = f"{tabs_id}-content-{i}"
        cls = "tab-content active" if i == 0 else "tab-content"
        content = render_code_block(tab, spec)
        parts.append(f'<div id="{content_id}" class="{cls}">{content}</div>')

    return "\n".join(parts)


def render_arch_diagram(diagram):
    """Render architecture diagram from spec."""
    parts = []
    parts.append('<div class="arch-diagram">')
    for layer in diagram.get("layers", []):
        parts.append('<div class="arch-layer">')
        label = esc(layer.get("label", ""))
        parts.append(f'<div class="arch-layer-label">{label}</div>')
        for box in layer.get("boxes", []):
            box_cls = esc(box.get("class", "rust"))
            name = esc(box.get("name", ""))
            desc = esc(box.get("desc", ""))
            parts.append(f'<div class="arch-box {box_cls}"><div class="name">{name}</div><div class="desc">{desc}</div></div>')
        parts.append('</div>')
        arrow = layer.get("arrow")
        if arrow:
            parts.append(f'<div class="arch-arrow">{esc(arrow)}</div>')
    parts.append('</div>')
    return "\n".join(parts)


def render_data_flow(flow):
    """Render data flow steps."""
    parts = []
    for step in flow.get("steps", []):
        num = esc(str(step.get("num", "")))
        title = esc(step.get("title", ""))
        detail = esc(step.get("detail", ""))
        cls = "flow-num output" if step.get("direction") == "output" else "flow-num"
        parts.append(f'<div class="flow-step"><div class="{cls}">{num}</div><div class="flow-content"><div class="title">{title}</div><div class="detail">{detail}</div></div></div>')
    return "\n".join(parts)


def render_wireframe(wf):
    """Render a UI wireframe mockup."""
    parts = []
    parts.append('<div class="wireframe">')
    label = esc(wf.get("label", ""))
    parts.append(f'<div class="wireframe-label">{label}</div>')
    parts.append('<div class="wf-window">')

    # Sidebar
    sidebar_items = wf.get("sidebar", [])
    if sidebar_items:
        parts.append('<div class="wf-sidebar">')
        for item in sidebar_items:
            item_cls = "wf-sidebar-item active" if item.get("active") else "wf-sidebar-item"
            parts.append(f'<div class="{item_cls}">{esc(item.get("label", ""))}</div>')
        parts.append('</div>')

    # Main area
    parts.append('<div class="wf-main">')
    tabs = wf.get("tabs", [])
    if tabs:
        parts.append('<div class="wf-tabbar">')
        for tab in tabs:
            tab_cls = "wf-tab active" if tab.get("active") else "wf-tab"
            parts.append(f'<div class="{tab_cls}">{esc(tab.get("label", ""))}</div>')
        parts.append('</div>')

    terminal_content = wf.get("terminal", "")
    if terminal_content:
        parts.append(f'<div class="wf-terminal">{esc(terminal_content)}</div>')
    else:
        main_content = wf.get("main_content", "")
        parts.append(f'<div>{main_content}</div>')

    parts.append('</div>')  # wf-main
    parts.append('</div>')  # wf-window
    parts.append('</div>')  # wireframe
    return "\n".join(parts)


def render_command_table(table):
    """Render a command/API contract table."""
    parts = []
    parts.append('<table>')
    headers = table.get("headers", [])
    if headers:
        parts.append('<tr>')
        for h in headers:
            parts.append(f'<th>{esc(h)}</th>')
        parts.append('</tr>')
    for row in table.get("rows", []):
        parts.append('<tr>')
        for cell in row:
            if cell.get("code"):
                parts.append(f'<td><code>{esc(cell["code"])}</code></td>')
            else:
                parts.append(f'<td>{esc(cell.get("text", ""))}</td>')
        parts.append('</tr>')
    parts.append('</table>')
    return "\n".join(parts)


def render_file_tree(tree):
    """Render a file tree with ADD/MOD badges."""
    parts = []
    parts.append('<div class="file-tree">')
    for entry in tree.get("entries", []):
        indent = "  " * entry.get("indent", 0)
        name = entry.get("name", "")
        badge = entry.get("badge", "")
        note = entry.get("note", "")
        is_dir = entry.get("dir", False)

        cls = "dir" if is_dir else "file"
        parts.append(f'<div><span class="{cls}">{indent}{esc(name)}</span>')

        if badge:
            badge_cls = "badge add" if badge.upper() == "ADD" else "badge mod"
            parts.append(f'<span class="{badge_cls}">{esc(badge.upper())}</span>')

        if note:
            parts.append(f' <span class="note">— {esc(note)}</span>')

        parts.append('</div>')

    parts.append('</div>')
    return "\n".join(parts)


def render_state_machine(sm):
    """Render a state machine diagram."""
    parts = []
    parts.append('<div class="state-machine">')
    for row in sm.get("rows", []):
        parts.append('<div class="state-row">')
        for node in row.get("nodes", []):
            state_cls = esc(node.get("state", "idle"))
            label = esc(node.get("label", ""))
            parts.append(f'<div class="state-node {state_cls}">{label}</div>')
        arrow = row.get("arrow")
        if arrow:
            parts.append(f'<div class="state-arrow">{esc(arrow)}</div>')
        arrow_label = row.get("arrow_label")
        if arrow_label:
            parts.append(f'<div class="state-label">{esc(arrow_label)}</div>')
        parts.append('</div>')
    parts.append('</div>')
    return "\n".join(parts)


def render_primer(primer):
    """Render a language primer cheat sheet."""
    parts = []
    parts.append('<div class="code-block">')
    filename = esc(primer.get("title", "Language primer"))
    parts.append(f'<div class="code-header"><span class="filename">{filename}</span><span class="lang">Reference</span></div>')
    parts.append('<div class="code-body">')
    parts.append('<div class="code-lines" style="padding: 16px">')
    for entry in primer.get("entries", []):
        syntax = entry.get("syntax", "")
        explanation = entry.get("explanation", "")
        parts.append(f'<div class="code-line"><span class="code-linenum">&nbsp;</span><span class="code-linecontent">{syntax} <span class="cmt">{esc(explanation)}</span></span></div>')
        parts.append('<div class="code-line">&nbsp;</div>')
    parts.append('</div>')

    concepts = primer.get("concepts", [])
    if concepts:
        parts.append('<div class="code-annotations">')
        for concept in concepts:
            label = esc(concept.get("label", ""))
            note = concept.get("note", "")
            parts.append(f'<div class="annotation lang-concept"><div class="label">{label}</div><div class="note">{note}</div></div>')
        parts.append('</div>')
    else:
        parts.append('<div class="code-annotations"></div>')

    parts.append('</div>')  # code-body
    parts.append('</div>')  # code-block
    return "\n".join(parts)


def render_callout(callout):
    """Render a callout box."""
    cls = "callout"
    callout_type = callout.get("callout_type", callout.get("type", ""))
    if callout_type == "decision":
        cls += " decision"
    elif callout_type == "warning":
        cls += " warning"
    title = esc(callout.get("title", ""))
    body = callout.get("body", "")
    return f'<div class="{cls}"><div class="title">{title}</div><div class="body">{body}</div></div>'


def render_section(section, spec):
    """Render a single section of the recap."""
    parts = []
    section_type = section.get("type", "")
    section_id = section.get("id", "")
    title = section.get("title", "")

    if title:
        parts.append(f'<h2 id="{esc(section_id)}">{esc(title)}</h2>')

    if section_type == "callout":
        parts.append(render_callout(section))
    elif section_type == "stats":
        parts.append('<div class="stats">')
        for stat in section.get("items", []):
            value = esc(stat.get("value", ""))
            label = esc(stat.get("label", ""))
            parts.append(f'<div class="stat"><div class="stat-value">{value}</div><div class="stat-label">{label}</div></div>')
        parts.append('</div>')
    elif section_type == "toc":
        parts.append('<div class="toc">')
        for item in section.get("items", []):
            ref = esc(item.get("ref", ""))
            text = esc(item.get("text", ""))
            parts.append(f'<a href="#{ref}">{text}</a>')
        parts.append('</div>')
    elif section_type == "architecture":
        parts.append(render_arch_diagram(section))
    elif section_type == "data-flow":
        parts.append(render_data_flow(section))
    elif section_type == "wireframe":
        parts.append(render_wireframe(section))
    elif section_type == "wireframes":
        for wf in section.get("wireframes", []):
            parts.append(render_wireframe(wf))
    elif section_type == "command-table":
        parts.append(render_command_table(section))
    elif section_type == "file-tree":
        parts.append(render_file_tree(section))
    elif section_type == "primer":
        parts.append(render_primer(section))
    elif section_type == "code-block":
        parts.append(render_code_block(section, spec))
    elif section_type == "tabbed-code":
        parts.append(render_tabs(section.get("id", "tabs"), section.get("tabs", []), spec))
    elif section_type == "state-machine":
        parts.append(render_state_machine(section))
    elif section_type == "html":
        parts.append(section.get("html", ""))
    elif section_type == "paragraph":
        parts.append(f'<p>{section.get("text", "")}</p>')
    elif section_type == "heading":
        level = section.get("level", 3)
        parts.append(f'<h{level}>{esc(section.get("text", ""))}</h{level}>')
    else:
        parts.append(f'<p class="muted">Unknown section type: {esc(section_type)}</p>')

    return "\n".join(parts)


def generate_html(spec):
    """Generate the full HTML document from a spec."""
    parts = []

    # HTML head
    title = esc(spec.get("title", "Code Recap"))
    parts.append(f'<!DOCTYPE html>')
    parts.append(f'<html lang="en">')
    parts.append(f'<head>')
    parts.append(f'<meta charset="UTF-8">')
    parts.append(f'<meta name="viewport" content="width=device-width, initial-scale=1.0">')
    parts.append(f'<title>{title}</title>')
    parts.append(f'<style>{CSS}</style>')
    parts.append(f'</head>')
    parts.append(f'<body>')
    parts.append(f'<div class="container">')

    # Title
    parts.append(f'<h1>{title}</h1>')

    subtitle = spec.get("subtitle", "")
    if subtitle:
        parts.append(f'<p class="muted">{esc(subtitle)}</p>')

    # Render all sections
    for section in spec.get("sections", []):
        parts.append(render_section(section, spec))

    # Footer
    footer = spec.get("footer", {})
    if footer:
        parts.append('<div class="footer">')
        for line in footer.get("lines", []):
            parts.append(f'<div>{line}</div>')
        parts.append('</div>')

    parts.append('</div>')  # container

    # Tab switching JavaScript
    parts.append('<script>')
    parts.append("""
function switchTab(tabGroupId, tabContentId) {
  var tabs = document.querySelectorAll('#' + tabGroupId + ' .tab');
  tabs.forEach(function(t) { t.classList.remove('active'); });
  var contents = document.querySelectorAll('.tab-content');
  for (var i = 0; i < contents.length; i++) {
    var c = contents[i];
    if (c.id && c.id.startsWith(tabGroupId + '-content-')) {
      c.classList.remove('active');
    }
  }
  var clickedTab = event.target;
  clickedTab.classList.add('active');
  var content = document.getElementById(tabContentId);
  if (content) content.classList.add('active');
}
    """)
    parts.append('</script>')
    parts.append('</body>')
    parts.append('</html>')

    return "\n".join(parts)


def main():
    if len(sys.argv) < 2:
        print("Usage: python3 generate-recap.py input.json [output.html]")
        sys.exit(1)

    input_path = Path(sys.argv[1])
    if not input_path.exists():
        print(f"Error: {input_path} not found")
        sys.exit(1)

    with open(input_path, "r") as f:
        spec = json.load(f)

    html_output = generate_html(spec)

    if len(sys.argv) >= 3:
        output_path = Path(sys.argv[2])
    else:
        output_path = input_path.with_suffix(".html")

    with open(output_path, "w") as f:
        f.write(html_output)

    print(f"Generated {output_path} ({len(html_output)} bytes)")


if __name__ == "__main__":
    main()

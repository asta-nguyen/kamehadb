# Legacy Connection Root CA Plan Pointer

This legacy pointer is kept so existing links remain valid. The canonical
design and execution tasks now live in the archived change folder:

- [Connection Root CA and TLS Mode design](../changes/archive/2026-10-16-connection-root-ca/design.md)
- [Verified implementation tasks](../changes/archive/2026-10-16-connection-root-ca/tasks.md)

Track task history only in the archived `tasks.md`; do not execute this former
task list. Implementation and final review are complete.

## Approval Gate

Required: yes
Reason: the change affects profile persistence and Wails models, database TLS
verification, managed MCP connections, and protected profile updates.
Status: approved
Execution: complete

## Decision Log

- 2026-10-17 — Replaced the legacy task list with a pointer to the canonical
  change-folder tasks. The task plan was materially revised after tracing the
  existing profile, connection-test, adapter, and MCP paths. The user then
  instructed implementation of the current design and tasks; approval is
  recorded and execution is complete in the archived change folder.

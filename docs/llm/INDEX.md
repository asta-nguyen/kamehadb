# KamehaDB Wiki

This wiki records behavior checked against current repository source and relevant tests. Start with the [Architecture overview](architecture/overview.md) for the product map and [Database support](architecture/engine-support.md) for the adapter boundaries.

Verification status: `[x]` pages were fully checked in the latest pass; `[~]` marks a known content gap. As of the latest review pass, [AI assistant](integrations/ai-assistant.md), [Diagnostics and database maintenance](operations/diagnostics-and-maintenance.md), and [Release packaging](operations/release-packaging.md) are `[x]`. [Database support and adapter boundaries](architecture/engine-support.md) and [Connections and workspace](workflows/connections-and-workspace.md) remain `[~]` because the in-progress runtime-footprint change owns a requirement block on each page.

## Architecture

- [Architecture overview](architecture/overview.md)
- [Database support and adapter boundaries](architecture/engine-support.md)

## Workflows

- [Connections and workspace](workflows/connections-and-workspace.md)
- [SQL workspace](workflows/sql-workspace.md)
- [Schema lifecycle](workflows/schema-lifecycle.md)
- [Engine explorers](workflows/engine-explorers.md)
- [Vector search](workflows/vector-search.md)
- [Query history](workflows/query-history.md)
- [Federated queries](workflows/federated-query.md)
- [Sidecar recovery after app resume](workflows/sidecar-resume-recovery.md)

## Integrations

- [AI assistant](integrations/ai-assistant.md)
- [Read-only MCP server](integrations/read-only-mcp.md)
- [Marketing and documentation site](integrations/marketing-site.md)

## Operations

- [Diagnostics and database maintenance](operations/diagnostics-and-maintenance.md)
- [Release packaging](operations/release-packaging.md)

## Requirement prefixes

| Prefix | Domain                             |
| ------ | ---------------------------------- |
| AI     | AI provider and chat integration   |
| MCP    | Model Context Protocol integration |
| SQL    | SQL results, previews, and exports |
| ENG    | Database adapter runtime           |
| WSP    | Workspace result lifetime          |
| OPS    | Release packaging                  |

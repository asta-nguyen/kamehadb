import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import * as metadataStore from "../db/metadata-store.js";
import { createAdapter } from "../adapters/factory.js";

export const sqlRouter = new Hono();

function handleError(c: any, err: unknown, context: string) {
  const message = err instanceof Error ? err.message : "Unknown error";
  console.error(`[SQL] ${context}:`, message);
  return c.json({ error: "INTERNAL_ERROR", message }, 500);
}

async function getAdapter(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw new Error("Connection not found");
  const password = metadataStore.getProfilePassword(connectionId);
  if (!password) {
    const msg = profile.kind === "postgres"
      ? "Password not saved. Open connection settings and save with password."
      : "No password configured for this connection.";
    throw new Error(msg);
  }
  return createAdapter(profile, password);
}

// Databases
sqlRouter.get("/:connectionId/databases", async (c) => {
  try {
    const adapter = await getAdapter(c.req.param("connectionId"));
    try {
      const databases = await adapter.listDatabases();
      return c.json(databases);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, "listDatabases");
  }
});

// Schemas
sqlRouter.get("/:connectionId/schemas", async (c) => {
  try {
    const adapter = await getAdapter(c.req.param("connectionId"));
    try {
      const schemas = await adapter.listSchemas();
      return c.json(schemas);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, "listSchemas");
  }
});

// Tables
sqlRouter.get("/:connectionId/tables", async (c) => {
  try {
    const adapter = await getAdapter(c.req.param("connectionId"));
    try {
      const schema = c.req.query("schema");
      const tables = await adapter.listTables(schema);
      return c.json(tables);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, "listTables");
  }
});

// Table columns
sqlRouter.get("/:connectionId/tables/:tableId/columns", async (c) => {
  try {
    const adapter = await getAdapter(c.req.param("connectionId"));
    try {
      const columns = await adapter.getTableColumns(c.req.param("tableId"));
      return c.json(columns);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, "getTableColumns");
  }
});

// Table indexes
sqlRouter.get("/:connectionId/tables/:tableId/indexes", async (c) => {
  try {
    const adapter = await getAdapter(c.req.param("connectionId"));
    try {
      const indexes = await adapter.getTableIndexes(c.req.param("tableId"));
      return c.json(indexes);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, "getTableIndexes");
  }
});

// Completions schema (all tables + columns for autocomplete)
sqlRouter.get("/:connectionId/completions", async (c) => {
  try {
    const adapter = await getAdapter(c.req.param("connectionId"));
    try {
      const tables = await adapter.listTables();
      const result = await Promise.all(
        tables.map(async (table) => {
          const columns = await adapter.getTableColumns(table.id);
          return {
            name: table.name,
            schema: table.schema,
            columns: columns.map((col) => ({
              name: col.name,
              type: col.type,
              primaryKey: col.primaryKey,
              foreignKey: col.foreignKey,
            })),
          };
        })
      );
      return c.json({ tables: result });
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, "completions");
  }
});

// Preview rows
sqlRouter.post("/:connectionId/preview", zValidator("json", z.object({
  tableId: z.string(),
  schema: z.string().optional(),
  offset: z.number().optional(),
  limit: z.number().optional(),
  sortColumn: z.string().optional(),
  sortDirection: z.enum(["asc", "desc"]).optional(),
  filters: z.array(z.object({
    column: z.string(),
    operator: z.string(),
    value: z.string(),
  })).optional(),
})), async (c) => {
  try {
    const adapter = await getAdapter(c.req.param("connectionId"));
    try {
      const result = await adapter.previewRows(c.req.valid("json"));
      return c.json(result);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, "previewRows");
  }
});

// Run query
sqlRouter.post("/:connectionId/query", zValidator("json", z.object({
  query: z.string(),
  params: z.array(z.unknown()).optional(),
})), async (c) => {
  try {
    const connectionId = c.req.param("connectionId");
    const profile = metadataStore.getProfile(connectionId);
    if (!profile) return c.json({ error: "NOT_FOUND", message: "Connection not found" }, 404);

    const password = metadataStore.getProfilePassword(connectionId);
    const adapter = createAdapter(profile, password);
    try {
      const result = await adapter.runQuery(c.req.valid("json"));
      return c.json(result);
    } finally {
      await adapter.close();
    }
  } catch (err) {
    return handleError(c, err, "runQuery");
  }
});
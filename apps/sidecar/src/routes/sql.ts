import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import * as metadataStore from "../db/metadata-store.js";
import { createAdapter } from "../adapters/factory.js";

export const sqlRouter = new Hono();

async function getAdapter(connectionId: string) {
  const profile = metadataStore.getProfile(connectionId);
  if (!profile) throw new Error("Connection not found");
  return createAdapter(profile);
}

// Databases
sqlRouter.get("/:connectionId/databases", async (c) => {
  const adapter = await getAdapter(c.req.param("connectionId"));
  try {
    const databases = await adapter.listDatabases();
    return c.json(databases);
  } finally {
    await adapter.close();
  }
});

// Schemas
sqlRouter.get("/:connectionId/schemas", async (c) => {
  const adapter = await getAdapter(c.req.param("connectionId"));
  try {
    const schemas = await adapter.listSchemas();
    return c.json(schemas);
  } finally {
    await adapter.close();
  }
});

// Tables
sqlRouter.get("/:connectionId/tables", async (c) => {
  const adapter = await getAdapter(c.req.param("connectionId"));
  try {
    const schema = c.req.query("schema");
    const tables = await adapter.listTables(schema);
    return c.json(tables);
  } finally {
    await adapter.close();
  }
});

// Table columns
sqlRouter.get("/:connectionId/tables/:tableId/columns", async (c) => {
  const adapter = await getAdapter(c.req.param("connectionId"));
  try {
    const columns = await adapter.getTableColumns(c.req.param("tableId"));
    return c.json(columns);
  } finally {
    await adapter.close();
  }
});

// Table indexes
sqlRouter.get("/:connectionId/tables/:tableId/indexes", async (c) => {
  const adapter = await getAdapter(c.req.param("connectionId"));
  try {
    const indexes = await adapter.getTableIndexes(c.req.param("tableId"));
    return c.json(indexes);
  } finally {
    await adapter.close();
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
  const adapter = await getAdapter(c.req.param("connectionId"));
  try {
    const result = await adapter.previewRows(c.req.valid("json"));
    return c.json(result);
  } finally {
    await adapter.close();
  }
});

// Run query
sqlRouter.post("/:connectionId/query", zValidator("json", z.object({
  query: z.string(),
  params: z.array(z.unknown()).optional(),
})), async (c) => {
  const profile = metadataStore.getProfile(c.req.param("connectionId"));
  if (!profile) return c.json({ error: "NOT_FOUND", message: "Connection not found" }, 404);

  const adapter = createAdapter(profile);
  try {
    const result = await adapter.runQuery(c.req.valid("json"));
    return c.json(result);
  } finally {
    await adapter.close();
  }
});

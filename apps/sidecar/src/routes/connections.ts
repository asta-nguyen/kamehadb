import { Hono } from "hono";
import { z } from "zod";
import { zValidator } from "@hono/zod-validator";
import { CreateConnectionProfileSchema, UpdateConnectionProfileSchema } from "@kamehadb/shared";
import * as metadataStore from "../db/metadata-store.js";
import { testPostgresConnection } from "../adapters/postgres.js";
import { testSqliteConnection } from "../adapters/sqlite.js";

export const connectionsRouter = new Hono();

connectionsRouter.get("/", (c) => {
  const profiles = metadataStore.listProfiles();
  return c.json(profiles);
});

connectionsRouter.get("/:id", (c) => {
  const profile = metadataStore.getProfile(c.req.param("id"));
  if (!profile) return c.json({ error: "NOT_FOUND", message: "Connection not found", statusCode: 404 }, 404);
  return c.json(profile);
});

connectionsRouter.post("/", zValidator("json", CreateConnectionProfileSchema), async (c) => {
  const input = c.req.valid("json");
  const profile = metadataStore.createProfile(input);
  return c.json(profile, 201);
});

connectionsRouter.patch("/:id", zValidator("json", UpdateConnectionProfileSchema), async (c) => {
  const profile = metadataStore.updateProfile(c.req.param("id"), c.req.valid("json"));
  if (!profile) return c.json({ error: "NOT_FOUND", message: "Connection not found", statusCode: 404 }, 404);
  return c.json(profile);
});

connectionsRouter.delete("/:id", (c) => {
  const deleted = metadataStore.deleteProfile(c.req.param("id"));
  if (!deleted) return c.json({ error: "NOT_FOUND", message: "Connection not found", statusCode: 404 }, 404);
  return c.body(null, 204);
});

connectionsRouter.post("/test", zValidator("json", CreateConnectionProfileSchema), async (c) => {
  const input = c.req.valid("json");

  try {
    let result;
    switch (input.kind) {
      case "postgres":
        result = await testPostgresConnection(input);
        break;
      case "sqlite":
        result = testSqliteConnection(input.filePath);
        break;
      default:
        return c.json({ success: false, message: `Unsupported database kind: ${input.kind}` });
    }
    return c.json(result);
  } catch (err) {
    return c.json({
      success: false,
      message: err instanceof Error ? err.message : "Unknown error",
    });
  }
});

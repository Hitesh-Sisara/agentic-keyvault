import { Hono } from "hono";
import type { AppEnv } from "../http";
import { ensureAdmin } from "../auth";
import { listAudit } from "../store/audit";

export const audit = new Hono<AppEnv>();

audit.get("/", async (c) => {
  ensureAdmin(c.get("token"));
  const limit = Number(c.req.query("limit") ?? "100");
  return c.json({ entries: await listAudit(c.env.DB, Number.isFinite(limit) ? limit : 100) });
});

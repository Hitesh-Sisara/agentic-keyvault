import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "../http";
import { search } from "../store/search";

export const searchRoutes = new Hono<AppEnv>();

// GET /v1/search?q=<term>&type=project,repo,secret — metadata only, no values.
searchRoutes.get("/", async (c) => {
  const q = c.req.query("q");
  if (!q || q.trim().length < 1) throw new HTTPException(400, { message: "q is required" });

  const typeParam = c.req.query("type") ?? "project,repo,secret";
  const types = new Set(
    typeParam
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
  );

  const token = c.get("token");
  // Project-scoped tokens only search within their project.
  const projectScope = token.scope === "admin" ? undefined : token.project_id ?? "__none__";

  const results = await search(c.env.DB, { query: q.trim(), types, projectScope });
  return c.json(results);
});

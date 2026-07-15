/**
 * agentic-keyvault Worker entrypoint — REST API.
 * See docs/ARCHITECTURE.md for the API surface and design.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import type { AppEnv } from "./http";
import { requireAuth } from "./auth";
import { bootstrap } from "./routes/bootstrap";
import { projects } from "./routes/projects";
import { secrets } from "./routes/secrets";
import { tokens } from "./routes/tokens";
import { audit } from "./routes/audit";

const app = new Hono<AppEnv>();

app.get("/health", (c) => c.json({ ok: true, service: "agentic-keyvault" }));

// Unauthenticated, one-time.
app.route("/v1/bootstrap", bootstrap);

// Everything below requires a bearer token.
app.use("/v1/*", requireAuth);
app.route("/v1/projects", projects);
app.route("/v1/secrets", secrets);
app.route("/v1/tokens", tokens);
app.route("/v1/audit", audit);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error("unhandled error", err);
  return c.json({ error: "internal error" }, 500);
});

app.notFound((c) => c.json({ error: "not found" }, 404));

export default app;
export type { Bindings } from "./http";

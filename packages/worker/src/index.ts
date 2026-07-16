/**
 * agentic-keyvault Worker entrypoint — REST API.
 * See docs/ARCHITECTURE.md for the API surface and design.
 */
import { Hono } from "hono";
import { HTTPException } from "hono/http-exception";
import { secureHeaders } from "hono/secure-headers";
import { bodyLimit } from "hono/body-limit";
import type { AppEnv } from "./http";
import { requireAuth } from "./auth";
import { bootstrap } from "./routes/bootstrap";
import { projects } from "./routes/projects";
import { secrets } from "./routes/secrets";
import { tokens } from "./routes/tokens";
import { audit } from "./routes/audit";
import { kek } from "./routes/kek";
import { authRoutes } from "./routes/auth";
import { searchRoutes } from "./routes/search";
import { idempotency } from "./idempotency";

// A secret value should never approach this; caps memory use and abuse.
const MAX_BODY_BYTES = 256 * 1024;

const app = new Hono<AppEnv>();

app.use("*", secureHeaders());
app.use(
  "/v1/*",
  bodyLimit({
    maxSize: MAX_BODY_BYTES,
    onError: (c) => c.json({ error: "request body too large" }, 413)
  })
);

app.get("/health", (c) => c.json({ ok: true, service: "agentic-keyvault" }));

// Unauthenticated, one-time.
app.route("/v1/bootstrap", bootstrap);

// Everything below requires a bearer token.
app.use("/v1/*", requireAuth);
app.use("/v1/*", idempotency);
app.route("/v1/auth", authRoutes);
app.route("/v1/projects", projects);
app.route("/v1/secrets", secrets);
app.route("/v1/tokens", tokens);
app.route("/v1/audit", audit);
app.route("/v1/kek", kek);
app.route("/v1/search", searchRoutes);

app.onError((err, c) => {
  if (err instanceof HTTPException) {
    return c.json({ error: err.message }, err.status);
  }
  console.error(JSON.stringify({ level: "error", msg: "unhandled", error: String(err) }));
  return c.json({ error: "internal error" }, 500);
});

app.notFound((c) => c.json({ error: "not found" }, 404));

export default app;
export type { Bindings } from "./http";

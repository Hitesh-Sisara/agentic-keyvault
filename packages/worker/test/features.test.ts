import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

const BASE = "https://kv.test";

async function reset() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM idempotency_keys"),
    env.DB.prepare("DELETE FROM secret_versions"),
    env.DB.prepare("DELETE FROM secrets"),
    env.DB.prepare("DELETE FROM repos"),
    env.DB.prepare("DELETE FROM tokens"),
    env.DB.prepare("DELETE FROM projects"),
    env.DB.prepare("DELETE FROM audit_log")
  ]);
}
beforeEach(reset);

async function req(method: string, path: string, token?: string, body?: unknown, headers: Record<string, string> = {}) {
  const h: Record<string, string> = { ...headers };
  if (token) h["Authorization"] = `Bearer ${token}`;
  if (body !== undefined) h["Content-Type"] = "application/json";
  return SELF.fetch(`${BASE}${path}`, {
    method,
    headers: h,
    body: body !== undefined ? JSON.stringify(body) : undefined
  });
}

async function admin(): Promise<string> {
  return ((await (await req("POST", "/v1/bootstrap")).json()) as { token: string }).token;
}
async function newProject(token: string, name: string): Promise<string> {
  return ((await (await req("POST", "/v1/projects", token, { name })).json()) as { id: string }).id;
}

describe("bulk set", () => {
  it("creates many secrets atomically and versions on repeat", async () => {
    const t = await admin();
    const p = await newProject(t, "Bulk");
    const first = await req("POST", "/v1/secrets/bulk", t, {
      projectId: p,
      items: [
        { name: "A", value: "1", isEnv: true },
        { name: "B", value: "2", isEnv: true }
      ]
    });
    expect(first.status).toBe(201);
    const body = (await first.json()) as { results: Array<{ name: string; version: number; created: boolean }> };
    expect(body.results.map((r) => r.created)).toEqual([true, true]);

    // second bulk versions them
    const second = await req("POST", "/v1/secrets/bulk", t, {
      projectId: p,
      items: [{ name: "A", value: "1b" }]
    });
    const b2 = (await second.json()) as { results: Array<{ version: number; created: boolean }> };
    expect(b2.results[0]).toMatchObject({ version: 2, created: false });

    const exp = (await (await req("GET", `/v1/secrets/export?project=${p}&env=1`, t)).json()) as {
      secrets: Array<{ name: string; value: string }>;
    };
    const map = Object.fromEntries(exp.secrets.map((s) => [s.name, s.value]));
    expect(map).toEqual({ A: "1b", B: "2" });
  });
});

describe("search", () => {
  it("finds projects and secrets by term (metadata only)", async () => {
    const t = await admin();
    const p = await newProject(t, "Payments");
    await req("PUT", "/v1/secrets", t, { projectId: p, name: "STRIPE_KEY", value: "x" });

    const res = (await (await req("GET", "/v1/search?q=stripe", t)).json()) as {
      secrets: Array<{ name: string }>;
    };
    expect(res.secrets.map((s) => s.name)).toContain("STRIPE_KEY");

    const projHit = (await (await req("GET", "/v1/search?q=paymen&type=project", t)).json()) as {
      projects: Array<{ name: string }>;
    };
    expect(projHit.projects[0]?.name).toBe("Payments");
  });
});

describe("token exchange", () => {
  it("mints a short-lived project-scoped child; cannot escalate write", async () => {
    const t = await admin();
    const p = await newProject(t, "Exch");

    // read-only project token
    const ro = ((await (
      await req("POST", "/v1/tokens", t, { name: "ro", scope: "project", projectId: p, canWrite: false })
    ).json()) as { token: string }).token;

    // ro exchanges for a child; asking for write must NOT grant write
    const child = await req("POST", "/v1/auth/exchange", ro, { canWrite: true, ttlSeconds: 120 });
    expect(child.status).toBe(201);
    const cb = (await child.json()) as { token: string; can_write: boolean; project: string };
    expect(cb.can_write).toBe(false);
    expect(cb.project).toBe(p);

    // child can read
    const who = (await (await req("GET", "/v1/auth/whoami", cb.token)).json()) as { token_type: string };
    expect(who.token_type).toBe("project");
  });
});

describe("idempotency", () => {
  it("replays the same response for a repeated Idempotency-Key", async () => {
    const t = await admin();
    const p = await newProject(t, "Idem");
    const headers = { "Idempotency-Key": "abc-123" };

    const r1 = await req("PUT", "/v1/secrets", t, { projectId: p, name: "K", value: "v1" }, headers);
    const b1 = (await r1.json()) as { id: string; version: number };

    // Same key with a DIFFERENT body returns the original cached response.
    const r2 = await req("PUT", "/v1/secrets", t, { projectId: p, name: "K", value: "v2" }, headers);
    expect(r2.headers.get("Idempotent-Replay")).toBe("true");
    const b2 = (await r2.json()) as { id: string; version: number };
    expect(b2.id).toBe(b1.id);
    expect(b2.version).toBe(b1.version);

    // Only one version was actually written.
    const versions = (await (await req("GET", `/v1/secrets/${b1.id}/versions`, t)).json()) as {
      versions: unknown[];
    };
    expect(versions.versions.length).toBe(1);
  });
});

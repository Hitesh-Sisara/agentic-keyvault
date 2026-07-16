import { SELF, env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";

const BASE = "https://kv.test";

async function reset() {
  await env.DB.batch([
    env.DB.prepare("DELETE FROM secret_versions"),
    env.DB.prepare("DELETE FROM secrets"),
    env.DB.prepare("DELETE FROM repos"),
    env.DB.prepare("DELETE FROM tokens"),
    env.DB.prepare("DELETE FROM projects"),
    env.DB.prepare("DELETE FROM audit_log")
  ]);
}
beforeEach(reset);

interface ReqOpts {
  token?: string;
  body?: unknown;
}
async function req(method: string, path: string, opts: ReqOpts = {}): Promise<Response> {
  const headers: Record<string, string> = {};
  if (opts.token) headers["Authorization"] = `Bearer ${opts.token}`;
  if (opts.body !== undefined) headers["Content-Type"] = "application/json";
  return SELF.fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined
  });
}

async function bootstrapAdmin(): Promise<string> {
  const res = await req("POST", "/v1/bootstrap");
  expect(res.status).toBe(201);
  return ((await res.json()) as { token: string }).token;
}

describe("health & auth", () => {
  it("health is public", async () => {
    const res = await req("GET", "/health");
    expect(res.status).toBe(200);
  });

  it("protected routes reject missing/invalid tokens", async () => {
    expect((await req("GET", "/v1/projects")).status).toBe(401);
    expect((await req("GET", "/v1/projects", { token: "akv_nope" })).status).toBe(401);
  });
});

describe("bootstrap", () => {
  it("mints the first admin token once, then refuses", async () => {
    const first = await req("POST", "/v1/bootstrap");
    expect(first.status).toBe(201);
    const second = await req("POST", "/v1/bootstrap");
    expect(second.status).toBe(403);
  });
});

describe("end-to-end secret lifecycle", () => {
  it("project -> repo -> secret -> version -> rotate -> history", async () => {
    const admin = await bootstrapAdmin();

    const proj = (await (
      await req("POST", "/v1/projects", { token: admin, body: { name: "Payments" } })
    ).json()) as { id: string };
    expect(proj.id).toBeTruthy();

    await req("POST", `/v1/projects/${proj.id}/repos`, {
      token: admin,
      body: { origin: "git@github.com:acme/payments.git" }
    });

    // create secret (repo-scoped, via origin)
    const put = await req("PUT", "/v1/secrets", {
      token: admin,
      body: {
        projectId: proj.id,
        origin: "https://github.com/acme/payments",
        name: "STRIPE_KEY",
        value: "sk_live_1",
        isEnv: true
      }
    });
    expect(put.status).toBe(201);
    const secretId = ((await put.json()) as { id: string }).id;

    // read value back
    const read1 = (await (await req("GET", `/v1/secrets/${secretId}`, { token: admin })).json()) as {
      value: string;
      version: number;
    };
    expect(read1.value).toBe("sk_live_1");
    expect(read1.version).toBe(1);

    // rotate
    await req("POST", `/v1/secrets/${secretId}/rotate`, { token: admin, body: { value: "sk_live_2" } });
    const read2 = (await (await req("GET", `/v1/secrets/${secretId}`, { token: admin })).json()) as {
      value: string;
      version: number;
    };
    expect(read2.value).toBe("sk_live_2");
    expect(read2.version).toBe(2);

    // old version still recoverable
    const v1 = (await (
      await req("GET", `/v1/secrets/${secretId}/versions/1`, { token: admin })
    ).json()) as { value: string };
    expect(v1.value).toBe("sk_live_1");

    // env listing
    const list = (await (
      await req("GET", `/v1/secrets?project=${proj.id}&env=1`, { token: admin })
    ).json()) as { secrets: unknown[] };
    expect(list.secrets.length).toBe(1);

    // batch export returns decrypted values in one call
    const exported = (await (
      await req("GET", `/v1/secrets/export?project=${proj.id}&env=1`, { token: admin })
    ).json()) as { secrets: Array<{ name: string; value: string }> };
    expect(exported.secrets).toEqual([{ name: "STRIPE_KEY", value: "sk_live_2", version: 2, is_env: 1 }]);
  });
});

describe("project-scoped tokens", () => {
  it("read-only token can read but not write; wrong project denied", async () => {
    const admin = await bootstrapAdmin();
    const projA = (await (
      await req("POST", "/v1/projects", { token: admin, body: { name: "A" } })
    ).json()) as { id: string };
    const projB = (await (
      await req("POST", "/v1/projects", { token: admin, body: { name: "B" } })
    ).json()) as { id: string };

    await req("PUT", "/v1/secrets", {
      token: admin,
      body: { projectId: projA.id, name: "K", value: "v1" }
    });

    // read-only token scoped to A
    const roToken = ((await (
      await req("POST", "/v1/tokens", {
        token: admin,
        body: { name: "ro", scope: "project", projectId: projA.id, canWrite: false }
      })
    ).json()) as { token: string }).token;

    // can list A's secrets
    const listA = await req("GET", `/v1/secrets?project=${projA.id}`, { token: roToken });
    expect(listA.status).toBe(200);

    // cannot write to A
    const writeA = await req("PUT", "/v1/secrets", {
      token: roToken,
      body: { projectId: projA.id, name: "K2", value: "x" }
    });
    expect(writeA.status).toBe(403);

    // cannot touch B
    const listB = await req("GET", `/v1/secrets?project=${projB.id}`, { token: roToken });
    expect(listB.status).toBe(403);
  });
});

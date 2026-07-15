import { env } from "cloudflare:test";
import { describe, it, expect, beforeEach } from "vitest";
import { loadKek } from "../src/crypto";
import { createProject, listProjects, getProjectBySlug } from "../src/store/projects";
import { createRepo, getRepoByOrigin, normalizeOrigin } from "../src/store/repos";
import { listSecrets, listVersions, softDeleteSecret, getSecretByScopeName } from "../src/store/secrets";
import { setSecret, getSecretValue, getVersionValue } from "../src/secret-service";
import { mintToken, findTokenByPlaintext, revokeToken } from "../src/store/tokens";

const db = env.DB;

async function reset() {
  await db.batch([
    db.prepare("DELETE FROM secret_versions"),
    db.prepare("DELETE FROM secrets"),
    db.prepare("DELETE FROM repos"),
    db.prepare("DELETE FROM tokens"),
    db.prepare("DELETE FROM projects")
  ]);
}

beforeEach(reset);

describe("projects & repos", () => {
  it("creates and lists projects with slugs", async () => {
    const p = await createProject(db, "My Payments App", "prod keys");
    expect(p.slug).toBe("my-payments-app");
    expect((await listProjects(db)).length).toBe(1);
    expect((await getProjectBySlug(db, "my-payments-app"))?.id).toBe(p.id);
  });

  it("normalizes git origins (ssh & https collapse)", () => {
    const a = normalizeOrigin("git@github.com:Hitesh-Sisara/agentic-keyvault.git");
    const b = normalizeOrigin("https://github.com/Hitesh-Sisara/agentic-keyvault");
    expect(a.origin).toBe(b.origin);
    expect(a.origin).toBe("github.com/hitesh-sisara/agentic-keyvault");
    expect(a.provider).toBe("github");
    expect(a.owner).toBe("hitesh-sisara");
    expect(a.name).toBe("agentic-keyvault");
  });

  it("binds a repo and finds it by any origin form", async () => {
    const p = await createProject(db, "Repo Project");
    await createRepo(db, p.id, "git@github.com:foo/bar.git");
    const found = await getRepoByOrigin(db, "https://github.com/foo/bar");
    expect(found?.name).toBe("bar");
  });
});

describe("secrets: versioning & recoverability", () => {
  it("creates, versions, and decrypts the current value", async () => {
    const kek = await loadKek(env.MASTER_KEK);
    const p = await createProject(db, "App");

    const first = await setSecret(db, kek, {
      projectId: p.id,
      repoId: null,
      name: "STRIPE_KEY",
      value: "sk_live_v1"
    });
    expect(first.created).toBe(true);
    expect(first.version).toBe(1);

    const second = await setSecret(db, kek, {
      projectId: p.id,
      repoId: null,
      name: "STRIPE_KEY",
      value: "sk_live_v2",
      comment: "rotated"
    });
    expect(second.created).toBe(false);
    expect(second.version).toBe(2);

    const current = await getSecretValue(db, kek, first.secret.id);
    expect(current?.value).toBe("sk_live_v2");
    expect(current?.version).toBe(2);

    // Old versions are never lost — the whole point.
    const old = await getVersionValue(db, kek, first.secret.id, 1);
    expect(old?.value).toBe("sk_live_v1");

    const history = await listVersions(db, first.secret.id);
    expect(history.map((v) => v.version)).toEqual([2, 1]);
  });

  it("separates general (repo-less) and repo-scoped secrets with the same name", async () => {
    const kek = await loadKek(env.MASTER_KEK);
    const p = await createProject(db, "Scoped");
    const repo = await createRepo(db, p.id, "github.com/x/y");

    await setSecret(db, kek, { projectId: p.id, repoId: null, name: "TOKEN", value: "general" });
    await setSecret(db, kek, { projectId: p.id, repoId: repo.id, name: "TOKEN", value: "repo", isEnv: true });

    const general = await getSecretByScopeName(db, p.id, null, "TOKEN");
    const scoped = await getSecretByScopeName(db, p.id, repo.id, "TOKEN");
    expect(general?.id).not.toBe(scoped?.id);

    expect((await getSecretValue(db, kek, general!.id))?.value).toBe("general");
    expect((await getSecretValue(db, kek, scoped!.id))?.value).toBe("repo");

    const envList = await listSecrets(db, { projectId: p.id, repoId: repo.id, envOnly: true });
    expect(envList.length).toBe(1);
  });

  it("soft-delete hides metadata but keeps versions recoverable", async () => {
    const kek = await loadKek(env.MASTER_KEK);
    const p = await createProject(db, "Del");
    const { secret } = await setSecret(db, kek, { projectId: p.id, repoId: null, name: "K", value: "v" });

    await softDeleteSecret(db, secret.id);
    expect((await listSecrets(db, { projectId: p.id })).length).toBe(0);
    expect(await getSecretValue(db, kek, secret.id)).toBeNull();
    // version data still present
    expect((await getVersionValue(db, kek, secret.id, 1))?.value).toBe("v");
  });
});

describe("tokens", () => {
  it("mints, looks up by plaintext, and revokes", async () => {
    const { token, row } = await mintToken(db, { name: "agent", scope: "admin", canWrite: true });
    expect(token.startsWith("akv_")).toBe(true);

    const found = await findTokenByPlaintext(db, token);
    expect(found?.id).toBe(row.id);
    expect(found?.revoked).toBe(0);

    await revokeToken(db, row.id);
    expect((await findTokenByPlaintext(db, token))?.revoked).toBe(1);
  });
});

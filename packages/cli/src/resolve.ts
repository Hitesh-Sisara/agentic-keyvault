import type { KeyvaultClient, SecretMeta } from "@agentic-keyvault/shared";
import { detectOrigin } from "./git";

export interface ScopeOpts {
  project: string;
  repo?: string;
  origin?: string;
  auto?: boolean; // auto-detect current git origin
}

/** Resolve the repo id for a scope, or null for a general (repo-less) secret. */
export async function resolveRepoId(
  client: KeyvaultClient,
  opts: ScopeOpts
): Promise<string | null> {
  if (opts.repo) return opts.repo;
  const origin = opts.origin ?? (opts.auto ? detectOrigin() : null);
  if (!origin) return null;
  const repos = await client.listRepos(opts.project);
  const norm = origin.toLowerCase().replace(/\.git$/, "");
  const match = repos.find(
    (r) => r.origin === norm || (r.name && norm.endsWith(`/${r.name}`))
  );
  if (!match) throw new Error(`origin "${origin}" is not bound to project ${opts.project}`);
  return match.id;
}

/** Find a secret's metadata by name within a scope. */
export async function findSecretByName(
  client: KeyvaultClient,
  projectId: string,
  repoId: string | null,
  name: string
): Promise<SecretMeta> {
  const list = await client.listSecrets(projectId, { repo: repoId });
  const match = list.find((s) => s.name === name);
  if (!match) throw new Error(`secret "${name}" not found in the given scope`);
  return match;
}

import type { KeyvaultClient } from "@agentic-keyvault/shared";
import { resolveRepoId, type ScopeOpts } from "../resolve";

export interface KeyValue {
  name: string;
  value: string;
}

/**
 * Collect the decrypted env secrets for a scope — the payload every sync target
 * pushes. Only secrets marked `is_env` are included.
 */
export async function collectEnvSecrets(
  client: KeyvaultClient,
  scope: ScopeOpts
): Promise<KeyValue[]> {
  const repoId = await resolveRepoId(client, scope);
  const metas = await client.listSecrets(scope.project, { repo: repoId, env: true });
  const out: KeyValue[] = [];
  for (const meta of metas) {
    const secret = await client.getSecret(meta.id);
    out.push({ name: meta.name, value: secret.value });
  }
  return out;
}

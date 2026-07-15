import type { Token, TokenScope } from "../types";
import { newTokenId, generateToken, sha256Hex } from "../ids";

export interface MintTokenInput {
  name: string;
  scope: TokenScope;
  projectId?: string | null;
  canWrite?: boolean;
  expiresAt?: number | null;
}

/** Create a token, returning the plaintext ONCE plus the stored row. */
export async function mintToken(
  db: D1Database,
  input: MintTokenInput
): Promise<{ token: string; row: Token }> {
  const token = generateToken();
  const row: Token = {
    id: newTokenId(),
    name: input.name,
    token_hash: await sha256Hex(token),
    scope: input.scope,
    project_id: input.projectId ?? null,
    can_write: input.canWrite ? 1 : 0,
    created_at: Date.now(),
    last_used_at: null,
    expires_at: input.expiresAt ?? null,
    revoked: 0
  };
  await db
    .prepare(
      "INSERT INTO tokens (id, name, token_hash, scope, project_id, can_write, created_at, last_used_at, expires_at, revoked) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
    )
    .bind(
      row.id,
      row.name,
      row.token_hash,
      row.scope,
      row.project_id,
      row.can_write,
      row.created_at,
      row.last_used_at,
      row.expires_at,
      row.revoked
    )
    .run();
  return { token, row };
}

export async function findTokenByPlaintext(
  db: D1Database,
  token: string
): Promise<Token | null> {
  const hash = await sha256Hex(token);
  return db.prepare("SELECT * FROM tokens WHERE token_hash = ?").bind(hash).first<Token>();
}

export async function touchToken(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE tokens SET last_used_at = ? WHERE id = ?").bind(Date.now(), id).run();
}

export async function listTokens(db: D1Database): Promise<Omit<Token, "token_hash">[]> {
  const { results } = await db
    .prepare(
      "SELECT id, name, scope, project_id, can_write, created_at, last_used_at, expires_at, revoked FROM tokens ORDER BY created_at DESC"
    )
    .all<Omit<Token, "token_hash">>();
  return results;
}

export async function revokeToken(db: D1Database, id: string): Promise<void> {
  await db.prepare("UPDATE tokens SET revoked = 1 WHERE id = ?").bind(id).run();
}

export async function countTokens(db: D1Database): Promise<number> {
  const row = await db.prepare("SELECT COUNT(*) AS n FROM tokens").first<{ n: number }>();
  return row?.n ?? 0;
}

import { sha256Hex } from "../ids";

export interface StoredResponse {
  status: number;
  response: string;
}

export async function idempotencyId(tokenId: string, key: string): Promise<string> {
  return sha256Hex(`${tokenId}:${key}`);
}

export async function getIdempotent(
  db: D1Database,
  id: string
): Promise<StoredResponse | null> {
  return db
    .prepare("SELECT status, response FROM idempotency_keys WHERE id = ?")
    .bind(id)
    .first<StoredResponse>();
}

export async function putIdempotent(
  db: D1Database,
  id: string,
  tokenId: string,
  status: number,
  response: string
): Promise<void> {
  await db
    .prepare(
      "INSERT OR IGNORE INTO idempotency_keys (id, token_id, status, response, created_at) VALUES (?, ?, ?, ?, ?)"
    )
    .bind(id, tokenId, status, response, Date.now())
    .run();
}

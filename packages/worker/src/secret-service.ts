import { seal, open } from "./crypto";
import { newSecretId, newVersionId } from "./ids";
import { getSecret, getSecretByScopeName, getCurrentVersionRow, getVersionRow } from "./store/secrets";
import type { Secret } from "./types";

export interface SetSecretInput {
  projectId: string;
  repoId: string | null;
  name: string;
  value: string;
  isEnv?: boolean;
  description?: string | null;
  comment?: string | null;
  createdBy?: string | null;
}

export interface SetSecretResult {
  secret: Secret;
  version: number;
  created: boolean; // true if the secret was newly created (vs a new version)
}

/**
 * Create a secret or add a new version to an existing one. Append-only:
 * previous versions are always retained. Writes are atomic (D1 batch).
 */
export async function setSecret(
  db: D1Database,
  kek: CryptoKey,
  input: SetSecretInput
): Promise<SetSecretResult> {
  const existing = await getSecretByScopeName(db, input.projectId, input.repoId, input.name);
  const sealed = await seal(input.value, input.name, kek);
  const now = Date.now();
  const versionId = newVersionId();

  if (!existing) {
    const secret: Secret = {
      id: newSecretId(),
      project_id: input.projectId,
      repo_id: input.repoId,
      name: input.name,
      is_env: input.isEnv ? 1 : 0,
      current_version: 1,
      description: input.description ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null
    };
    await db.batch([
      db
        .prepare(
          "INSERT INTO secrets (id, project_id, repo_id, name, is_env, current_version, description, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, NULL)"
        )
        .bind(
          secret.id,
          secret.project_id,
          secret.repo_id,
          secret.name,
          secret.is_env,
          secret.description,
          now,
          now
        ),
      db
        .prepare(
          "INSERT INTO secret_versions (id, secret_id, version, ciphertext, iv_value, wrapped_dek, iv_dek, comment, created_by, created_at) VALUES (?, ?, 1, ?, ?, ?, ?, ?, ?, ?)"
        )
        .bind(
          versionId,
          secret.id,
          sealed.ciphertext,
          sealed.ivValue,
          sealed.wrappedDek,
          sealed.ivDek,
          input.comment ?? null,
          input.createdBy ?? null,
          now
        )
    ]);
    return { secret, version: 1, created: true };
  }

  const nextVersion = existing.current_version + 1;
  await db.batch([
    db
      .prepare(
        "INSERT INTO secret_versions (id, secret_id, version, ciphertext, iv_value, wrapped_dek, iv_dek, comment, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        versionId,
        existing.id,
        nextVersion,
        sealed.ciphertext,
        sealed.ivValue,
        sealed.wrappedDek,
        sealed.ivDek,
        input.comment ?? null,
        input.createdBy ?? null,
        now
      ),
    db
      .prepare(
        "UPDATE secrets SET current_version = ?, updated_at = ?, deleted_at = NULL, is_env = ?, description = COALESCE(?, description) WHERE id = ?"
      )
      .bind(
        nextVersion,
        now,
        input.isEnv === undefined ? existing.is_env : input.isEnv ? 1 : 0,
        input.description ?? null,
        existing.id
      )
  ]);
  return {
    secret: { ...existing, current_version: nextVersion, updated_at: now, deleted_at: null },
    version: nextVersion,
    created: false
  };
}

/** Decrypt and return the current value of a secret. */
export async function getSecretValue(
  db: D1Database,
  kek: CryptoKey,
  secretId: string
): Promise<{ secret: Secret; value: string; version: number } | null> {
  const secret = await getSecret(db, secretId);
  if (!secret || secret.deleted_at) return null;
  const row = await getCurrentVersionRow(db, secretId);
  if (!row) return null;
  const value = await open(
    { ciphertext: row.ciphertext, ivValue: row.iv_value, wrappedDek: row.wrapped_dek, ivDek: row.iv_dek },
    secret.name,
    kek
  );
  return { secret, value, version: row.version };
}

/** Decrypt and return a specific historical version's value. */
export async function getVersionValue(
  db: D1Database,
  kek: CryptoKey,
  secretId: string,
  version: number
): Promise<{ secret: Secret; value: string; version: number } | null> {
  const secret = await getSecret(db, secretId);
  if (!secret) return null;
  const row = await getVersionRow(db, secretId, version);
  if (!row) return null;
  const value = await open(
    { ciphertext: row.ciphertext, ivValue: row.iv_value, wrappedDek: row.wrapped_dek, ivDek: row.iv_dek },
    secret.name,
    kek
  );
  return { secret, value, version: row.version };
}

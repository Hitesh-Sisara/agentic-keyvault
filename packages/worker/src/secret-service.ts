import { sealValue, openValue, rewrapDek, type Keyring } from "./crypto";
import { newSecretId, newVersionId } from "./ids";
import {
  getSecret,
  getSecretByScopeName,
  getCurrentVersionRow,
  getVersionRow,
  listSecrets,
  listAllWrapFields,
  updateVersionWrap
} from "./store/secrets";
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
  created: boolean;
}

/**
 * Create a secret or add a new version. Append-only: previous versions are
 * always retained. Writes are atomic (D1 batch).
 */
export async function setSecret(
  db: D1Database,
  keyring: Keyring,
  input: SetSecretInput
): Promise<SetSecretResult> {
  const existing = await getSecretByScopeName(db, input.projectId, input.repoId, input.name);
  const now = Date.now();
  const built = await buildWrite(db, keyring, input.projectId, input.repoId, existing, input, now);
  await db.batch(built.stmts);
  return { secret: built.secret, version: built.version, created: built.created };
}

interface WriteItem {
  name: string;
  value: string;
  isEnv?: boolean;
  description?: string | null;
  comment?: string | null;
  createdBy?: string | null;
}

/** Build the D1 statements for one create-or-version write (no execution). */
async function buildWrite(
  db: D1Database,
  keyring: Keyring,
  projectId: string,
  repoId: string | null,
  existing: Secret | null,
  item: WriteItem,
  now: number
): Promise<{ stmts: D1PreparedStatement[]; secret: Secret; version: number; created: boolean }> {
  const { sealed, kekVersion } = await sealValue(item.value, item.name, keyring);
  const versionId = newVersionId();
  const insertVersion = (secretId: string, version: number) =>
    db
      .prepare(
        "INSERT INTO secret_versions (id, secret_id, version, ciphertext, iv_value, wrapped_dek, iv_dek, kek_version, comment, created_by, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)"
      )
      .bind(
        versionId,
        secretId,
        version,
        sealed.ciphertext,
        sealed.ivValue,
        sealed.wrappedDek,
        sealed.ivDek,
        kekVersion,
        item.comment ?? null,
        item.createdBy ?? null,
        now
      );

  if (!existing) {
    const secret: Secret = {
      id: newSecretId(),
      project_id: projectId,
      repo_id: repoId,
      name: item.name,
      is_env: item.isEnv ? 1 : 0,
      current_version: 1,
      description: item.description ?? null,
      created_at: now,
      updated_at: now,
      deleted_at: null
    };
    const insertSecret = db
      .prepare(
        "INSERT INTO secrets (id, project_id, repo_id, name, is_env, current_version, description, created_at, updated_at, deleted_at) VALUES (?, ?, ?, ?, ?, 1, ?, ?, ?, NULL)"
      )
      .bind(secret.id, secret.project_id, secret.repo_id, secret.name, secret.is_env, secret.description, now, now);
    return { stmts: [insertSecret, insertVersion(secret.id, 1)], secret, version: 1, created: true };
  }

  const nextVersion = existing.current_version + 1;
  const updateSecret = db
    .prepare(
      "UPDATE secrets SET current_version = ?, updated_at = ?, deleted_at = NULL, is_env = ?, description = COALESCE(?, description) WHERE id = ?"
    )
    .bind(
      nextVersion,
      now,
      item.isEnv === undefined ? existing.is_env : item.isEnv ? 1 : 0,
      item.description ?? null,
      existing.id
    );
  return {
    stmts: [insertVersion(existing.id, nextVersion), updateSecret],
    secret: { ...existing, current_version: nextVersion, updated_at: now, deleted_at: null },
    version: nextVersion,
    created: false
  };
}

export interface BulkItem {
  name: string;
  value: string;
  isEnv?: boolean;
  description?: string;
}

export interface BulkResult {
  name: string;
  version: number;
  created: boolean;
}

/** Atomically create/version many secrets in one scope (single D1 batch). */
export async function setSecretsBulk(
  db: D1Database,
  keyring: Keyring,
  input: { projectId: string; repoId: string | null; items: BulkItem[]; createdBy?: string | null }
): Promise<BulkResult[]> {
  const now = Date.now();
  const existings = await Promise.all(
    input.items.map((it) => getSecretByScopeName(db, input.projectId, input.repoId, it.name))
  );
  const stmts: D1PreparedStatement[] = [];
  const results: BulkResult[] = [];
  for (let i = 0; i < input.items.length; i++) {
    const it = input.items[i]!;
    const built = await buildWrite(db, keyring, input.projectId, input.repoId, existings[i] ?? null, {
      name: it.name,
      value: it.value,
      isEnv: it.isEnv,
      description: it.description,
      createdBy: input.createdBy
    }, now);
    stmts.push(...built.stmts);
    results.push({ name: it.name, version: built.version, created: built.created });
  }
  await db.batch(stmts);
  return results;
}

export async function getSecretValue(
  db: D1Database,
  keyring: Keyring,
  secretId: string
): Promise<{ secret: Secret; value: string; version: number } | null> {
  const secret = await getSecret(db, secretId);
  if (!secret || secret.deleted_at) return null;
  const row = await getCurrentVersionRow(db, secretId);
  if (!row) return null;
  const value = await openValue(
    { ciphertext: row.ciphertext, ivValue: row.iv_value, wrappedDek: row.wrapped_dek, ivDek: row.iv_dek },
    secret.name,
    keyring,
    row.kek_version
  );
  return { secret, value, version: row.version };
}

export async function getVersionValue(
  db: D1Database,
  keyring: Keyring,
  secretId: string,
  version: number
): Promise<{ secret: Secret; value: string; version: number } | null> {
  const secret = await getSecret(db, secretId);
  if (!secret) return null;
  const row = await getVersionRow(db, secretId, version);
  if (!row) return null;
  const value = await openValue(
    { ciphertext: row.ciphertext, ivValue: row.iv_value, wrappedDek: row.wrapped_dek, ivDek: row.iv_dek },
    secret.name,
    keyring,
    row.kek_version
  );
  return { secret, value, version: row.version };
}

export interface ExportedSecret {
  name: string;
  value: string;
  version: number;
  is_env: number;
}

/**
 * Decrypt every (current) secret value in a scope in a single call — avoids the
 * N+1 round-trips of fetching each secret individually. Powers `env pull`,
 * `sync`, and `run`.
 */
export async function exportSecrets(
  db: D1Database,
  keyring: Keyring,
  filter: { projectId: string; repoId?: string | null; envOnly?: boolean }
): Promise<ExportedSecret[]> {
  const metas = await listSecrets(db, {
    projectId: filter.projectId,
    repoId: filter.repoId,
    envOnly: filter.envOnly
  });
  const out: ExportedSecret[] = [];
  for (const meta of metas) {
    const row = await getCurrentVersionRow(db, meta.id);
    if (!row) continue;
    const value = await openValue(
      { ciphertext: row.ciphertext, ivValue: row.iv_value, wrappedDek: row.wrapped_dek, ivDek: row.iv_dek },
      meta.name,
      keyring,
      row.kek_version
    );
    out.push({ name: meta.name, value, version: row.version, is_env: meta.is_env });
  }
  return out;
}

/**
 * Re-wrap every DEK not already at the active KEK version. Values are never
 * re-encrypted — only the DEK wrapping changes. Returns how many were rotated.
 */
export async function rotateKek(db: D1Database, keyring: Keyring): Promise<number> {
  const rows = await listAllWrapFields(db);
  let rotated = 0;
  for (const row of rows) {
    if (row.kek_version === keyring.active) continue;
    const rewrapped = await rewrapDek(
      { wrappedDek: row.wrapped_dek, ivDek: row.iv_dek },
      keyring,
      row.kek_version
    );
    await updateVersionWrap(db, row.id, rewrapped.wrappedDek, rewrapped.ivDek, rewrapped.kekVersion);
    rotated++;
  }
  return rotated;
}

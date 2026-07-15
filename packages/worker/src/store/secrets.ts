import type { Secret, SecretVersionRow } from "../types";

export interface ListSecretsFilter {
  projectId: string;
  repoId?: string | null; // undefined = any scope; null = general (repo-less) only
  envOnly?: boolean;
  includeDeleted?: boolean;
}

export async function getSecret(db: D1Database, id: string): Promise<Secret | null> {
  return db.prepare("SELECT * FROM secrets WHERE id = ?").bind(id).first<Secret>();
}

export async function getSecretByScopeName(
  db: D1Database,
  projectId: string,
  repoId: string | null,
  name: string
): Promise<Secret | null> {
  return db
    .prepare(
      "SELECT * FROM secrets WHERE project_id = ? AND COALESCE(repo_id, '') = COALESCE(?, '') AND name = ?"
    )
    .bind(projectId, repoId, name)
    .first<Secret>();
}

export async function listSecrets(
  db: D1Database,
  filter: ListSecretsFilter
): Promise<Secret[]> {
  const clauses = ["project_id = ?"];
  const binds: unknown[] = [filter.projectId];

  if (filter.repoId !== undefined) {
    if (filter.repoId === null) {
      clauses.push("repo_id IS NULL");
    } else {
      clauses.push("repo_id = ?");
      binds.push(filter.repoId);
    }
  }
  if (filter.envOnly) clauses.push("is_env = 1");
  if (!filter.includeDeleted) clauses.push("deleted_at IS NULL");

  const { results } = await db
    .prepare(`SELECT * FROM secrets WHERE ${clauses.join(" AND ")} ORDER BY name ASC`)
    .bind(...binds)
    .all<Secret>();
  return results;
}

export async function getCurrentVersionRow(
  db: D1Database,
  secretId: string
): Promise<SecretVersionRow | null> {
  return db
    .prepare(
      "SELECT v.* FROM secret_versions v JOIN secrets s ON s.id = v.secret_id AND s.current_version = v.version WHERE v.secret_id = ?"
    )
    .bind(secretId)
    .first<SecretVersionRow>();
}

export async function getVersionRow(
  db: D1Database,
  secretId: string,
  version: number
): Promise<SecretVersionRow | null> {
  return db
    .prepare("SELECT * FROM secret_versions WHERE secret_id = ? AND version = ?")
    .bind(secretId, version)
    .first<SecretVersionRow>();
}

export type VersionMetaRow = Pick<
  SecretVersionRow,
  "id" | "secret_id" | "version" | "kek_version" | "comment" | "created_by" | "created_at"
>;

export async function listVersions(db: D1Database, secretId: string): Promise<VersionMetaRow[]> {
  const { results } = await db
    .prepare(
      "SELECT id, secret_id, version, kek_version, comment, created_by, created_at FROM secret_versions WHERE secret_id = ? ORDER BY version DESC"
    )
    .bind(secretId)
    .all<VersionMetaRow>();
  return results;
}

export interface RewrapRow {
  id: string;
  wrapped_dek: string;
  iv_dek: string;
  kek_version: number;
}

/** All version DEK-wrap fields, for KEK rotation. */
export async function listAllWrapFields(db: D1Database): Promise<RewrapRow[]> {
  const { results } = await db
    .prepare("SELECT id, wrapped_dek, iv_dek, kek_version FROM secret_versions")
    .all<RewrapRow>();
  return results;
}

export async function updateVersionWrap(
  db: D1Database,
  id: string,
  wrappedDek: string,
  ivDek: string,
  kekVersion: number
): Promise<void> {
  await db
    .prepare("UPDATE secret_versions SET wrapped_dek = ?, iv_dek = ?, kek_version = ? WHERE id = ?")
    .bind(wrappedDek, ivDek, kekVersion, id)
    .run();
}

export async function softDeleteSecret(db: D1Database, id: string): Promise<void> {
  await db
    .prepare("UPDATE secrets SET deleted_at = ?, updated_at = ? WHERE id = ?")
    .bind(Date.now(), Date.now(), id)
    .run();
}

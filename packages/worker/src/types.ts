export interface Project {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  created_at: number;
}

export interface Repo {
  id: string;
  project_id: string;
  origin: string;
  provider: string | null;
  owner: string | null;
  name: string | null;
  created_at: number;
}

/** Secret metadata — never carries a plaintext or ciphertext value. */
export interface Secret {
  id: string;
  project_id: string;
  repo_id: string | null;
  name: string;
  is_env: number;
  current_version: number;
  description: string | null;
  created_at: number;
  updated_at: number;
  deleted_at: number | null;
}

export interface SecretVersionRow {
  id: string;
  secret_id: string;
  version: number;
  ciphertext: string;
  iv_value: string;
  wrapped_dek: string;
  iv_dek: string;
  comment: string | null;
  created_by: string | null;
  created_at: number;
}

export type TokenScope = "admin" | "project";

export interface Token {
  id: string;
  name: string;
  token_hash: string;
  scope: TokenScope;
  project_id: string | null;
  can_write: number;
  created_at: number;
  last_used_at: number | null;
  expires_at: number | null;
  revoked: number;
}

export interface AuditEntry {
  id: string;
  actor_token_id: string | null;
  action: string;
  target_type: string | null;
  target_id: string | null;
  metadata: string | null;
  ip: string | null;
  created_at: number;
}

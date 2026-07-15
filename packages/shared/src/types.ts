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

export interface ProjectWithRepos extends Project {
  repos: Repo[];
}

export interface SecretMeta {
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

export interface SecretValue extends SecretMeta {
  value: string;
  version: number;
}

export interface VersionMeta {
  id: string;
  secret_id: string;
  version: number;
  comment: string | null;
  created_by: string | null;
  created_at: number;
}

export interface TokenInfo {
  id: string;
  name: string;
  scope: "admin" | "project";
  project_id: string | null;
  can_write: number;
  created_at: number;
  last_used_at: number | null;
  expires_at: number | null;
  revoked: number;
}

export interface MintedToken {
  token: string;
  id: string;
  name?: string;
  scope: "admin" | "project";
  can_write?: number;
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

export interface SetSecretInput {
  projectId: string;
  name: string;
  value: string;
  repoId?: string | null;
  origin?: string;
  isEnv?: boolean;
  description?: string;
  comment?: string;
}

export interface MintTokenInput {
  name: string;
  scope: "admin" | "project";
  projectId?: string;
  canWrite?: boolean;
  expiresAt?: number;
}

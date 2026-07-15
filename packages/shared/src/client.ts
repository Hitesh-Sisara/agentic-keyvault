import type {
  Project,
  ProjectWithRepos,
  Repo,
  SecretMeta,
  SecretValue,
  VersionMeta,
  TokenInfo,
  MintedToken,
  AuditEntry,
  SetSecretInput,
  MintTokenInput
} from "./types";

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ClientOptions {
  baseUrl: string;
  token?: string;
  fetch?: typeof fetch;
}

/** Thin, typed client over the agentic-keyvault REST API. Shared by CLI and MCP. */
export class KeyvaultClient {
  private baseUrl: string;
  private token?: string;
  private fetchImpl: typeof fetch;

  constructor(opts: ClientOptions) {
    this.baseUrl = opts.baseUrl.replace(/\/+$/, "");
    this.token = opts.token;
    this.fetchImpl = opts.fetch ?? fetch;
  }

  private async request<T>(method: string, path: string, body?: unknown): Promise<T> {
    const headers: Record<string, string> = {};
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    if (body !== undefined) headers["Content-Type"] = "application/json";

    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers,
      body: body !== undefined ? JSON.stringify(body) : undefined
    });

    const text = await res.text();
    const data = text ? JSON.parse(text) : {};
    if (!res.ok) {
      throw new ApiError(res.status, (data as { error?: string }).error ?? res.statusText);
    }
    return data as T;
  }

  // ---- lifecycle ----
  health() {
    return this.request<{ ok: boolean; service: string }>("GET", "/health");
  }
  bootstrap() {
    return this.request<MintedToken>("POST", "/v1/bootstrap");
  }

  // ---- projects & repos ----
  createProject(name: string, description?: string) {
    return this.request<Project>("POST", "/v1/projects", { name, description });
  }
  listProjects() {
    return this.request<{ projects: Project[] }>("GET", "/v1/projects").then((r) => r.projects);
  }
  getProject(id: string) {
    return this.request<ProjectWithRepos>("GET", `/v1/projects/${id}`);
  }
  bindRepo(projectId: string, origin: string) {
    return this.request<Repo>("POST", `/v1/projects/${projectId}/repos`, { origin });
  }
  listRepos(projectId: string) {
    return this.request<{ repos: Repo[] }>("GET", `/v1/projects/${projectId}/repos`).then(
      (r) => r.repos
    );
  }

  // ---- secrets ----
  setSecret(input: SetSecretInput) {
    return this.request<SecretMeta & { version: number }>("PUT", "/v1/secrets", input);
  }
  listSecrets(projectId: string, opts: { repo?: string | null; env?: boolean } = {}) {
    const params = new URLSearchParams({ project: projectId });
    if (opts.repo !== undefined) params.set("repo", opts.repo === null ? "none" : opts.repo);
    if (opts.env) params.set("env", "1");
    return this.request<{ secrets: SecretMeta[] }>("GET", `/v1/secrets?${params}`).then(
      (r) => r.secrets
    );
  }
  getSecret(id: string) {
    return this.request<SecretValue>("GET", `/v1/secrets/${id}`);
  }
  listVersions(id: string) {
    return this.request<{ versions: VersionMeta[] }>("GET", `/v1/secrets/${id}/versions`).then(
      (r) => r.versions
    );
  }
  getVersion(id: string, version: number) {
    return this.request<{ value: string; version: number }>(
      "GET",
      `/v1/secrets/${id}/versions/${version}`
    );
  }
  rotate(id: string, value: string, comment?: string) {
    return this.request<SecretMeta & { version: number }>("POST", `/v1/secrets/${id}/rotate`, {
      value,
      comment
    });
  }
  deleteSecret(id: string) {
    return this.request<{ ok: boolean; id: string }>("DELETE", `/v1/secrets/${id}`);
  }

  // ---- tokens & audit ----
  mintToken(input: MintTokenInput) {
    return this.request<MintedToken>("POST", "/v1/tokens", input);
  }
  listTokens() {
    return this.request<{ tokens: TokenInfo[] }>("GET", "/v1/tokens").then((r) => r.tokens);
  }
  revokeToken(id: string) {
    return this.request<{ ok: boolean; id: string }>("DELETE", `/v1/tokens/${id}`);
  }
  audit(limit = 100) {
    return this.request<{ entries: AuditEntry[] }>("GET", `/v1/audit?limit=${limit}`).then(
      (r) => r.entries
    );
  }

  // ---- key management ----
  rotateKek() {
    return this.request<{ ok: boolean; rotated: number; activeVersion: number }>(
      "POST",
      "/v1/kek/rotate"
    );
  }
}

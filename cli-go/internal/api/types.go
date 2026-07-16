package api

// Project is a group of secrets, optionally bound to git repos.
type Project struct {
	ID          string `json:"id"`
	Name        string `json:"name"`
	Slug        string `json:"slug"`
	Description string `json:"description"`
	CreatedAt   int64  `json:"created_at"`
}

type Repo struct {
	ID        string `json:"id"`
	ProjectID string `json:"project_id"`
	Origin    string `json:"origin"`
	Provider  string `json:"provider"`
	Owner     string `json:"owner"`
	Name      string `json:"name"`
	CreatedAt int64  `json:"created_at"`
}

type ProjectWithRepos struct {
	Project
	Repos []Repo `json:"repos"`
}

// SecretMeta never carries a value.
type SecretMeta struct {
	ID             string `json:"id"`
	ProjectID      string `json:"project_id"`
	RepoID         string `json:"repo_id"`
	Name           string `json:"name"`
	IsEnv          int    `json:"is_env"`
	CurrentVersion int    `json:"current_version"`
	Description    string `json:"description"`
	CreatedAt      int64  `json:"created_at"`
	UpdatedAt      int64  `json:"updated_at"`
}

type SecretValue struct {
	SecretMeta
	Value   string `json:"value"`
	Version int    `json:"version"`
}

type VersionMeta struct {
	Version    int    `json:"version"`
	KekVersion int    `json:"kek_version"`
	Comment    string `json:"comment"`
	CreatedBy  string `json:"created_by"`
	CreatedAt  int64  `json:"created_at"`
}

type ExportedSecret struct {
	Name    string `json:"name"`
	Value   string `json:"value"`
	Version int    `json:"version"`
	IsEnv   int    `json:"is_env"`
}

type TokenInfo struct {
	ID         string `json:"id"`
	Name       string `json:"name"`
	Scope      string `json:"scope"`
	ProjectID  string `json:"project_id"`
	CanWrite   int    `json:"can_write"`
	CreatedAt  int64  `json:"created_at"`
	LastUsedAt int64  `json:"last_used_at"`
	ExpiresAt  int64  `json:"expires_at"`
	Revoked    int    `json:"revoked"`
}

type MintedToken struct {
	Token string `json:"token"`
	ID    string `json:"id"`
	Name  string `json:"name"`
	Scope string `json:"scope"`
}

type AuditEntry struct {
	Action     string `json:"action"`
	TargetType string `json:"target_type"`
	TargetID   string `json:"target_id"`
	Metadata   string `json:"metadata"`
	CreatedAt  int64  `json:"created_at"`
}

// WhoAmI describes the calling token's authority.
type WhoAmI struct {
	TokenType string `json:"token_type"`
	Project   string `json:"project"`
	CanWrite  bool   `json:"can_write"`
	ExpiresAt int64  `json:"expires_at"`
}

// SearchResults is the response of GET /v1/search.
type SearchResults struct {
	Projects []struct {
		ID   string `json:"id"`
		Name string `json:"name"`
		Slug string `json:"slug"`
	} `json:"projects"`
	Repos []struct {
		ID        string `json:"id"`
		ProjectID string `json:"project_id"`
		Origin    string `json:"origin"`
	} `json:"repos"`
	Secrets []struct {
		ID        string `json:"id"`
		ProjectID string `json:"project_id"`
		RepoID    string `json:"repo_id"`
		Name      string `json:"name"`
	} `json:"secrets"`
}

// BulkItem is one entry in a bulk set request.
type BulkItem struct {
	Name  string `json:"name"`
	Value string `json:"value"`
	IsEnv bool   `json:"isEnv,omitempty"`
}

type BulkResult struct {
	Name    string `json:"name"`
	Version int    `json:"version"`
	Created bool   `json:"created"`
}

type ExchangedToken struct {
	Token     string `json:"token"`
	TokenType string `json:"token_type"`
	Project   string `json:"project"`
	CanWrite  bool   `json:"can_write"`
	ExpiresAt int64  `json:"expires_at"`
}

// SetSecretInput is the body for creating/versioning a secret.
type SetSecretInput struct {
	ProjectID   string `json:"projectId"`
	Name        string `json:"name"`
	Value       string `json:"value"`
	RepoID      string `json:"repoId,omitempty"`
	Origin      string `json:"origin,omitempty"`
	IsEnv       bool   `json:"isEnv,omitempty"`
	Description string `json:"description,omitempty"`
	Comment     string `json:"comment,omitempty"`
}

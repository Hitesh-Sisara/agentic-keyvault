package api

import (
	"context"
	"fmt"
	"net/url"
)

func (c *Client) Health(ctx context.Context) error {
	return c.do(ctx, "GET", "/health", nil, nil)
}

func (c *Client) WhoAmI(ctx context.Context) (*WhoAmI, error) {
	var out WhoAmI
	return &out, c.do(ctx, "GET", "/v1/auth/whoami", nil, &out)
}

func (c *Client) Bootstrap(ctx context.Context) (*MintedToken, error) {
	var out MintedToken
	return &out, c.do(ctx, "POST", "/v1/bootstrap", nil, &out)
}

func (c *Client) CreateProject(ctx context.Context, name, description string) (*Project, error) {
	var out Project
	body := map[string]string{"name": name, "description": description}
	return &out, c.do(ctx, "POST", "/v1/projects", body, &out)
}

func (c *Client) ListProjects(ctx context.Context) ([]Project, error) {
	var out struct {
		Projects []Project `json:"projects"`
	}
	return out.Projects, c.do(ctx, "GET", "/v1/projects", nil, &out)
}

func (c *Client) GetProject(ctx context.Context, id string) (*ProjectWithRepos, error) {
	var out ProjectWithRepos
	return &out, c.do(ctx, "GET", "/v1/projects/"+url.PathEscape(id), nil, &out)
}

func (c *Client) BindRepo(ctx context.Context, projectID, origin string) (*Repo, error) {
	var out Repo
	body := map[string]string{"origin": origin}
	return &out, c.do(ctx, "POST", "/v1/projects/"+url.PathEscape(projectID)+"/repos", body, &out)
}

func (c *Client) ListRepos(ctx context.Context, projectID string) ([]Repo, error) {
	var out struct {
		Repos []Repo `json:"repos"`
	}
	return out.Repos, c.do(ctx, "GET", "/v1/projects/"+url.PathEscape(projectID)+"/repos", nil, &out)
}

func (c *Client) SetSecret(ctx context.Context, in SetSecretInput) (*SecretMeta, error) {
	var out SecretMeta
	return &out, c.do(ctx, "PUT", "/v1/secrets", in, &out)
}

type ListSecretsOpts struct {
	Repo    string // "" = any scope; "none" = general only
	RepoSet bool
	EnvOnly bool
}

func (c *Client) ListSecrets(ctx context.Context, projectID string, opts ListSecretsOpts) ([]SecretMeta, error) {
	q := url.Values{"project": {projectID}}
	if opts.RepoSet {
		q.Set("repo", opts.Repo)
	}
	if opts.EnvOnly {
		q.Set("env", "1")
	}
	var out struct {
		Secrets []SecretMeta `json:"secrets"`
	}
	return out.Secrets, c.do(ctx, "GET", "/v1/secrets?"+q.Encode(), nil, &out)
}

func (c *Client) ExportSecrets(ctx context.Context, projectID string, opts ListSecretsOpts) ([]ExportedSecret, error) {
	q := url.Values{"project": {projectID}}
	if opts.RepoSet {
		q.Set("repo", opts.Repo)
	}
	if opts.EnvOnly {
		q.Set("env", "1")
	}
	var out struct {
		Secrets []ExportedSecret `json:"secrets"`
	}
	return out.Secrets, c.do(ctx, "GET", "/v1/secrets/export?"+q.Encode(), nil, &out)
}

func (c *Client) GetSecret(ctx context.Context, id string) (*SecretValue, error) {
	var out SecretValue
	return &out, c.do(ctx, "GET", "/v1/secrets/"+url.PathEscape(id), nil, &out)
}

func (c *Client) GetSecretVersion(ctx context.Context, id string, version int) (string, error) {
	var out struct {
		Value   string `json:"value"`
		Version int    `json:"version"`
	}
	err := c.do(ctx, "GET", fmt.Sprintf("/v1/secrets/%s/versions/%d", url.PathEscape(id), version), nil, &out)
	return out.Value, err
}

func (c *Client) ListVersions(ctx context.Context, id string) ([]VersionMeta, error) {
	var out struct {
		Versions []VersionMeta `json:"versions"`
	}
	return out.Versions, c.do(ctx, "GET", "/v1/secrets/"+url.PathEscape(id)+"/versions", nil, &out)
}

func (c *Client) Rotate(ctx context.Context, id, value, comment string) (*SecretMeta, error) {
	var out SecretMeta
	body := map[string]string{"value": value, "comment": comment}
	return &out, c.do(ctx, "POST", "/v1/secrets/"+url.PathEscape(id)+"/rotate", body, &out)
}

func (c *Client) DeleteSecret(ctx context.Context, id string) error {
	return c.do(ctx, "DELETE", "/v1/secrets/"+url.PathEscape(id), nil, nil)
}

type MintTokenInput struct {
	Name      string `json:"name"`
	Scope     string `json:"scope,omitempty"`
	ProjectID string `json:"projectId,omitempty"`
	CanWrite  bool   `json:"canWrite,omitempty"`
}

func (c *Client) MintToken(ctx context.Context, in MintTokenInput) (*MintedToken, error) {
	var out MintedToken
	return &out, c.do(ctx, "POST", "/v1/tokens", in, &out)
}

func (c *Client) ListTokens(ctx context.Context) ([]TokenInfo, error) {
	var out struct {
		Tokens []TokenInfo `json:"tokens"`
	}
	return out.Tokens, c.do(ctx, "GET", "/v1/tokens", nil, &out)
}

func (c *Client) RevokeToken(ctx context.Context, id string) error {
	return c.do(ctx, "DELETE", "/v1/tokens/"+url.PathEscape(id), nil, nil)
}

func (c *Client) Audit(ctx context.Context, limit int) ([]AuditEntry, error) {
	var out struct {
		Entries []AuditEntry `json:"entries"`
	}
	return out.Entries, c.do(ctx, "GET", fmt.Sprintf("/v1/audit?limit=%d", limit), nil, &out)
}

func (c *Client) RotateKek(ctx context.Context) (int, error) {
	var out struct {
		Rotated       int `json:"rotated"`
		ActiveVersion int `json:"activeVersion"`
	}
	err := c.do(ctx, "POST", "/v1/kek/rotate", nil, &out)
	return out.Rotated, err
}

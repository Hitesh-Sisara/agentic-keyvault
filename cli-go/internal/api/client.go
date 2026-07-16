package api

import (
	"bytes"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"net/http"
	"net/url"
	"strings"
	"time"
)

const defaultTimeout = 15 * time.Second

// maxResponseBytes caps decoded response size to avoid memory abuse.
const maxResponseBytes = 8 << 20 // 8 MiB

// Client is a small, typed client over the agentic-keyvault REST API.
type Client struct {
	baseURL   *url.URL
	http      *http.Client
	token     string
	userAgent string
}

// Option configures a Client.
type Option func(*Client)

func WithUserAgent(ua string) Option { return func(c *Client) { c.userAgent = ua } }

// New builds a client. HTTPS is required except for localhost development.
func New(baseURL, token string, timeout time.Duration, opts ...Option) (*Client, error) {
	if timeout <= 0 {
		timeout = defaultTimeout
	}
	u, err := url.Parse(strings.TrimRight(baseURL, "/"))
	if err != nil {
		return nil, fmt.Errorf("invalid API URL: %w", err)
	}
	if u.Scheme != "https" && !isLocalhost(u.Hostname()) {
		return nil, fmt.Errorf("refusing non-HTTPS API URL %q (only https or localhost allowed)", baseURL)
	}
	c := &Client{
		baseURL:   u,
		token:     token,
		userAgent: "akv-go",
		http: &http.Client{
			Timeout: timeout,
			// Reject redirects to a different origin — never leak the token.
			CheckRedirect: func(req *http.Request, via []*http.Request) error {
				if len(via) > 0 && req.URL.Host != via[0].URL.Host {
					return errors.New("cross-origin redirect blocked")
				}
				if len(via) >= 5 {
					return errors.New("too many redirects")
				}
				return nil
			},
		},
	}
	for _, o := range opts {
		o(c)
	}
	return c, nil
}

func isLocalhost(host string) bool {
	return host == "localhost" || host == "127.0.0.1" || host == "::1"
}

func (c *Client) do(ctx context.Context, method, path string, body, out any) error {
	var reader io.Reader
	if body != nil {
		buf, err := json.Marshal(body)
		if err != nil {
			return fmt.Errorf("encode request: %w", err)
		}
		reader = bytes.NewReader(buf)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.baseURL.String()+path, reader)
	if err != nil {
		return err
	}
	req.Header.Set("User-Agent", c.userAgent)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}
	if c.token != "" {
		req.Header.Set("Authorization", "Bearer "+c.token)
	}

	resp, err := c.http.Do(req)
	if err != nil {
		return err // net errors never include the token
	}
	defer resp.Body.Close()

	data, err := io.ReadAll(io.LimitReader(resp.Body, maxResponseBytes))
	if err != nil {
		return fmt.Errorf("read response: %w", err)
	}

	if resp.StatusCode >= 400 {
		return decodeError(resp.StatusCode, resp.Header.Get("cf-ray"), data)
	}
	if out != nil && len(data) > 0 {
		if err := json.Unmarshal(data, out); err != nil {
			return fmt.Errorf("decode response: %w", err)
		}
	}
	return nil
}

func decodeError(status int, requestID string, data []byte) error {
	var payload struct {
		Error string `json:"error"`
		Code  string `json:"code"`
	}
	_ = json.Unmarshal(data, &payload)
	msg := payload.Error
	if msg == "" {
		msg = http.StatusText(status)
	}
	return &APIError{Status: status, Code: payload.Code, Message: msg, RequestID: requestID}
}

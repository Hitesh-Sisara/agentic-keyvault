package api

import "fmt"

// APIError is a typed error from the vault API. It deliberately never carries
// the request body, Authorization header, or any secret value.
type APIError struct {
	Status    int
	Code      string
	Message   string
	RequestID string
}

func (e *APIError) Error() string {
	if e.RequestID != "" {
		return fmt.Sprintf("api error %d (%s): %s [request %s]", e.Status, e.Code, e.Message, e.RequestID)
	}
	return fmt.Sprintf("api error %d: %s", e.Status, e.Message)
}

// IsStatus reports whether err is an APIError with the given HTTP status.
func IsStatus(err error, status int) bool {
	ae, ok := err.(*APIError)
	return ok && ae.Status == status
}

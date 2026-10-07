package auth

import "strings"

// resolvePassword keeps the provided password or generates a temporary one:
// an explicit non-empty password is used as-is; otherwise a password is
// generated and reported as temporary.
func resolvePassword(password *string) (temporary *string, value string, err error) {
	if password != nil && *password != "" {
		if len([]rune(*password)) < 8 {
			return nil, "", errf(CodeMessage, "password must be at least 8 characters")
		}
		return nil, *password, nil
	}
	generated := GeneratePassword()
	return &generated, generated, nil
}

// cleanPtr trims a string pointer; empty becomes nil.
func cleanPtr(value *string) *string {
	if value == nil {
		return nil
	}
	trimmed := strings.TrimSpace(*value)
	if trimmed == "" {
		return nil
	}
	return &trimmed
}

func trimSpace(value string) string { return strings.TrimSpace(value) }

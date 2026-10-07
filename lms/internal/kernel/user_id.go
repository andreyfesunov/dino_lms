// Package kernel holds shared domain primitives: actors, roles,
// permissions and user identity. It must not import other internal packages.
package kernel

import "github.com/google/uuid"

// UserID is a stable user identifier (UUIDv4).
type UserID uuid.UUID

// NewUserID generates a fresh identifier.
func NewUserID() UserID { return UserID(uuid.New()) }

// ParseUserID parses the canonical UUID string form.
func ParseUserID(s string) (UserID, error) {
	id, err := uuid.Parse(s)
	if err != nil {
		return UserID(uuid.Nil), err
	}
	return UserID(id), nil
}

func (u UserID) String() string { return uuid.UUID(u).String() }

// IsZero reports whether the id is the zero value.
func (u UserID) IsZero() bool { return u == UserID(uuid.Nil) }

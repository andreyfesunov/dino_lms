package auth

import (
	"crypto/rand"
	"fmt"
	"math/big"
	"strings"

	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
)

// PasswordHash is an argon2id PHC-encoded password hash.
type PasswordHash string

func (h PasswordHash) String() string { return string(h) }

// passwordAlphabet: ASCII letters and digits without visually similar
// characters (no I, O, l, 0, 1).
const passwordAlphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"

const passwordLength = 16

// GeneratePassword returns a random password using the shared alphabet.
func GeneratePassword() string {
	out := make([]byte, passwordLength)
	max := big.NewInt(int64(len(passwordAlphabet)))
	for i := range out {
		n, err := rand.Int(rand.Reader, max)
		if err != nil {
			panic(fmt.Sprintf("generate password: %v", err))
		}
		out[i] = passwordAlphabet[n.Int64()]
	}
	return string(out)
}

// User is an account.
type User struct {
	ID           kernel.UserID
	Login        string
	PasswordHash *PasswordHash
	Role         kernel.Role
	Status       UserStatus
	FirstName    *string
	LastName     *string
	CreatedAt    int64
}

// NeedsOnboarding includes pending accounts and incomplete profiles.
func (u User) NeedsOnboarding() bool {
	return u.Status == StatusPending || isEmpty(u.FirstName) || isEmpty(u.LastName)
}

// DisplayName returns "Last First" when both names exist.
func (u User) DisplayName() string {
	first, last := trimmed(u.FirstName), trimmed(u.LastName)
	switch {
	case first != "" && last != "":
		return last + " " + first
	case first != "":
		return first
	case last != "":
		return last
	default:
		return u.Login
	}
}

// ShortName returns "Last F." when both names exist.
func (u User) ShortName() string {
	first, last := trimmed(u.FirstName), trimmed(u.LastName)
	switch {
	case first != "" && last != "":
		return fmt.Sprintf("%s %c.", last, first[0])
	case first != "":
		return first
	case last != "":
		return last
	default:
		return u.Login
	}
}

// NewUser carries the data for creating a user row.
type NewUser struct {
	ID           kernel.UserID
	Login        string
	PasswordHash *PasswordHash
	Role         kernel.Role
	Status       UserStatus
	FirstName    *string
	LastName     *string
	CreatedAt    int64
}

// UserListFilter narrows the users list.
type UserListFilter struct {
	Query  *string
	Status *UserStatus
}

// UserProfileUpdate partially updates a user; nil fields keep the value.
type UserProfileUpdate struct {
	ClearFirstName bool
	ClearLastName  bool
	PasswordHash   *PasswordHash
	FirstName      *string
	LastName       *string
	Role           *kernel.Role
	Status         *UserStatus
}

// UserStatus is the account lifecycle state.
type UserStatus string

const (
	StatusPending UserStatus = "pending"
	StatusActive  UserStatus = "active"
)

// ParseUserStatus maps a database string to UserStatus.
func ParseUserStatus(s string) (UserStatus, error) {
	switch s {
	case "pending":
		return StatusPending, nil
	case "active":
		return StatusActive, nil
	default:
		return "", fmt.Errorf("unknown user status: %s", s)
	}
}

func isEmpty(value *string) bool {
	return value == nil || strings.TrimSpace(*value) == ""
}

func trimmed(value *string) string {
	if value == nil {
		return ""
	}
	return strings.TrimSpace(*value)
}

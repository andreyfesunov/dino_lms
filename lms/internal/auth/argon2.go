package auth

import (
	"crypto/rand"
	"encoding/base64"
	"fmt"

	"golang.org/x/crypto/argon2"
)

// Argon2 parameters (argon2id, m=19456 KiB, t=2, p=1) must stay in sync with
// the previous implementation so existing password hashes keep verifying.
const (
	argonTime    = 2
	argonMemory  = 19456
	argonThreads = 1
	argonKeyLen  = 32
	argonSaltLen = 16
)

// Argon2Hasher is the PasswordHasher implementation.
type Argon2Hasher struct{}

// Hash derives an argon2id PHC string with a random salt.
func (Argon2Hasher) Hash(password string) (PasswordHash, error) {
	salt := make([]byte, argonSaltLen)
	if _, err := rand.Read(salt); err != nil {
		return "", fmt.Errorf("salt: %w", err)
	}
	key := argon2.IDKey([]byte(password), salt, argonTime, argonMemory, argonThreads, argonKeyLen)
	encoded := fmt.Sprintf("$argon2id$v=%d$m=%d,t=%d,p=%d$%s$%s",
		argon2.Version, argonMemory, argonTime, argonThreads,
		base64.RawStdEncoding.EncodeToString(salt),
		base64.RawStdEncoding.EncodeToString(key))
	return PasswordHash(encoded), nil
}

// Verify checks a password against a PHC-encoded hash.
func (Argon2Hasher) Verify(password string, hash PasswordHash) (bool, error) {
	params, salt, key, err := decodePHC(string(hash))
	if err != nil {
		return false, nil
	}
	derived := argon2.IDKey([]byte(password), salt, params.time, params.memory, params.threads, uint32(len(key)))
	return constantTimeEqual(derived, key), nil
}

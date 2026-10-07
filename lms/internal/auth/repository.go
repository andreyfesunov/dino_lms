package auth

import (
	"context"
	"database/sql"
	"errors"
	"fmt"

	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
)

// UserRepository is the persistence boundary for users.
type UserRepository interface {
	Create(ctx context.Context, user NewUser) (User, error)
	CreateFirstAdmin(ctx context.Context, user NewUser) (*User, error)
	FindByLogin(ctx context.Context, login string) (*User, error)
	FindByID(ctx context.Context, id kernel.UserID) (*User, error)
	CountByRole(ctx context.Context, role kernel.Role) (int64, error)
	List(ctx context.Context, filter UserListFilter) ([]User, error)
	UpdateProfile(ctx context.Context, id kernel.UserID, update UserProfileUpdate) (User, error)
	SetPassword(ctx context.Context, id kernel.UserID, hash PasswordHash) error
	CompleteOnboarding(ctx context.Context, id kernel.UserID, firstName, lastName string) (User, error)
	Delete(ctx context.Context, id kernel.UserID) (bool, error)
}

// SessionRepository is the persistence boundary for sessions.
type SessionRepository interface {
	Create(ctx context.Context, session NewSession) error
	FindValid(ctx context.Context, tokenHash string, now int64) (*SessionRecord, error)
	Delete(ctx context.Context, tokenHash string) error
}

// PasswordHasher hashes and verifies passwords (argon2id PHC strings).
type PasswordHasher interface {
	Hash(password string) (PasswordHash, error)
	Verify(password string, hash PasswordHash) (bool, error)
}

// NewSession carries data for a new session row.
type NewSession struct {
	TokenHash string
	UserID    kernel.UserID
	ExpiresAt int64
}

// SessionRecord is a stored session.
type SessionRecord struct {
	TokenHash string
	UserID    kernel.UserID
	ExpiresAt int64
}

// SqliteUserRepository is the SQLite UserRepository.
type SqliteUserRepository struct {
	pool *sql.DB
}

func NewSqliteUserRepository(pool *sql.DB) *SqliteUserRepository {
	return &SqliteUserRepository{pool: pool}
}

const userColumns = `id, login, password_hash, role, status, first_name, last_name, created_at`

// Create inserts a user row.
func (r *SqliteUserRepository) Create(ctx context.Context, user NewUser) (User, error) {
	_, err := r.pool.ExecContext(ctx, `
INSERT INTO users (id, login, password_hash, role, status, first_name, last_name, created_at)
VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
		user.ID.String(), user.Login, hashPtr(user.PasswordHash),
		string(user.Role), string(user.Status), user.FirstName, user.LastName, user.CreatedAt)
	if err != nil {
		return User{}, fmt.Errorf("create user: %w", err)
	}
	return User{
		ID: user.ID, Login: user.Login, PasswordHash: user.PasswordHash,
		Role: user.Role, Status: user.Status,
		FirstName: user.FirstName, LastName: user.LastName, CreatedAt: user.CreatedAt,
	}, nil
}

// CreateFirstAdmin inserts the bootstrap admin unless one already exists.
func (r *SqliteUserRepository) CreateFirstAdmin(ctx context.Context, user NewUser) (*User, error) {
	row := r.pool.QueryRowContext(ctx, `
INSERT INTO users (id, login, password_hash, role, status, first_name, last_name, created_at)
SELECT ?, ?, ?, ?, ?, ?, ?, ?
WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')
RETURNING `+userColumns,
		user.ID.String(), user.Login, hashPtr(user.PasswordHash),
		string(user.Role), string(user.Status), user.FirstName, user.LastName, user.CreatedAt)
	return scanUser(row)
}

// FindByLogin looks a user up case-insensitively by login.
func (r *SqliteUserRepository) FindByLogin(ctx context.Context, login string) (*User, error) {
	row := r.pool.QueryRowContext(ctx,
		`SELECT `+userColumns+` FROM users WHERE login = ? COLLATE NOCASE`, login)
	user, err := scanUser(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return user, err
}

// FindByID loads one user.
func (r *SqliteUserRepository) FindByID(ctx context.Context, id kernel.UserID) (*User, error) {
	row := r.pool.QueryRowContext(ctx,
		`SELECT `+userColumns+` FROM users WHERE id = ?`, id.String())
	user, err := scanUser(row)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	return user, err
}

// CountByRole counts users with the role.
func (r *SqliteUserRepository) CountByRole(ctx context.Context, role kernel.Role) (int64, error) {
	var count int64
	err := r.pool.QueryRowContext(ctx,
		`SELECT COUNT(*) FROM users WHERE role = ?`, string(role)).Scan(&count)
	return count, err
}

// List returns users matching the filter, newest first.
func (r *SqliteUserRepository) List(ctx context.Context, filter UserListFilter) ([]User, error) {
	query := `SELECT ` + userColumns + ` FROM users WHERE 1 = 1`
	var args []any

	if filter.Status != nil {
		query += ` AND status = ?`
		args = append(args, string(*filter.Status))
	}
	if filter.Query != nil && *filter.Query != "" {
		pattern := "%" + *filter.Query + "%"
		query += ` AND (
login LIKE ? COLLATE NOCASE
OR IFNULL(first_name, '') LIKE ? COLLATE NOCASE
OR IFNULL(last_name, '') LIKE ? COLLATE NOCASE
OR (IFNULL(last_name, '') || ' ' || IFNULL(first_name, '')) LIKE ? COLLATE NOCASE
)`
		args = append(args, pattern, pattern, pattern, pattern)
	}
	query += ` ORDER BY created_at DESC, login ASC`

	rows, err := r.pool.QueryContext(ctx, query, args...)
	if err != nil {
		return nil, fmt.Errorf("list users: %w", err)
	}
	defer rows.Close()

	users := []User{}
	for rows.Next() {
		user, err := scanUserRow(rows)
		if err != nil {
			return nil, err
		}
		users = append(users, *user)
	}
	return users, rows.Err()
}

// UpdateProfile merges partial changes onto the stored user.
func (r *SqliteUserRepository) UpdateProfile(ctx context.Context, id kernel.UserID, update UserProfileUpdate) (User, error) {
	current, err := r.FindByID(ctx, id)
	if err != nil {
		return User{}, err
	}
	if current == nil {
		return User{}, errors.New("user not found")
	}

	firstName := update.FirstName
	if firstName == nil && !update.ClearFirstName {
		firstName = current.FirstName
	}
	lastName := update.LastName
	if lastName == nil && !update.ClearLastName {
		lastName = current.LastName
	}
	role := current.Role
	if update.Role != nil {
		role = *update.Role
	}
	status := current.Status
	if update.Status != nil {
		status = *update.Status
	}

	if _, err := r.pool.ExecContext(ctx, `
UPDATE users SET first_name = ?, last_name = ?, role = ?, status = ?, password_hash = COALESCE(?, password_hash) WHERE id = ?`,
		firstName, lastName, string(role), string(status), hashPtr(update.PasswordHash), id.String()); err != nil {
		return User{}, fmt.Errorf("update profile: %w", err)
	}

	updated, err := r.FindByID(ctx, id)
	if err != nil {
		return User{}, err
	}
	if updated == nil {
		return User{}, errors.New("user not found after update")
	}
	return *updated, nil
}

// SetPassword replaces the stored hash.
func (r *SqliteUserRepository) SetPassword(ctx context.Context, id kernel.UserID, hash PasswordHash) error {
	result, err := r.pool.ExecContext(ctx,
		`UPDATE users SET password_hash = ? WHERE id = ?`, string(hash), id.String())
	if err != nil {
		return fmt.Errorf("set password: %w", err)
	}
	if affected, err := result.RowsAffected(); err == nil && affected == 0 {
		return errors.New("user not found")
	}
	return nil
}

// CompleteOnboarding stores names and activates the account.
func (r *SqliteUserRepository) CompleteOnboarding(ctx context.Context, id kernel.UserID, firstName, lastName string) (User, error) {
	if _, err := r.pool.ExecContext(ctx, `
UPDATE users SET first_name = ?, last_name = ?, status = ? WHERE id = ?`,
		firstName, lastName, string(StatusActive), id.String()); err != nil {
		return User{}, fmt.Errorf("complete onboarding: %w", err)
	}
	updated, err := r.FindByID(ctx, id)
	if err != nil {
		return User{}, err
	}
	if updated == nil {
		return User{}, errors.New("user not found after onboarding")
	}
	return *updated, nil
}

// Delete removes a user row; sessions cascade.
func (r *SqliteUserRepository) Delete(ctx context.Context, id kernel.UserID) (bool, error) {
	result, err := r.pool.ExecContext(ctx, `DELETE FROM users WHERE id = ?`, id.String())
	if err != nil {
		return false, fmt.Errorf("delete user: %w", err)
	}
	affected, err := result.RowsAffected()
	if err != nil {
		return false, err
	}
	return affected > 0, nil
}

// SqliteSessionRepository is the SQLite SessionRepository.
type SqliteSessionRepository struct {
	pool *sql.DB
}

func NewSqliteSessionRepository(pool *sql.DB) *SqliteSessionRepository {
	return &SqliteSessionRepository{pool: pool}
}

// Create inserts a session row.
func (r *SqliteSessionRepository) Create(ctx context.Context, session NewSession) error {
	_, err := r.pool.ExecContext(ctx, `
INSERT INTO sessions (token_hash, user_id, expires_at) VALUES (?, ?, ?)`,
		session.TokenHash, session.UserID.String(), session.ExpiresAt)
	if err != nil {
		return fmt.Errorf("create session: %w", err)
	}
	return nil
}

// FindValid loads an unexpired session by token hash.
func (r *SqliteSessionRepository) FindValid(ctx context.Context, tokenHash string, now int64) (*SessionRecord, error) {
	var record SessionRecord
	var userID string
	err := r.pool.QueryRowContext(ctx, `
SELECT token_hash, user_id, expires_at FROM sessions
WHERE token_hash = ? AND expires_at > ?`, tokenHash, now).
		Scan(&record.TokenHash, &userID, &record.ExpiresAt)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, fmt.Errorf("find session: %w", err)
	}
	id, err := kernel.ParseUserID(userID)
	if err != nil {
		return nil, err
	}
	record.UserID = id
	return &record, nil
}

// Delete removes a session by token hash.
func (r *SqliteSessionRepository) Delete(ctx context.Context, tokenHash string) error {
	if _, err := r.pool.ExecContext(ctx,
		`DELETE FROM sessions WHERE token_hash = ?`, tokenHash); err != nil {
		return fmt.Errorf("delete session: %w", err)
	}
	return nil
}

type rowScanner interface{ Scan(dest ...any) error }

func scanUser(row rowScanner) (*User, error) {
	user, err := scanUserRow(row)
	if err != nil {
		return nil, err
	}
	return user, nil
}

func scanUserRow(row rowScanner) (*User, error) {
	var user User
	var id, role, status string
	var passwordHash sql.NullString
	var firstName, lastName sql.NullString
	if err := row.Scan(&id, &user.Login, &passwordHash, &role, &status, &firstName, &lastName, &user.CreatedAt); err != nil {
		return nil, err
	}
	parsedID, err := kernel.ParseUserID(id)
	if err != nil {
		return nil, err
	}
	parsedRole, err := kernel.ParseRole(role)
	if err != nil {
		return nil, err
	}
	parsedStatus, err := ParseUserStatus(status)
	if err != nil {
		return nil, err
	}
	user.ID = parsedID
	user.Role = parsedRole
	user.Status = parsedStatus
	if passwordHash.Valid {
		hash := PasswordHash(passwordHash.String)
		user.PasswordHash = &hash
	}
	if firstName.Valid {
		value := firstName.String
		user.FirstName = &value
	}
	if lastName.Valid {
		value := lastName.String
		user.LastName = &value
	}
	return &user, nil
}

func hashPtr(hash *PasswordHash) any {
	if hash == nil {
		return nil
	}
	return string(*hash)
}

func strPtr(value *string) any {
	if value == nil {
		return nil
	}
	return *value
}

var _ = strPtr

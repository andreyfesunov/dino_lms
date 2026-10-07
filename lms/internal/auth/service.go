package auth

import (
	"context"
	"crypto/rand"
	"crypto/sha256"
	"fmt"
	"time"

	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
)

// AuthError is a service-level failure with a stable code for the API layer.
type AuthError struct {
	Code string
	Msg  string
}

func (e *AuthError) Error() string { return e.Msg }

// Stable error codes shared with the HTTP layer.
const (
	CodeAdminExists        = "admin_exists"
	CodeInvalidCredentials = "invalid_credentials"
	CodeSessionUserMissing = "session_user_missing"
	CodeSelfDelete         = "self_delete"
	CodeUserNotFound       = "user_not_found"
	CodeForbidden          = "forbidden"
	CodeMessage            = "message"
)

func errf(code, format string, args ...any) *AuthError {
	return &AuthError{Code: code, Msg: fmt.Sprintf(format, args...)}
}

// Command and result types of the auth service.

// BootstrapAdminCommand creates the first administrator.
type BootstrapAdminCommand struct {
	Login     string
	Password  *string
	FirstName *string
	LastName  *string
}

// BootstrapAdminResult reports the created admin.
type BootstrapAdminResult struct {
	UserID            kernel.UserID
	Login             string
	TemporaryPassword *string
}

// LoginCommand carries credentials.
type LoginCommand struct {
	Login    string
	Password string
}

// LoginResult reports the signed-in user.
type LoginResult struct{ User User }

// CreateStudentCommand creates one student account.
type CreateStudentCommand struct {
	Login    string
	Password *string
}

// CreateStudentResult reports the created student.
type CreateStudentResult struct {
	UserID            kernel.UserID
	Login             string
	TemporaryPassword *string
	Actor             kernel.Actor
}

// InvitedUser is an account created by InviteUsers.
type InvitedUser struct {
	UserID            kernel.UserID
	Login             string
	TemporaryPassword string
}

// InviteUsersCommand invites one login per line.
type InviteUsersCommand struct{ Emails []string }

// InviteUsersResult splits created vs skipped logins.
type InviteUsersResult struct {
	Created []InvitedUser
	Skipped []string
}

// ListUsersCommand queries the users list.
type ListUsersCommand struct {
	Query  *string
	Status *UserStatus
}

// UpdateUserCommand changes role/status/names of a user.
type UpdateUserCommand struct {
	ClearFirstName bool
	ClearLastName  bool
	UserID         kernel.UserID
	FirstName      *string
	LastName       *string
	Role           kernel.Role
	Status         UserStatus
}

// GeneratePasswordCommand targets a user for a fresh password.
type GeneratePasswordCommand struct{ UserID kernel.UserID }

// GeneratePasswordResult reports the new temporary password.
type GeneratePasswordResult struct {
	UserID            kernel.UserID
	Login             string
	TemporaryPassword string
}

// DeleteUserCommand removes a user.
type DeleteUserCommand struct{ UserID kernel.UserID }

// CompleteOnboardingCommand stores profile names.
type CompleteOnboardingCommand struct {
	FirstName string
	LastName  string
}

// UpdateOwnProfileCommand renames the current user.
type UpdateOwnProfileCommand struct {
	FirstName       string
	LastName        string
	CurrentPassword string
	NewPassword     string
}

// ChangePasswordCommand swaps the own password.
type ChangePasswordCommand struct {
	CurrentPassword string
	NewPassword     string
}

// ActorFromUser builds an Actor with the user's single role.
func ActorFromUser(user User) kernel.Actor {
	return kernel.NewActor(user.ID, []kernel.Role{user.Role})
}

// RbacAuthorizer guards operations with the Ability table.
type RbacAuthorizer struct{}

// Permits reports whether the actor holds the permission.
func (RbacAuthorizer) Permits(actor kernel.Actor, permission kernel.Permission) bool {
	var ability Ability
	return ability.AllowsAny(actor.Roles, permission)
}

// Authorize returns CodeForbidden when the permission is missing.
func (r RbacAuthorizer) Authorize(actor kernel.Actor, permission kernel.Permission) error {
	if r.Permits(actor, permission) {
		return nil
	}
	return errf(CodeForbidden, "permission %s required", permission)
}

// AuthService verifies credentials, issues sessions and manages users.
type AuthService struct {
	users      UserRepository
	sessions   SessionRepository
	hasher     PasswordHasher
	authorizer RbacAuthorizer
}

func NewAuthService(users UserRepository, sessions SessionRepository, hasher PasswordHasher) *AuthService {
	return &AuthService{users: users, sessions: sessions, hasher: hasher, authorizer: RbacAuthorizer{}}
}

// Permits reports whether the actor holds the permission.
func (s *AuthService) Permits(actor kernel.Actor, permission kernel.Permission) bool {
	return s.authorizer.Permits(actor, permission)
}

// HasAdmin reports whether any administrator exists.
func (s *AuthService) HasAdmin(ctx context.Context) (bool, error) {
	admins, err := s.users.CountByRole(ctx, kernel.RoleAdmin)
	if err != nil {
		return false, err
	}
	return admins > 0, nil
}

// BootstrapAdmin creates the first admin; further calls fail.
func (s *AuthService) BootstrapAdmin(ctx context.Context, cmd BootstrapAdminCommand) (BootstrapAdminResult, error) {
	cmd.Login = trimSpace(cmd.Login)
	if cmd.Login == "" {
		return BootstrapAdminResult{}, errf(CodeMessage, "login is required")
	}
	hasAdmin, err := s.HasAdmin(ctx)
	if err != nil {
		return BootstrapAdminResult{}, err
	}
	if hasAdmin {
		return BootstrapAdminResult{}, errf(CodeAdminExists, "an administrator already exists")
	}

	temporary, password, err := resolvePassword(cmd.Password)
	if err != nil {
		return BootstrapAdminResult{}, err
	}

	firstName := cleanPtr(cmd.FirstName)
	lastName := cleanPtr(cmd.LastName)
	status := StatusPending
	if firstName != nil && lastName != nil {
		status = StatusActive
	}

	hash, err := s.hasher.Hash(password)
	if err != nil {
		return BootstrapAdminResult{}, errf(CodeMessage, "%s", err.Error())
	}
	user, err := s.users.CreateFirstAdmin(ctx, NewUser{
		ID:           kernel.NewUserID(),
		Login:        cmd.Login,
		PasswordHash: &hash,
		Role:         kernel.RoleAdmin,
		Status:       status,
		FirstName:    firstName,
		LastName:     lastName,
		CreatedAt:    UnixNow(),
	})
	if err != nil {
		return BootstrapAdminResult{}, errf(CodeMessage, "%s", err.Error())
	}
	if user == nil {
		return BootstrapAdminResult{}, errf(CodeAdminExists, "an administrator already exists")
	}
	return BootstrapAdminResult{UserID: user.ID, Login: user.Login, TemporaryPassword: temporary}, nil
}

// Login verifies credentials; sessions are persisted by the caller.
func (s *AuthService) Login(ctx context.Context, cmd LoginCommand) (LoginResult, error) {
	cmd.Login = trimSpace(cmd.Login)
	user, err := s.users.FindByLogin(ctx, cmd.Login)
	if err != nil {
		return LoginResult{}, err
	}
	if user == nil || user.PasswordHash == nil {
		return LoginResult{}, errf(CodeInvalidCredentials, "invalid login or password")
	}
	valid, err := s.hasher.Verify(cmd.Password, *user.PasswordHash)
	if err != nil {
		return LoginResult{}, errf(CodeMessage, "%s", err.Error())
	}
	if !valid {
		return LoginResult{}, errf(CodeInvalidCredentials, "invalid login or password")
	}
	return LoginResult{User: *user}, nil
}

// CreateStudent adds a student account with a password.
func (s *AuthService) CreateStudent(ctx context.Context, actor kernel.Actor, cmd CreateStudentCommand) (CreateStudentResult, error) {
	if err := s.authorizer.Authorize(actor, kernel.PermissionManageUsers); err != nil {
		return CreateStudentResult{}, err
	}
	cmd.Login = trimSpace(cmd.Login)
	if cmd.Login == "" {
		return CreateStudentResult{}, errf(CodeMessage, "login is required")
	}
	temporary, password, err := resolvePassword(cmd.Password)
	if err != nil {
		return CreateStudentResult{}, err
	}
	hash, err := s.hasher.Hash(password)
	if err != nil {
		return CreateStudentResult{}, errf(CodeMessage, "%s", err.Error())
	}
	user, err := s.users.Create(ctx, NewUser{
		ID:           kernel.NewUserID(),
		Login:        cmd.Login,
		PasswordHash: &hash,
		Role:         kernel.RoleStudent,
		Status:       StatusPending,
		CreatedAt:    UnixNow(),
	})
	if err != nil {
		return CreateStudentResult{}, errf(CodeMessage, "%s", err.Error())
	}
	return CreateStudentResult{
		UserID: user.ID, Login: user.Login, TemporaryPassword: temporary, Actor: ActorFromUser(user),
	}, nil
}

// InviteUsers creates pending student accounts with temporary passwords.
func (s *AuthService) InviteUsers(ctx context.Context, actor kernel.Actor, cmd InviteUsersCommand) (InviteUsersResult, error) {
	if err := s.authorizer.Authorize(actor, kernel.PermissionManageUsers); err != nil {
		return InviteUsersResult{}, err
	}
	result := InviteUsersResult{Created: []InvitedUser{}, Skipped: []string{}}
	now := UnixNow()
	for _, raw := range cmd.Emails {
		login := trimSpace(raw)
		if login == "" {
			continue
		}
		existing, err := s.users.FindByLogin(ctx, login)
		if err != nil {
			return InviteUsersResult{}, err
		}
		if existing != nil {
			result.Skipped = append(result.Skipped, login)
			continue
		}
		temporary := GeneratePassword()
		hash, err := s.hasher.Hash(temporary)
		if err != nil {
			return InviteUsersResult{}, errf(CodeMessage, "%s", err.Error())
		}
		user, err := s.users.Create(ctx, NewUser{
			ID:           kernel.NewUserID(),
			Login:        login,
			PasswordHash: &hash,
			Role:         kernel.RoleStudent,
			Status:       StatusPending,
			CreatedAt:    now,
		})
		if err != nil {
			return InviteUsersResult{}, errf(CodeMessage, "%s", err.Error())
		}
		result.Created = append(result.Created, InvitedUser{
			UserID: user.ID, Login: user.Login, TemporaryPassword: temporary,
		})
	}
	return result, nil
}

// ListUsers returns the filtered users list.
func (s *AuthService) ListUsers(ctx context.Context, actor kernel.Actor, cmd ListUsersCommand) ([]User, error) {
	if err := s.authorizer.Authorize(actor, kernel.PermissionManageUsers); err != nil {
		return nil, err
	}
	return s.users.List(ctx, UserListFilter{Query: cmd.Query, Status: cmd.Status})
}

// GetUser loads one user by id (admin-only).
func (s *AuthService) GetUser(ctx context.Context, actor kernel.Actor, id kernel.UserID) (User, error) {
	if err := s.authorizer.Authorize(actor, kernel.PermissionManageUsers); err != nil {
		return User{}, err
	}
	user, err := s.users.FindByID(ctx, id)
	if err != nil {
		return User{}, err
	}
	if user == nil {
		return User{}, errf(CodeMessage, "user not found")
	}
	return *user, nil
}

// CurrentUser loads the signed-in user.
func (s *AuthService) CurrentUser(ctx context.Context, actor kernel.Actor) (User, error) {
	user, err := s.users.FindByID(ctx, actor.UserID)
	if err != nil {
		return User{}, err
	}
	if user == nil {
		return User{}, errf(CodeSessionUserMissing, "session user missing")
	}
	return *user, nil
}

// UpdateUser changes role/status/names of a user (admin-only).
func (s *AuthService) UpdateUser(ctx context.Context, actor kernel.Actor, cmd UpdateUserCommand) (User, error) {
	if err := s.authorizer.Authorize(actor, kernel.PermissionManageUsers); err != nil {
		return User{}, err
	}
	current, err := s.users.FindByID(ctx, cmd.UserID)
	if err != nil {
		return User{}, err
	}
	if current == nil {
		return User{}, errf(CodeUserNotFound, "user not found")
	}
	role, status := current.Role, current.Status
	if cmd.Role != "" {
		if _, err := kernel.ParseRole(string(cmd.Role)); err != nil {
			return User{}, errf(CodeMessage, "invalid role")
		}
		role = cmd.Role
	}
	if cmd.Status != "" {
		if _, err := ParseUserStatus(string(cmd.Status)); err != nil {
			return User{}, errf(CodeMessage, "invalid status")
		}
		status = cmd.Status
	}
	if current.Role == kernel.RoleAdmin && role != kernel.RoleAdmin {
		return User{}, errf(CodeForbidden, "cannot remove the administrator role")
	}
	if current.Role != kernel.RoleAdmin && role == kernel.RoleAdmin {
		return User{}, errf(CodeAdminExists, "administrator already exists")
	}
	return s.users.UpdateProfile(ctx, cmd.UserID, UserProfileUpdate{
		ClearFirstName: cmd.ClearFirstName,
		ClearLastName:  cmd.ClearLastName,
		FirstName:      cmd.FirstName,
		LastName:       cmd.LastName,
		Role:           &role,
		Status:         &status,
	})
}

// GenerateUserPassword sets a fresh temporary password (admin-only).
func (s *AuthService) GenerateUserPassword(ctx context.Context, actor kernel.Actor, cmd GeneratePasswordCommand) (GeneratePasswordResult, error) {
	if err := s.authorizer.Authorize(actor, kernel.PermissionManageUsers); err != nil {
		return GeneratePasswordResult{}, err
	}
	user, err := s.users.FindByID(ctx, cmd.UserID)
	if err != nil {
		return GeneratePasswordResult{}, err
	}
	if user == nil {
		return GeneratePasswordResult{}, errf(CodeMessage, "user not found")
	}
	temporary := GeneratePassword()
	hash, err := s.hasher.Hash(temporary)
	if err != nil {
		return GeneratePasswordResult{}, errf(CodeMessage, "%s", err.Error())
	}
	if err := s.users.SetPassword(ctx, user.ID, hash); err != nil {
		return GeneratePasswordResult{}, errf(CodeMessage, "%s", err.Error())
	}
	return GeneratePasswordResult{UserID: user.ID, Login: user.Login, TemporaryPassword: temporary}, nil
}

// DeleteUser removes a user and cascades sessions (admin-only, not self).
func (s *AuthService) DeleteUser(ctx context.Context, actor kernel.Actor, cmd DeleteUserCommand) error {
	if err := s.authorizer.Authorize(actor, kernel.PermissionManageUsers); err != nil {
		return err
	}
	if cmd.UserID == actor.UserID {
		return errf(CodeSelfDelete, "cannot delete your own account")
	}
	user, err := s.users.FindByID(ctx, cmd.UserID)
	if err != nil {
		return err
	}
	if user == nil {
		return errf(CodeUserNotFound, "user not found")
	}
	deleted, err := s.users.Delete(ctx, user.ID)
	if err != nil {
		return errf(CodeMessage, "%s", err.Error())
	}
	if !deleted {
		return errf(CodeUserNotFound, "user not found")
	}
	return nil
}

// CompleteOnboarding stores the profile names and activates the account.
func (s *AuthService) CompleteOnboarding(ctx context.Context, actor kernel.Actor, cmd CompleteOnboardingCommand) (User, error) {
	firstName := trimSpace(cmd.FirstName)
	lastName := trimSpace(cmd.LastName)
	if firstName == "" || lastName == "" {
		return User{}, errf(CodeMessage, "first and last name are required")
	}
	user, err := s.users.CompleteOnboarding(ctx, actor.UserID, firstName, lastName)
	if err != nil {
		return User{}, errf(CodeMessage, "%s", err.Error())
	}
	return user, nil
}

// UpdateOwnProfile validates names and an optional password before a single database write.
func (s *AuthService) UpdateOwnProfile(ctx context.Context, actor kernel.Actor, cmd UpdateOwnProfileCommand) (User, error) {
	firstName := trimSpace(cmd.FirstName)
	lastName := trimSpace(cmd.LastName)
	if firstName == "" || lastName == "" {
		return User{}, errf(CodeMessage, "first and last name are required")
	}
	var passwordHash *PasswordHash
	if cmd.CurrentPassword != "" || cmd.NewPassword != "" {
		user, err := s.CurrentUser(ctx, actor)
		if err != nil {
			return User{}, err
		}
		if user.PasswordHash == nil {
			return User{}, errf(CodeInvalidCredentials, "invalid password")
		}
		valid, err := s.hasher.Verify(cmd.CurrentPassword, *user.PasswordHash)
		if err != nil {
			return User{}, err
		}
		if !valid {
			return User{}, errf(CodeInvalidCredentials, "invalid password")
		}
		if len([]rune(cmd.NewPassword)) < 8 {
			return User{}, errf(CodeMessage, "new password must be at least 8 characters")
		}
		hash, err := s.hasher.Hash(cmd.NewPassword)
		if err != nil {
			return User{}, err
		}
		passwordHash = &hash
	}
	user, err := s.users.UpdateProfile(ctx, actor.UserID, UserProfileUpdate{
		FirstName:    &firstName,
		LastName:     &lastName,
		PasswordHash: passwordHash,
	})
	if err != nil {
		return User{}, errf(CodeMessage, "%s", err.Error())
	}
	return user, nil
}

// ChangePassword verifies the current password and stores the new one.
func (s *AuthService) ChangePassword(ctx context.Context, actor kernel.Actor, cmd ChangePasswordCommand) error {
	user, err := s.CurrentUser(ctx, actor)
	if err != nil {
		return err
	}
	if user.PasswordHash == nil {
		return errf(CodeInvalidCredentials, "invalid login or password")
	}
	valid, err := s.hasher.Verify(cmd.CurrentPassword, *user.PasswordHash)
	if err != nil {
		return errf(CodeMessage, "%s", err.Error())
	}
	if !valid {
		return errf(CodeInvalidCredentials, "invalid login or password")
	}
	newPassword := cmd.NewPassword
	if len([]rune(newPassword)) < 8 {
		return errf(CodeMessage, "new password must be at least 8 characters")
	}
	hash, err := s.hasher.Hash(newPassword)
	if err != nil {
		return errf(CodeMessage, "%s", err.Error())
	}
	if err := s.users.SetPassword(ctx, actor.UserID, hash); err != nil {
		return errf(CodeMessage, "%s", err.Error())
	}
	return nil
}

// PersistSession stores a session row for the token hash.
func (s *AuthService) PersistSession(ctx context.Context, userID kernel.UserID, tokenHash []byte, expiresAt time.Time) error {
	return s.sessions.Create(ctx, NewSession{
		TokenHash: HashToken(tokenHash),
		UserID:    userID,
		ExpiresAt: expiresAt.Unix(),
	})
}

// DeleteSession removes the session row for the token hash.
func (s *AuthService) DeleteSession(ctx context.Context, tokenHash []byte) error {
	return s.sessions.Delete(ctx, HashToken(tokenHash))
}

// ActorFromTokenHash resolves an actor from a raw session token.
func (s *AuthService) ActorFromTokenHash(ctx context.Context, tokenHash []byte) (*kernel.Actor, error) {
	session, err := s.sessions.FindValid(ctx, HashToken(tokenHash), UnixNow())
	if err != nil {
		return nil, err
	}
	if session == nil {
		return nil, nil
	}
	user, err := s.users.FindByID(ctx, session.UserID)
	if err != nil {
		return nil, err
	}
	if user == nil {
		return nil, errf(CodeSessionUserMissing, "session user missing")
	}
	actor := ActorFromUser(*user)
	return &actor, nil
}

// SessionTTL is how long a session cookie stays valid.
const SessionTTL = 30 * 24 * time.Hour

// NewSessionToken returns a fresh 256-bit session token.
func NewSessionToken() []byte {
	token := make([]byte, 32)
	if _, err := rand.Read(token); err != nil {
		panic(fmt.Sprintf("session token: %v", err))
	}
	return token
}

// HashToken returns the hex sha256 of the raw token, the session storage
// format.
func HashToken(token []byte) string {
	sum := sha256.Sum256(token)
	return fmt.Sprintf("%x", sum)
}

// UnixNow returns seconds since the epoch.
func UnixNow() int64 { return time.Now().Unix() }

// Ability re-exported from kernel for the authorizer.
type Ability = kernel.Ability

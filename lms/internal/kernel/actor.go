package kernel

// Actor is an authenticated principal with its roles.
type Actor struct {
	UserID UserID
	Roles  []Role
}

func NewActor(id UserID, roles []Role) Actor {
	return Actor{UserID: id, Roles: roles}
}

// HasRole reports whether the actor carries the role.
func (a Actor) HasRole(role Role) bool {
	for _, r := range a.Roles {
		if r == role {
			return true
		}
	}
	return false
}

// Ability is the static RBAC table.
type Ability struct{}

// Allows reports whether the role grants the permission.
func (Ability) Allows(role Role, permission Permission) bool {
	switch permission {
	case PermissionManageUsers, PermissionManageCourses:
		return role == RoleAdmin
	default:
		return false
	}
}

// AllowsAny reports whether any of the roles grants the permission.
func (a Ability) AllowsAny(roles []Role, permission Permission) bool {
	for _, role := range roles {
		if a.Allows(role, permission) {
			return true
		}
	}
	return false
}

// AuthzError is an authorization failure.
type AuthzError struct {
	msg string
}

func NewAuthzError(msg string) AuthzError { return AuthzError{msg: msg} }

func (e AuthzError) Error() string { return e.msg }

package kernel

// Permission is an action a role may be allowed to perform.
type Permission string

const (
	PermissionManageUsers   Permission = "manage_users"
	PermissionManageCourses Permission = "manage_courses"
)

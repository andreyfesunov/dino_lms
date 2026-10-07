package kernel

import "fmt"

// Role is a user role in the system.
type Role string

const (
	RoleAdmin   Role = "admin"
	RoleTeacher Role = "teacher"
	RoleStudent Role = "student"
)

// Valid role values, mirroring the CHECK constraint in SQLite.
const (
	roleAdmin   = "admin"
	roleTeacher = "teacher"
	roleStudent = "student"
)

// ParseRole maps a database string to Role.
func ParseRole(s string) (Role, error) {
	switch s {
	case roleAdmin:
		return RoleAdmin, nil
	case roleTeacher:
		return RoleTeacher, nil
	case roleStudent:
		return RoleStudent, nil
	default:
		return "", fmt.Errorf("unknown role: %s", s)
	}
}

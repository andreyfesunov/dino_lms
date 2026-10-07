package kernel

// Authorizer checks permissions for actors.
type Authorizer interface {
	Permits(actor Actor, permission Permission) bool
}

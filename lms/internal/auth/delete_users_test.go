package auth_test

import (
	"context"
	"strings"
	"testing"
	"time"

	"github.com/andreyfesunov/dino_lms/lms/internal/auth"
	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
)

func timeNow() time.Time { return time.Now() }

type deleteFixture struct {
	svc          *auth.AuthService
	admin        kernel.Actor
	adminID      kernel.UserID
	ivanID       kernel.UserID
	ivanPassword string
}

// deleteFixture boots an admin and one invited student.
func newDeleteFixture(t *testing.T) deleteFixture {
	t.Helper()
	svc, admin := inviteFixture(t)
	invited, err := svc.InviteUsers(context.Background(), admin, inviteCommand("ivanov@school.ru"))
	if err != nil {
		t.Fatal(err)
	}
	return deleteFixture{
		svc:          svc,
		admin:        admin,
		adminID:      admin.UserID,
		ivanID:       invited.Created[0].UserID,
		ivanPassword: invited.Created[0].TemporaryPassword,
	}
}

func TestAdminDeletesAnotherUser(t *testing.T) {
	ctx := context.Background()
	f := newDeleteFixture(t)

	if err := f.svc.DeleteUser(ctx, f.admin, auth.DeleteUserCommand{UserID: f.ivanID}); err != nil {
		t.Fatal(err)
	}

	users, err := f.svc.ListUsers(ctx, f.admin, auth.ListUsersCommand{})
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 1 || users[0].ID != f.adminID {
		t.Fatalf("users = %+v", users)
	}

	// The deleted user can no longer sign in.
	_, err = f.svc.Login(ctx, auth.LoginCommand{Login: "ivanov@school.ru", Password: f.ivanPassword})
	var authErr *auth.AuthError
	if err == nil || !errorsAs(err, &authErr) || authErr.Code != auth.CodeInvalidCredentials {
		t.Fatalf("err = %v", err)
	}
}

func TestAdminCannotDeleteSelf(t *testing.T) {
	ctx := context.Background()
	f := newDeleteFixture(t)

	err := f.svc.DeleteUser(ctx, f.admin, auth.DeleteUserCommand{UserID: f.adminID})
	var authErr *auth.AuthError
	if err == nil || !errorsAs(err, &authErr) || authErr.Code != auth.CodeSelfDelete {
		t.Fatalf("err = %v", err)
	}

	users, err := f.svc.ListUsers(ctx, f.admin, auth.ListUsersCommand{})
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 2 {
		t.Fatalf("users = %d", len(users))
	}
}

func TestDeletingAMissingUserIsAnError(t *testing.T) {
	ctx := context.Background()
	f := newDeleteFixture(t)

	err := f.svc.DeleteUser(ctx, f.admin, auth.DeleteUserCommand{UserID: kernel.NewUserID()})
	if err == nil || !strings.Contains(err.Error(), "user not found") {
		t.Fatalf("err = %v", err)
	}
}

func TestNonAdminCannotDelete(t *testing.T) {
	ctx := context.Background()
	f := newDeleteFixture(t)
	student := kernel.NewActor(f.ivanID, []kernel.Role{kernel.RoleStudent})

	err := f.svc.DeleteUser(ctx, student, auth.DeleteUserCommand{UserID: f.adminID})
	var authErr *auth.AuthError
	if err == nil || !errorsAs(err, &authErr) || authErr.Code != auth.CodeForbidden {
		t.Fatalf("err = %v", err)
	}
}

func TestSessionPersistenceRoundTrip(t *testing.T) {
	ctx := context.Background()
	f := newDeleteFixture(t)

	token := auth.NewSessionToken()
	expires := timeNow().Add(auth.SessionTTL)
	if err := f.svc.PersistSession(ctx, f.ivanID, token, expires); err != nil {
		t.Fatal(err)
	}

	actor, err := f.svc.ActorFromTokenHash(ctx, token)
	if err != nil {
		t.Fatal(err)
	}
	if actor == nil || actor.UserID != f.ivanID {
		t.Fatalf("actor = %+v", actor)
	}

	if err := f.svc.DeleteSession(ctx, token); err != nil {
		t.Fatal(err)
	}
	actor, err = f.svc.ActorFromTokenHash(ctx, token)
	if err != nil {
		t.Fatal(err)
	}
	if actor != nil {
		t.Fatal("session must be gone after delete")
	}
}

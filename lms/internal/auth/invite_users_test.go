package auth_test

import (
	"context"
	"testing"

	"github.com/andreyfesunov/dino_lms/lms/internal/auth"
	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
)

func inviteCommand(emails ...string) auth.InviteUsersCommand {
	return auth.InviteUsersCommand{Emails: emails}
}

// inviteFixture boots an admin and returns the service plus its actor.
func inviteFixture(t *testing.T) (*auth.AuthService, kernel.Actor) {
	t.Helper()
	ctx := context.Background()
	svc := newService(t)
	result, err := svc.BootstrapAdmin(ctx, auth.BootstrapAdminCommand{
		Login:     "admin@dino.lms",
		Password:  ptr("correct horse"),
		FirstName: ptr("Алексей"),
		LastName:  ptr("Иванов"),
	})
	if err != nil {
		t.Fatal(err)
	}
	return svc, kernel.NewActor(result.UserID, []kernel.Role{kernel.RoleAdmin})
}

func TestInviteCreatesPendingUsersWithPasswords(t *testing.T) {
	ctx := context.Background()
	svc, actor := inviteFixture(t)

	result, err := svc.InviteUsers(ctx, actor, inviteCommand("ivanov@school.ru", "petrova@school.ru"))
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Created) != 2 || len(result.Skipped) != 0 {
		t.Fatalf("created = %d, skipped = %d", len(result.Created), len(result.Skipped))
	}
	for _, invited := range result.Created {
		if len(invited.TemporaryPassword) != 16 {
			t.Fatalf("password %q must be 16 chars", invited.TemporaryPassword)
		}
	}

	users, err := svc.ListUsers(ctx, actor, auth.ListUsersCommand{})
	if err != nil {
		t.Fatal(err)
	}
	if len(users) != 3 { // admin + 2 invited
		t.Fatalf("users = %d", len(users))
	}
	for _, user := range users {
		if user.Role == kernel.RoleStudent && user.Status != auth.StatusPending {
			t.Fatalf("invited user %s must be pending", user.Login)
		}
	}

	// The temporary password actually authenticates the new user.
	invited := result.Created[0]
	login, err := svc.Login(ctx, auth.LoginCommand{Login: invited.Login, Password: invited.TemporaryPassword})
	if err != nil {
		t.Fatal(err)
	}
	if login.User.ID != invited.UserID || login.User.Status != auth.StatusPending {
		t.Fatalf("login = %+v", login.User)
	}
}

func TestExistingLoginsAreSkipped(t *testing.T) {
	ctx := context.Background()
	svc, actor := inviteFixture(t)

	first, err := svc.InviteUsers(ctx, actor, inviteCommand("ivanov@school.ru"))
	if err != nil {
		t.Fatal(err)
	}
	if len(first.Created) != 1 {
		t.Fatalf("first created = %d", len(first.Created))
	}

	second, err := svc.InviteUsers(ctx, actor, inviteCommand("ivanov@school.ru", "petrova@school.ru"))
	if err != nil {
		t.Fatal(err)
	}
	if len(second.Created) != 1 || second.Created[0].Login != "petrova@school.ru" {
		t.Fatalf("second created = %+v", second.Created)
	}
	if len(second.Skipped) != 1 || second.Skipped[0] != "ivanov@school.ru" {
		t.Fatalf("skipped = %v", second.Skipped)
	}

	// The first user keeps their original password.
	login, err := svc.Login(ctx, auth.LoginCommand{
		Login:    "ivanov@school.ru",
		Password: first.Created[0].TemporaryPassword,
	})
	if err != nil {
		t.Fatal(err)
	}
	if login.User.Login != "ivanov@school.ru" {
		t.Fatalf("login = %s", login.User.Login)
	}
}

func TestBlankEntriesAreIgnored(t *testing.T) {
	ctx := context.Background()
	svc, actor := inviteFixture(t)

	result, err := svc.InviteUsers(ctx, actor, inviteCommand("  ", "", "ivanov@school.ru"))
	if err != nil {
		t.Fatal(err)
	}
	if len(result.Created) != 1 || result.Created[0].Login != "ivanov@school.ru" {
		t.Fatalf("created = %+v", result.Created)
	}
}

func TestGeneratePasswordAlphabet(t *testing.T) {
	const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789"
	for range 50 {
		password := auth.GeneratePassword()
		if len(password) != 16 {
			t.Fatalf("password %q must be 16 chars", password)
		}
		for _, ch := range password {
			if !stringsContainsRune(alphabet, ch) {
				t.Fatalf("password %q contains %q outside alphabet", password, ch)
			}
		}
	}
}

func stringsContainsRune(s string, r rune) bool {
	for _, c := range s {
		if c == r {
			return true
		}
	}
	return false
}

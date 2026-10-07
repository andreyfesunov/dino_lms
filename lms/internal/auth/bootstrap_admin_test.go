package auth_test

import (
	"context"
	"path/filepath"
	"strings"
	"testing"

	"github.com/andreyfesunov/dino_lms/lms/internal/auth"
	"github.com/andreyfesunov/dino_lms/lms/internal/db"
	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
)

// newService opens a temporary SQLite database and applies migrations.
func newService(t *testing.T) *auth.AuthService {
	t.Helper()
	pool, err := db.Open(context.Background(), filepath.Join(t.TempDir(), "auth.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = pool.Close() })
	return auth.NewAuthService(
		auth.NewSqliteUserRepository(pool),
		auth.NewSqliteSessionRepository(pool),
		auth.Argon2Hasher{},
	)
}

func ptr[T any](value T) *T { return &value }

func bootstrapCommand(login, password string) auth.BootstrapAdminCommand {
	return auth.BootstrapAdminCommand{
		Login:     login,
		Password:  ptr(password),
		FirstName: ptr("Алексей"),
		LastName:  ptr("Иванов"),
	}
}

func TestFreshDatabaseHasNoAdmin(t *testing.T) {
	svc := newService(t)
	hasAdmin, err := svc.HasAdmin(context.Background())
	if err != nil {
		t.Fatal(err)
	}
	if hasAdmin {
		t.Fatal("fresh database must not have an admin")
	}
}

func TestBootstrapCreatesActiveAdminAndLoginWorks(t *testing.T) {
	ctx := context.Background()
	svc := newService(t)

	result, err := svc.BootstrapAdmin(ctx, bootstrapCommand("admin@dino.lms", "correct horse"))
	if err != nil {
		t.Fatal(err)
	}
	hasAdmin, err := svc.HasAdmin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if !hasAdmin {
		t.Fatal("admin must exist after bootstrap")
	}

	actor := kernel.NewActor(result.UserID, []kernel.Role{kernel.RoleAdmin})
	user, err := svc.CurrentUser(ctx, actor)
	if err != nil {
		t.Fatal(err)
	}
	if user.Role != kernel.RoleAdmin || user.Status != auth.StatusActive {
		t.Fatalf("role/status = %s/%s", user.Role, user.Status)
	}
	if user.FirstName == nil || *user.FirstName != "Алексей" {
		t.Fatalf("first name = %v", user.FirstName)
	}
	if user.LastName == nil || *user.LastName != "Иванов" {
		t.Fatalf("last name = %v", user.LastName)
	}
	if user.NeedsOnboarding() {
		t.Fatal("named admin must not need onboarding")
	}

	login, err := svc.Login(ctx, auth.LoginCommand{Login: "admin@dino.lms", Password: "correct horse"})
	if err != nil {
		t.Fatal(err)
	}
	if login.User.ID != result.UserID {
		t.Fatalf("login id = %s, want %s", login.User.ID, result.UserID)
	}
}

func TestSecondBootstrapIsRefused(t *testing.T) {
	ctx := context.Background()
	svc := newService(t)
	if _, err := svc.BootstrapAdmin(ctx, bootstrapCommand("admin@dino.lms", "correct horse")); err != nil {
		t.Fatal(err)
	}
	_, err := svc.BootstrapAdmin(ctx, bootstrapCommand("other@dino.lms", "another horse"))
	var authErr *auth.AuthError
	if err == nil {
		t.Fatal("second bootstrap must fail")
	}
	if !errorsAs(err, &authErr) || authErr.Code != auth.CodeAdminExists {
		t.Fatalf("err = %v", err)
	}
}

func TestShortPasswordIsRejectedWithoutCreatingAUser(t *testing.T) {
	ctx := context.Background()
	svc := newService(t)
	_, err := svc.BootstrapAdmin(ctx, bootstrapCommand("admin@dino.lms", "short"))
	if err == nil {
		t.Fatal("short password must be rejected")
	}
	hasAdmin, err := svc.HasAdmin(ctx)
	if err != nil {
		t.Fatal(err)
	}
	if hasAdmin {
		t.Fatal("no admin must be created")
	}
}

func TestBlankNamesAreStoredAsNone(t *testing.T) {
	ctx := context.Background()
	svc := newService(t)
	result, err := svc.BootstrapAdmin(ctx, auth.BootstrapAdminCommand{
		Login:     "admin@dino.lms",
		Password:  ptr("correct horse"),
		FirstName: ptr("   "),
		LastName:  ptr(""),
	})
	if err != nil {
		t.Fatal(err)
	}
	actor := kernel.NewActor(result.UserID, []kernel.Role{kernel.RoleAdmin})
	user, err := svc.CurrentUser(ctx, actor)
	if err != nil {
		t.Fatal(err)
	}
	if user.FirstName != nil || user.LastName != nil {
		t.Fatalf("names = %v/%v, want nil", user.FirstName, user.LastName)
	}
	if user.Status != auth.StatusPending || !user.NeedsOnboarding() {
		t.Fatalf("status = %s, needs onboarding = %v", user.Status, user.NeedsOnboarding())
	}
}

func TestArgon2HasherRoundTrip(t *testing.T) {
	hasher := auth.Argon2Hasher{}
	hash, err := hasher.Hash("correct horse")
	if err != nil {
		t.Fatal(err)
	}
	if !strings.HasPrefix(string(hash), "$argon2id$") {
		t.Fatalf("hash = %s", hash)
	}
	valid, err := hasher.Verify("correct horse", hash)
	if err != nil || !valid {
		t.Fatalf("verify = %v, %v", valid, err)
	}
	valid, err = hasher.Verify("wrong", hash)
	if err != nil || valid {
		t.Fatalf("wrong password verify = %v, %v", valid, err)
	}
}

// helpers kept tiny to avoid importing errors/assert packages everywhere.
func errorsAs(err error, target **auth.AuthError) bool {
	if e, ok := err.(*auth.AuthError); ok {
		*target = e
		return true
	}
	return false
}

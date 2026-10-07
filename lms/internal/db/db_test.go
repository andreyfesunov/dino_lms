package db

import (
	"context"
	"database/sql"
	"path/filepath"
	"testing"
)

func openTest(t *testing.T) *sql.DB {
	t.Helper()
	pool, err := Open(context.Background(), filepath.Join(t.TempDir(), "test.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { _ = pool.Close() })
	return pool
}

func TestMigrationsIdempotent(t *testing.T) {
	pool := openTest(t)
	ctx := context.Background()
	if err := Migrate(ctx, pool); err != nil {
		t.Fatalf("second migrate: %v", err)
	}

	var usersCols []string
	rows, err := pool.Query(`SELECT name FROM pragma_table_info('users') ORDER BY cid`)
	if err != nil {
		t.Fatal(err)
	}
	for rows.Next() {
		var name string
		if err := rows.Scan(&name); err != nil {
			t.Fatal(err)
		}
		usersCols = append(usersCols, name)
	}
	rows.Close()

	want := map[string]bool{
		"id": true, "login": true, "password_hash": true, "role": true,
		"status": true, "first_name": true, "last_name": true, "created_at": true,
	}
	if len(usersCols) != len(want) {
		t.Fatalf("users columns = %v", usersCols)
	}
	for _, col := range usersCols {
		if !want[col] {
			t.Fatalf("unexpected users column %q in %v", col, usersCols)
		}
	}
}

func TestConnectionPragmasAndNestedDirectory(t *testing.T) {
	pool, err := Open(context.Background(), filepath.Join(t.TempDir(), "new", "nested", "db.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	for pragma, expected := range map[string]string{"foreign_keys": "1", "journal_mode": "wal", "busy_timeout": "5000"} {
		var actual string
		if err := pool.QueryRow("PRAGMA " + pragma).Scan(&actual); err != nil {
			t.Fatal(err)
		}
		if actual != expected {
			t.Fatalf("%s = %s, want %s", pragma, actual, expected)
		}
	}
}

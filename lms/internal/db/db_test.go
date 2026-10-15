package db

import (
	"context"
	"database/sql"
	"io/fs"
	"path/filepath"
	"sort"
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

func TestCourseEnrollmentMigrationPreservesGrants(t *testing.T) {
	pool := openTest(t)
	_, err := pool.Exec(`
INSERT INTO users (id,login,role,status,created_at) VALUES ('admin','admin','admin','active',0),('student','student','student','active',0);
DROP TABLE course_access;
CREATE TABLE course_access (
 user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
 course_id TEXT NOT NULL,
 open_chapters TEXT NOT NULL DEFAULT '*' CHECK(length(open_chapters)>0),
 granted_by TEXT NOT NULL REFERENCES users(id),
 created_at INTEGER NOT NULL,
 PRIMARY KEY(user_id,course_id)
);
CREATE INDEX course_access_course_idx ON course_access(course_id);
INSERT INTO course_access VALUES ('student','full','*','admin',123),('student','partial','chapter-1','admin',456);
INSERT INTO lesson_progress VALUES ('student','full','chapter-1/intro',789);
`)
	if err != nil {
		t.Fatal(err)
	}
	body, err := migrationsFS.ReadFile("migrations/20261014120000_course_enrollment.sql")
	if err != nil {
		t.Fatal(err)
	}
	if err = applyMigration(context.Background(), pool, "enrollment-upgrade-test", string(body)); err != nil {
		t.Fatal(err)
	}
	for course, chapters := range map[string]string{"full": "*", "partial": "chapter-1"} {
		var got, by string
		var created int
		if err := pool.QueryRow(`SELECT open_chapters,granted_by,created_at FROM course_access WHERE course_id=?`, course).Scan(&got, &by, &created); err != nil {
			t.Fatal(err)
		}
		if got != chapters || by != "admin" || (course == "full" && created != 123) || (course == "partial" && created != 456) {
			t.Fatalf("lost grant: %s %s %d", got, by, created)
		}
	}
	if _, err = pool.Exec(`UPDATE course_access SET open_chapters='' WHERE course_id='full'`); err != nil {
		t.Fatal(err)
	}
	var progress int
	if err = pool.QueryRow(`SELECT completed_at FROM lesson_progress`).Scan(&progress); err != nil || progress != 789 {
		t.Fatal(progress, err)
	}
	if _, err = pool.Exec(`DELETE FROM users WHERE id='student'`); err != nil {
		t.Fatal(err)
	}
	var remaining int
	if err = pool.QueryRow(`SELECT count(*) FROM course_access`).Scan(&remaining); err != nil || remaining != 0 {
		t.Fatal(remaining, err)
	}
}

func TestTeacherScheduleMigrationClearsWindowsAndPreservesCalls(t *testing.T) {
	ctx := context.Background()
	dsn, err := sqliteDSN(filepath.Join(t.TempDir(), "legacy.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	pool, err := sql.Open("sqlite", dsn)
	if err != nil {
		t.Fatal(err)
	}
	defer pool.Close()
	pool.SetMaxOpenConns(1)
	if _, err := pool.Exec(`CREATE TABLE _migrations (name TEXT PRIMARY KEY NOT NULL, applied_at INTEGER NOT NULL)`); err != nil {
		t.Fatal(err)
	}
	entries, err := fs.ReadDir(migrationsFS, "migrations")
	if err != nil {
		t.Fatal(err)
	}
	names := make([]string, 0, len(entries))
	for _, entry := range entries {
		if !entry.IsDir() && filepath.Ext(entry.Name()) == ".sql" && entry.Name() != "20261015120000_teacher_call_schedules.sql" {
			names = append(names, entry.Name())
		}
	}
	sort.Strings(names)
	for _, name := range names {
		body, err := migrationsFS.ReadFile("migrations/" + name)
		if err != nil {
			t.Fatal(err)
		}
		if err := applyMigration(ctx, pool, name, string(body)); err != nil {
			t.Fatal(err)
		}
	}
	if _, err := pool.Exec(`
INSERT INTO users(id,login,role,status,first_name,last_name,created_at)
VALUES('teacher','teacher','teacher','active','Test','Teacher',0),('student','student','student','active','Test','Student',0);
INSERT INTO call_settings(course_id,chapter_id,lesson_id,teacher_id,duration_min,timezone,version)
VALUES('course','chapter','lesson','teacher',30,'UTC',1);
INSERT INTO call_windows(id,course_id,chapter_id,lesson_id,starts_at,ends_at)
VALUES('window','course','chapter','lesson',2000000000,2000003600);
INSERT INTO calls(id,course_id,chapter_id,lesson_id,course_title,lesson_title,teacher_id,student_id,teacher_name,student_name,starts_at,ends_at,created_at)
VALUES('call','course','chapter','lesson','Course','Lesson','teacher','student','Test Teacher','Test Student',2000000000,2000001800,1);
`); err != nil {
		t.Fatal(err)
	}
	body, err := migrationsFS.ReadFile("migrations/20261015120000_teacher_call_schedules.sql")
	if err != nil {
		t.Fatal(err)
	}
	if err := applyMigration(ctx, pool, "20261015120000_teacher_call_schedules.sql", string(body)); err != nil {
		t.Fatal(err)
	}
	var windows, calls int
	if err := pool.QueryRow(`SELECT count(*) FROM call_windows`).Scan(&windows); err != nil {
		t.Fatal(err)
	}
	if err := pool.QueryRow(`SELECT count(*) FROM calls`).Scan(&calls); err != nil {
		t.Fatal(err)
	}
	if windows != 0 || calls != 1 {
		t.Fatalf("migration left windows=%d calls=%d", windows, calls)
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

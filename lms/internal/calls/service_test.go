package calls

import (
	"context"
	"database/sql"
	"errors"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"
	"time"

	"github.com/andreyfesunov/dino_lms/lms/internal/courses"
	"github.com/andreyfesunov/dino_lms/lms/internal/db"
	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
)

type fixture struct {
	s                                      *Service
	pool                                   *sql.DB
	admin, teacher, other, student, second kernel.Actor
	key, otherKey                          Key
	start                                  int64
	root                                   string
}

func setup(t *testing.T) *fixture {
	t.Helper()
	ctx := context.Background()
	root := t.TempDir()
	pool, err := db.Open(ctx, filepath.Join(root, "test.sqlite"))
	if err != nil {
		t.Fatal(err)
	}
	t.Cleanup(func() { pool.Close() })
	actor := func(role kernel.Role) kernel.Actor {
		id := kernel.NewUserID()
		_, err := pool.ExecContext(ctx, `INSERT INTO users(id,login,role,status,first_name,last_name,created_at) VALUES(?,?,?,'active','Test','User',0)`, id.String(), id.String(), string(role))
		if err != nil {
			t.Fatal(err)
		}
		return kernel.NewActor(id, []kernel.Role{role})
	}
	f := &fixture{pool: pool, admin: actor(kernel.RoleAdmin), teacher: actor(kernel.RoleTeacher), other: actor(kernel.RoleTeacher), student: actor(kernel.RoleStudent), second: actor(kernel.RoleStudent), root: filepath.Join(root, "courses"), key: Key{"sample", "chapter", "call"}, otherKey: Key{"other", "chapter", "call"}}
	for _, id := range []string{"sample", "other"} {
		dir := filepath.Join(f.root, id)
		if err := os.MkdirAll(dir, 0700); err != nil {
			t.Fatal(err)
		}
		raw := `id="` + id + `"
title="Sample"
[[chapters]]
id="chapter"
title="Chapter"
open_by_default=true
lessons=[{id="call",title="Consultation",type="call"}]
`
		if err := os.WriteFile(filepath.Join(dir, "config.toml"), []byte(raw), 0600); err != nil {
			t.Fatal(err)
		}
	}
	c := courses.NewCourseService(courses.OpenCatalog(f.root), courses.NewSqliteCourseRepository(pool))
	f.s = New(pool, c)
	now := time.Date(2030, 1, 1, 0, 0, 0, 0, time.UTC)
	f.s.now = func() time.Time { return now }
	f.start = now.Add(24 * time.Hour).Unix()
	for _, key := range []Key{f.key, f.otherKey} {
		cfg := Settings{TeacherID: f.teacher.UserID.String(), DurationMin: 30, Timezone: "Europe/Moscow", Windows: []Window{{StartsAt: f.start, EndsAt: f.start + 7500}}}
		if _, err := f.s.SaveSettings(ctx, f.admin, key, cfg); err != nil {
			t.Fatal(err)
		}
	}
	return f
}
func code(t *testing.T, err error, want string) {
	t.Helper()
	var e *Error
	if !errors.As(err, &e) || e.Code != want {
		t.Fatalf("error=%v, want %s", err, want)
	}
}
func book(t *testing.T, f *fixture, a kernel.Actor, k Key, start int64) Call {
	t.Helper()
	c, err := f.s.Book(context.Background(), a, k, start)
	if err != nil {
		t.Fatal(err)
	}
	return c
}

func TestSlotsAndCrossCourseConflicts(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	slots, err := f.s.Slots(ctx, f.student, f.key, f.start, f.start+86400, "")
	if err != nil || len(slots) != 4 {
		t.Fatalf("slots=%v err=%v", slots, err)
	}
	c := book(t, f, f.student, f.key, f.start)
	_, err = f.s.Book(ctx, f.second, f.otherKey, f.start)
	code(t, err, "conflict")
	slots, err = f.s.Slots(ctx, f.second, f.otherKey, f.start, f.start+86400, "")
	if err != nil || len(slots) != 3 {
		t.Fatalf("slots=%v err=%v", slots, err)
	}
	_, err = f.s.Book(ctx, f.student, f.key, f.start+1800)
	code(t, err, "conflict")
	// Adjacent calls are allowed.
	book(t, f, f.second, f.otherKey, f.start+1800)
	// A failed move leaves the old booking and version intact.
	_, err = f.s.Change(ctx, f.student, c.ID, Change{Action: "reschedule", StartsAt: f.start + 1800, Version: c.Version})
	code(t, err, "conflict")
	old, err := readCall(ctx, f.pool, c.ID)
	if err != nil || old.StartsAt != c.StartsAt || old.Version != c.Version {
		t.Fatal(old, err)
	}
	_, err = f.s.Slots(ctx, f.second, f.key, f.start, f.start+86400, c.ID)
	code(t, err, "forbidden")
	slots, err = f.s.Slots(ctx, f.student, f.key, f.start, f.start+86400, c.ID)
	if err != nil || len(slots) != 3 {
		t.Fatal(slots, err)
	}
}
func TestConcurrentBookingOnlyOneWins(t *testing.T) {
	f := setup(t)
	var wg sync.WaitGroup
	results := make(chan error, 2)
	for _, a := range []kernel.Actor{f.student, f.second} {
		wg.Go(func() { _, err := f.s.Book(context.Background(), a, f.key, f.start); results <- err })
	}
	wg.Wait()
	close(results)
	successes := 0
	for err := range results {
		if err == nil {
			successes++
		} else {
			code(t, err, "conflict")
		}
	}
	if successes != 1 {
		t.Fatalf("successes=%d", successes)
	}
}

func TestStudentCannotOverlapDifferentTeachers(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	cfg, _ := f.s.Settings(ctx, f.admin, f.otherKey)
	cfg.TeacherID = f.other.UserID.String()
	cfg.Windows = []Window{{StartsAt: f.start, EndsAt: f.start + 3600}}
	if _, err := f.s.SaveSettings(ctx, f.admin, f.otherKey, cfg); err != nil {
		t.Fatal(err)
	}
	book(t, f, f.student, f.key, f.start)
	_, err := f.s.Book(ctx, f.student, f.otherKey, f.start)
	code(t, err, "conflict")
	book(t, f, f.second, f.otherKey, f.start)
}

func TestDeletedLessonKeepsBookingHistory(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	c := book(t, f, f.student, f.key, f.start)
	if err := os.Remove(filepath.Join(f.root, "sample", "config.toml")); err != nil {
		t.Fatal(err)
	}
	f.s.courses = courses.NewCourseService(courses.OpenCatalog(f.root), courses.NewSqliteCourseRepository(f.pool))
	_, err := f.s.Book(ctx, f.second, f.key, f.start+1800)
	code(t, err, "not_found")
	list, err := f.s.List(ctx, f.student)
	if err != nil || len(list) != 1 || list[0].LessonTitle != "Consultation" {
		t.Fatal(list, err)
	}
	if _, err = f.s.Change(ctx, f.teacher, c.ID, Change{Action: "cancel", Version: c.Version}); err != nil {
		t.Fatal(err)
	}
}
func TestManageCancelRescheduleAndComplete(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	c := book(t, f, f.student, f.key, f.start)
	_, err := f.s.Change(ctx, f.other, c.ID, Change{Action: "cancel", Version: c.Version})
	code(t, err, "forbidden")
	_, err = f.s.Change(ctx, f.student, c.ID, Change{Action: "link", Version: c.Version, MeetingURL: "https://meet.example/test"})
	code(t, err, "forbidden")
	_, err = f.s.Change(ctx, f.teacher, c.ID, Change{Action: "link", Version: c.Version, MeetingURL: "javascript:alert(1)"})
	code(t, err, "bad_request")
	c, err = f.s.Change(ctx, f.teacher, c.ID, Change{Action: "link", Version: c.Version, MeetingURL: "https://meet.example/test"})
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.s.Change(ctx, f.teacher, c.ID, Change{Action: "complete", Version: c.Version})
	code(t, err, "conflict")
	// Teacher can move outside published windows.
	c, err = f.s.Change(ctx, f.teacher, c.ID, Change{Action: "reschedule", Version: c.Version, StartsAt: f.start + 86400})
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.s.Change(ctx, f.teacher, c.ID, Change{Action: "cancel", Version: c.Version - 1})
	code(t, err, "conflict")
	c, err = f.s.Change(ctx, f.student, c.ID, Change{Action: "cancel", Version: c.Version})
	if err != nil {
		t.Fatal(err)
	}
	c = book(t, f, f.student, f.key, f.start)
	f.s.now = func() time.Time { return time.Unix(c.EndsAt+1, 0) }
	_, err = f.s.Change(ctx, f.student, c.ID, Change{Action: "cancel", Version: c.Version})
	code(t, err, "conflict")
	c, err = f.s.Change(ctx, f.teacher, c.ID, Change{Action: "complete", Version: c.Version})
	if err != nil {
		t.Fatal(err)
	}
	keys, err := f.s.courses.CompletedLessons(ctx, f.student, f.key.CourseID)
	if err != nil || len(keys) != 1 || keys[0] != "chapter/call" {
		t.Fatal(keys, err)
	}
	_, err = f.s.Book(ctx, f.student, f.key, f.start+3600)
	code(t, err, "conflict")
	if err = f.s.courses.MarkLessonDone(ctx, f.student, "sample", "chapter", "call"); err == nil {
		t.Fatal("student completed a call directly")
	}
	if err = f.s.courses.MarkLessonUndone(ctx, f.student, "sample", "chapter", "call"); err == nil {
		t.Fatal("student cleared call progress")
	}
}
func TestSettingsChangesPreserveBookingsAndLifecycle(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	c := book(t, f, f.student, f.key, f.start)
	cfg, err := f.s.Settings(ctx, f.teacher, f.key)
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.s.SaveSettings(ctx, f.other, f.key, cfg)
	code(t, err, "forbidden")
	cfg.DurationMin = 45
	cfg.Windows = nil
	cfg, err = f.s.SaveSettings(ctx, f.teacher, f.key, cfg)
	if err != nil {
		t.Fatal(err)
	}
	old, err := readCall(ctx, f.pool, c.ID)
	if err != nil || old.EndsAt-old.StartsAt != 1800 {
		t.Fatal(old, err)
	}
	cfg.TeacherID = f.other.UserID.String()
	_, err = f.s.SaveSettings(ctx, f.admin, f.key, cfg)
	code(t, err, "calls_teacher_busy")
	for _, id := range []string{f.teacher.UserID.String(), f.student.UserID.String()} {
		if _, err = f.pool.ExecContext(ctx, `DELETE FROM users WHERE id=?`, id); err == nil {
			t.Fatal("deleted participant with unfinished booking")
		}
	}
	if _, err = f.pool.ExecContext(ctx, `UPDATE users SET role='student' WHERE id=?`, f.teacher.UserID.String()); err == nil {
		t.Fatal("demoted assigned teacher")
	}
	_, err = f.s.Change(ctx, f.teacher, c.ID, Change{Action: "cancel", Version: c.Version})
	if err != nil {
		t.Fatal(err)
	}
	cfg, err = f.s.SaveSettings(ctx, f.admin, f.key, cfg)
	if err != nil {
		t.Fatal(err)
	}
	_, err = f.s.SaveSettings(ctx, f.admin, f.key, Settings{TeacherID: cfg.TeacherID, DurationMin: 30, Timezone: "UTC", Version: cfg.Version - 1})
	code(t, err, "conflict")
	// Unassigned teacher cannot edit previous calls, but admin can still inspect history.
	list, err := f.s.List(ctx, f.second)
	if err != nil || len(list) != 0 {
		t.Fatal(list, err)
	}
	list, err = f.s.List(ctx, f.admin)
	if err != nil || len(list) != 1 {
		t.Fatal(list, err)
	}
	if _, err = f.pool.ExecContext(ctx, `DELETE FROM users WHERE id=?`, f.student.UserID.String()); err != nil {
		t.Fatal(err)
	}
	old, err = readCall(ctx, f.pool, c.ID)
	if err != nil || old.StudentName == "" || old.StudentID != "" {
		t.Fatal(old, err)
	}
}
func TestSettingsValidationAndAccessRevocation(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	cfg, _ := f.s.Settings(ctx, f.teacher, f.key)
	for _, mutate := range []func(*Settings){func(c *Settings) { c.DurationMin = 0 }, func(c *Settings) { c.Timezone = "invalid/zone" }, func(c *Settings) {
		c.Windows = append(c.Windows, Window{StartsAt: f.start + 60, EndsAt: f.start + 3600})
	}} {
		test := cfg
		test.Windows = append([]Window{}, cfg.Windows...)
		mutate(&test)
		_, err := f.s.SaveSettings(ctx, f.teacher, f.key, test)
		code(t, err, "bad_request")
	}
	c := book(t, f, f.student, f.key, f.start)
	// Remove public access, with no explicit student grant.
	path := filepath.Join(f.root, "sample", "config.toml")
	raw, err := os.ReadFile(path)
	if err != nil {
		t.Fatal(err)
	}
	raw = []byte(strings.ReplaceAll(string(raw), "open_by_default=true", "open_by_default=false"))
	if err = os.WriteFile(path, raw, 0600); err != nil {
		t.Fatal(err)
	}
	f.s.courses = courses.NewCourseService(courses.OpenCatalog(f.root), courses.NewSqliteCourseRepository(f.pool))
	_, err = f.s.Slots(ctx, f.student, f.key, f.start, f.start+86400, "")
	code(t, err, "forbidden")
	_, err = f.s.Change(ctx, f.student, c.ID, Change{Action: "reschedule", Version: c.Version, StartsAt: f.start + 1800})
	code(t, err, "forbidden")
	list, err := f.s.List(ctx, f.student)
	if err != nil || len(list) != 1 {
		t.Fatal(list, err)
	}
	_, err = f.s.Change(ctx, f.student, c.ID, Change{Action: "cancel", Version: c.Version})
	if err != nil {
		t.Fatal(err)
	}
}

package calls

import (
	"context"
	"testing"
	"time"
)

func TestAdminCanTeachCall(t *testing.T) {
	f := setup(t)
	ctx := context.Background()
	teachers, err := f.s.Teachers(ctx, f.admin)
	if err != nil {
		t.Fatal(err)
	}
	found := false
	for _, teacher := range teachers {
		if teacher.ID == f.admin.UserID.String() {
			found = true
		}
		if teacher.ID == f.student.UserID.String() {
			t.Fatal("student listed as a teacher")
		}
	}
	if !found {
		t.Fatal("admin missing from teacher list")
	}
	cfg, err := f.s.Settings(ctx, f.admin, f.key)
	if err != nil {
		t.Fatal(err)
	}
	cfg.TeacherID = f.student.UserID.String()
	_, err = f.s.SaveSettings(ctx, f.admin, f.key, cfg)
	code(t, err, "bad_request")
	cfg.TeacherID = f.admin.UserID.String()
	if _, err := f.s.SaveSettings(ctx, f.admin, f.key, cfg); err != nil {
		t.Fatal(err)
	}
	if _, err := f.s.SaveSchedule(ctx, f.admin, TeacherSchedule{Timezone: "UTC", HorizonWeeks: 12, WeeklyWindows: []WeeklyWindow{{Weekday: 3, StartTime: "00:00", EndTime: "01:00"}}}); err != nil {
		t.Fatal(err)
	}
	c := book(t, f, f.student, f.key, f.start)
	if c.TeacherID != cfg.TeacherID || c.TeacherName != "Test User" {
		t.Fatalf("wrong assigned teacher: %+v", c)
	}
	c, err = f.s.Change(ctx, f.admin, c.ID, Change{Action: "link", Version: c.Version, MeetingURL: "https://meet.example/admin"})
	if err != nil {
		t.Fatal(err)
	}
	f.s.now = func() time.Time { return time.Unix(c.EndsAt+1, 0) }
	if _, err := f.s.Change(ctx, f.admin, c.ID, Change{Action: "complete", Version: c.Version}); err != nil {
		t.Fatal(err)
	}
}

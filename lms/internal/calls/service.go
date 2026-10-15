// Package calls owns lesson availability and individual call bookings.
package calls

import (
	"context"
	"database/sql"
	"errors"
	"net/url"
	"sort"
	"strings"
	"time"
	_ "time/tzdata"

	"github.com/andreyfesunov/dino_lms/lms/internal/courses"
	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
	"github.com/google/uuid"
)

type Error struct{ Code string }

func (e *Error) Error() string { return e.Code }
func fail(code string) error   { return &Error{code} }

type Key struct {
	CourseID  string `json:"course_id"`
	ChapterID string `json:"chapter_id"`
	LessonID  string `json:"lesson_id"`
}
type Window struct {
	ID       string `json:"id"`
	StartsAt int64  `json:"starts_at"`
	EndsAt   int64  `json:"ends_at"`
}
type Settings struct {
	TeacherID   string `json:"teacher_id"`
	TeacherName string `json:"teacher_name"`
	DurationMin int    `json:"duration_min"`
	Version     int    `json:"version"`
	CanManage   bool   `json:"can_manage"`
}
type TimeWindow struct {
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
}
type WeeklyWindow struct {
	Weekday   int    `json:"weekday"`
	StartTime string `json:"start_time"`
	EndTime   string `json:"end_time"`
}
type ScheduleException struct {
	Date    string       `json:"date"`
	Windows []TimeWindow `json:"windows"`
}
type TeacherSchedule struct {
	Timezone      string              `json:"timezone"`
	HorizonWeeks  int                 `json:"horizon_weeks"`
	Version       int                 `json:"version"`
	WeeklyWindows []WeeklyWindow      `json:"weekly_windows"`
	Exceptions    []ScheduleException `json:"exceptions"`
}
type Teacher struct {
	ID   string `json:"id"`
	Name string `json:"name"`
}
type Call struct {
	Key
	ID          string `json:"id"`
	CourseTitle string `json:"course_title"`
	LessonTitle string `json:"lesson_title"`
	TeacherID   string `json:"teacher_id"`
	StudentID   string `json:"student_id"`
	TeacherName string `json:"teacher_name"`
	StudentName string `json:"student_name"`
	StartsAt    int64  `json:"starts_at"`
	EndsAt      int64  `json:"ends_at"`
	Status      string `json:"status"`
	MeetingURL  string `json:"meeting_url"`
	Version     int    `json:"version"`
}
type Change struct {
	Action     string `json:"action"`
	StartsAt   int64  `json:"starts_at"`
	MeetingURL string `json:"meeting_url"`
	Version    int    `json:"version"`
}
type Service struct {
	db      *sql.DB
	courses *courses.CourseService
	now     func() time.Time
}

func New(db *sql.DB, c *courses.CourseService) *Service { return &Service{db, c, time.Now} }

type querier interface {
	QueryContext(context.Context, string, ...any) (*sql.Rows, error)
	QueryRowContext(context.Context, string, ...any) *sql.Row
}

func (s *Service) lesson(ctx context.Context, a kernel.Actor, k Key) (*courses.CourseConfig, *courses.LessonConfig, error) {
	c := s.courses.Catalog().Get(k.CourseID)
	if c == nil {
		return nil, nil, fail("not_found")
	}
	ch := c.Chapter(k.ChapterID)
	l := c.Lesson(k.ChapterID, k.LessonID)
	if ch == nil || l == nil || l.Kind() != "call" {
		return nil, nil, fail("not_found")
	}
	state, err := s.courses.ChapterAccess(ctx, a, c, ch)
	if err != nil {
		return nil, nil, err
	}
	if state != courses.ChapterOpen {
		return nil, nil, fail("forbidden")
	}
	return c, l, nil
}
func settings(ctx context.Context, q querier, k Key) (Settings, error) {
	out := Settings{DurationMin: 30}
	err := q.QueryRowContext(ctx, `SELECT COALESCE(s.teacher_id,''), COALESCE(trim(u.first_name || ' ' || u.last_name),''),s.duration_min,s.version FROM call_settings s LEFT JOIN users u ON u.id=s.teacher_id WHERE course_id=? AND chapter_id=? AND lesson_id=?`, k.CourseID, k.ChapterID, k.LessonID).Scan(&out.TeacherID, &out.TeacherName, &out.DurationMin, &out.Version)
	if errors.Is(err, sql.ErrNoRows) {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	return out, nil
}
func manages(a kernel.Actor, teacher string) bool {
	return a.HasRole(kernel.RoleAdmin) || (a.HasRole(kernel.RoleTeacher) && a.UserID.String() == teacher)
}
func (s *Service) Settings(ctx context.Context, a kernel.Actor, k Key) (Settings, error) {
	if _, _, err := s.lesson(ctx, a, k); err != nil {
		return Settings{}, err
	}
	out, err := settings(ctx, s.db, k)
	out.CanManage = manages(a, out.TeacherID)
	return out, err
}

func minuteOfDay(value string) (int, bool) {
	t, err := time.Parse("15:04", value)
	if err != nil || t.Format("15:04") != value {
		return 0, false
	}
	return t.Hour()*60 + t.Minute(), true
}

func clockTime(minute int) string {
	return time.Date(2000, 1, 1, minute/60, minute%60, 0, 0, time.UTC).Format("15:04")
}

func validTimeWindows(windows []TimeWindow) ([][2]int, bool) {
	if len(windows) > 100 {
		return nil, false
	}
	minutes := make([][2]int, 0, len(windows))
	for _, window := range windows {
		start, okStart := minuteOfDay(window.StartTime)
		end, okEnd := minuteOfDay(window.EndTime)
		if !okStart || !okEnd || end <= start {
			return nil, false
		}
		minutes = append(minutes, [2]int{start, end})
	}
	sort.Slice(minutes, func(i, j int) bool { return minutes[i][0] < minutes[j][0] })
	for i := 1; i < len(minutes); i++ {
		if minutes[i][0] < minutes[i-1][1] {
			return nil, false
		}
	}
	return minutes, true
}

func teacherSchedule(ctx context.Context, q querier, teacherID string) (TeacherSchedule, error) {
	out := TeacherSchedule{HorizonWeeks: 12, WeeklyWindows: []WeeklyWindow{}, Exceptions: []ScheduleException{}}
	err := q.QueryRowContext(ctx, `SELECT timezone,horizon_weeks,version FROM teacher_schedules WHERE teacher_id=?`, teacherID).Scan(&out.Timezone, &out.HorizonWeeks, &out.Version)
	if errors.Is(err, sql.ErrNoRows) {
		return out, nil
	}
	if err != nil {
		return out, err
	}
	rows, err := q.QueryContext(ctx, `SELECT weekday,start_minute,end_minute FROM teacher_weekly_windows WHERE teacher_id=? ORDER BY weekday,start_minute`, teacherID)
	if err != nil {
		return out, err
	}
	for rows.Next() {
		var window WeeklyWindow
		var start, end int
		if err := rows.Scan(&window.Weekday, &start, &end); err != nil {
			rows.Close()
			return out, err
		}
		window.StartTime, window.EndTime = clockTime(start), clockTime(end)
		out.WeeklyWindows = append(out.WeeklyWindows, window)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return out, err
	}
	rows, err = q.QueryContext(ctx, `SELECT local_date FROM teacher_schedule_exceptions WHERE teacher_id=? ORDER BY local_date`, teacherID)
	if err != nil {
		return out, err
	}
	dateKeys := []string{}
	for rows.Next() {
		var date string
		if err := rows.Scan(&date); err != nil {
			rows.Close()
			return out, err
		}
		dateKeys = append(dateKeys, date)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return out, err
	}
	for _, date := range dateKeys {
		exception := ScheduleException{Date: date, Windows: []TimeWindow{}}
		windowRows, err := q.QueryContext(ctx, `SELECT start_minute,end_minute FROM teacher_exception_windows WHERE teacher_id=? AND local_date=? ORDER BY start_minute`, teacherID, date)
		if err != nil {
			return out, err
		}
		for windowRows.Next() {
			var start, end int
			if err := windowRows.Scan(&start, &end); err != nil {
				windowRows.Close()
				return out, err
			}
			exception.Windows = append(exception.Windows, TimeWindow{StartTime: clockTime(start), EndTime: clockTime(end)})
		}
		if err := windowRows.Err(); err != nil {
			windowRows.Close()
			return out, err
		}
		windowRows.Close()
		out.Exceptions = append(out.Exceptions, exception)
	}
	return out, nil
}

func (s *Service) Schedule(ctx context.Context, a kernel.Actor) (TeacherSchedule, error) {
	if !a.HasRole(kernel.RoleTeacher) && !a.HasRole(kernel.RoleAdmin) {
		return TeacherSchedule{}, fail("forbidden")
	}
	return teacherSchedule(ctx, s.db, a.UserID.String())
}

func (s *Service) SaveSchedule(ctx context.Context, a kernel.Actor, in TeacherSchedule) (TeacherSchedule, error) {
	if !a.HasRole(kernel.RoleTeacher) && !a.HasRole(kernel.RoleAdmin) {
		return TeacherSchedule{}, fail("forbidden")
	}
	if _, err := time.LoadLocation(in.Timezone); err != nil || in.HorizonWeeks < 1 || in.HorizonWeeks > 52 || len(in.WeeklyWindows) > 100 || len(in.Exceptions) > 366 {
		return TeacherSchedule{}, fail("bad_request")
	}
	weekly := make([][3]int, 0, len(in.WeeklyWindows))
	byDay := [7][]TimeWindow{}
	for _, window := range in.WeeklyWindows {
		if window.Weekday < 0 || window.Weekday > 6 {
			return TeacherSchedule{}, fail("bad_request")
		}
		byDay[window.Weekday] = append(byDay[window.Weekday], TimeWindow{StartTime: window.StartTime, EndTime: window.EndTime})
	}
	for weekday, windows := range byDay {
		minutes, ok := validTimeWindows(windows)
		if !ok {
			return TeacherSchedule{}, fail("bad_request")
		}
		for _, window := range minutes {
			weekly = append(weekly, [3]int{weekday, window[0], window[1]})
		}
	}
	loc, _ := time.LoadLocation(in.Timezone)
	today := s.now().In(loc).Format("2006-01-02")
	exceptions := make(map[string][][2]int, len(in.Exceptions))
	for _, exception := range in.Exceptions {
		parsed, err := time.Parse("2006-01-02", exception.Date)
		if err != nil || parsed.Format("2006-01-02") != exception.Date || exception.Date < today {
			return TeacherSchedule{}, fail("bad_request")
		}
		if _, exists := exceptions[exception.Date]; exists {
			return TeacherSchedule{}, fail("bad_request")
		}
		windows, ok := validTimeWindows(exception.Windows)
		if !ok {
			return TeacherSchedule{}, fail("bad_request")
		}
		exceptions[exception.Date] = windows
	}

	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return TeacherSchedule{}, err
	}
	defer tx.Rollback()
	old, err := teacherSchedule(ctx, tx, a.UserID.String())
	if err != nil {
		return TeacherSchedule{}, err
	}
	if old.Version != in.Version {
		return TeacherSchedule{}, fail("conflict")
	}
	if old.Version == 0 {
		_, err = tx.ExecContext(ctx, `INSERT INTO teacher_schedules(teacher_id,timezone,horizon_weeks,version) VALUES(?,?,?,1)`, a.UserID.String(), in.Timezone, in.HorizonWeeks)
	} else {
		_, err = tx.ExecContext(ctx, `UPDATE teacher_schedules SET timezone=?,horizon_weeks=?,version=version+1 WHERE teacher_id=?`, in.Timezone, in.HorizonWeeks, a.UserID.String())
	}
	if err != nil {
		return TeacherSchedule{}, err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM teacher_weekly_windows WHERE teacher_id=?`, a.UserID.String()); err != nil {
		return TeacherSchedule{}, err
	}
	if _, err = tx.ExecContext(ctx, `DELETE FROM teacher_schedule_exceptions WHERE teacher_id=?`, a.UserID.String()); err != nil {
		return TeacherSchedule{}, err
	}
	for _, window := range weekly {
		if _, err = tx.ExecContext(ctx, `INSERT INTO teacher_weekly_windows(id,teacher_id,weekday,start_minute,end_minute) VALUES(?,?,?,?,?)`, uuid.NewString(), a.UserID.String(), window[0], window[1], window[2]); err != nil {
			return TeacherSchedule{}, err
		}
	}
	for date, windows := range exceptions {
		if _, err = tx.ExecContext(ctx, `INSERT INTO teacher_schedule_exceptions(teacher_id,local_date) VALUES(?,?)`, a.UserID.String(), date); err != nil {
			return TeacherSchedule{}, err
		}
		for _, window := range windows {
			if _, err = tx.ExecContext(ctx, `INSERT INTO teacher_exception_windows(teacher_id,local_date,start_minute,end_minute) VALUES(?,?,?,?)`, a.UserID.String(), date, window[0], window[1]); err != nil {
				return TeacherSchedule{}, err
			}
		}
	}
	if err = tx.Commit(); err != nil {
		return TeacherSchedule{}, err
	}
	return teacherSchedule(ctx, s.db, a.UserID.String())
}
func (s *Service) Teachers(ctx context.Context, a kernel.Actor) ([]Teacher, error) {
	if !a.HasRole(kernel.RoleAdmin) {
		return nil, fail("forbidden")
	}
	rows, err := s.db.QueryContext(ctx, `SELECT id,trim(first_name || ' ' || last_name) FROM users WHERE role IN ('teacher','admin') AND status='active' AND length(trim(COALESCE(first_name,'')))>0 AND length(trim(COALESCE(last_name,'')))>0 ORDER BY first_name,last_name`)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Teacher{}
	for rows.Next() {
		var t Teacher
		if err := rows.Scan(&t.ID, &t.Name); err != nil {
			return nil, err
		}
		out = append(out, t)
	}
	return out, rows.Err()
}
func (s *Service) SaveSettings(ctx context.Context, a kernel.Actor, k Key, in Settings) (Settings, error) {
	if _, _, err := s.lesson(ctx, a, k); err != nil {
		return Settings{}, err
	}
	if in.DurationMin < 5 || in.DurationMin > 480 {
		return Settings{}, fail("bad_request")
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Settings{}, err
	}
	defer tx.Rollback()
	old, err := settings(ctx, tx, k)
	if err != nil {
		return Settings{}, err
	}
	if !manages(a, old.TeacherID) {
		return Settings{}, fail("forbidden")
	}
	if old.Version != in.Version {
		return Settings{}, fail("conflict")
	}
	if !a.HasRole(kernel.RoleAdmin) && in.TeacherID != old.TeacherID {
		return Settings{}, fail("forbidden")
	}
	if in.TeacherID != "" {
		var n int
		err = tx.QueryRowContext(ctx, `SELECT count(*) FROM users WHERE id=? AND role IN ('teacher','admin') AND status='active' AND length(trim(COALESCE(first_name,'')))>0 AND length(trim(COALESCE(last_name,'')))>0`, in.TeacherID).Scan(&n)
		if err != nil {
			return Settings{}, err
		}
		if n != 1 {
			return Settings{}, fail("bad_request")
		}
	}
	if old.TeacherID != in.TeacherID {
		var n int
		err = tx.QueryRowContext(ctx, `SELECT count(*) FROM calls WHERE course_id=? AND chapter_id=? AND lesson_id=? AND status='scheduled'`, k.CourseID, k.ChapterID, k.LessonID).Scan(&n)
		if err != nil {
			return Settings{}, err
		}
		if n > 0 {
			return Settings{}, fail("calls_teacher_busy")
		}
	}
	_, err = tx.ExecContext(ctx, `INSERT INTO call_settings(course_id,chapter_id,lesson_id,teacher_id,duration_min,timezone,version) VALUES(?,?,?,NULLIF(?,''),?,'UTC',1) ON CONFLICT(course_id,chapter_id,lesson_id) DO UPDATE SET teacher_id=excluded.teacher_id,duration_min=excluded.duration_min,version=call_settings.version+1`, k.CourseID, k.ChapterID, k.LessonID, in.TeacherID, in.DurationMin)
	if err != nil {
		return Settings{}, err
	}
	if err = tx.Commit(); err != nil {
		return Settings{}, err
	}
	return s.Settings(ctx, a, k)
}
func conflict(ctx context.Context, q querier, teacher, student, except string, start, end int64) (bool, error) {
	var n int
	err := q.QueryRowContext(ctx, `SELECT count(*) FROM calls WHERE id!=? AND status='scheduled' AND starts_at<? AND ends_at>? AND (teacher_id=? OR student_id=? OR teacher_id=? OR student_id=?)`, except, end, start, teacher, student, student, teacher).Scan(&n)
	return n > 0, err
}
func scheduleWindowsForDate(schedule TeacherSchedule, date string, weekday int) []TimeWindow {
	for _, exception := range schedule.Exceptions {
		if exception.Date == date {
			return exception.Windows
		}
	}
	out := []TimeWindow{}
	for _, window := range schedule.WeeklyWindows {
		if window.Weekday == weekday {
			out = append(out, TimeWindow{StartTime: window.StartTime, EndTime: window.EndTime})
		}
	}
	return out
}

func localDateTime(date time.Time, minute int, loc *time.Location) (time.Time, bool) {
	value := time.Date(date.Year(), date.Month(), date.Day(), minute/60, minute%60, 0, 0, loc)
	local := value.In(loc)
	return value, local.Year() == date.Year() && local.Month() == date.Month() && local.Day() == date.Day() && local.Hour() == minute/60 && local.Minute() == minute%60
}

func scheduleContains(ctx context.Context, q querier, teacher string, duration int, start, end int64, now time.Time) (bool, error) {
	if teacher == "" || end-start != int64(duration)*60 {
		return false, nil
	}
	schedule, err := teacherSchedule(ctx, q, teacher)
	if err != nil {
		return false, err
	}
	if schedule.Version == 0 {
		return false, nil
	}
	loc, err := time.LoadLocation(schedule.Timezone)
	if err != nil {
		return false, nil
	}
	localStart := time.Unix(start, 0).In(loc)
	day := time.Date(localStart.Year(), localStart.Month(), localStart.Day(), 0, 0, 0, 0, loc)
	today := now.In(loc)
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, loc)
	if day.Before(today) || !day.Before(today.AddDate(0, 0, schedule.HorizonWeeks*7)) {
		return false, nil
	}
	date := localStart.Format("2006-01-02")
	for _, window := range scheduleWindowsForDate(schedule, date, int(localStart.Weekday())) {
		startMinute, _ := minuteOfDay(window.StartTime)
		endMinute, _ := minuteOfDay(window.EndTime)
		windowStart, okStart := localDateTime(day, startMinute, loc)
		windowEnd, okEnd := localDateTime(day, endMinute, loc)
		if !okStart || !okEnd {
			continue
		}
		step := int64(duration) * 60
		if start >= windowStart.Unix() && end <= windowEnd.Unix() && (start-windowStart.Unix())%step == 0 {
			return true, nil
		}
	}
	return false, nil
}
func (s *Service) Slots(ctx context.Context, a kernel.Actor, k Key, from, to int64, except string) ([]Window, error) {
	if _, _, err := s.lesson(ctx, a, k); err != nil {
		return nil, err
	}
	if from < 0 || to > 253402300799 || to <= from || to-from > 93*86400 {
		return nil, fail("bad_request")
	}
	cfg, err := settings(ctx, s.db, k)
	if err != nil {
		return nil, err
	}
	out := []Window{}
	if cfg.TeacherID == "" {
		return out, nil
	}
	// Only the owner's current booking can be ignored while choosing a replacement.
	if except != "" {
		c, err := readCall(ctx, s.db, except)
		if err != nil {
			return nil, err
		}
		if c.StudentID != a.UserID.String() || c.Key != k || c.Status != "scheduled" {
			return nil, fail("forbidden")
		}
	}
	rows, err := s.db.QueryContext(ctx, `SELECT starts_at,ends_at FROM calls WHERE id!=? AND status='scheduled' AND starts_at<? AND ends_at>? AND (teacher_id=? OR student_id=? OR teacher_id=? OR student_id=?)`, except, to, from, cfg.TeacherID, a.UserID.String(), a.UserID.String(), cfg.TeacherID)
	if err != nil {
		return nil, err
	}
	busy := []Window{}
	for rows.Next() {
		var w Window
		if err := rows.Scan(&w.StartsAt, &w.EndsAt); err != nil {
			rows.Close()
			return nil, err
		}
		busy = append(busy, w)
	}
	err = rows.Err()
	rows.Close()
	if err != nil {
		return nil, err
	}
	schedule, err := teacherSchedule(ctx, s.db, cfg.TeacherID)
	if err != nil {
		return nil, err
	}
	if schedule.Version == 0 {
		return out, nil
	}
	loc, err := time.LoadLocation(schedule.Timezone)
	if err != nil {
		return nil, fail("bad_request")
	}
	step := int64(cfg.DurationMin) * 60
	now := s.now()
	first := time.Unix(from, 0).In(loc)
	day := time.Date(first.Year(), first.Month(), first.Day(), 0, 0, 0, 0, loc)
	last := time.Unix(to-1, 0).In(loc)
	lastDay := time.Date(last.Year(), last.Month(), last.Day(), 0, 0, 0, 0, loc)
	today := now.In(loc)
	today = time.Date(today.Year(), today.Month(), today.Day(), 0, 0, 0, 0, loc)
	horizonEnd := today.AddDate(0, 0, schedule.HorizonWeeks*7)
	for ; !day.After(lastDay) && day.Before(horizonEnd); day = day.AddDate(0, 0, 1) {
		if day.Before(today) {
			continue
		}
		date := day.Format("2006-01-02")
		for _, window := range scheduleWindowsForDate(schedule, date, int(day.Weekday())) {
			startMinute, _ := minuteOfDay(window.StartTime)
			endMinute, _ := minuteOfDay(window.EndTime)
			windowStart, okStart := localDateTime(day, startMinute, loc)
			windowEnd, okEnd := localDateTime(day, endMinute, loc)
			if !okStart || !okEnd || windowEnd.Before(windowStart) {
				continue
			}
			start := windowStart.Unix()
			if start < from {
				start += ((from - start + step - 1) / step) * step
			}
			for ; start+step <= windowEnd.Unix() && start < to; start += step {
				if start <= now.Unix() || start < from {
					continue
				}
				free := true
				for _, b := range busy {
					if start < b.EndsAt && start+step > b.StartsAt {
						free = false
						break
					}
				}
				if free {
					out = append(out, Window{StartsAt: start, EndsAt: start + step})
				}
			}
		}
	}
	return out, nil
}

const callColumns = `id,course_id,chapter_id,lesson_id,course_title,lesson_title,COALESCE(teacher_id,''),COALESCE(student_id,''),teacher_name,student_name,starts_at,ends_at,status,meeting_url,version`

type scanner interface{ Scan(...any) error }

func scanCall(row scanner) (Call, error) {
	var c Call
	err := row.Scan(&c.ID, &c.CourseID, &c.ChapterID, &c.LessonID, &c.CourseTitle, &c.LessonTitle, &c.TeacherID, &c.StudentID, &c.TeacherName, &c.StudentName, &c.StartsAt, &c.EndsAt, &c.Status, &c.MeetingURL, &c.Version)
	return c, err
}
func readCall(ctx context.Context, q querier, id string) (Call, error) {
	c, err := scanCall(q.QueryRowContext(ctx, `SELECT `+callColumns+` FROM calls WHERE id=?`, id))
	if errors.Is(err, sql.ErrNoRows) {
		return c, fail("not_found")
	}
	return c, err
}
func (s *Service) List(ctx context.Context, a kernel.Actor) ([]Call, error) {
	query := `SELECT ` + callColumns + ` FROM calls`
	args := []any{}
	if !a.HasRole(kernel.RoleAdmin) {
		query += ` WHERE teacher_id=? OR student_id=?`
		args = append(args, a.UserID.String(), a.UserID.String())
	}
	rows, err := s.db.QueryContext(ctx, query+` ORDER BY starts_at,id`, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	out := []Call{}
	for rows.Next() {
		c, err := scanCall(rows)
		if err != nil {
			return nil, err
		}
		out = append(out, c)
	}
	return out, rows.Err()
}
func (s *Service) Book(ctx context.Context, a kernel.Actor, k Key, start int64) (Call, error) {
	if !a.HasRole(kernel.RoleStudent) {
		return Call{}, fail("forbidden")
	}
	course, lesson, err := s.lesson(ctx, a, k)
	if err != nil {
		return Call{}, err
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Call{}, err
	}
	defer tx.Rollback()
	cfg, err := settings(ctx, tx, k)
	if err != nil {
		return Call{}, err
	}
	end := start + int64(cfg.DurationMin)*60
	fits, err := scheduleContains(ctx, tx, cfg.TeacherID, cfg.DurationMin, start, end, s.now())
	if err != nil {
		return Call{}, err
	}
	if start <= s.now().Unix() || !fits {
		return Call{}, fail("conflict")
	}
	var n int
	err = tx.QueryRowContext(ctx, `SELECT count(*) FROM calls WHERE student_id=? AND course_id=? AND chapter_id=? AND lesson_id=? AND status IN ('scheduled','completed')`, a.UserID.String(), k.CourseID, k.ChapterID, k.LessonID).Scan(&n)
	if err != nil {
		return Call{}, err
	}
	if n > 0 {
		return Call{}, fail("conflict")
	}
	busy, err := conflict(ctx, tx, cfg.TeacherID, a.UserID.String(), "", start, end)
	if err != nil {
		return Call{}, err
	}
	if busy {
		return Call{}, fail("conflict")
	}
	var studentName string
	err = tx.QueryRowContext(ctx, `SELECT trim(first_name || ' ' || last_name) FROM users WHERE id=?`, a.UserID.String()).Scan(&studentName)
	if err != nil {
		return Call{}, err
	}
	id := uuid.NewString()
	_, err = tx.ExecContext(ctx, `INSERT INTO calls(id,course_id,chapter_id,lesson_id,course_title,lesson_title,teacher_id,student_id,teacher_name,student_name,starts_at,ends_at,created_at) VALUES(?,?,?,?,?,?,?,?,?,?,?,?,?)`, id, k.CourseID, k.ChapterID, k.LessonID, course.Title, lesson.Title, cfg.TeacherID, a.UserID.String(), cfg.TeacherName, studentName, start, end, s.now().Unix())
	if err != nil {
		return Call{}, err
	}
	c, err := readCall(ctx, tx, id)
	if err != nil {
		return c, err
	}
	return c, tx.Commit()
}
func (s *Service) Change(ctx context.Context, a kernel.Actor, id string, in Change) (Call, error) {
	// Course access must be checked before opening a transaction (one DB connection).
	initial, err := readCall(ctx, s.db, id)
	if err != nil {
		return Call{}, err
	}
	manager := manages(a, initial.TeacherID)
	owner := a.HasRole(kernel.RoleStudent) && initial.StudentID == a.UserID.String()
	if !manager && !owner {
		return Call{}, fail("forbidden")
	}
	if owner && in.Action == "reschedule" {
		if _, _, err = s.lesson(ctx, a, initial.Key); err != nil {
			return Call{}, err
		}
	}
	tx, err := s.db.BeginTx(ctx, nil)
	if err != nil {
		return Call{}, err
	}
	defer tx.Rollback()
	c, err := readCall(ctx, tx, id)
	if err != nil {
		return c, err
	}
	if c.Status != "scheduled" || c.Version != in.Version {
		return c, fail("conflict")
	}
	now := s.now().Unix()
	switch in.Action {
	case "cancel":
		if owner && c.StartsAt <= now {
			return c, fail("conflict")
		}
		c.Status = "cancelled"
	case "reschedule":
		if in.StartsAt <= now || in.StartsAt > 253402300799-(c.EndsAt-c.StartsAt) || (owner && c.StartsAt <= now) {
			return c, fail("conflict")
		}
		end := in.StartsAt + c.EndsAt - c.StartsAt
		if owner {
			cfg, err := settings(ctx, tx, c.Key)
			if err != nil {
				return c, err
			}
			end = in.StartsAt + int64(cfg.DurationMin)*60
			fits, err := scheduleContains(ctx, tx, cfg.TeacherID, cfg.DurationMin, in.StartsAt, end, s.now())
			if err != nil {
				return c, err
			}
			if cfg.TeacherID != c.TeacherID || !fits {
				return c, fail("conflict")
			}
		}
		busy, err := conflict(ctx, tx, c.TeacherID, c.StudentID, c.ID, in.StartsAt, end)
		if err != nil {
			return c, err
		}
		if busy {
			return c, fail("conflict")
		}
		c.StartsAt = in.StartsAt
		c.EndsAt = end
	case "link":
		if !manager {
			return c, fail("forbidden")
		}
		c.MeetingURL = strings.TrimSpace(in.MeetingURL)
		if c.MeetingURL != "" {
			u, err := url.Parse(c.MeetingURL)
			if err != nil || len(c.MeetingURL) > 2048 || u.Host == "" || (u.Scheme != "http" && u.Scheme != "https") || u.User != nil {
				return c, fail("bad_request")
			}
		}
	case "complete":
		if !manager {
			return c, fail("forbidden")
		}
		if c.EndsAt > now {
			return c, fail("conflict")
		}
		c.Status = "completed"
		_, err = tx.ExecContext(ctx, `INSERT INTO lesson_progress(user_id,course_id,lesson_key,completed_at) VALUES(?,?,?,?) ON CONFLICT(user_id,course_id,lesson_key) DO NOTHING`, c.StudentID, c.CourseID, c.ChapterID+"/"+c.LessonID, now)
		if err != nil {
			return c, err
		}
	default:
		return c, fail("bad_request")
	}
	_, err = tx.ExecContext(ctx, `UPDATE calls SET starts_at=?,ends_at=?,status=?,meeting_url=?,version=version+1 WHERE id=?`, c.StartsAt, c.EndsAt, c.Status, c.MeetingURL, c.ID)
	if err != nil {
		return c, err
	}
	c.Version++
	return c, tx.Commit()
}

// CheckUserRemoval lets bulk deletion reject all busy users before deleting any.
// Database triggers also enforce the invariant for direct repository operations.
func (s *Service) CheckUserRemoval(ctx context.Context, userID string) error {
	var busy int
	err := s.db.QueryRowContext(ctx, `SELECT EXISTS(SELECT 1 FROM call_settings WHERE teacher_id=?) OR EXISTS(SELECT 1 FROM calls WHERE status='scheduled' AND (teacher_id=? OR student_id=?))`, userID, userID, userID).Scan(&busy)
	if err != nil {
		return err
	}
	if busy != 0 {
		return fail("calls_user_busy")
	}
	return nil
}

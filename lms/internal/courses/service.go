package courses

import (
	"context"
	"database/sql"
	"errors"
	"strings"

	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
)

// CourseAccess is a grant: which chapters of a course a student may open.
// ["*"] means every chapter.
type CourseAccess struct {
	UserID       kernel.UserID
	CourseID     string
	OpenChapters []string
}

// OpensAll reports a wildcard grant.
func (a CourseAccess) OpensAll() bool {
	for _, id := range a.OpenChapters {
		if id == "*" {
			return true
		}
	}
	return false
}

// OpensChapter reports whether the chapter is granted.
func (a CourseAccess) OpensChapter(chapterID string) bool {
	return a.OpensAll() || containsString(a.OpenChapters, chapterID)
}

// ChapterState tells whether the user may read a chapter's lessons.
type ChapterState string

const (
	// ChapterOpen means the user may read the chapter's lessons.
	ChapterOpen ChapterState = "open"
	// ChapterLocked hides the chapter behind an access request.
	ChapterLocked ChapterState = "locked"
)

// CourseSummary is a flat course row for list pages.
type CourseSummary struct {
	Course   *CourseConfig
	Students int
}

// LessonRef locates a lesson with its parent chapter.
type LessonRef struct {
	Chapter     *ChapterConfig
	LessonID    string
	LessonTitle string
	DurationMin *uint32
	Index       int
}

// LessonEntry is a (chapter_id, lesson_id, title) triple for navigation.
type LessonEntry struct {
	ChapterID string
	LessonID  string
	Title     string
}

// CourseRepository is the persistence boundary for grants and progress.
type CourseRepository interface {
	Access(ctx context.Context, userID kernel.UserID, courseID string) (*CourseAccess, error)
	AccessList(ctx context.Context, userID kernel.UserID) ([]CourseAccess, error)
	CourseStudents(ctx context.Context, courseID string) ([]kernel.UserID, error)
	Grant(ctx context.Context, userID kernel.UserID, courseID string, openChapters []string, grantedBy kernel.UserID) error
	Revoke(ctx context.Context, userID kernel.UserID, courseID string) error
	CompletedLessons(ctx context.Context, userID kernel.UserID, courseID string) ([]string, error)
	MarkLessonDone(ctx context.Context, userID kernel.UserID, courseID, lessonKey string) error
	MarkLessonUndone(ctx context.Context, userID kernel.UserID, courseID, lessonKey string) error
}

// CourseService is the facade over the file catalog, grants and progress.
type CourseService struct {
	catalog *Catalog
	repo    CourseRepository
}

func NewCourseService(catalog *Catalog, repo CourseRepository) *CourseService {
	return &CourseService{catalog: catalog, repo: repo}
}

// Catalog exposes the underlying catalog.
func (s *CourseService) Catalog() *Catalog { return s.catalog }

func (s *CourseService) seesAllCourses(actor kernel.Actor) bool {
	return actor.HasRole(kernel.RoleAdmin) || actor.HasRole(kernel.RoleTeacher)
}

func (s *CourseService) requireManage(actor kernel.Actor) error {
	// courses does not depend on auth, so the role check lives here.
	if actor.HasRole(kernel.RoleAdmin) {
		return nil
	}
	return &CoursesError{Code: CodeForbidden, msg: "admin permission required"}
}

// VisibleCourses lists courses for the list page: admins/teachers see
// everything (including archived); students see granted courses plus any
// course with a chapter open by default.
func (s *CourseService) VisibleCourses(ctx context.Context, actor kernel.Actor) ([]CourseSummary, error) {
	seeAll := s.seesAllCourses(actor)
	var grants []CourseAccess
	if !seeAll {
		var err error
		grants, err = s.repo.AccessList(ctx, actor.UserID)
		if err != nil {
			return nil, StorageError(err)
		}
	}

	summaries := []CourseSummary{}
	for _, course := range s.catalog.List() {
		visible := seeAll
		if !seeAll {
			granted := false
			for _, grant := range grants {
				if grant.CourseID == course.ID && len(grant.OpenChapters) > 0 {
					granted = true
					break
				}
			}
			for _, chapter := range course.Chapters {
				if chapter.OpenByDefault {
					granted = true
					break
				}
			}
			visible = granted
		}
		if !visible {
			continue
		}
		students := 0
		if seeAll {
			list, err := s.repo.CourseStudents(ctx, course.ID)
			if err != nil {
				return nil, StorageError(err)
			}
			students = len(list)
		}
		summaries = append(summaries, CourseSummary{Course: course, Students: students})
	}
	return summaries, nil
}

// ChapterAccess tells whether the user may open the chapter: admins/teachers
// always can, students need a grant, a wildcard or open_by_default.
func (s *CourseService) ChapterAccess(ctx context.Context, actor kernel.Actor, course *CourseConfig, chapter *ChapterConfig) (ChapterState, error) {
	if s.seesAllCourses(actor) || chapter.OpenByDefault {
		return ChapterOpen, nil
	}
	grant, err := s.repo.Access(ctx, actor.UserID, course.ID)
	if err != nil {
		return ChapterLocked, StorageError(err)
	}
	if grant != nil && grant.OpensChapter(chapter.ID) {
		return ChapterOpen, nil
	}
	return ChapterLocked, nil
}

// CompletedLessons returns lesson keys completed by the user in the course.
func (s *CourseService) CompletedLessons(ctx context.Context, actor kernel.Actor, courseID string) ([]string, error) {
	keys, err := s.repo.CompletedLessons(ctx, actor.UserID, courseID)
	if err != nil {
		return nil, StorageError(err)
	}
	return keys, nil
}

// LessonKey builds the "{chapter-id}/{lesson-id}" progress key.
func LessonKey(chapterID, lessonID string) string {
	return chapterID + "/" + lessonID
}

// CourseProgress is the percentage of completed lessons (0-100).
func (s *CourseService) CourseProgress(course *CourseConfig, completed []string) uint8 {
	total := course.TotalLessons()
	if total == 0 {
		return 0
	}
	validKeys := map[string]bool{}
	for _, pair := range course.LessonPairs() {
		validKeys[LessonKey(pair.Chapter.ID, pair.Lesson.ID)] = true
	}
	done := 0
	for _, key := range completed {
		if validKeys[key] {
			done++
		}
	}
	return percent(done, total)
}

// ChapterProgress is the percentage of completed lessons in one chapter.
func (s *CourseService) ChapterProgress(chapter *ChapterConfig, completed []string) uint8 {
	total := len(chapter.Lessons)
	if total == 0 {
		return 0
	}
	done := 0
	for _, lesson := range chapter.Lessons {
		if containsString(completed, LessonKey(chapter.ID, lesson.ID)) {
			done++
		}
	}
	return percent(done, total)
}

// FindLesson returns the flat lesson locator by ids.
func (s *CourseService) FindLesson(course *CourseConfig, chapterID, lessonID string) *LessonRef {
	pairs := course.LessonPairs()
	for index, pair := range pairs {
		if pair.Chapter.ID == chapterID && pair.Lesson.ID == lessonID {
			return &LessonRef{
				Chapter:     pair.Chapter,
				LessonID:    pair.Lesson.ID,
				LessonTitle: pair.Lesson.Title,
				DurationMin: pair.Lesson.DurationMin,
				Index:       index,
			}
		}
	}
	return nil
}

// LessonNeighbours returns the (prev, next) neighbours of a lesson.
func (s *CourseService) LessonNeighbours(course *CourseConfig, chapterID, lessonID string) (prev, next *LessonEntry) {
	pairs := course.LessonPairs()
	position := -1
	for index, pair := range pairs {
		if pair.Chapter.ID == chapterID && pair.Lesson.ID == lessonID {
			position = index
			break
		}
	}
	if position < 0 {
		return nil, nil
	}
	if position > 0 {
		pair := pairs[position-1]
		prev = &LessonEntry{ChapterID: pair.Chapter.ID, LessonID: pair.Lesson.ID, Title: pair.Lesson.Title}
	}
	if position+1 < len(pairs) {
		pair := pairs[position+1]
		next = &LessonEntry{ChapterID: pair.Chapter.ID, LessonID: pair.Lesson.ID, Title: pair.Lesson.Title}
	}
	return prev, next
}

// MarkLessonDone records a completed lesson.
func (s *CourseService) MarkLessonDone(ctx context.Context, actor kernel.Actor, courseID, chapterID, lessonID string) error {
	if err := s.checkLessonAccess(ctx, actor, courseID, chapterID, lessonID); err != nil {
		return err
	}
	if err := s.repo.MarkLessonDone(ctx, actor.UserID, courseID, LessonKey(chapterID, lessonID)); err != nil {
		return StorageError(err)
	}
	return nil
}

// MarkLessonUndone clears the completed mark of a lesson.
func (s *CourseService) MarkLessonUndone(ctx context.Context, actor kernel.Actor, courseID, chapterID, lessonID string) error {
	if err := s.checkLessonAccess(ctx, actor, courseID, chapterID, lessonID); err != nil {
		return err
	}
	if err := s.repo.MarkLessonUndone(ctx, actor.UserID, courseID, LessonKey(chapterID, lessonID)); err != nil {
		return StorageError(err)
	}
	return nil
}

// Grant adds or updates a course access grant. Admin-only.
func (s *CourseService) Grant(ctx context.Context, actor kernel.Actor, userID kernel.UserID, courseID string, openChapters []string) error {
	if err := s.requireManage(actor); err != nil {
		return err
	}
	if len(openChapters) == 0 {
		return StorageErrorf("grant must include at least one chapter or `*`")
	}
	course := s.catalog.Get(courseID)
	if course == nil {
		return NotFoundError(CodeCourseNotFound, courseID)
	}
	for _, id := range openChapters {
		if id != "*" && course.Chapter(id) == nil {
			return NotFoundError(CodeChapterNotFound, id)
		}
	}
	if err := s.repo.Grant(ctx, userID, courseID, openChapters, actor.UserID); err != nil {
		return StorageError(err)
	}
	return nil
}

// Revoke removes a grant entirely. Admin-only.
func (s *CourseService) Revoke(ctx context.Context, actor kernel.Actor, userID kernel.UserID, courseID string) error {
	if err := s.requireManage(actor); err != nil {
		return err
	}
	if err := s.repo.Revoke(ctx, userID, courseID); err != nil {
		return StorageError(err)
	}
	return nil
}

// CourseStudents lists users granted the course. Admin-only.
func (s *CourseService) CourseStudents(ctx context.Context, actor kernel.Actor, courseID string) ([]kernel.UserID, error) {
	if err := s.requireManage(actor); err != nil {
		return nil, err
	}
	users, err := s.repo.CourseStudents(ctx, courseID)
	if err != nil {
		return nil, StorageError(err)
	}
	return users, nil
}

// StudentChapters lists chapters currently open for one user in a course:
// ["*"] for a full grant, otherwise the explicit chapter id list. Admin-only.
func (s *CourseService) StudentChapters(ctx context.Context, actor kernel.Actor, userID kernel.UserID, courseID string) ([]string, error) {
	if err := s.requireManage(actor); err != nil {
		return nil, err
	}
	access, err := s.repo.Access(ctx, userID, courseID)
	if err != nil {
		return nil, StorageError(err)
	}
	if access == nil {
		return []string{}, nil
	}
	return access.OpenChapters, nil
}

func (s *CourseService) checkLessonAccess(ctx context.Context, actor kernel.Actor, courseID, chapterID, lessonID string) error {
	course := s.catalog.Get(courseID)
	if course == nil {
		return NotFoundError(CodeCourseNotFound, courseID)
	}
	chapter := course.Chapter(chapterID)
	if chapter == nil {
		return NotFoundError(CodeChapterNotFound, chapterID)
	}
	if course.Lesson(chapterID, lessonID) == nil {
		return NotFoundError(CodeLessonNotFound, lessonID)
	}
	state, err := s.ChapterAccess(ctx, actor, course, chapter)
	if err != nil {
		return err
	}
	if state != ChapterOpen {
		return &CoursesError{Code: CodeChapterLocked, msg: "chapter is locked"}
	}
	return nil
}

func percent(done, total int) uint8 {
	value := done * 100 / total
	if value > 100 {
		value = 100
	}
	return uint8(value)
}

func containsString(list []string, value string) bool {
	for _, item := range list {
		if item == value {
			return true
		}
	}
	return false
}

// SqliteCourseRepository is the SQLite CourseRepository.
type SqliteCourseRepository struct {
	pool *sql.DB
}

func NewSqliteCourseRepository(pool *sql.DB) *SqliteCourseRepository {
	return &SqliteCourseRepository{pool: pool}
}

func parseOpenChapters(raw string) []string {
	if strings.TrimSpace(raw) == "*" {
		return []string{"*"}
	}
	parts := strings.Split(raw, ",")
	out := make([]string, 0, len(parts))
	for _, part := range parts {
		if id := strings.TrimSpace(part); id != "" {
			out = append(out, id)
		}
	}
	return out
}

// Access loads one grant.
func (r *SqliteCourseRepository) Access(ctx context.Context, userID kernel.UserID, courseID string) (*CourseAccess, error) {
	var raw string
	err := r.pool.QueryRowContext(ctx, `
SELECT open_chapters FROM course_access WHERE user_id = ? AND course_id = ?`,
		userID.String(), courseID).Scan(&raw)
	if errors.Is(err, sql.ErrNoRows) {
		return nil, nil
	}
	if err != nil {
		return nil, err
	}
	return &CourseAccess{UserID: userID, CourseID: courseID, OpenChapters: parseOpenChapters(raw)}, nil
}

// AccessList loads all grants of a user.
func (r *SqliteCourseRepository) AccessList(ctx context.Context, userID kernel.UserID) ([]CourseAccess, error) {
	rows, err := r.pool.QueryContext(ctx, `
SELECT course_id, open_chapters FROM course_access WHERE user_id = ?`, userID.String())
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	list := []CourseAccess{}
	for rows.Next() {
		var access CourseAccess
		var raw string
		if err := rows.Scan(&access.CourseID, &raw); err != nil {
			return nil, err
		}
		access.UserID = userID
		access.OpenChapters = parseOpenChapters(raw)
		list = append(list, access)
	}
	return list, rows.Err()
}

// CourseStudents lists users granted the course, in grant order.
func (r *SqliteCourseRepository) CourseStudents(ctx context.Context, courseID string) ([]kernel.UserID, error) {
	rows, err := r.pool.QueryContext(ctx, `
SELECT user_id FROM course_access WHERE course_id = ? ORDER BY created_at`, courseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	users := []kernel.UserID{}
	for rows.Next() {
		var raw string
		if err := rows.Scan(&raw); err != nil {
			return nil, err
		}
		id, err := kernel.ParseUserID(raw)
		if err != nil {
			return nil, err
		}
		users = append(users, id)
	}
	return users, rows.Err()
}

// Grant inserts or updates a grant.
func (r *SqliteCourseRepository) Grant(ctx context.Context, userID kernel.UserID, courseID string, openChapters []string, grantedBy kernel.UserID) error {
	joined := strings.Join(openChapters, ",")
	if joined == "" {
		joined = "*"
	}
	_, err := r.pool.ExecContext(ctx, `
INSERT INTO course_access (user_id, course_id, open_chapters, granted_by, created_at)
VALUES (?, ?, ?, ?, strftime('%s','now'))
ON CONFLICT (user_id, course_id)
DO UPDATE SET open_chapters = excluded.open_chapters,
              granted_by = excluded.granted_by`,
		userID.String(), courseID, joined, grantedBy.String())
	return err
}

// Revoke deletes a grant.
func (r *SqliteCourseRepository) Revoke(ctx context.Context, userID kernel.UserID, courseID string) error {
	_, err := r.pool.ExecContext(ctx,
		`DELETE FROM course_access WHERE user_id = ? AND course_id = ?`,
		userID.String(), courseID)
	return err
}

// CompletedLessons lists "{chapter}/{lesson}" keys completed by the user.
func (r *SqliteCourseRepository) CompletedLessons(ctx context.Context, userID kernel.UserID, courseID string) ([]string, error) {
	rows, err := r.pool.QueryContext(ctx, `
SELECT lesson_key FROM lesson_progress
WHERE user_id = ? AND course_id = ?
ORDER BY completed_at`, userID.String(), courseID)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	keys := []string{}
	for rows.Next() {
		var key string
		if err := rows.Scan(&key); err != nil {
			return nil, err
		}
		keys = append(keys, key)
	}
	return keys, rows.Err()
}

// MarkLessonDone inserts the completed key if missing.
func (r *SqliteCourseRepository) MarkLessonDone(ctx context.Context, userID kernel.UserID, courseID, lessonKey string) error {
	_, err := r.pool.ExecContext(ctx, `
INSERT INTO lesson_progress (user_id, course_id, lesson_key, completed_at)
VALUES (?, ?, ?, strftime('%s','now'))
ON CONFLICT (user_id, course_id, lesson_key) DO NOTHING`,
		userID.String(), courseID, lessonKey)
	return err
}

// MarkLessonUndone deletes the completed key.
func (r *SqliteCourseRepository) MarkLessonUndone(ctx context.Context, userID kernel.UserID, courseID, lessonKey string) error {
	_, err := r.pool.ExecContext(ctx, `
DELETE FROM lesson_progress
WHERE user_id = ? AND course_id = ? AND lesson_key = ?`,
		userID.String(), courseID, lessonKey)
	return err
}

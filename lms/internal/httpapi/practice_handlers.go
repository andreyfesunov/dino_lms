package httpapi

import (
	"net/http"
	"sort"
	"time"

	"github.com/andreyfesunov/dino_lms/lms/internal/courses"
	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
	"github.com/andreyfesunov/dino_lms/lms/internal/practices"
)

func (s *Server) requirePracticeReviewer(w http.ResponseWriter, r *http.Request) (*kernel.Actor, bool) {
	actor, _, ok := s.requireOnboarded(w, r)
	if !ok {
		return nil, false
	}
	if !actor.HasRole(kernel.RoleAdmin) && !actor.HasRole(kernel.RoleTeacher) {
		writeJSON(w, http.StatusForbidden, map[string]string{"code": "forbidden"})
		return nil, false
	}
	return actor, true
}

func (s *Server) practiceLesson(courseID, chapterID, lessonID string) (*courses.CourseConfig, *courses.ChapterConfig, *courses.LessonConfig, error) {
	course := s.Catalog.Get(courseID)
	if course == nil {
		return nil, nil, nil, courses.NotFoundError(courses.CodeCourseNotFound, courseID)
	}
	chapter := course.Chapter(chapterID)
	if chapter == nil {
		return nil, nil, nil, courses.NotFoundError(courses.CodeChapterNotFound, chapterID)
	}
	lesson := course.Lesson(chapterID, lessonID)
	if lesson == nil {
		return nil, nil, nil, courses.NotFoundError(courses.CodeLessonNotFound, lessonID)
	}
	if lesson.Kind() != "practice" {
		return nil, nil, nil, practices.ErrNotFound
	}
	return course, chapter, lesson, nil
}

func (s *Server) requireStudentPractice(w http.ResponseWriter, r *http.Request) (*kernel.Actor, *courses.CourseConfig, *courses.ChapterConfig, *courses.LessonConfig, bool) {
	actor, _, ok := s.requireOnboarded(w, r)
	if !ok {
		return nil, nil, nil, nil, false
	}
	if !actor.HasRole(kernel.RoleStudent) {
		writeJSON(w, http.StatusForbidden, map[string]string{"code": "forbidden"})
		return nil, nil, nil, nil, false
	}
	course, chapter, lesson, err := s.practiceLesson(r.PathValue("course"), r.PathValue("chapter"), r.PathValue("lesson"))
	if err != nil {
		writeError(w, err)
		return nil, nil, nil, nil, false
	}
	if err := s.Courses.CheckCourseAccess(r.Context(), *actor, course.ID); err != nil {
		writeError(w, err)
		return nil, nil, nil, nil, false
	}
	state, err := s.Courses.ChapterAccess(r.Context(), *actor, course, chapter)
	if err != nil {
		writeError(w, err)
		return nil, nil, nil, nil, false
	}
	if state != courses.ChapterOpen {
		writeJSON(w, http.StatusForbidden, map[string]string{"code": courses.CodeChapterLocked})
		return nil, nil, nil, nil, false
	}
	return actor, course, chapter, lesson, true
}

func (s *Server) handlePracticeAttempts(w http.ResponseWriter, r *http.Request) {
	actor, _, _, _, ok := s.requireStudentPractice(w, r)
	if !ok {
		return
	}
	items, err := s.Practices.List(r.Context(), actor.UserID.String(), r.PathValue("course"))
	if err != nil {
		writeError(w, err)
		return
	}
	filtered := items[:0]
	for _, item := range items {
		if item.ChapterID == r.PathValue("chapter") && item.LessonID == r.PathValue("lesson") {
			filtered = append(filtered, item)
		}
	}
	canSubmit := len(filtered) == 0 || filtered[0].Status == practices.StatusRevisionRequested
	writeJSON(w, http.StatusOK, map[string]any{"attempts": filtered, "can_submit": canSubmit})
}

func (s *Server) handlePracticeSubmit(w http.ResponseWriter, r *http.Request) {
	actor, _, _, _, ok := s.requireStudentPractice(w, r)
	if !ok {
		return
	}
	var in practices.Submission
	if decodeJSON(r, &in) != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
		return
	}
	out, err := s.Practices.Submit(r.Context(), actor.UserID.String(), practices.Key{
		CourseID: r.PathValue("course"), ChapterID: r.PathValue("chapter"), LessonID: r.PathValue("lesson"),
	}, in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusCreated, out)
}

func (s *Server) handlePracticeReview(w http.ResponseWriter, r *http.Request) {
	actor, ok := s.requirePracticeReviewer(w, r)
	if !ok {
		return
	}
	var in practices.Review
	if decodeJSON(r, &in) != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
		return
	}
	item, err := s.Practices.Get(r.Context(), r.PathValue("id"))
	if err != nil {
		writeError(w, err)
		return
	}
	if _, _, lesson, err := s.practiceLesson(item.CourseID, item.ChapterID, item.LessonID); err != nil || lesson == nil {
		if err != nil {
			writeError(w, err)
		} else {
			writeJSON(w, http.StatusNotFound, map[string]string{"code": "not_found"})
		}
		return
	}
	out, err := s.Practices.Review(r.Context(), actor.UserID.String(), item.ID, in)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

func (s *Server) handleMyPractices(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requireOnboarded(w, r)
	if !ok {
		return
	}
	if !actor.HasRole(kernel.RoleStudent) {
		writeJSON(w, http.StatusForbidden, map[string]string{"code": "forbidden"})
		return
	}
	items, err := s.Practices.List(r.Context(), actor.UserID.String(), "")
	if err != nil {
		writeError(w, err)
		return
	}
	for i := range items {
		if course := s.Catalog.Get(items[i].CourseID); course != nil {
			items[i].CourseTitle = course.Title
			if chapter := course.Chapter(items[i].ChapterID); chapter != nil {
				items[i].ChapterTitle = chapter.Title
				if lesson := course.Lesson(items[i].ChapterID, items[i].LessonID); lesson != nil {
					items[i].LessonTitle = lesson.Title
				}
			}
		}
	}
	writeJSON(w, http.StatusOK, map[string]any{"attempts": items})
}

type practiceChapterProgress struct {
	ID       string `json:"id"`
	Title    string `json:"title"`
	Progress int    `json:"progress"`
	Done     int    `json:"done"`
	Total    int    `json:"total"`
}
type practiceStudentProgress struct {
	practices.Student
	Progress int                       `json:"progress"`
	Chapters []practiceChapterProgress `json:"chapters"`
}

func (s *Server) handlePracticeDashboard(w http.ResponseWriter, r *http.Request) {
	if _, ok := s.requirePracticeReviewer(w, r); !ok {
		return
	}
	courseID := r.URL.Query().Get("course_id")
	if courseID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
		return
	}
	course := s.Catalog.Get(courseID)
	if course == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"code": courses.CodeCourseNotFound})
		return
	}
	students, err := s.Practices.Students(r.Context(), courseID)
	if err != nil {
		writeError(w, err)
		return
	}
	items, err := s.Practices.List(r.Context(), "", courseID)
	if err != nil {
		writeError(w, err)
		return
	}
	pending := []practices.Attempt{}
	acceptedWeek := 0
	weekStart := time.Now().Add(-7 * 24 * time.Hour).Unix()
	for i := range items {
		item := &items[i]
		if chapter := course.Chapter(item.ChapterID); chapter != nil {
			item.CourseTitle = course.Title
			item.ChapterTitle = chapter.Title
			if lesson := course.Lesson(item.ChapterID, item.LessonID); lesson != nil {
				item.LessonTitle = lesson.Title
			}
		}
		if item.Status == practices.StatusSubmitted {
			pending = append(pending, *item)
		}
		if item.Status == practices.StatusAccepted && item.ReviewedAt != nil && *item.ReviewedAt >= weekStart {
			acceptedWeek++
		}
	}
	sort.Slice(pending, func(i, j int) bool { return pending[i].SubmittedAt < pending[j].SubmittedAt })
	progressRows := []practiceStudentProgress{}
	average := 0
	for _, student := range students {
		completed, err := s.Practices.Completed(r.Context(), student.ID, courseID)
		if err != nil {
			writeError(w, err)
			return
		}
		doneKeys := map[string]bool{}
		for _, key := range completed {
			doneKeys[key] = true
		}
		row := practiceStudentProgress{Student: student, Progress: int(s.Courses.CourseProgress(course, completed)), Chapters: []practiceChapterProgress{}}
		for _, chapter := range course.Chapters {
			done, total := 0, len(chapter.Lessons)
			for _, lesson := range chapter.Lessons {
				if doneKeys[courses.LessonKey(chapter.ID, lesson.ID)] {
					done++
				}
			}
			percent := int(s.Courses.ChapterProgress(&chapter, completed))
			row.Chapters = append(row.Chapters, practiceChapterProgress{ID: chapter.ID, Title: chapter.Title, Progress: percent, Done: done, Total: total})
		}
		average += row.Progress
		progressRows = append(progressRows, row)
	}
	if len(progressRows) > 0 {
		average /= len(progressRows)
	}
	recent := items
	if len(recent) > 8 {
		recent = recent[:8]
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"course":   map[string]string{"id": course.ID, "title": course.Title},
		"metrics":  map[string]int{"students": len(students), "average_progress": average, "pending": len(pending), "accepted_this_week": acceptedWeek},
		"students": progressRows, "pending": pending, "recent": recent,
	})
}

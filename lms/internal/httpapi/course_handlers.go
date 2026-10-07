package httpapi

import (
	"net/http"
	"os"
	"path"
	"path/filepath"
	"sort"
	"strings"

	"github.com/andreyfesunov/dino_lms/lms/internal/courses"
	"github.com/andreyfesunov/dino_lms/lms/internal/kernel"
)

type chapterJSON struct {
	ID            string       `json:"id"`
	Title         string       `json:"title"`
	OpenByDefault bool         `json:"open_by_default"`
	State         string       `json:"state"`
	Progress      int          `json:"progress"`
	Lessons       []lessonJSON `json:"lessons"`
}

type lessonJSON struct {
	Type        string   `json:"type"`
	ChapterID   string   `json:"chapter_id"`
	ID          string   `json:"id"`
	Title       string   `json:"title"`
	DurationMin *uint32  `json:"duration_min"`
	Done        bool     `json:"done"`
	PrevLesson  *navJSON `json:"prev"`
	NextLesson  *navJSON `json:"next"`
}

type navJSON struct {
	CourseID  string `json:"course_id"`
	ChapterID string `json:"chapter_id"`
	LessonID  string `json:"lesson_id"`
	Title     string `json:"title"`
}

type courseListJSON struct {
	ID             string  `json:"id"`
	Title          string  `json:"title"`
	Description    string  `json:"description"`
	Archived       bool    `json:"archived"`
	EstimatedHours *string `json:"estimated_hours"`
	TotalLessons   int     `json:"total_lessons"`
	Progress       int     `json:"progress"`
	Students       int     `json:"students"`
}

type courseDetailJSON struct {
	Course   courseListJSON `json:"course"`
	Chapters []chapterJSON  `json:"chapters"`
}

func mediaMime(file string) string {
	switch strings.ToLower(path.Ext(file)) {
	case ".mp4":
		return "video/mp4"
	case ".webm":
		return "video/webm"
	case ".ogg", ".ogv":
		return "video/ogg"
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".svg":
		return "image/svg+xml"
	default:
		return "application/octet-stream"
	}
}

// handleCoursesList answers GET /api/courses.
func (s *Server) handleCoursesList(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requireOnboarded(w, r)
	if !ok {
		return
	}
	summaries, err := s.Courses.VisibleCourses(r.Context(), *actor)
	if err != nil {
		writeError(w, err)
		return
	}
	out := make([]courseListJSON, 0, len(summaries))
	for _, summary := range summaries {
		progress := 0
		if !actor.HasRole(kernel.RoleAdmin) && !actor.HasRole(kernel.RoleTeacher) {
			completed, err := s.Courses.CompletedLessons(r.Context(), *actor, summary.Course.ID)
			if err != nil {
				writeError(w, err)
				return
			}
			progress = int(s.Courses.CourseProgress(summary.Course, completed))
		}
		out = append(out, courseListJSON{
			ID:             summary.Course.ID,
			Title:          summary.Course.Title,
			Description:    summary.Course.Description,
			Archived:       summary.Course.Archived,
			EstimatedHours: summary.Course.EstimatedHours,
			TotalLessons:   summary.Course.TotalLessons(),
			Progress:       progress,
			Students:       summary.Students,
		})
	}
	writeJSON(w, http.StatusOK, map[string]any{"courses": out})
}

// handleCourseDetail answers GET /api/courses/{course} with the course header,
// chapter list and per-lesson done flags.
func (s *Server) handleCourseDetail(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requireOnboarded(w, r)
	if !ok {
		return
	}
	courseID := r.PathValue("course")
	course := s.Catalog.Get(courseID)
	if course == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"code": courses.CodeCourseNotFound})
		return
	}

	completed, err := s.Courses.CompletedLessons(r.Context(), *actor, course.ID)
	if err != nil {
		writeError(w, err)
		return
	}

	detail := courseDetailJSON{
		Course: courseListJSON{
			ID:             course.ID,
			Title:          course.Title,
			Description:    course.Description,
			Archived:       course.Archived,
			EstimatedHours: course.EstimatedHours,
			TotalLessons:   course.TotalLessons(),
			Progress:       int(s.Courses.CourseProgress(course, completed)),
		},
		Chapters: []chapterJSON{},
	}
	for ci := range course.Chapters {
		chapter := &course.Chapters[ci]
		state, err := s.Courses.ChapterAccess(r.Context(), *actor, course, chapter)
		if err != nil {
			writeError(w, err)
			return
		}
		chapterOut := chapterJSON{
			ID:            chapter.ID,
			Title:         chapter.Title,
			OpenByDefault: chapter.OpenByDefault,
			State:         string(state),
			Progress:      int(s.Courses.ChapterProgress(chapter, completed)),
			Lessons:       []lessonJSON{},
		}
		for li := range chapter.Lessons {
			lesson := &chapter.Lessons[li]
			chapterOut.Lessons = append(chapterOut.Lessons, lessonJSON{
				Type:        lesson.Kind(),
				ChapterID:   chapter.ID,
				ID:          lesson.ID,
				Title:       lesson.Title,
				DurationMin: lesson.DurationMin,
				Done:        containsString(completed, courses.LessonKey(chapter.ID, lesson.ID)),
			})
		}
		detail.Chapters = append(detail.Chapters, chapterOut)
	}
	writeJSON(w, http.StatusOK, detail)
}

// handleLesson answers GET /api/courses/{course}/{chapter}/{lesson}:
// access check, markdown render, media, neighbours.
func (s *Server) handleLesson(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requireOnboarded(w, r)
	if !ok {
		return
	}
	courseID := r.PathValue("course")
	chapterID := r.PathValue("chapter")
	lessonID := r.PathValue("lesson")

	course := s.Catalog.Get(courseID)
	if course == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"code": courses.CodeCourseNotFound})
		return
	}
	chapter := course.Chapter(chapterID)
	if chapter == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"code": courses.CodeChapterNotFound})
		return
	}
	lesson := course.Lesson(chapterID, lessonID)
	if lesson == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"code": courses.CodeLessonNotFound})
		return
	}
	state, err := s.Courses.ChapterAccess(r.Context(), *actor, course, chapter)
	if err != nil {
		writeError(w, err)
		return
	}
	if state != courses.ChapterOpen {
		writeJSON(w, http.StatusForbidden, map[string]string{"code": "chapter_locked"})
		return
	}

	if lesson.Kind() == "call" {
		completed, err := s.Courses.CompletedLessons(r.Context(), *actor, courseID)
		if err != nil {
			writeError(w, err)
			return
		}
		prev, next := s.Courses.LessonNeighbours(course, chapterID, lessonID)
		ref := s.Courses.FindLesson(course, chapterID, lessonID)
		writeJSON(w, http.StatusOK, map[string]any{
			"type": "call", "course": map[string]string{"id": course.ID, "title": course.Title},
			"chapter": map[string]string{"id": chapter.ID, "title": chapter.Title}, "id": lessonID, "title": lesson.Title,
			"durationMin": lesson.DurationMin, "html": "", "videos": []mediaVideo{}, "youtube": []mediaYoutube{},
			"done": containsString(completed, courses.LessonKey(chapterID, lessonID)), "index": ref.Index, "total": course.TotalLessons(),
			"prev": toNav(courseID, prev), "next": toNav(courseID, next), "state": string(state),
		})
		return
	}
	raw, err := s.readLesson(courseID, chapterID, lessonID)
	if err != nil {
		writeError(w, err)
		return
	}
	parsed, err := courses.RenderLessonMarkdown(string(raw))
	if err != nil {
		writeError(w, err)
		return
	}
	completed, err := s.Courses.CompletedLessons(r.Context(), *actor, courseID)
	if err != nil {
		writeError(w, err)
		return
	}
	prev, next := s.Courses.LessonNeighbours(course, chapterID, lessonID)
	lessonRef := s.Courses.FindLesson(course, chapterID, lessonID)
	lessonIndex := 0
	if lessonRef != nil {
		lessonIndex = lessonRef.Index
	}

	videos := []mediaVideo{}
	for _, video := range parsed.Videos {
		videos = append(videos, mediaVideo{
			URL:  "/media/courses/" + courseID + "/" + chapterID + "/" + video.File,
			File: video.File,
		})
	}
	youtube := []mediaYoutube{}
	for _, ref := range parsed.Youtube {
		out := mediaYoutube{URL: ref.URL, Title: ref.Title, Thumbnail: ref.ThumbnailURL()}
		if ref.Channel != nil {
			out.Channel = *ref.Channel
		}
		youtube = append(youtube, out)
	}

	title := lesson.Title
	if title == "" {
		title = firstHeading(parsed.HTML)
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"course":      map[string]any{"id": course.ID, "title": course.Title},
		"type":        lesson.Kind(),
		"chapter":     map[string]any{"id": chapter.ID, "title": chapter.Title},
		"id":          lessonID,
		"title":       title,
		"durationMin": lesson.DurationMin,
		"html":        parsed.HTML,
		"videos":      videos,
		"youtube":     youtube,
		"done":        containsString(completed, courses.LessonKey(chapterID, lessonID)),
		"index":       lessonIndex,
		"total":       course.TotalLessons(),
		"prev":        toNav(courseID, prev),
		"next":        toNav(courseID, next),
		"state":       string(state),
	})
}

type mediaVideo struct {
	URL  string `json:"url"`
	File string `json:"file"`
}

type mediaYoutube struct {
	URL       string  `json:"url"`
	Title     string  `json:"title"`
	Channel   string  `json:"channel"`
	Thumbnail *string `json:"thumbnail"`
}

func (s *Server) readLesson(courseID, chapterID, lessonID string) ([]byte, error) {
	// The catalog validated the file at load time; read it fresh so edits
	// show up without a restart.
	raw, err := os.ReadFile(filepath.Join(s.Catalog.Root(), courseID, chapterID, lessonID+".md"))
	if err != nil {
		if os.IsNotExist(err) {
			return nil, courses.NotFoundError(courses.CodeLessonNotFound, lessonID)
		}
		return nil, courses.StorageError(err)
	}
	return raw, nil
}

func firstHeading(html string) string {
	if start := strings.Index(html, ">"); start >= 0 {
		if end := strings.Index(html[start:], "</"); end > 0 {
			// Strip any inner tags crudely; titles are plain text in practice.
			inner := html[start+1 : start+end]
			return strings.TrimSpace(stripTags(inner))
		}
	}
	return ""
}

func stripTags(s string) string {
	var out strings.Builder
	depth := false
	for _, r := range s {
		switch {
		case r == '<':
			depth = true
		case r == '>':
			depth = false
		case !depth:
			out.WriteRune(r)
		}
	}
	return out.String()
}

func toNav(courseID string, entry *navEntry) *navJSON {
	if entry == nil {
		return nil
	}
	return &navJSON{
		CourseID:  courseID,
		ChapterID: entry.ChapterID,
		LessonID:  entry.LessonID,
		Title:     entry.Title,
	}
}

type navEntry = courses.LessonEntry

// handleProgress answers POST /api/courses/{course}/{chapter}/{lesson}/progress
// and toggles the done flag for the current user.
func (s *Server) handleProgress(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requireOnboarded(w, r)
	if !ok {
		return
	}
	var body struct {
		Done bool `json:"done"`
	}
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
		return
	}
	courseID := r.PathValue("course")
	chapterID := r.PathValue("chapter")
	lessonID := r.PathValue("lesson")

	course := s.Catalog.Get(courseID)
	if course == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"code": courses.CodeCourseNotFound})
		return
	}
	var err error
	if body.Done {
		err = s.Courses.MarkLessonDone(r.Context(), *actor, courseID, chapterID, lessonID)
	} else {
		err = s.Courses.MarkLessonUndone(r.Context(), *actor, courseID, chapterID, lessonID)
	}
	if err != nil {
		writeError(w, err)
		return
	}
	completed, err := s.Courses.CompletedLessons(r.Context(), *actor, courseID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"done":     body.Done,
		"progress": int(s.Courses.CourseProgress(course, completed)),
	})
}

type studentChaptersRequest struct {
	ChapterID string `json:"chapter_id"`
	Open      bool   `json:"open"`
}

// handleStudentChapterAccess answers POST
// /api/courses/{course}/students/{user}/chapters: toggles one chapter and
// normalises the grant.
func (s *Server) handleStudentChapterAccess(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requirePermission(w, r, kernel.PermissionManageCourses)
	if !ok {
		return
	}
	courseID := r.PathValue("course")
	studentID, ok := parseUserID(w, r.PathValue("user"))
	if !ok {
		return
	}
	var body studentChaptersRequest
	if err := decodeJSON(r, &body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
		return
	}

	course := s.Catalog.Get(courseID)
	if course == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"code": courses.CodeCourseNotFound})
		return
	}

	current, err := s.Courses.StudentChapters(r.Context(), *actor, studentID, courseID)
	if err != nil {
		writeError(w, err)
		return
	}
	if course.Chapter(body.ChapterID) == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"code": courses.CodeChapterNotFound})
		return
	}

	all := containsString(current, "*")
	chapterIDs := make([]string, 0, len(course.Chapters))
	for _, chapter := range course.Chapters {
		chapterIDs = append(chapterIDs, chapter.ID)
	}

	var next []string
	if all {
		next = append([]string{}, chapterIDs...)
	} else {
		for _, id := range current {
			if id != "*" && containsString(chapterIDs, id) {
				next = append(next, id)
			}
		}
	}
	if body.Open {
		if !containsString(next, body.ChapterID) {
			next = append(next, body.ChapterID)
		}
	} else {
		filtered := next[:0]
		for _, id := range next {
			if id != body.ChapterID {
				filtered = append(filtered, id)
			}
		}
		next = filtered
	}
	sort.Slice(next, func(i, j int) bool {
		return posInList(chapterIDs, next[i]) < posInList(chapterIDs, next[j])
	})

	if len(next) == 0 {
		err = s.Courses.Revoke(r.Context(), *actor, studentID, courseID)
	} else if len(next) == len(chapterIDs) && allIn(next, chapterIDs) {
		err = s.Courses.Grant(r.Context(), *actor, studentID, courseID, []string{"*"})
	} else {
		err = s.Courses.Grant(r.Context(), *actor, studentID, courseID, next)
	}
	if err != nil {
		writeError(w, err)
		return
	}
	updated, err := s.Courses.StudentChapters(r.Context(), *actor, studentID, courseID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"open_chapters": updated})
}

func posInList(list []string, value string) int {
	for i, item := range list {
		if item == value {
			return i
		}
	}
	return len(list)
}

func allIn(next, chapterIDs []string) bool {
	for _, id := range chapterIDs {
		if !containsString(next, id) {
			return false
		}
	}
	return true
}

// handleStudentChaptersGet answers GET
// /api/courses/{course}/students/{user}/chapters for the access modal.
func (s *Server) handleStudentChaptersGet(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requirePermission(w, r, kernel.PermissionManageCourses)
	if !ok {
		return
	}
	courseID := r.PathValue("course")
	studentID, ok := parseUserID(w, r.PathValue("user"))
	if !ok {
		return
	}
	chapters, err := s.Courses.StudentChapters(r.Context(), *actor, studentID, courseID)
	if err != nil {
		writeError(w, err)
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"open_chapters": chapters})
}

// handleCourseStudents answers GET /api/courses/{course}/students.
func (s *Server) handleCourseStudents(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requirePermission(w, r, kernel.PermissionManageCourses)
	if !ok {
		return
	}
	students, err := s.Courses.CourseStudents(r.Context(), *actor, r.PathValue("course"))
	if err != nil {
		writeError(w, err)
		return
	}
	ids := make([]string, 0, len(students))
	for _, id := range students {
		ids = append(ids, id.String())
	}
	writeJSON(w, http.StatusOK, map[string]any{"students": ids})
}

// handleMedia answers GET /media/courses/{course}/{chapter}/{file}; files may
// not escape the course bundle.
func (s *Server) handleMedia(w http.ResponseWriter, r *http.Request) {
	actor, _, ok := s.requireOnboarded(w, r)
	if !ok {
		return
	}
	courseID := r.PathValue("course")
	chapterID := r.PathValue("chapter")
	file := r.PathValue("media")

	for _, part := range []string{courseID, chapterID, file} {
		if part == "" || part == "." || part == ".." || strings.ContainsAny(part, "\\/:") {
			writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
			return
		}
	}
	course := s.Catalog.Get(courseID)
	if course == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"code": courses.CodeCourseNotFound})
		return
	}
	chapter := course.Chapter(chapterID)
	if chapter == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"code": courses.CodeChapterNotFound})
		return
	}
	state, err := s.Courses.ChapterAccess(r.Context(), *actor, course, chapter)
	if err != nil {
		writeError(w, err)
		return
	}
	if state != courses.ChapterOpen {
		writeJSON(w, http.StatusForbidden, map[string]string{"code": courses.CodeChapterLocked})
		return
	}

	root, err := filepath.EvalSymlinks(s.Catalog.Root())
	if err != nil {
		writeError(w, err)
		return
	}
	root = filepath.Join(root, courseID, chapterID)
	full, err := filepath.EvalSymlinks(filepath.Join(root, file))
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"code": "not_found"})
		return
	}
	// Path traversal guard: the resolved file must stay inside the bundle.
	rel, err := filepath.Rel(root, full)
	if err != nil || !filepath.IsLocal(rel) {
		writeJSON(w, http.StatusBadRequest, map[string]string{"code": "bad_request"})
		return
	}
	media, err := os.Open(full)
	if err != nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"code": "not_found"})
		return
	}
	defer media.Close()
	info, err := media.Stat()
	if err != nil || !info.Mode().IsRegular() {
		writeJSON(w, http.StatusNotFound, map[string]string{"code": "not_found"})
		return
	}
	w.Header().Set("Content-Type", mediaMime(file))
	http.ServeContent(w, r, file, info.ModTime(), media)
}

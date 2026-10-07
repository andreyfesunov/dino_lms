// Package courses implements the declarative course catalog, access grants
// and lesson progress. It must not import auth, config or httpapi.
package courses

import (
	"fmt"
	"os"
	"path/filepath"
)

// CoursesError is a domain failure with a stable code for the API layer.
type CoursesError struct {
	Code       string // config, course_not_found, chapter_not_found, lesson_not_found, storage
	Path       string // config file path for Code == CodeConfig
	Runtime    bool   // true for runtime (storage) failures
	Underlying error
	msg        string
}

// Stable error codes shared with the HTTP layer.
const (
	CodeConfig          = "config"
	CodeCourseNotFound  = "course_not_found"
	CodeChapterNotFound = "chapter_not_found"
	CodeLessonNotFound  = "lesson_not_found"
	CodeStorage         = "storage"
	CodeForbidden       = "forbidden"
	CodeChapterLocked   = "chapter_locked"
)

// ConfigError builds a bundle validation error.
func ConfigError(path, msg string) *CoursesError {
	return &CoursesError{Code: CodeConfig, Path: path, msg: msg}
}

// NotFoundError builds a course/chapter/lesson not-found error.
func NotFoundError(code, name string) *CoursesError {
	return &CoursesError{Code: code, msg: fmt.Sprintf("%s not found: %s", code, name)}
}

// StorageError wraps a persistence failure.
func StorageError(err error) *CoursesError {
	return &CoursesError{Code: CodeStorage, Runtime: true, Underlying: err, msg: err.Error()}
}

// StorageErrorf builds a storage-domain failure with a message.
func StorageErrorf(format string, args ...any) *CoursesError {
	return &CoursesError{Code: CodeStorage, Runtime: true, msg: fmt.Sprintf(format, args...)}
}

func (e *CoursesError) Error() string {
	if e.Code == CodeConfig {
		return fmt.Sprintf("invalid course config at %s: %s", e.Path, e.msg)
	}
	return fmt.Sprintf("%s: %s", e.Code, e.msg)
}

// lessonFilePath is the on-disk layout of a lesson markdown file.
func lessonFilePath(root, courseID, chapterID, lessonID string) string {
	return filepath.Join(root, courseID, chapterID, lessonID+".md")
}

// readLessonFile loads a lesson markdown file from the bundle.
func readLessonFile(root, courseID, chapterID, lessonID string) ([]byte, error) {
	path := lessonFilePath(root, courseID, chapterID, lessonID)
	raw, err := os.ReadFile(path)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, NotFoundError(CodeLessonNotFound, lessonID)
		}
		return nil, StorageError(err)
	}
	return raw, nil
}

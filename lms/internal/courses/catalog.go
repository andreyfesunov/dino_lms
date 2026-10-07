package courses

import (
	"os"
	"path/filepath"
	"sort"
	"strings"
	"sync"
	"time"
)

// Catalog is the in-memory directory of course bundles loaded from disk.
// It scans `{root}/{course-id}/config.toml` and caches them, invalidating
// when any config file or bundle directory changes its modification time.
type Catalog struct {
	root    string
	mu      sync.RWMutex
	stamp   *time.Time
	courses []*CourseConfig
}

// OpenCatalog builds a catalog over the bundles root.
func OpenCatalog(root string) *Catalog {
	return &Catalog{root: root}
}

// Root returns the bundles root directory.
func (c *Catalog) Root() string { return c.root }

// List returns all courses in stable id order. Invalid bundles are skipped.
func (c *Catalog) List() []*CourseConfig {
	return c.refresh()
}

// Get finds one course by id.
func (c *Catalog) Get(courseID string) *CourseConfig {
	for _, course := range c.refresh() {
		if course.ID == courseID {
			return course
		}
	}
	return nil
}

// LessonFile is the filesystem path of a lesson markdown file.
func (c *Catalog) LessonFile(courseID, chapterID, lessonID string) string {
	return lessonFilePath(c.root, courseID, chapterID, lessonID)
}

// TotalLessons counts lessons of a course, if it exists.
func (c *Catalog) TotalLessons(courseID string) (int, bool) {
	course := c.Get(courseID)
	if course == nil {
		return 0, false
	}
	return course.TotalLessons(), true
}

func (c *Catalog) refresh() []*CourseConfig {
	stamp := scanStamp(c.root)

	c.mu.RLock()
	same := c.stamp != nil && stamp != nil && c.stamp.Equal(*stamp)
	cached := c.courses
	c.mu.RUnlock()
	if same {
		return cached
	}

	courses := loadCourses(c.root)
	c.mu.Lock()
	if c.stamp == nil || stamp == nil || !c.stamp.Equal(*stamp) {
		c.stamp = stamp
		c.courses = courses
	}
	unlocked := c.courses
	c.mu.Unlock()
	return unlocked
}

func loadCourses(root string) []*CourseConfig {
	entries, err := os.ReadDir(root)
	if err != nil {
		return nil
	}
	var courses []*CourseConfig
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		path := filepath.Join(root, entry.Name())
		if _, err := os.Stat(filepath.Join(path, "config.toml")); err != nil {
			continue
		}
		if config, err := LoadCourseConfig(path); err == nil {
			courses = append(courses, config)
		}
	}
	sort.Slice(courses, func(i, j int) bool { return courses[i].ID < courses[j].ID })
	return courses
}

// scanStamp fingerprints the catalog: the max mtime over the root directory,
// its bundle subdirectories and their config.toml files.
func scanStamp(root string) *time.Time {
	var newest *time.Time
	consider := func(t time.Time, ok bool) {
		if !ok {
			return
		}
		if newest == nil || t.After(*newest) {
			newest = &t
		}
	}

	if info, err := os.Stat(root); err == nil {
		consider(info.ModTime(), true)
	}
	entries, err := os.ReadDir(root)
	if err != nil {
		return newest
	}
	for _, entry := range entries {
		if !entry.IsDir() {
			continue
		}
		if info, err := entry.Info(); err == nil {
			consider(info.ModTime(), true)
		}
		config := filepath.Join(root, entry.Name(), "config.toml")
		if info, err := os.Stat(config); err == nil && !info.IsDir() {
			consider(info.ModTime(), true)
		}
	}
	return newest
}

// trimForStamp normalizes path separators (kept for Windows parity tests).
func trimForStamp(path string) string { return strings.ReplaceAll(path, "\\", "/") }

package courses

import (
	"fmt"
	"os"
	"path/filepath"
	"strings"

	"github.com/pelletier/go-toml/v2"
)

// IsValidSlug checks course slugs: non-empty, at most 64 ASCII
// lowercase letters/digits/hyphens, no leading/trailing/double hyphens.
func IsValidSlug(value string) bool {
	if value == "" || len(value) > 64 {
		return false
	}
	if strings.HasPrefix(value, "-") || strings.HasSuffix(value, "-") || strings.Contains(value, "--") {
		return false
	}
	for _, r := range value {
		if (r < 'a' || r > 'z') && (r < '0' || r > '9') && r != '-' {
			return false
		}
	}
	return true
}

// CourseConfig is the parsed `{course-id}/config.toml`.
type CourseConfig struct {
	ID             string          `toml:"id"`
	Title          string          `toml:"title"`
	Description    string          `toml:"description"`
	Archived       bool            `toml:"archived"`
	EstimatedHours *string         `toml:"estimated_hours"`
	Chapters       []ChapterConfig `toml:"chapters"`
}

// ChapterConfig declares one chapter with its lessons.
type ChapterConfig struct {
	ID            string         `toml:"id"`
	Title         string         `toml:"title"`
	OpenByDefault bool           `toml:"open_by_default"`
	Lessons       []LessonConfig `toml:"lessons"`
}

// LessonConfig declares one markdown lesson.
type LessonConfig struct {
	ID          string  `toml:"id"`
	Title       string  `toml:"title"`
	DurationMin *uint32 `toml:"duration_min"`
}

// LoadCourseConfig parses and validates `{bundleDir}/config.toml`.
func LoadCourseConfig(bundleDir string) (*CourseConfig, error) {
	path := filepath.Join(bundleDir, "config.toml")
	raw, err := os.ReadFile(path)
	if err != nil {
		return nil, ConfigError(path, err.Error())
	}
	var config CourseConfig
	if err := toml.Unmarshal(raw, &config); err != nil {
		return nil, ConfigError(path, err.Error())
	}
	if err := config.validate(bundleDir); err != nil {
		return nil, err
	}
	return &config, nil
}

func (c *CourseConfig) validate(bundleDir string) error {
	path := filepath.Join(bundleDir, "config.toml")
	dirName := filepath.Base(bundleDir)
	if c.ID != dirName {
		return ConfigError(path, fmt.Sprintf("course id `%s` must match the bundle directory name `%s`", c.ID, dirName))
	}
	if !IsValidSlug(c.ID) {
		return ConfigError(path, fmt.Sprintf("course id `%s` is not a valid slug", c.ID))
	}
	if strings.TrimSpace(c.Title) == "" {
		return ConfigError(path, "course title must not be empty")
	}
	if len(c.Chapters) == 0 {
		return ConfigError(path, "course must declare at least one chapter")
	}

	chapterIDs := map[string]bool{}
	for _, chapter := range c.Chapters {
		if !IsValidSlug(chapter.ID) {
			return ConfigError(path, fmt.Sprintf("chapter id `%s` is not a valid slug", chapter.ID))
		}
		if chapterIDs[chapter.ID] {
			return ConfigError(path, fmt.Sprintf("duplicate chapter id `%s`", chapter.ID))
		}
		chapterIDs[chapter.ID] = true
		if strings.TrimSpace(chapter.Title) == "" {
			return ConfigError(path, fmt.Sprintf("chapter `%s` title must not be empty", chapter.ID))
		}
		if len(chapter.Lessons) == 0 {
			return ConfigError(path, fmt.Sprintf("chapter `%s` must declare at least one lesson", chapter.ID))
		}
		lessonIDs := map[string]bool{}
		for _, lesson := range chapter.Lessons {
			if !IsValidSlug(lesson.ID) {
				return ConfigError(path, fmt.Sprintf("lesson id `%s.%s` is not a valid slug", chapter.ID, lesson.ID))
			}
			if lessonIDs[lesson.ID] {
				return ConfigError(path, fmt.Sprintf("duplicate lesson id `%s.%s`", chapter.ID, lesson.ID))
			}
			lessonIDs[lesson.ID] = true
			file := filepath.Join(bundleDir, chapter.ID, lesson.ID+".md")
			info, err := os.Stat(file)
			if err != nil || info.IsDir() {
				return ConfigError(path, fmt.Sprintf("lesson file `%s` is missing (expected %s)", lesson.ID, file))
			}
		}
	}
	return nil
}

// Chapter finds a chapter by id.
func (c *CourseConfig) Chapter(chapterID string) *ChapterConfig {
	for i := range c.Chapters {
		if c.Chapters[i].ID == chapterID {
			return &c.Chapters[i]
		}
	}
	return nil
}

// Lesson finds a lesson by chapter and lesson ids.
func (c *CourseConfig) Lesson(chapterID, lessonID string) *LessonConfig {
	chapter := c.Chapter(chapterID)
	if chapter == nil {
		return nil
	}
	for i := range chapter.Lessons {
		if chapter.Lessons[i].ID == lessonID {
			return &chapter.Lessons[i]
		}
	}
	return nil
}

// LessonPair is one flat (chapter, lesson) entry.
type LessonPair struct {
	Chapter *ChapterConfig
	Lesson  *LessonConfig
}

// LessonPairs returns flat chapter/lesson pairs in declaration order.
func (c *CourseConfig) LessonPairs() []LessonPair {
	pairs := make([]LessonPair, 0, c.TotalLessons())
	for ci := range c.Chapters {
		chapter := &c.Chapters[ci]
		for li := range chapter.Lessons {
			pairs = append(pairs, LessonPair{Chapter: chapter, Lesson: &chapter.Lessons[li]})
		}
	}
	return pairs
}

// TotalLessons counts all lessons of the course.
func (c *CourseConfig) TotalLessons() int {
	total := 0
	for _, chapter := range c.Chapters {
		total += len(chapter.Lessons)
	}
	return total
}

// LessonFile is the filesystem path of a lesson markdown file.
func (c *CourseConfig) LessonFile(root, chapterID, lessonID string) string {
	return lessonFilePath(root, c.ID, chapterID, lessonID)
}

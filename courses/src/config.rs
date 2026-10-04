//! On-disk course bundle declaration (`{course-id}/config.toml`).

use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

/// A slug usable both as a directory name and as a URL path segment.
pub fn is_valid_slug(value: &str) -> bool {
    !value.is_empty()
        && value.len() <= 64
        && value
            .chars()
            .all(|c| c.is_ascii_lowercase() || c.is_ascii_digit() || c == '-')
        && !value.starts_with('-')
        && !value.ends_with('-')
        && !value.contains("--")
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CourseConfig {
    /// Must match the bundle directory name.
    pub id: String,
    pub title: String,
    #[serde(default)]
    pub description: String,
    #[serde(default)]
    pub archived: bool,
    /// Estimated study time, shown on the course header.
    #[serde(default)]
    pub estimated_hours: Option<String>,
    pub chapters: Vec<ChapterConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ChapterConfig {
    pub id: String,
    pub title: String,
    /// Chapters are visible to students without an explicit grant.
    #[serde(default)]
    pub open_by_default: bool,
    pub lessons: Vec<LessonConfig>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct LessonConfig {
    pub id: String,
    /// Optional: derived from the markdown H1 when absent.
    #[serde(default)]
    pub title: String,
    /// Estimated reading time in minutes, shown in lesson meta.
    #[serde(default)]
    pub duration_min: Option<u32>,
}

impl CourseConfig {
    /// Parses and validates `config.toml`. `bundle_dir` is the course bundle
    /// directory; lesson files are checked against it.
    pub fn load(bundle_dir: &Path) -> Result<Self, CoursesError> {
        let path = bundle_dir.join("config.toml");
        let raw = std::fs::read_to_string(&path)
            .map_err(|error| CoursesError::Config(path.clone(), error.to_string()))?;
        let config: CourseConfig = toml::from_str(&raw)
            .map_err(|error| CoursesError::Config(path.clone(), error.to_string()))?;
        config.validate(bundle_dir)?;
        Ok(config)
    }

    fn validate(&self, bundle_dir: &Path) -> Result<(), CoursesError> {
        let dir_name = bundle_dir
            .file_name()
            .and_then(|name| name.to_str())
            .unwrap_or_default();
        if self.id != dir_name {
            return Err(CoursesError::Config(
                bundle_dir.join("config.toml"),
                format!(
                    "course id `{}` must match the bundle directory name `{dir_name}`",
                    self.id
                ),
            ));
        }
        if !is_valid_slug(&self.id) {
            return Err(CoursesError::Config(
                bundle_dir.join("config.toml"),
                format!("course id `{}` is not a valid slug", self.id),
            ));
        }
        if self.title.trim().is_empty() {
            return Err(CoursesError::Config(
                bundle_dir.join("config.toml"),
                "course title must not be empty".into(),
            ));
        }
        if self.chapters.is_empty() {
            return Err(CoursesError::Config(
                bundle_dir.join("config.toml"),
                "course must declare at least one chapter".into(),
            ));
        }

        let mut chapter_ids = std::collections::HashSet::new();
        for chapter in &self.chapters {
            if !is_valid_slug(&chapter.id) {
                return Err(CoursesError::Config(
                    bundle_dir.join("config.toml"),
                    format!("chapter id `{}` is not a valid slug", chapter.id),
                ));
            }
            if !chapter_ids.insert(chapter.id.as_str()) {
                return Err(CoursesError::Config(
                    bundle_dir.join("config.toml"),
                    format!("duplicate chapter id `{}`", chapter.id),
                ));
            }
            if chapter.title.trim().is_empty() {
                return Err(CoursesError::Config(
                    bundle_dir.join("config.toml"),
                    format!("chapter `{}` title must not be empty", chapter.id),
                ));
            }
            if chapter.lessons.is_empty() {
                return Err(CoursesError::Config(
                    bundle_dir.join("config.toml"),
                    format!("chapter `{}` must declare at least one lesson", chapter.id),
                ));
            }
            let mut lesson_ids = std::collections::HashSet::new();
            for lesson in &chapter.lessons {
                if !is_valid_slug(&lesson.id) {
                    return Err(CoursesError::Config(
                        bundle_dir.join("config.toml"),
                        format!(
                            "lesson id `{}.{}` is not a valid slug",
                            chapter.id, lesson.id
                        ),
                    ));
                }
                if !lesson_ids.insert(lesson.id.as_str()) {
                    return Err(CoursesError::Config(
                        bundle_dir.join("config.toml"),
                        format!("duplicate lesson id `{}.{}`", chapter.id, lesson.id),
                    ));
                }
                let file = bundle_dir
                    .join(&chapter.id)
                    .join(format!("{}.md", lesson.id));
                if !file.is_file() {
                    return Err(CoursesError::Config(
                        bundle_dir.join("config.toml"),
                        format!(
                            "lesson file `{}` is missing (expected {})",
                            lesson.id,
                            file.display()
                        ),
                    ));
                }
            }
        }
        Ok(())
    }

    pub fn chapter(&self, chapter_id: &str) -> Option<&ChapterConfig> {
        self.chapters.iter().find(|c| c.id == chapter_id)
    }

    pub fn lesson(&self, chapter_id: &str, lesson_id: &str) -> Option<&LessonConfig> {
        self.chapter(chapter_id)
            .and_then(|c| c.lessons.iter().find(|l| l.id == lesson_id))
    }

    /// Flat `[chapter, lesson]` pairs in declaration order.
    pub fn lesson_pairs(&self) -> Vec<(&ChapterConfig, &LessonConfig)> {
        self.chapters
            .iter()
            .flat_map(|c| c.lessons.iter().map(move |l| (c, l)))
            .collect()
    }

    pub fn total_lessons(&self) -> usize {
        self.chapters.iter().map(|c| c.lessons.len()).sum()
    }

    /// Filesystem path of a lesson markdown file.
    pub fn lesson_file(&self, root: &Path, chapter_id: &str, lesson_id: &str) -> PathBuf {
        root.join(&self.id)
            .join(chapter_id)
            .join(format!("{lesson_id}.md"))
    }
}

pub(crate) use courses_error::CoursesError;

mod courses_error {
    pub use crate::error::CoursesError;
}

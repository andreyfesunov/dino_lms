use std::path::PathBuf;

use thiserror::Error;

#[derive(Debug, Error)]
pub enum CoursesError {
    #[error("invalid course config at {0}: {1}")]
    Config(PathBuf, String),
    #[error("course not found: {0}")]
    CourseNotFound(String),
    #[error("chapter not found: {0}")]
    ChapterNotFound(String),
    #[error("lesson not found: {0}")]
    LessonNotFound(String),
    #[error("storage error: {0}")]
    Storage(String),
}

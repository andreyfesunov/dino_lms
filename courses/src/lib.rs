//! Declarative course content: `config.toml` bundles on disk, access grants
//! and lesson progress in SQLite.

mod catalog;
mod config;
mod error;
mod markdown;
mod ports;
mod service;
mod sqlite;

pub use catalog::Catalog;
pub use config::{ChapterConfig, CourseConfig, LessonConfig, is_valid_slug};
pub use error::CoursesError;
pub use markdown::{
    VideoRef, YOUTUBE_THUMB_URL, YoutubeRef, render_lesson_markdown, render_markdown,
};
pub use ports::CourseRepository;
pub use service::{ChapterState, CourseAccess, CourseService, CourseSummary, LessonRef};
pub use sqlite::SqlxCourseRepository;

use std::sync::Arc;

use kernel::{Actor, Role, UserId};

use crate::{
    config::{ChapterConfig, CourseConfig},
    error::CoursesError,
    ports::CourseRepository,
};

/// Access grant: which chapters of a course a student may open. `["*"]` means
/// every chapter.
#[derive(Debug, Clone)]
pub struct CourseAccess {
    pub user_id: UserId,
    pub course_id: String,
    pub open_chapters: Vec<String>,
}

impl CourseAccess {
    pub fn opens_all(&self) -> bool {
        self.open_chapters.iter().any(|id| id == "*")
    }

    pub fn opens_chapter(&self, chapter_id: &str) -> bool {
        self.opens_all() || self.open_chapters.iter().any(|id| id == chapter_id)
    }
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub enum ChapterState {
    /// The user may read the chapter's lessons.
    Open,
    /// The chapter is hidden behind an access request.
    Locked,
}

/// Flat course row for list pages.
#[derive(Debug, Clone)]
pub struct CourseSummary {
    pub course: CourseConfig,
    /// Students the user may see for this course: admins/teachers see the
    /// real count, students see nothing.
    pub students: usize,
}

/// `(chapter_id, lesson_id, title)` triple for prev/next navigation.
pub type LessonEntry = (String, String, String);
/// `(prev, next)` neighbours of a lesson.
pub type LessonNeighbours = (Option<LessonEntry>, Option<LessonEntry>);

/// A lesson pointer with its parent chapter.
#[derive(Debug, Clone)]
pub struct LessonRef {
    pub chapter: ChapterConfig,
    pub lesson_id: String,
    pub lesson_title: String,
    pub duration_min: Option<u32>,
    /// Zero-based flat index across the whole course.
    pub index: usize,
}

/// Facade over the file catalog, grants and progress. Cheap to clone.
#[derive(Clone)]
pub struct CourseService {
    catalog: Arc<crate::catalog::Catalog>,
    repo: Arc<dyn CourseRepository>,
}

impl CourseService {
    pub fn new(catalog: crate::catalog::Catalog, repo: Arc<dyn CourseRepository>) -> Self {
        Self {
            catalog: Arc::new(catalog),
            repo,
        }
    }

    pub fn catalog(&self) -> &crate::catalog::Catalog {
        &self.catalog
    }

    /// Courses visible to the actor on the list page.
    ///
    /// Admins and teachers see everything (including archived); students see
    /// granted courses plus any course with a chapter open by default.
    pub async fn visible_courses(&self, actor: &Actor) -> Result<Vec<CourseSummary>, CoursesError> {
        let see_all = self.sees_all_courses(actor);
        let grants: Vec<CourseAccess> = if see_all {
            Vec::new()
        } else {
            self.repo
                .access_list(actor.user_id)
                .await
                .map_err(CoursesError::Storage)?
        };

        let mut summaries = Vec::new();
        for course in self.catalog.list() {
            let visible = if see_all {
                true
            } else {
                let granted = grants
                    .iter()
                    .any(|grant| grant.course_id == course.id && !grant.open_chapters.is_empty());
                granted
                    || course
                        .chapters
                        .iter()
                        .any(|chapter| chapter.open_by_default)
            };
            if !visible {
                continue;
            }
            let students = if see_all {
                self.repo
                    .course_students(&course.id)
                    .await
                    .map_err(CoursesError::Storage)?
                    .len()
            } else {
                0
            };
            summaries.push(CourseSummary { course, students });
        }
        Ok(summaries)
    }

    /// True when the user may open the chapter: admins/teachers always can,
    /// students need a grant, a wildcard, or `open_by_default`.
    pub async fn chapter_access(
        &self,
        actor: &Actor,
        course: &CourseConfig,
        chapter: &ChapterConfig,
    ) -> Result<ChapterState, CoursesError> {
        if self.sees_all_courses(actor) || chapter.open_by_default {
            return Ok(ChapterState::Open);
        }
        let grant = self
            .repo
            .access(actor.user_id, &course.id)
            .await
            .map_err(CoursesError::Storage)?;
        Ok(match grant {
            Some(access) if access.opens_chapter(&chapter.id) => ChapterState::Open,
            _ => ChapterState::Locked,
        })
    }

    /// Lesson keys completed by the user in the course.
    pub async fn completed_lessons(
        &self,
        actor: &Actor,
        course_id: &str,
    ) -> Result<Vec<String>, CoursesError> {
        self.repo
            .completed_lessons(actor.user_id, course_id)
            .await
            .map_err(CoursesError::Storage)
    }

    /// Percentage of completed lessons in the whole course (0–100).
    pub fn course_progress(&self, course: &CourseConfig, completed: &[String]) -> u8 {
        let total = course.total_lessons();
        if total == 0 {
            return 0;
        }
        let valid_keys: std::collections::HashSet<String> = course
            .lesson_pairs()
            .iter()
            .map(|(chapter, lesson)| Self::lesson_key(chapter, &lesson.id))
            .collect();
        let done = completed
            .iter()
            .filter(|key| valid_keys.contains(key.as_str()))
            .count();
        ((done * 100) / total).min(100) as u8
    }

    /// Percentage of completed lessons in one chapter (0–100).
    pub fn chapter_progress(&self, chapter: &ChapterConfig, completed: &[String]) -> u8 {
        let total = chapter.lessons.len();
        if total == 0 {
            return 0;
        }
        let done = chapter
            .lessons
            .iter()
            .filter(|lesson| completed.contains(&Self::lesson_key(chapter, &lesson.id)))
            .count();
        ((done * 100) / total).min(100) as u8
    }

    pub fn lesson_key(chapter: &ChapterConfig, lesson_id: &str) -> String {
        format!("{}/{}", chapter.id, lesson_id)
    }

    /// Flat lesson locator by ids.
    pub fn find_lesson(
        &self,
        course: &CourseConfig,
        chapter_id: &str,
        lesson_id: &str,
    ) -> Option<LessonRef> {
        let pairs = course.lesson_pairs();
        pairs
            .iter()
            .position(|(chapter, lesson)| chapter.id == chapter_id && lesson.id == lesson_id)
            .map(|index| {
                let (chapter, lesson) = pairs[index];
                LessonRef {
                    chapter: chapter.clone(),
                    lesson_id: lesson.id.clone(),
                    lesson_title: lesson.title.clone(),
                    duration_min: lesson.duration_min,
                    index,
                }
            })
    }

    /// Neighbouring lessons for prev/next navigation: `(prev, next)` as
    /// `(chapter_id, lesson_id, title)`.
    pub fn lesson_neighbours(
        &self,
        course: &CourseConfig,
        chapter_id: &str,
        lesson_id: &str,
    ) -> LessonNeighbours {
        let pairs = course.lesson_pairs();
        let position = pairs
            .iter()
            .position(|(chapter, lesson)| chapter.id == chapter_id && lesson.id == lesson_id);
        let Some(position) = position else {
            return (None, None);
        };
        let to_tuple = |&(chapter, lesson): &(&ChapterConfig, &crate::config::LessonConfig)| {
            (chapter.id.clone(), lesson.id.clone(), lesson.title.clone())
        };
        let prev = if position > 0 {
            pairs.get(position - 1).map(to_tuple)
        } else {
            None
        };
        let next = pairs.get(position + 1).map(to_tuple);
        (prev, next)
    }
    /// Marks a lesson completed. Returns whether it is now done.
    pub async fn mark_lesson_done(
        &self,
        actor: &Actor,
        course_id: &str,
        chapter_id: &str,
        lesson_id: &str,
    ) -> Result<(), CoursesError> {
        self.repo
            .mark_lesson_done(
                actor.user_id,
                course_id,
                &Self::lesson_key_raw(chapter_id, lesson_id),
            )
            .await
            .map_err(CoursesError::Storage)
    }

    /// Clears the completed mark of a lesson.
    pub async fn mark_lesson_undone(
        &self,
        actor: &Actor,
        course_id: &str,
        chapter_id: &str,
        lesson_id: &str,
    ) -> Result<(), CoursesError> {
        self.repo
            .mark_lesson_undone(
                actor.user_id,
                course_id,
                &Self::lesson_key_raw(chapter_id, lesson_id),
            )
            .await
            .map_err(CoursesError::Storage)
    }

    /// Grants or updates course access. Admin-only.
    pub async fn grant(
        &self,
        actor: &Actor,
        user_id: UserId,
        course_id: &str,
        open_chapters: &[String],
    ) -> Result<(), CoursesError> {
        self.require_manage(actor)?;
        if open_chapters.is_empty() {
            return Err(CoursesError::Storage(
                "grant must include at least one chapter or `*`".into(),
            ));
        }
        self.repo
            .grant(user_id, course_id, open_chapters, actor.user_id)
            .await
            .map_err(CoursesError::Storage)
    }

    /// Removes a grant entirely. Admin-only.
    pub async fn revoke(
        &self,
        actor: &Actor,
        user_id: UserId,
        course_id: &str,
    ) -> Result<(), CoursesError> {
        self.require_manage(actor)?;
        self.repo
            .revoke(user_id, course_id)
            .await
            .map_err(CoursesError::Storage)
    }

    /// Users granted the course. Admin-only.
    pub async fn course_students(
        &self,
        actor: &Actor,
        course_id: &str,
    ) -> Result<Vec<UserId>, CoursesError> {
        self.require_manage(actor)?;
        self.repo
            .course_students(course_id)
            .await
            .map_err(CoursesError::Storage)
    }

    /// Chapters currently open for one user in a course: `["*"]` for a full
    /// grant, otherwise the explicit chapter id list. Admin-only.
    pub async fn student_chapters(
        &self,
        actor: &Actor,
        user_id: UserId,
        course_id: &str,
    ) -> Result<Vec<String>, CoursesError> {
        self.require_manage(actor)?;
        Ok(self
            .repo
            .access(user_id, course_id)
            .await
            .map_err(CoursesError::Storage)?
            .map(|access| access.open_chapters)
            .unwrap_or_default())
    }

    fn require_manage(&self, actor: &Actor) -> Result<(), CoursesError> {
        // Mirrors `Ability::allows(Admin, ManageCourses)` from the auth crate;
        // kernel does not depend on auth, so the role check lives here.
        if actor.has_role(Role::Admin) {
            return Ok(());
        }
        Err(CoursesError::Storage("admin permission required".into()))
    }

    fn sees_all_courses(&self, actor: &Actor) -> bool {
        actor.has_role(Role::Admin) || actor.has_role(Role::Teacher)
    }

    fn lesson_key_raw(chapter_id: &str, lesson_id: &str) -> String {
        format!("{chapter_id}/{lesson_id}")
    }
}

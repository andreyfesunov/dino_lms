use async_trait::async_trait;
use kernel::UserId;

use crate::service::CourseAccess;

/// Persistence boundary for course grants and lesson progress.
#[async_trait]
pub trait CourseRepository: Send + Sync {
    async fn access(
        &self,
        user_id: UserId,
        course_id: &str,
    ) -> Result<Option<CourseAccess>, String>;

    async fn access_list(&self, user_id: UserId) -> Result<Vec<CourseAccess>, String>;

    /// All users granted the course, in grant order.
    async fn course_students(&self, course_id: &str) -> Result<Vec<UserId>, String>;

    /// Inserts or updates a grant. An empty `open_chapters` list means all
    /// chapters (`*`).
    async fn grant(
        &self,
        user_id: UserId,
        course_id: &str,
        open_chapters: &[String],
        granted_by: UserId,
    ) -> Result<(), String>;

    async fn revoke(&self, user_id: UserId, course_id: &str) -> Result<(), String>;

    /// `"{chapter-id}/{lesson-id}"` keys completed by the user in the course.
    async fn completed_lessons(
        &self,
        user_id: UserId,
        course_id: &str,
    ) -> Result<Vec<String>, String>;

    async fn mark_lesson_done(
        &self,
        user_id: UserId,
        course_id: &str,
        lesson_key: &str,
    ) -> Result<(), String>;

    async fn mark_lesson_undone(
        &self,
        user_id: UserId,
        course_id: &str,
        lesson_key: &str,
    ) -> Result<(), String>;
}

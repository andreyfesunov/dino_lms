use courses::{ChapterState, CourseService};
use kernel::Actor;

/// Shared context for course pages: the signed-in actor plus course service.
pub(crate) struct CoursePage<'a> {
    pub actor: Actor,
    pub courses: &'a CourseService,
}

impl<'a> CoursePage<'a> {
    /// Which chapters of the course the actor may open.
    pub(crate) async fn chapter_states(&self, course: &courses::CourseConfig) -> Vec<ChapterState> {
        let mut states = Vec::with_capacity(course.chapters.len());
        for chapter in &course.chapters {
            states.push(
                self.courses
                    .chapter_access(&self.actor, course, chapter)
                    .await
                    .unwrap_or(ChapterState::Locked),
            );
        }
        states
    }
}

/// Loads the page context for signed-in, onboarded users.
pub(crate) async fn require_course_actor(
    cx: &topcoat::context::Cx,
) -> Result<CoursePage<'_>, topcoat::Error> {
    let (actor, _) = crate::session::require_onboarded(cx).await?;
    let courses: &courses::CourseService = topcoat::context::app_context(cx);
    Ok(CoursePage { actor, courses })
}

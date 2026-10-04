use auth::Permission;
use courses::{ChapterState, CourseConfig, CourseService};
use kernel::UserId;
use topcoat::{
    Result,
    context::{Cx, app_context},
    router::{page, path_param},
    runtime::{Event, Signal, procedure, shard, signal},
    view::{View, component, view},
};

use crate::{
    components,
    i18n::{t, t_args},
    session::require_permission,
};

use super::course_context::require_course_actor;

path_param!(pub detail_course_id);

#[page("/courses/{detail_course_id}")]
async fn course_detail_page(cx: &Cx) -> Result<impl View> {
    let course_id: &str = path_param::<DetailCourseId>(cx);
    Ok(view! {
        course_detail_panel(course_id: course_id.to_owned())
    })
}

pub struct DetailModel {
    pub course: CourseConfig,
    pub completed: Vec<String>,
    pub states: Vec<ChapterState>,
    pub students: Vec<UserId>,
}

/// Builds the view model shared by the page and the chapter-access modal.
pub(crate) async fn detail_model(cx: &Cx, course_id: &str) -> Result<DetailModel, topcoat::Error> {
    let page = require_course_actor(cx).await?;
    let Some(course) = page.courses.catalog().get(course_id) else {
        return Err(topcoat::Error::msg("not found"));
    };
    let completed = page
        .courses
        .completed_lessons(&page.actor, &course.id)
        .await
        .unwrap_or_default();
    let states = page.chapter_states(&course).await;
    let students = if page.actor.has_role(kernel::Role::Admin) {
        page.courses
            .course_students(&page.actor, &course.id)
            .await
            .unwrap_or_default()
    } else {
        Vec::new()
    };
    Ok(DetailModel {
        course,
        completed,
        states,
        students,
    })
}

#[component]
async fn chapter_row(
    cx: &Cx,
    course_id: String,
    chapter: courses::ChapterConfig,
    index: usize,
    state: ChapterState,
    done: bool,
    total: usize,
) -> Result<impl View> {
    let open = state == ChapterState::Open;
    let lessons_label = t_args(cx, "course-lessons", [("count", (total as i64).into())]);
    let access_label = if open {
        t(cx, "course-chapter-access-open")
    } else {
        t(cx, "course-chapter-access-locked")
    };
    let row_class = if open {
        "rounded-lg border border-border bg-surface p-4"
    } else {
        "rounded-lg border border-[#F3E0C8] bg-[#FFFBEB]/60 p-4"
    };
    let num_class = if open {
        "inline-flex h-9 w-9 items-center justify-center rounded-md bg-primary font-heading text-[15px] font-bold text-text-inverse"
    } else {
        "inline-flex h-9 w-9 items-center justify-center rounded-md bg-[#D97706] font-heading text-[15px] font-bold text-white"
    };
    let href = format!(
        "/courses/{course_id}/{}/{}",
        chapter.id,
        first_lesson_id(&chapter)
    );

    Ok(view! {
        <div class=(row_class)>
            <div class="flex items-center justify-between gap-4">
                <div class="flex min-w-0 items-center gap-3">
                    <span class=(num_class)>((index + 1).to_string())</span>
                    <div class="min-w-0">
                        <div class="flex items-center gap-2">
                            <span class=(if open { "font-body text-[15px] font-semibold text-text" } else { "font-body text-[15px] font-semibold text-text-muted" })>
                                (chapter.title.clone())
                            </span>
                            if done {
                                <span class="text-primary" title=(t(cx, "course-lesson-done"))>
                                    components::check_circle(extra: "h-4 w-4")
                                </span>
                            } else if !open {
                                <span class="text-[#D97706]">
                                    components::lock(extra: "h-4 w-4")
                                </span>
                            }
                        </div>
                        <span class=(if open { "font-body text-xs text-text-muted" } else { "font-body text-xs text-[#D97706]" })>
                            (format!("{lessons_label} · {access_label}"))
                        </span>
                    </div>
                </div>
                if open {
                    <a
                        href=(href)
                        class="inline-flex shrink-0 items-center gap-1.5 rounded-md bg-primary px-3.5 py-2 font-body text-xs font-semibold text-text-inverse hover:bg-inverse"
                    >
                        (t(cx, "course-chapter-open"))
                        components::chevron_right(extra: "h-3.5 w-3.5")
                    </a>
                } else {
                    <span class="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-border px-3.5 py-2 font-body text-xs font-medium text-text-secondary">
                        (t(cx, "course-chapter-request"))
                    </span>
                }
            </div>
        </div>
    })
}

fn first_lesson_id(chapter: &courses::ChapterConfig) -> &str {
    chapter
        .lessons
        .first()
        .map(|lesson| lesson.id.as_str())
        .unwrap_or_default()
}

/// Renders the chapter access modal (admin): toggles per chapter for one
/// student. Saving goes through `set_chapter_access_action`.
#[component]
#[allow(clippy::too_many_arguments)]
pub(crate) async fn chapter_access_modal(
    cx: &Cx,
    course_id: String,
    course_title: String,
    chapters: Vec<courses::ChapterConfig>,
    initial_open: Vec<String>,
    students: Vec<UserId>,
    student: Signal<String>,
    open: Signal<bool>,
    version: Signal<u32>,
) -> Result<impl View> {
    let title = t(cx, "access-chapter-title");
    let sub = format!("{course_title} · {}", t(cx, "access-saved-hint"));
    let student_bar = t(cx, "access-student-bar");
    let change = t(cx, "access-change");
    let close = t(cx, "access-close");
    let open_badge = t(cx, "access-chapter-open-badge");
    let closed_badge = t(cx, "access-chapter-closed-badge");
    let open_hint = t(cx, "access-chapter-open-hint");
    let closed_hint = t(cx, "access-chapter-closed-hint");
    let no_chapters = t(cx, "access-no-chapters");

    let selected = student.get();
    let is_open: Vec<bool> = chapters
        .iter()
        .map(|chapter| {
            initial_open
                .iter()
                .any(|id| id.as_str() == "*" || *id == chapter.id)
        })
        .collect();

    Ok(view! {
        if open.get() {
            <div class="fixed inset-0 z-50 flex items-center justify-center bg-[#1B3A28]/40 p-4">
                <div class="flex max-h-[90vh] w-full max-w-xl flex-col overflow-hidden rounded-xl bg-surface shadow-xl">
                    <div class="flex flex-col gap-4 p-6 pb-4">
                        <div class="flex items-start justify-between gap-4">
                            <div>
                                <h2 class="font-heading text-lg font-semibold text-text">(title)</h2>
                                <p class="mt-0.5 font-body text-xs text-text-muted">(sub)</p>
                            </div>
                            <button type="button" class="rounded-md p-1 text-text-secondary hover:bg-input"
                                @click=$(move |e: Event| { e.prevent_default(); open.set(false); })>
                                components::x(extra: "")
                            </button>
                        </div>
                        <div class="flex items-center gap-2 rounded-md bg-input px-3 py-2.5">
                            components::user(extra: "h-4 w-4 text-text-muted")
                            <span class="font-body text-xs font-medium text-text-secondary">(student_bar)</span>
                            <select :value=$(selected.clone()) @change=$(move |e: Event| student.set(e.target.value))
                                class="min-w-0 flex-1 rounded border-0 bg-transparent font-body text-xs font-semibold text-text focus:outline-none">
                                for user_id in students.clone() {
                                    <option value=(user_id.to_string())>(user_id.to_string())</option>
                                }
                            </select>
                            <span class="rounded-full border border-border px-2 py-0.5 font-body text-[10px] font-medium text-text-secondary">(change)</span>
                        </div>
                    </div>
                    <div class="flex flex-col gap-2 overflow-y-auto px-6 pb-4">
                        if chapters.is_empty() {
                            <p class="py-8 text-center font-body text-sm text-text-muted">(no_chapters)</p>
                        }
                        for (index, chapter) in chapters.iter().enumerate() {
                            let chapter_id = chapter.id.clone();
                            let chapter_id2 = chapter.id.clone();
                            let currently_open = is_open[index];
                            let (row_bg, num_bg, badge, hint) = if currently_open {
                                ("bg-[#F0FDF4]", "bg-primary", open_badge.clone(), open_hint.clone())
                            } else {
                                ("bg-[#FFFBEB]", "bg-[#D97706]", closed_badge.clone(), closed_hint.clone())
                            };
                            <div class=(format!("flex items-center justify-between gap-3 rounded-md p-3 {row_bg}"))>
                                <div class="flex min-w-0 items-center gap-3">
                                    <span class=(format!("inline-flex h-7 w-7 shrink-0 items-center justify-center rounded font-heading text-xs font-bold text-white {num_bg}"))>
                                        ((index + 1).to_string())
                                    </span>
                                    <div class="min-w-0">
                                        <div class="flex items-center gap-2">
                                            <span class="truncate font-body text-[13px] font-semibold text-text">(chapter.title.clone())</span>
                                            <span class=(format!("rounded px-1.5 py-0.5 font-body text-[9px] font-semibold {}", if currently_open { "bg-[#D1FAE5] text-[#059669]" } else { "bg-[#FEE2E2] text-[#DC2626]" }))>
                                                (badge)
                                            </span>
                                        </div>
                                        <span class=(format!("font-body text-[11px] {}", if currently_open { "text-text-muted" } else { "text-[#D97706]" }))>
                                            (hint)
                                        </span>
                                    </div>
                                </div>
                                <button
                                    type="button"
                                    class=(format!("relative h-6 w-11 shrink-0 rounded-full transition-colors {}", if currently_open { "bg-primary" } else { "bg-border" }))
                                    aria-pressed=(currently_open)
                                    @click=$(async move |e: Event| {
                                        e.prevent_default();
                                        set_chapter_access_action(
                                            student.get(),
                                            course_id.clone(),
                                            chapter_id2.clone(),
                                            !currently_open,
                                        ).await;
                                        version.increment();
                                    })
                                    data-chapter=(chapter_id)
                                ></button>
                            </div>
                        }
                    </div>
                    <div class="flex items-center justify-between border-t border-border px-6 py-4">
                        <span class="flex items-center gap-1.5 font-body text-[11px] text-text-muted">
                            components::check_circle(extra: "h-3.5 w-3.5")
                            (t(cx, "access-saved-hint"))
                        </span>
                        <button type="button" class="rounded-md border border-border px-4 py-2 font-body text-[13px] font-medium text-text-secondary hover:bg-input"
                            @click=$(move |e: Event| { e.prevent_default(); open.set(false); })>
                            (close)
                        </button>
                    </div>
                </div>
            </div>
        }
    })
}

/// Opens or closes one chapter for one student (admin). Wildcards are
/// preserved: toggling any chapter on a `*` grant replaces it with the
/// explicit chapter list.
#[procedure]
pub(crate) async fn set_chapter_access_action(
    cx: &Cx,
    student_id: String,
    course_id: String,
    chapter_id: String,
    open: bool,
) -> Result<()> {
    let (actor, _) = require_permission(cx, Permission::ManageCourses).await?;
    let courses: &CourseService = app_context(cx);
    let Ok(user_id) = student_id.parse::<UserId>() else {
        return Err(topcoat::Error::msg(t(cx, "error-generic")));
    };

    // Load the current grant to compute the new chapter list.
    let current = courses
        .student_chapters(&actor, user_id, &course_id)
        .await
        .map_err(|error| topcoat::Error::msg(error.to_string()))?;

    let all = current.iter().any(|id| id == "*");
    let chapter_ids: Vec<String> = courses
        .catalog()
        .get(&course_id)
        .map(|course| course.chapters.iter().map(|c| c.id.clone()).collect())
        .unwrap_or_default();

    let mut next: Vec<String> = if all {
        chapter_ids.clone()
    } else {
        current
            .into_iter()
            .filter(|id| id != "*" && chapter_ids.contains(id))
            .collect()
    };
    if open {
        if !next.contains(&chapter_id) {
            next.push(chapter_id);
        }
    } else {
        next.retain(|id| *id != chapter_id);
    }
    next.sort_by_key(|id| {
        chapter_ids
            .iter()
            .position(|valid| valid == id)
            .unwrap_or(usize::MAX)
    });

    if next.is_empty() {
        courses
            .revoke(&actor, user_id, &course_id)
            .await
            .map_err(|error| topcoat::Error::msg(error.to_string()))?;
    } else if next.len() == chapter_ids.len() && chapter_ids.iter().all(|id| next.contains(id)) {
        courses
            .grant(&actor, user_id, &course_id, &["*".to_owned()])
            .await
            .map_err(|error| topcoat::Error::msg(error.to_string()))?;
    } else {
        courses
            .grant(&actor, user_id, &course_id, &next)
            .await
            .map_err(|error| topcoat::Error::msg(error.to_string()))?;
    }
    Ok(())
}

#[shard]
async fn course_detail_panel(cx: &Cx, course_id: String) -> Result<impl View> {
    let model = detail_model(cx, &course_id).await?;
    let page = require_course_actor(cx).await?;
    let courses_service: &CourseService = app_context(cx);
    let course = model.course;
    let is_admin = page.actor.has_role(kernel::Role::Admin);

    let completed = model.completed;
    let progress = courses_service.course_progress(&course, &completed);

    let back_label = t(cx, "course-back");
    let open_badge = t(cx, "course-open-for-you");
    let progress_label = t(cx, "course-your-progress");
    let progress_done = t_args(
        cx,
        "course-progress-done",
        [("percent", (progress as i64).into())],
    );
    let chapters_title = t(cx, "course-chapters-title");

    let chapters_count = course.chapters.len() as i64;
    let lessons_count = course.total_lessons() as i64;
    let chapters_label = t_args(cx, "course-chapters", [("count", chapters_count.into())]);
    let lessons_label = t_args(cx, "course-lessons", [("count", lessons_count.into())]);
    let hours_label = course
        .estimated_hours
        .as_ref()
        .map(|hours| t_args(cx, "course-hours", [("hours", hours.clone().into())]));

    // First unfinished lesson for the "continue" link.
    let first_open = course
        .chapters
        .iter()
        .enumerate()
        .find(|(index, _)| model.states.get(*index) == Some(&ChapterState::Open))
        .and_then(|(_, chapter)| {
            let key = |lesson_id: &str| format!("{}/{}", chapter.id, lesson_id);
            chapter
                .lessons
                .iter()
                .find(|lesson| !completed.contains(&key(&lesson.id)))
                .or_else(|| chapter.lessons.first())
                .map(|lesson| (chapter.id.clone(), lesson.id.clone()))
        });

    let manage_open = signal(cx, || false);
    let student = signal(cx, || {
        model
            .students
            .first()
            .map(|id| id.to_string())
            .unwrap_or_default()
    });
    let version = signal(cx, || 0u32);
    let _ = version.get();

    // Refresh-driven rows: recompute toggles from the current grant.
    let current_open = if is_admin && !model.students.is_empty() {
        courses_service
            .student_chapters(&page.actor, *model.students.first().unwrap(), &course.id)
            .await
            .unwrap_or_default()
    } else {
        Vec::new()
    };

    Ok(view! {
        <section class="flex h-full min-h-[calc(100vh-2rem)] flex-col gap-6 rounded-xl bg-surface p-5 shadow-[0_4px_24px_rgba(27,58,40,0.06)] md:p-8">
            <div class="flex items-center justify-between gap-4">
                <a href="/courses" class="inline-flex items-center gap-2 font-body text-[13px] text-text-secondary hover:text-text">
                    components::arrow_left(extra: "h-4 w-4")
                    (back_label)
                </a>
                if is_admin {
                    <button
                        type="button"
                        class="inline-flex items-center gap-2 rounded-md border border-border px-3.5 py-2 font-body text-xs font-medium text-text-secondary hover:bg-input"
                        @click=$(move |e: Event| { e.prevent_default(); manage_open.set(true); })
                    >
                        components::key(extra: "h-3.5 w-3.5")
                        (t(cx, "course-manage-access"))
                    </button>
                }
            </div>

            <div class="flex flex-col gap-3">
                <div class="flex flex-wrap items-center gap-3">
                    <h1 class="font-heading text-[26px] font-semibold text-text">(course.title.clone())</h1>
                    <span class="inline-flex items-center gap-1 rounded bg-primary-soft px-2 py-0.5 font-body text-[11px] font-semibold text-primary">
                        components::unlock(extra: "h-3 w-3")
                        (open_badge)
                    </span>
                </div>
                if !course.description.is_empty() {
                    <p class="max-w-3xl font-body text-sm text-text-secondary">(course.description.clone())</p>
                }
                <div class="flex flex-wrap items-center gap-4 text-text-muted">
                    <span class="flex items-center gap-1.5 font-body text-[13px]">
                        components::book_open(extra: "h-4 w-4")
                        (chapters_label)
                    </span>
                    <span class="flex items-center gap-1.5 font-body text-[13px]">
                        components::file_text(extra: "h-4 w-4")
                        (lessons_label)
                    </span>
                    if let Some(hours) = hours_label {
                        <span class="flex items-center gap-1.5 font-body text-[13px]">
                            components::clock(extra: "h-4 w-4")
                            (hours)
                        </span>
                    }
                </div>
            </div>

            <div class="flex flex-col gap-1.5">
                <div class="flex items-center justify-between">
                    <span class="font-body text-xs text-text-muted">(progress_label)</span>
                    <span class="font-body text-[13px] font-semibold text-primary">(progress_done)</span>
                </div>
                <span class="inline-block h-2 w-full overflow-hidden rounded bg-input">
                    <span class="block h-full rounded bg-primary" style=(format!("width: {progress}%"))></span>
                </span>
            </div>

            if let Some((chapter_id, lesson_id)) = first_open {
                <a
                    href=(format!("/courses/{}/{}/{}", course.id, chapter_id, lesson_id))
                    class="inline-flex w-fit items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-text-inverse hover:bg-inverse"
                >
                    (t(cx, "course-chapter-open"))
                    components::chevron_right(extra: "h-4 w-4")
                </a>
            }

            <h2 class="font-heading text-lg font-semibold text-text">(chapters_title)</h2>

            <div class="flex flex-col gap-3">
                for (index, chapter) in course.chapters.iter().enumerate() {
                    let state = model
                        .states
                        .get(index)
                        .cloned()
                        .unwrap_or(ChapterState::Locked);
                    let done = !chapter.lessons.is_empty() && chapter.lessons.iter().all(|lesson| {
                        completed.contains(&format!("{}/{}", chapter.id, lesson.id))
                    });
                    chapter_row(
                        course_id: course.id.clone(),
                        chapter: chapter.clone(),
                        index: index,
                        state: state,
                        done: done,
                        total: chapter.lessons.len(),
                    )
                }
            </div>

            if is_admin {
                chapter_access_modal(
                    course_id: course.id.clone(),
                    course_title: course.title.clone(),
                    chapters: course.chapters.clone(),
                    initial_open: current_open,
                    students: model.students.clone(),
                    student: student.clone(),
                    open: manage_open.clone(),
                    version: version.clone(),
                )
            }
        </section>
    })
}

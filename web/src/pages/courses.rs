use auth::{AuthService, ListUsersCommand, Permission};
use courses::{ChapterState, CourseConfig, CourseService};
use kernel::UserId;
use topcoat::{
    Result,
    context::{Cx, app_context},
    router::page,
    runtime::{Event, Signal, procedure, shard, signal},
    view::{View, component, view},
};

use crate::{
    components,
    i18n::{t, t_args},
    session::require_permission,
};

use super::course_context::require_course_actor;

/// One rendered course row: config plus per-viewer derived data.
struct CourseRow {
    course: CourseConfig,
    students: usize,
    progress: u8,
    /// Whether the viewer may open at least one chapter.
    open: bool,
}

#[shard]
async fn courses_panel(cx: &Cx) -> Result<impl View> {
    let page = require_course_actor(cx).await?;
    let auth: &AuthService = app_context(cx);
    let can_grant = auth.permits(&page.actor, Permission::ManageCourses);

    let search = signal(cx, String::new);
    // 0 all, 1 active, 2 archived
    let filter = signal(cx, || 0u8);
    // 0 none, 1 grant access modal
    let modal = signal(cx, || 0u8);
    let grant_student = signal(cx, String::new);
    let grant_course = signal(cx, String::new);
    let grant_all_chapters = signal(cx, || true);
    let grant_version = signal(cx, || 0u32);

    let _ = grant_version.get();

    let courses_service = page.courses;
    let summaries = courses_service
        .visible_courses(&page.actor)
        .await
        .map_err(|error| topcoat::Error::msg(error.to_string()))?;

    let mut rows = Vec::with_capacity(summaries.len());
    for summary in summaries {
        let completed = courses_service
            .completed_lessons(&page.actor, &summary.course.id)
            .await
            .unwrap_or_default();
        let progress = courses_service.course_progress(&summary.course, &completed);
        let mut open = false;
        for chapter in &summary.course.chapters {
            if let Ok(ChapterState::Open) = courses_service
                .chapter_access(&page.actor, &summary.course, chapter)
                .await
            {
                open = true;
                break;
            }
        }
        rows.push(CourseRow {
            course: summary.course,
            students: summary.students,
            progress,
            open,
        });
    }

    // Filters and search are client-side over the (small) catalog.
    let query = search.get().trim().to_lowercase();
    let current_filter = filter.get();
    let rows: Vec<CourseRow> = rows
        .into_iter()
        .filter(|row| {
            let matches_filter = match current_filter {
                1 => !row.course.archived,
                2 => row.course.archived,
                _ => true,
            };
            let matches_query = query.is_empty()
                || row.course.title.to_lowercase().contains(&query)
                || row.course.description.to_lowercase().contains(&query);
            matches_filter && matches_query
        })
        .collect();

    // Students for the grant modal (admin only).
    let students = if can_grant {
        auth.list_users(
            &page.actor,
            ListUsersCommand {
                query: None,
                status: None,
            },
        )
        .await
        .map_err(|error| topcoat::Error::msg(error.to_string()))?
    } else {
        Vec::new()
    };

    let title = t(cx, "courses-title");
    let subtitle = t(cx, "courses-subtitle");
    let search_ph = t(cx, "courses-search-placeholder");
    let filter_all = t(cx, "courses-filter-all");
    let filter_active = t(cx, "courses-filter-active");
    let filter_archived = t(cx, "courses-filter-archived");
    let empty = t(cx, "courses-empty");
    let empty_hint = t(cx, "courses-empty-hint");
    let grant_label = t(cx, "courses-grant-access");
    let progress_label = t(cx, "courses-progress-label");
    let open_badge = t(cx, "courses-open-badge");
    let locked_badge = t(cx, "courses-locked-badge");
    let archived_badge = t(cx, "courses-archived-badge");

    let current_modal = modal.get();
    let grant_course_options = if can_grant {
        courses_service
            .catalog()
            .list()
            .iter()
            .map(|course| (course.id.clone(), course.title.clone()))
            .collect::<Vec<_>>()
    } else {
        Vec::new()
    };

    Ok(view! {
        <section class="flex h-full min-h-[calc(100vh-2rem)] flex-col gap-6 rounded-xl bg-surface p-5 shadow-[0_4px_24px_rgba(27,58,40,0.06)] md:p-8">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div class="flex flex-col gap-1">
                    <h1 class="font-heading text-3xl font-semibold text-text">(title)</h1>
                    <p class="font-body text-sm text-text-secondary">(subtitle)</p>
                </div>
                if can_grant {
                    <button
                        type="button"
                        class="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-text-inverse hover:bg-inverse"
                        @click=$(move |e: Event| { e.prevent_default(); modal.set(1u8); })
                    >
                        components::user_plus(extra: "h-4 w-4 text-text-inverse")
                        <span>(grant_label)</span>
                    </button>
                }
            </div>

            <div class="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
                <label class="relative block w-full max-w-md">
                    <span class="pointer-events-none absolute top-1/2 left-3 -translate-y-1/2 text-text-muted">
                        components::search(extra: "h-4 w-4")
                    </span>
                    <input
                        type="search"
                        placeholder=(search_ph)
                        :value=$(search.get())
                        @input=$(|e: Event| search.set(e.target.value))
                        class="h-11 w-full rounded-md border-0 bg-input py-2.5 pr-3 pl-10 font-body text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                </label>
                <div class="flex flex-wrap gap-2">
                    <button type="button" class=(filter_chip(current_filter == 0))
                        @click=$(move |e: Event| { e.prevent_default(); filter.set(0u8); })>(filter_all)</button>
                    <button type="button" class=(filter_chip(current_filter == 1))
                        @click=$(move |e: Event| { e.prevent_default(); filter.set(1u8); })>(filter_active)</button>
                    <button type="button" class=(filter_chip(current_filter == 2))
                        @click=$(move |e: Event| { e.prevent_default(); filter.set(2u8); })>(filter_archived)</button>
                </div>
            </div>

            if rows.is_empty() {
                <div class="flex flex-col items-center gap-2 rounded-lg border border-dashed border-border py-16 text-center">
                    <span class="text-text-muted">components::graduation_cap(extra: "h-10 w-10")</span>
                    <p class="font-body text-base font-medium text-text">(empty)</p>
                    <p class="font-body text-sm text-text-muted">(empty_hint)</p>
                </div>
            }

            <div class="flex flex-col gap-4">
                for row in rows {
                    course_row(
                        course: row.course,
                        students: row.students,
                        progress: row.progress,
                        open: row.open,
                        progress_label: progress_label.clone(),
                        open_badge: open_badge.clone(),
                        locked_badge: locked_badge.clone(),
                        archived_badge: archived_badge.clone(),
                    )
                }
            </div>

            if current_modal == 1 && can_grant {
                grant_access_modal(
                    modal: modal.clone(),
                    students: students.clone(),
                    course_options: grant_course_options,
                    grant_student: grant_student.clone(),
                    grant_course: grant_course.clone(),
                    grant_all_chapters: grant_all_chapters.clone(),
                    version: grant_version.clone(),
                )
            }
        </section>
    })
}

fn filter_chip(active: bool) -> &'static str {
    if active {
        "rounded-full bg-primary px-3.5 py-1.5 font-body text-sm font-medium text-text-inverse"
    } else {
        "rounded-full bg-input px-3.5 py-1.5 font-body text-sm font-medium text-text-secondary hover:bg-border"
    }
}

#[component]
async fn course_row(
    cx: &Cx,
    course: CourseConfig,
    students: usize,
    progress: u8,
    open: bool,
    progress_label: String,
    open_badge: String,
    locked_badge: String,
    archived_badge: String,
) -> Result<impl View> {
    let chapters = course.chapters.len() as i64;
    let chapters_label = t_args(cx, "courses-chapters-count", [("count", chapters.into())]);
    let students_label = t_args(cx, "courses-students-count", [("count", students.into())]);
    let status_badge = if course.archived {
        Some(archived_badge)
    } else if open {
        Some(open_badge)
    } else {
        Some(locked_badge)
    };
    let (badge_class, badge_icon) = if course.archived {
        ("bg-[#F3E0C8] text-[#8A5A2B]", "lock")
    } else if open {
        ("bg-primary-soft text-primary", "unlock")
    } else {
        ("bg-[#FEF3C7] text-[#D97706]", "lock")
    };
    let href = format!("/courses/{}", course.id);

    Ok(view! {
        <a
            href=(href)
            class="group block rounded-lg border border-border bg-surface p-5 transition-colors hover:border-primary/40 hover:bg-input/40"
        >
            <div class="flex items-start justify-between gap-4">
                <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                        <h2 class="font-heading text-lg font-semibold text-text group-hover:text-primary">
                            (course.title.clone())
                        </h2>
                        if let Some(badge) = status_badge {
                            <span class=(format!("inline-flex items-center gap-1 rounded px-2 py-0.5 font-body text-[11px] font-semibold {badge_class}"))>
                                if badge_icon == "unlock" {
                                    components::unlock(extra: "h-3 w-3")
                                } else {
                                    components::lock(extra: "h-3 w-3")
                                }
                                (badge)
                            </span>
                        }
                    </div>
                    if !course.description.is_empty() {
                        <p class="mt-1 line-clamp-2 font-body text-[13px] text-text-secondary">
                            (course.description.clone())
                        </p>
                    }
                </div>
                <span class="text-text-muted transition-colors group-hover:text-primary">
                    components::chevron_right(extra: "h-5 w-5")
                </span>
            </div>
            <div class="mt-3 flex flex-wrap items-center justify-between gap-3">
                <div class="flex items-center gap-4 text-text-muted">
                    <span class="flex items-center gap-1.5 font-body text-xs">
                        components::book_open(extra: "h-3.5 w-3.5")
                        (chapters_label)
                    </span>
                    if students > 0 {
                        <span class="flex items-center gap-1.5 font-body text-xs">
                            components::users(extra: "h-3.5 w-3.5")
                            (students_label)
                        </span>
                    }
                </div>
                <div class="flex items-center gap-2">
                    <span class="font-body text-[11px] text-text-muted">(progress_label)</span>
                    <span class="font-body text-[11px] font-semibold text-primary">(format!("{progress}%"))</span>
                    <span class="inline-block h-1.5 w-32 overflow-hidden rounded-full bg-input">
                        <span class="block h-full rounded-full bg-primary" style=(format!("width: {progress}%"))></span>
                    </span>
                </div>
            </div>
        </a>
    })
}

/// Student picker + course select + chapter scope. Admin-only.
#[component]
#[allow(clippy::too_many_arguments)]
async fn grant_access_modal(
    cx: &Cx,
    modal: Signal<u8>,
    students: Vec<auth::User>,
    course_options: Vec<(String, String)>,
    grant_student: Signal<String>,
    grant_course: Signal<String>,
    grant_all_chapters: Signal<bool>,
    version: Signal<u32>,
) -> Result<impl View> {
    let title = t(cx, "access-grant-title");
    let sub = t(cx, "access-grant-sub");
    let student_label = t(cx, "access-student-label");
    let student_ph = t(cx, "access-student-placeholder");
    let course_label = t(cx, "access-course-label");
    let chapters_label = t(cx, "access-chapters-label");
    let chapters_all = t(cx, "access-chapters-all");
    let submit_label = t(cx, "access-grant-submit");
    let cancel = t(cx, "action-cancel");

    let _ = grant_all_chapters.get();

    Ok(view! {
        <div class="fixed inset-0 z-50 flex items-center justify-center bg-[#1B3A28]/40 p-4">
            <div class="w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
                <div class="mb-4 flex items-start justify-between gap-4">
                    <div>
                        <h2 class="font-heading text-xl font-semibold text-text">(title)</h2>
                        <p class="mt-1 font-body text-sm text-text-secondary">(sub)</p>
                    </div>
                    <button type="button" class="rounded-md p-1 text-text-secondary hover:bg-input"
                        @click=$(move |e: Event| { e.prevent_default(); modal.set(0u8); })>
                        components::x(extra: "")
                    </button>
                </div>
                <div class="flex flex-col gap-3">
                    <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
                        (student_label)
                        <select :value=$(grant_student.get()) @change=$(|e: Event| grant_student.set(e.target.value))
                            class="h-11 rounded-md border-0 bg-input px-3 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30">
                            <option value="">(student_ph)</option>
                            for student in students {
                                <option value=(student.id.to_string())>(format!("{} ({})", student.display_name(), student.login))</option>
                            }
                        </select>
                    </label>
                    <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
                        (course_label)
                        <select :value=$(grant_course.get()) @change=$(|e: Event| grant_course.set(e.target.value))
                            class="h-11 rounded-md border-0 bg-input px-3 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30">
                            for (course_id, course_title) in course_options {
                                <option value=(course_id)>(course_title)</option>
                            }
                        </select>
                    </label>
                    <p class="font-body text-xs text-text-muted">(format!("{chapters_label} — {chapters_all}"))</p>
                </div>
                <div class="mt-5 flex justify-end gap-2">
                    <button type="button" class="rounded-md bg-input px-4 py-2.5 font-body text-sm font-medium text-text hover:bg-border"
                        @click=$(move |e: Event| { e.prevent_default(); modal.set(0u8); })>(cancel)</button>
                    <button type="button" class="inline-flex items-center gap-2 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-text-inverse hover:bg-inverse"
                        @click=$(async move |e: Event| {
                            e.prevent_default();
                            let student = grant_student.get();
                            let course_id = grant_course.get();
                            grant_course_access_action(student, course_id).await;
                            modal.set(0u8);
                            version.increment();
                        })>
                        components::check_circle(extra: "h-4 w-4 text-text-inverse")
                        (submit_label)
                    </button>
                </div>
            </div>
        </div>
    })
}

#[procedure]
async fn grant_course_access_action(cx: &Cx, student_id: String, course_id: String) -> Result<()> {
    let (actor, _) = require_permission(cx, Permission::ManageCourses).await?;
    let courses: &CourseService = app_context(cx);
    let Ok(user_id) = student_id.trim().parse::<UserId>() else {
        return Err(topcoat::Error::msg(t(cx, "error-generic")));
    };
    if student_id.trim().is_empty() || course_id.trim().is_empty() {
        return Err(topcoat::Error::msg(t(cx, "error-generic")));
    }
    courses
        .grant(&actor, user_id, course_id.trim(), &["*".to_owned()])
        .await
        .map_err(|error| topcoat::Error::msg(error.to_string()))?;
    Ok(())
}

#[page("/courses")]
async fn courses_page() -> Result<impl View> {
    Ok(view! {
        courses_panel()
    })
}

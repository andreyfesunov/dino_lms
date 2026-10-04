use courses::{CourseService, render_lesson_markdown};
use topcoat::{
    Result,
    context::{Cx, app_context},
    router::{page, path_param},
    runtime::{Event, procedure, shard, signal},
    view::{Unescaped, View, component, view},
};

use crate::{
    components,
    i18n::{t, t_args},
};

use super::course_context::require_course_actor;
use super::course_media::media_url;

path_param!(pub lesson_course_id);
path_param!(pub lesson_chapter_id);
path_param!(pub lesson_lesson_id);

#[page("/courses/{lesson_course_id}/{lesson_chapter_id}/{lesson_lesson_id}")]
async fn lesson_page(cx: &Cx) -> Result<impl View> {
    let course_id: &str = path_param::<LessonCourseId>(cx);
    let chapter_id: &str = path_param::<LessonChapterId>(cx);
    let lesson_id: &str = path_param::<LessonLessonId>(cx);
    Ok(view! {
        lesson_panel(
            course_id: course_id.to_owned(),
            chapter_id: chapter_id.to_owned(),
            lesson_id: lesson_id.to_owned(),
        )
    })
}

/// One YouTube link card.
#[component]
async fn youtube_card(
    cx: &Cx,
    url: String,
    title: String,
    channel: Option<String>,
    thumb: Option<String>,
) -> Result<impl View> {
    let source = t(cx, "lesson-source-youtube");
    let open_label = t(cx, "lesson-open-link");
    Ok(view! {
        <a
            href=(url.clone())
            target="_blank"
            rel="noopener noreferrer"
            class="group flex items-stretch gap-4 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-primary/40"
        >
            <span class="relative block h-[84px] w-[150px] shrink-0 overflow-hidden rounded-md bg-input">
                if let Some(thumb_url) = thumb {
                    <img
                        src=(thumb_url)
                        alt=""
                        loading="lazy"
                        class="h-full w-full object-cover transition-transform group-hover:scale-105"
                    />
                }
                <span class="absolute inset-0 flex items-center justify-center">
                    <span class="flex h-9 w-9 items-center justify-center rounded-full bg-black/40 text-white">
                        components::play(extra: "h-4 w-4")
                    </span>
                </span>
            </span>
            <span class="flex min-w-0 flex-1 flex-col justify-center gap-1">
                <span class="truncate font-body text-sm font-semibold text-text group-hover:text-primary">
                    (title.clone())
                </span>
                <span class="font-body text-xs text-text-muted">(source.clone())</span>
                if let Some(channel_name) = channel {
                    <span class="font-body text-xs text-text-muted">(channel_name)</span>
                }
                <span class="inline-flex items-center gap-1 font-body text-xs font-semibold text-primary">
                    components::external_link(extra: "h-3 w-3")
                    (open_label)
                </span>
            </span>
        </a>
    })
}

/// Video player for a recorded lesson file.
#[component]
async fn video_player(src: String, caption: String) -> Result<impl View> {
    Ok(view! {
        <figure class="flex flex-col gap-2">
            <video
                src=(src)
                controls=""
                preload="metadata"
                class="aspect-video w-full rounded-lg bg-black"
            ></video>
            <figcaption class="font-body text-sm font-semibold text-text">(caption)</figcaption>
        </figure>
    })
}

#[shard]
async fn lesson_panel(
    cx: &Cx,
    course_id: String,
    chapter_id: String,
    lesson_id: String,
) -> Result<impl View> {
    let page = require_course_actor(cx).await?;
    let courses_service: &CourseService = app_context(cx);

    let Some(course) = courses_service.catalog().get(&course_id) else {
        return Err(topcoat::Error::msg("not found"));
    };
    let Some(chapter) = course.chapter(&chapter_id) else {
        return Err(topcoat::Error::msg("not found"));
    };
    let Some(lesson) = chapter.lessons.iter().find(|lesson| lesson.id == lesson_id) else {
        return Err(topcoat::Error::msg("not found"));
    };
    let state = courses_service
        .chapter_access(&page.actor, &course, chapter)
        .await
        .map_err(|error| topcoat::Error::msg(error.to_string()))?;
    if state == courses::ChapterState::Locked {
        return Err(topcoat::Error::msg("forbidden"));
    }

    let lesson_file = courses_service
        .catalog()
        .lesson_file(&course_id, &chapter_id, &lesson_id);
    let source = tokio::fs::read_to_string(&lesson_file)
        .await
        .map_err(|error| topcoat::Error::msg(error.to_string()))?;
    let parsed = render_lesson_markdown(&source);

    let completed = courses_service
        .completed_lessons(&page.actor, &course_id)
        .await
        .map_err(|error| topcoat::Error::msg(error.to_string()))?;
    let lesson_key = format!("{chapter_id}/{lesson_id}");
    let is_done = completed.contains(&lesson_key);

    let (prev, next) = course
        .lesson_pairs()
        .iter()
        .position(|(ch, ls)| ch.id == chapter_id && ls.id == lesson_id)
        .map(|index| {
            let pairs = course.lesson_pairs();
            let prev = index
                .checked_sub(1)
                .and_then(|p| pairs.get(p))
                .map(|(ch, ls)| (ch.id.clone(), ls.id.clone(), ls.title.clone()));
            let next = pairs
                .get(index + 1)
                .map(|(ch, ls)| (ch.id.clone(), ls.id.clone(), ls.title.clone()));
            (prev, next)
        })
        .unwrap_or((None, None));

    let lesson_title = if lesson.title.is_empty() {
        // Fallback: first H1 of the markdown, or the file id.
        markdown_first_heading(&source).unwrap_or_else(|| lesson_id.clone())
    } else {
        lesson.title.clone()
    };

    let meta = if let Some(minutes) = lesson.duration_min {
        t_args(
            cx,
            "lesson-meta",
            [
                ("chapter", chapter.title.clone().into()),
                (
                    "current",
                    ((index_of(&course, &chapter_id, &lesson_id) + 1) as i64).into(),
                ),
                ("total", (course.total_lessons() as i64).into()),
                ("minutes", (minutes as i64).into()),
            ],
        )
    } else {
        t_args(
            cx,
            "lesson-meta-simple",
            [
                ("chapter", chapter.title.clone().into()),
                (
                    "current",
                    ((index_of(&course, &chapter_id, &lesson_id) + 1) as i64).into(),
                ),
                ("total", (course.total_lessons() as i64).into()),
            ],
        )
    };
    let done_badge = t(cx, "lesson-done-badge");
    let video_title = t(cx, "lesson-video-title");
    let links_title = t(cx, "lesson-links-title");
    let prev_label = t(cx, "lesson-prev");
    let next_label = t(cx, "lesson-next");

    let done = signal(cx, move || is_done);
    let _ = done.get();

    let course_href = format!("/courses/{course_id}");
    let open_course = t(cx, "lesson-open-course");

    Ok(view! {
        <section class="flex h-full min-h-[calc(100vh-2rem)] flex-col gap-5 rounded-xl bg-surface p-5 shadow-[0_4px_24px_rgba(27,58,40,0.06)] md:p-8">
            <div class="flex items-center justify-between gap-4">
                <a href=(course_href) class="inline-flex items-center gap-2 font-body text-[13px] text-text-secondary hover:text-text">
                    components::arrow_left(extra: "h-4 w-4")
                    (open_course)
                </a>
                if done.get() {
                    <span class="inline-flex items-center gap-1.5 rounded-full bg-[#D1FAE5] px-3 py-1 font-body text-[11px] font-semibold text-[#059669]">
                        components::circle_check(extra: "h-3.5 w-3.5")
                        (done_badge)
                    </span>
                }
            </div>

            <div class="flex flex-col gap-2">
                <h1 class="font-heading text-[26px] font-semibold text-text">(lesson_title.clone())</h1>
                <p class="font-body text-[13px] text-text-muted">(meta)</p>
            </div>

            <div class="h-px bg-border"></div>

            <div class="md-body flex flex-col">(Unescaped::new_unchecked(parsed.html.clone()))</div>

            if !parsed.videos.is_empty() {
                <div class="flex flex-col gap-3">
                    <h2 class="flex items-center gap-2 font-heading text-[17px] font-semibold text-text">
                        components::circle_play(extra: "h-[18px] w-[18px] text-primary")
                        (video_title)
                    </h2>
                    for video in parsed.videos.clone() {
                        video_player(
                            src: media_url(&course_id, &chapter_id, &video.file),
                            caption: format!("{lesson_title} — {file}", file = video.file),
                        )
                    }
                </div>
            }

            if !parsed.youtube.is_empty() {
                <div class="flex flex-col gap-3">
                    <h2 class="flex items-center gap-2 font-heading text-[17px] font-semibold text-text">
                        components::external_link(extra: "h-[18px] w-[18px] text-text-secondary")
                        (links_title)
                    </h2>
                    for link in parsed.youtube.clone() {
                        youtube_card(
                            url: link.url.clone(),
                            title: link.title.clone(),
                            channel: link.channel.clone(),
                            thumb: link.thumbnail_url(),
                        )
                    }
                </div>
            }

            <div class="h-px bg-border"></div>

            <div class="flex flex-wrap items-center justify-between gap-3">
                <div class="flex flex-wrap items-center gap-2">
                    if let Some((prev_chapter, prev_lesson, prev_title)) = prev {
                        <a
                            href=(format!("/courses/{course_id}/{prev_chapter}/{prev_lesson}"))
                            class="inline-flex items-center gap-2 rounded-md border border-border px-3.5 py-2 font-body text-[13px] font-medium text-text-secondary hover:bg-input"
                        >
                            components::arrow_left(extra: "h-3.5 w-3.5")
                            (prev_label)
                            <span class="hidden max-w-[180px] truncate sm:inline">(format!("— {prev_title}"))</span>
                        </a>
                    }
                    if let Some((next_chapter, next_lesson, next_title)) = next {
                        <a
                            href=(format!("/courses/{course_id}/{next_chapter}/{next_lesson}"))
                            class="inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 font-body text-[13px] font-semibold text-text-inverse hover:bg-inverse"
                        >
                            (next_label)
                            <span class="hidden max-w-[180px] truncate sm:inline">(format!("— {next_title}"))</span>
                            components::arrow_right(extra: "h-3.5 w-3.5")
                        </a>
                    }
                </div>
                <button
                    type="button"
                    class=(if done.get() {
                        "inline-flex items-center gap-2 rounded-md border border-border bg-input px-3.5 py-2 font-body text-[13px] font-medium text-text-secondary hover:bg-border"
                    } else {
                        "inline-flex items-center gap-2 rounded-md bg-primary px-3.5 py-2 font-body text-[13px] font-semibold text-text-inverse hover:bg-inverse"
                    })
                    @click=$(async move |e: Event| {
                        e.prevent_default();
                        if done.get() {
                            mark_lesson_action(course_id.clone(), chapter_id.clone(), lesson_id.clone(), false).await;
                            done.set(false);
                        } else {
                            mark_lesson_action(course_id.clone(), chapter_id.clone(), lesson_id.clone(), true).await;
                            done.set(true);
                        }
                    })
                >
                    components::circle_check(extra: "h-4 w-4")
                    if done.get() {
                        (t(cx, "lesson-mark-undone"))
                    } else {
                        (t(cx, "lesson-mark-done"))
                    }
                </button>
            </div>
        </section>
    })
}

fn index_of(course: &courses::CourseConfig, chapter_id: &str, lesson_id: &str) -> usize {
    course
        .lesson_pairs()
        .iter()
        .position(|(chapter, lesson)| chapter.id == chapter_id && lesson.id == lesson_id)
        .unwrap_or(0)
}

fn markdown_first_heading(source: &str) -> Option<String> {
    source.lines().find_map(|line| {
        let trimmed = line.trim_start();
        trimmed
            .strip_prefix("# ")
            .map(|title| title.trim().to_owned())
            .filter(|title| !title.is_empty())
    })
}

#[procedure]
async fn mark_lesson_action(
    cx: &Cx,
    course_id: String,
    chapter_id: String,
    lesson_id: String,
    done: bool,
) -> Result<()> {
    let page = require_course_actor(cx).await?;
    if done {
        page.courses
            .mark_lesson_done(&page.actor, &course_id, &chapter_id, &lesson_id)
            .await
            .map_err(|error| topcoat::Error::msg(error.to_string()))?;
    } else {
        page.courses
            .mark_lesson_undone(&page.actor, &course_id, &chapter_id, &lesson_id)
            .await
            .map_err(|error| topcoat::Error::msg(error.to_string()))?;
    }
    Ok(())
}

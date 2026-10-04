use auth::{AuthService, Permission};
use topcoat::{
    Result,
    context::{Cx, app_context},
    router::request::uri,
    runtime::{Event, shard, signal},
    view::{View, view},
};

use crate::{
    components,
    i18n::t,
    session::{current_actor, current_user},
};

#[derive(Clone, Copy, PartialEq, Eq)]
enum NavId {
    Courses,
    Users,
    Settings,
}

fn active_nav(path: &str) -> Option<NavId> {
    if path == "/users" {
        Some(NavId::Users)
    } else if path == "/settings" {
        Some(NavId::Settings)
    } else if path == "/courses" || path.starts_with("/courses/") {
        Some(NavId::Courses)
    } else {
        None
    }
}

fn item_class(active: bool) -> &'static str {
    if active {
        "flex items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm font-medium text-text-inverse bg-primary"
    } else {
        "flex items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm font-medium text-text-secondary hover:bg-input"
    }
}

fn icon_only_class(active: bool) -> &'static str {
    if active {
        "flex items-center justify-center rounded-md p-2.5 text-text-inverse bg-primary"
    } else {
        "flex items-center justify-center rounded-md p-2.5 text-text-secondary hover:bg-input"
    }
}

fn icon_tone(active: bool) -> &'static str {
    if active {
        "text-text-inverse"
    } else {
        "text-text-secondary"
    }
}

#[shard]
pub async fn app_sidebar(cx: &Cx) -> Result<impl View> {
    let maybe_user = current_user(cx).await?;
    let actor = current_actor(cx).await?;
    let auth: &AuthService = app_context(cx);
    let can_manage_users = actor
        .as_ref()
        .is_some_and(|a| auth.permits(a, Permission::ManageUsers));

    let path = uri(cx).path().to_owned();
    let active = active_nav(&path);
    let menu_open = signal(cx, || false);

    let short_name = maybe_user
        .as_ref()
        .map(|user| user.short_name())
        .unwrap_or_default();
    let show = maybe_user.is_some();

    let label_back = t(cx, "nav-back");
    let label_courses = t(cx, "nav-courses");
    let label_users = t(cx, "nav-users");
    let label_settings = t(cx, "nav-settings");
    let label_logout = t(cx, "nav-logout");
    let label_people = t(cx, "nav-people");
    let label_more = t(cx, "nav-more");

    let courses_active = active == Some(NavId::Courses);
    let users_active = active == Some(NavId::Users);
    let settings_active = active == Some(NavId::Settings);
    let open = menu_open.get();
    let menu_class = if open {
        "profile-menu profile-menu--open flex flex-col gap-1"
    } else {
        "profile-menu flex flex-col gap-1"
    };

    let back_script = concat!(
        "(function(){",
        "var show=window.history.length>1;",
        "document.querySelectorAll('[data-sidebar-back]').forEach(function(el){",
        "if(!show){el.remove();return;}",
        "el.hidden=false;",
        "el.addEventListener('click',function(e){e.preventDefault();history.back();});",
        "});",
        "})();"
    );

    Ok(view! {
        if show {
        <aside class="hidden h-[calc(100vh-2rem)] w-[72px] shrink-0 flex-col justify-between rounded-xl bg-surface p-3 shadow-[0_4px_24px_rgba(27,58,40,0.08)] md:flex lg:w-[220px] lg:p-4">
            <div class="flex flex-col gap-1">
                <button
                    type="button"
                    data-sidebar-back=""
                    hidden=""
                    class=(format!("{} lg:hidden", icon_only_class(false)))
                    aria-label=(label_back.clone())
                >
                    components::arrow_left(extra: icon_tone(false))
                </button>
                <button
                    type="button"
                    data-sidebar-back=""
                    hidden=""
                    class=(format!("{} hidden lg:flex", item_class(false)))
                >
                    components::arrow_left(extra: icon_tone(false))
                    <span>(label_back.clone())</span>
                </button>
                <div class="my-1 h-px bg-border" data-sidebar-back="" hidden=""></div>

                <a href="/courses" class=(format!("{} lg:hidden", icon_only_class(courses_active)))>
                    components::graduation_cap(extra: icon_tone(courses_active))
                </a>
                <a href="/courses" class=(format!("{} hidden lg:flex", item_class(courses_active)))>
                    components::graduation_cap(extra: icon_tone(courses_active))
                    <span>(label_courses.clone())</span>
                </a>

                if can_manage_users {
                    <a href="/users" class=(format!("{} lg:hidden", icon_only_class(users_active)))>
                        components::user_cog(extra: icon_tone(users_active))
                    </a>
                    <a href="/users" class=(format!("{} hidden lg:flex", item_class(users_active)))>
                        components::user_cog(extra: icon_tone(users_active))
                        <span>(label_users.clone())</span>
                    </a>
                }
            </div>

            <div class="flex flex-col gap-1">
                <div class=(menu_class)>
                    <div class="profile-menu__panel">
                        <div class="profile-menu__inner flex flex-col gap-1">
                            <a href="/settings" class=(format!("{} lg:hidden", icon_only_class(settings_active)))>
                                components::settings(extra: icon_tone(settings_active))
                            </a>
                            <a href="/settings" class=(format!("{} hidden lg:flex", item_class(settings_active)))>
                                components::settings(extra: icon_tone(settings_active))
                                <span>(label_settings.clone())</span>
                            </a>
                            <form method="post" action="/logout" class="lg:hidden">
                                <button type="submit" class=(format!("{} text-danger", icon_only_class(false))) aria-label=(label_logout.clone())>
                                    components::log_out(extra: "text-danger")
                                </button>
                            </form>
                            <form method="post" action="/logout" class="hidden lg:block">
                                <button
                                    type="submit"
                                    class="flex w-full items-center gap-3 rounded-md px-3 py-2.5 font-body text-sm font-medium text-danger hover:bg-danger/10"
                                >
                                    components::log_out(extra: "text-danger")
                                    <span>(label_logout.clone())</span>
                                </button>
                            </form>
                        </div>
                    </div>
                </div>

                <button
                    type="button"
                    class="flex items-center justify-center gap-3 rounded-md px-3 py-2.5 text-left hover:bg-input lg:justify-start"
                    @click=$(move |e: Event| {
                        e.prevent_default();
                        menu_open.set(!menu_open.get());
                    })
                >
                    <span class="inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary text-text-inverse">
                        components::user(extra: "h-3.5 w-3.5 text-text-inverse")
                    </span>
                    <span class="hidden truncate font-body text-sm font-medium text-text lg:inline">
                        (short_name.clone())
                    </span>
                </button>
            </div>
        </aside>

        <nav class="fixed inset-x-0 bottom-0 z-40 flex items-end justify-between gap-1 border-t border-border bg-surface px-3 pb-3 pt-2 md:hidden">
            <a
                href="/courses"
                class=(if courses_active {
                    "flex flex-1 flex-col items-center gap-1 rounded-md py-1 text-primary"
                } else {
                    "flex flex-1 flex-col items-center gap-1 rounded-md py-1 text-text-secondary"
                })
            >
                components::graduation_cap(extra: "h-5 w-5")
                <span class="font-body text-[11px]">(label_courses.clone())</span>
            </a>
            if can_manage_users {
                <a
                    href="/users"
                    class=(if users_active {
                        "flex flex-1 flex-col items-center gap-1 rounded-md py-1 text-primary"
                    } else {
                        "flex flex-1 flex-col items-center gap-1 rounded-md py-1 text-text-secondary"
                    })
                >
                    components::users(extra: "h-5 w-5")
                    <span class="font-body text-[11px]">(label_people.clone())</span>
                </a>
            }
            <a
                href="/settings"
                class=(if settings_active {
                    "flex flex-1 flex-col items-center gap-1 rounded-md py-1 text-primary"
                } else {
                    "flex flex-1 flex-col items-center gap-1 rounded-md py-1 text-text-secondary"
                })
            >
                components::more_horizontal(extra: "h-5 w-5")
                <span class="font-body text-[11px]">(label_more.clone())</span>
            </a>
        </nav>

        <script>(back_script)</script>
        }
    })
}

use auth::{
    AuthService, GeneratePasswordCommand, InviteUsersCommand, ListUsersCommand, Permission, Role,
    UpdateUserCommand, UserId, UserStatus,
};
use topcoat::{
    Result,
    context::{Cx, app_context},
    router::page,
    runtime::{Event, Signal, procedure, shard, signal},
    view::{View, component, view},
};

use crate::{
    components,
    i18n::{auth_error, t, t_args},
    session::require_permission,
};

fn role_label(cx: &Cx, role: Role) -> String {
    match role {
        Role::Admin => t(cx, "role-admin"),
        Role::Teacher => t(cx, "role-teacher"),
        Role::Student => t(cx, "role-student"),
    }
}

fn status_label(cx: &Cx, status: UserStatus) -> String {
    match status {
        UserStatus::Active => t(cx, "status-active"),
        UserStatus::Pending => t(cx, "status-pending"),
    }
}

fn status_badge_class(status: UserStatus) -> &'static str {
    match status {
        UserStatus::Active => {
            "inline-flex rounded-full bg-primary-soft px-2.5 py-0.5 font-body text-xs font-medium text-primary"
        }
        UserStatus::Pending => {
            "inline-flex rounded-full bg-[#F3E0C8] px-2.5 py-0.5 font-body text-xs font-medium text-[#8A5A2B]"
        }
    }
}

fn parse_full_name(name: &str) -> (Option<String>, Option<String>) {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return (None, None);
    }
    let mut parts = trimmed.split_whitespace();
    let last = parts.next().map(str::to_owned);
    let first = {
        let rest: Vec<_> = parts.collect();
        if rest.is_empty() {
            None
        } else {
            Some(rest.join(" "))
        }
    };
    (first, last)
}

fn filter_chip(active: bool) -> &'static str {
    if active {
        "rounded-full bg-primary px-3.5 py-1.5 font-body text-sm font-medium text-text-inverse"
    } else {
        "rounded-full bg-input px-3.5 py-1.5 font-body text-sm font-medium text-text-secondary hover:bg-border"
    }
}

#[component]
async fn edit_user_button(
    user_id: String,
    name: String,
    email: String,
    role: String,
    status: String,
    edit_id: Signal<String>,
    edit_name: Signal<String>,
    edit_email: Signal<String>,
    edit_role: Signal<String>,
    edit_status: Signal<String>,
    modal: Signal<u8>,
) -> Result<impl View> {
    Ok(view! {
        <button
            type="button"
            class="inline-flex rounded-md p-2 text-text-muted hover:bg-input hover:text-text"
            @click=$(move |e: Event| {
                e.prevent_default();
                edit_id.set(user_id.clone());
                edit_name.set(name.clone());
                edit_email.set(email.clone());
                edit_role.set(role.clone());
                edit_status.set(status.clone());
                modal.set(2u8);
            })
        >
            components::pencil(extra: "h-4 w-4")
        </button>
    })
}

#[procedure]
async fn invite_users_action(cx: &Cx, emails_text: String) -> Result<String> {
    let (actor, _) = require_permission(cx, Permission::ManageUsers).await?;
    let auth: &AuthService = app_context(cx);
    let emails: Vec<String> = emails_text
        .lines()
        .map(str::trim)
        .filter(|line| !line.is_empty())
        .map(str::to_owned)
        .collect();
    let result = auth
        .invite_users(&actor, InviteUsersCommand { emails })
        .await
        .map_err(|error| auth_error(cx, error))?;
    Ok(format!(
        "{} · {}",
        t_args(
            cx,
            "users-invite-created",
            [("count", (result.created.len() as i64).into())]
        ),
        t_args(
            cx,
            "users-invite-skipped",
            [("count", (result.skipped.len() as i64).into())]
        )
    ))
}

#[procedure]
async fn update_user_action(
    cx: &Cx,
    user_id: String,
    name: String,
    role: String,
    status: String,
) -> Result<()> {
    let (actor, _) = require_permission(cx, Permission::ManageUsers).await?;
    let auth: &AuthService = app_context(cx);
    let (first_name, last_name) = parse_full_name(&name);
    let user_id = user_id
        .parse::<UserId>()
        .map_err(|_| topcoat::Error::msg(t(cx, "error-generic")))?;
    let role = role.parse::<Role>().unwrap_or(Role::Student);
    let status = status.parse::<UserStatus>().unwrap_or(UserStatus::Pending);
    auth.update_user(
        &actor,
        UpdateUserCommand {
            user_id,
            first_name,
            last_name,
            role,
            status,
        },
    )
    .await
    .map_err(|error| auth_error(cx, error))?;
    Ok(())
}

#[procedure]
async fn generate_password_action(cx: &Cx, user_id: String) -> Result<String> {
    let (actor, _) = require_permission(cx, Permission::ManageUsers).await?;
    let auth: &AuthService = app_context(cx);
    let user_id = user_id
        .parse::<UserId>()
        .map_err(|_| topcoat::Error::msg(t(cx, "error-generic")))?;
    let result = auth
        .generate_user_password(&actor, GeneratePasswordCommand { user_id })
        .await
        .map_err(|error| auth_error(cx, error))?;
    Ok(result.temporary_password)
}

#[shard]
async fn users_panel(cx: &Cx) -> Result<impl View> {
    let (actor, _) = require_permission(cx, Permission::ManageUsers).await?;
    let auth: &AuthService = app_context(cx);

    let search = signal(cx, String::new);
    // 0 all, 1 active, 2 pending
    let filter = signal(cx, || 0u8);
    // 0 none, 1 invite, 2 edit, 3 password
    let modal = signal(cx, || 0u8);
    let invite_emails = signal(cx, String::new);
    let edit_id = signal(cx, String::new);
    let edit_name = signal(cx, String::new);
    let edit_email = signal(cx, String::new);
    let edit_role = signal(cx, || "student".to_owned());
    let edit_status = signal(cx, || "pending".to_owned());
    let new_password = signal(cx, String::new);
    let flash = signal(cx, String::new);
    let version = signal(cx, || 0u32);

    let _ = version.get();

    let status_filter = match filter.get() {
        1 => Some(UserStatus::Active),
        2 => Some(UserStatus::Pending),
        _ => None,
    };
    let query = {
        let q = search.get();
        let trimmed = q.trim();
        if trimmed.is_empty() {
            None
        } else {
            Some(trimmed.to_owned())
        }
    };

    let users = auth
        .list_users(
            &actor,
            ListUsersCommand {
                query,
                status: status_filter,
            },
        )
        .await
        .map_err(|error| auth_error(cx, error))?;

    let title = t(cx, "users-title");
    let subtitle = t(cx, "users-subtitle");
    let invite_btn = t(cx, "users-invite");
    let search_ph = t(cx, "users-search-placeholder");
    let filter_all = t(cx, "users-filter-all");
    let filter_active = t(cx, "users-filter-active");
    let filter_pending = t(cx, "users-filter-pending");
    let col_name = t(cx, "users-col-name");
    let col_email = t(cx, "users-col-email");
    let col_role = t(cx, "users-col-role");
    let col_status = t(cx, "users-col-status");
    let invite_title = t(cx, "users-invite-title");
    let invite_sub = t(cx, "users-invite-sub");
    let invite_hint = t(cx, "users-invite-hint");
    let cancel = t(cx, "action-cancel");
    let edit_title = t(cx, "users-edit-title");
    let edit_sub = t(cx, "users-edit-sub");
    let label_name = t(cx, "field-name");
    let label_email = t(cx, "field-email");
    let label_role = t(cx, "field-role");
    let label_status = t(cx, "field-status");
    let pass_title = t(cx, "users-password-section");
    let pass_hint = t(cx, "users-password-hint");
    let gen_pass = t(cx, "users-generate-password");
    let save = t(cx, "action-save");
    let pwd_title = t(cx, "users-new-password-title");
    let pwd_sub = t(cx, "users-new-password-sub");
    let done = t(cx, "action-done");
    let copy_label = t(cx, "action-copy");
    let role_admin = t(cx, "role-admin");
    let role_teacher = t(cx, "role-teacher");
    let role_student = t(cx, "role-student");
    let status_active = t(cx, "status-active");
    let status_pending = t(cx, "status-pending");

    let email_count = invite_emails
        .get()
        .lines()
        .map(str::trim)
        .filter(|l| !l.is_empty())
        .count();
    let invite_submit = t_args(
        cx,
        "users-invite-submit",
        [("count", (email_count as i64).into())],
    );
    let current_filter = filter.get();
    let current_modal = modal.get();

    Ok(view! {
        <section class="flex h-full min-h-[calc(100vh-2rem)] flex-col gap-6 rounded-xl bg-surface p-5 shadow-[0_4px_24px_rgba(27,58,40,0.06)] md:p-8">
            <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                <div class="flex flex-col gap-1">
                    <h1 class="font-heading text-3xl font-semibold text-text">(title)</h1>
                    <p class="font-body text-sm text-text-secondary">(subtitle)</p>
                </div>
                <button
                    type="button"
                    class="inline-flex items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-text-inverse hover:bg-inverse"
                    @click=$(move |e: Event| { e.prevent_default(); modal.set(1u8); })
                >
                    components::plus(extra: "h-4 w-4 text-text-inverse")
                    <span>(invite_btn)</span>
                </button>
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
                        @click=$(move |e: Event| { e.prevent_default(); filter.set(2u8); })>(filter_pending)</button>
                </div>
            </div>

            if !flash.get().is_empty() {
                <p class="font-body text-sm text-text-secondary">$(flash.get())</p>
            }

            <div class="hidden overflow-hidden rounded-lg border border-border md:block">
                <table class="w-full text-left">
                    <thead class="bg-input/60 font-body text-xs font-medium uppercase tracking-wide text-text-muted">
                        <tr>
                            <th class="px-4 py-3">(col_name)</th>
                            <th class="px-4 py-3">(col_email)</th>
                            <th class="px-4 py-3">(col_role)</th>
                            <th class="px-4 py-3">(col_status)</th>
                            <th class="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        for user in users.clone() {
                            <tr class="border-t border-border">
                                <td class="px-4 py-3 font-body text-sm font-medium text-text">(user.display_name())</td>
                                <td class="px-4 py-3 font-body text-sm text-text-secondary">(user.login.clone())</td>
                                <td class="px-4 py-3 font-body text-sm text-text">(role_label(cx, user.role))</td>
                                <td class="px-4 py-3">
                                    <span class=(status_badge_class(user.status))>(status_label(cx, user.status))</span>
                                </td>
                                <td class="px-4 py-3 text-right">
                                    edit_user_button(
                                        user_id: user.id.to_string(),
                                        name: user.display_name(),
                                        email: user.login.clone(),
                                        role: user.role.as_str().to_owned(),
                                        status: user.status.as_str().to_owned(),
                                        edit_id: edit_id.clone(),
                                        edit_name: edit_name.clone(),
                                        edit_email: edit_email.clone(),
                                        edit_role: edit_role.clone(),
                                        edit_status: edit_status.clone(),
                                        modal: modal.clone(),
                                    )
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>

            <div class="flex flex-col gap-3 md:hidden">
                for user in users.clone() {
                    <article class="rounded-lg border border-border bg-bg/40 p-4">
                        <div class="flex items-start justify-between gap-3">
                            <div class="min-w-0">
                                <p class="truncate font-body text-sm font-semibold text-text">(user.display_name())</p>
                                <p class="truncate font-body text-xs text-text-secondary">(user.login.clone())</p>
                            </div>
                            edit_user_button(
                                user_id: user.id.to_string(),
                                name: user.display_name(),
                                email: user.login.clone(),
                                role: user.role.as_str().to_owned(),
                                status: user.status.as_str().to_owned(),
                                edit_id: edit_id.clone(),
                                edit_name: edit_name.clone(),
                                edit_email: edit_email.clone(),
                                edit_role: edit_role.clone(),
                                edit_status: edit_status.clone(),
                                modal: modal.clone(),
                            )
                        </div>
                        <div class="mt-3 flex flex-wrap gap-2">
                            <span class="inline-flex rounded-full bg-input px-2.5 py-0.5 font-body text-xs font-medium text-text-secondary">
                                (role_label(cx, user.role))
                            </span>
                            <span class=(status_badge_class(user.status))>(status_label(cx, user.status))</span>
                        </div>
                    </article>
                }
            </div>

            if current_modal == 1 {
                <div class="fixed inset-0 z-50 flex items-center justify-center bg-[#1B3A28]/40 p-4">
                    <div class="w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
                        <div class="mb-4 flex items-start justify-between gap-4">
                            <div>
                                <h2 class="font-heading text-xl font-semibold text-text">(invite_title)</h2>
                                <p class="mt-1 font-body text-sm text-text-secondary">(invite_sub)</p>
                            </div>
                            <button type="button" class="rounded-md p-1 text-text-secondary hover:bg-input"
                                @click=$(move |e: Event| { e.prevent_default(); modal.set(0u8); })>
                                components::x(extra: "")
                            </button>
                        </div>
                        <textarea
                            rows="5"
                            :value=$(invite_emails.get())
                            @input=$(|e: Event| invite_emails.set(e.target.value))
                            class="w-full rounded-md border-0 bg-input p-3 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                        ></textarea>
                        <p class="mt-2 font-body text-xs text-text-muted">(invite_hint)</p>
                        <div class="mt-5 flex justify-end gap-2">
                            <button type="button" class="rounded-md bg-input px-4 py-2.5 font-body text-sm font-medium text-text hover:bg-border"
                                @click=$(move |e: Event| { e.prevent_default(); modal.set(0u8); })>(cancel.clone())</button>
                            <button type="button" class="rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-text-inverse hover:bg-inverse"
                                @click=$(async move |e: Event| {
                                    e.prevent_default();
                                    let msg = invite_users_action(invite_emails.get()).await;
                                    invite_emails.set("".to_owned());
                                    modal.set(0u8);
                                    flash.set(msg);
                                    version.increment();
                                })>(invite_submit)</button>
                        </div>
                    </div>
                </div>
            }

            if current_modal == 2 {
                <div class="fixed inset-0 z-50 flex items-center justify-center bg-[#1B3A28]/40 p-4">
                    <div class="w-full max-w-lg rounded-xl bg-surface p-6 shadow-xl">
                        <div class="mb-4 flex items-start justify-between gap-4">
                            <div>
                                <h2 class="font-heading text-xl font-semibold text-text">(edit_title)</h2>
                                <p class="mt-1 font-body text-sm text-text-secondary">(edit_sub)</p>
                            </div>
                            <button type="button" class="rounded-md p-1 text-text-secondary hover:bg-input"
                                @click=$(move |e: Event| { e.prevent_default(); modal.set(0u8); })>
                                components::x(extra: "")
                            </button>
                        </div>
                        <div class="flex flex-col gap-3">
                            <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
                                (label_name)
                                <input type="text" :value=$(edit_name.get()) @input=$(|e: Event| edit_name.set(e.target.value))
                                    class="h-11 rounded-md border-0 bg-input px-3 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30" />
                            </label>
                            <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
                                (label_email)
                                <div class="relative">
                                    <input type="email" readonly="" :value=$(edit_email.get())
                                        class="h-11 w-full rounded-md border-0 bg-input py-2 pr-10 pl-3 font-body text-sm text-text-muted" />
                                    <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-muted">
                                        components::lock(extra: "h-4 w-4")
                                    </span>
                                </div>
                            </label>
                            <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
                                (label_role)
                                <select :value=$(edit_role.get()) @change=$(|e: Event| edit_role.set(e.target.value))
                                    class="h-11 rounded-md border-0 bg-input px-3 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30">
                                    <option value="admin">(role_admin)</option>
                                    <option value="teacher">(role_teacher)</option>
                                    <option value="student">(role_student)</option>
                                </select>
                            </label>
                            <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
                                (label_status)
                                <select :value=$(edit_status.get()) @change=$(|e: Event| edit_status.set(e.target.value))
                                    class="h-11 rounded-md border-0 bg-input px-3 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30">
                                    <option value="active">(status_active)</option>
                                    <option value="pending">(status_pending)</option>
                                </select>
                            </label>
                            <div class="rounded-lg bg-input p-4">
                                <p class="font-body text-sm font-semibold text-text">(pass_title)</p>
                                <p class="mt-1 font-body text-xs text-text-muted">(pass_hint)</p>
                                <button type="button"
                                    class="mt-3 inline-flex items-center gap-2 rounded-md bg-surface px-3 py-2 font-body text-sm font-medium text-text hover:bg-border"
                                    @click=$(async move |e: Event| {
                                        e.prevent_default();
                                        let password = generate_password_action(edit_id.get()).await;
                                        new_password.set(password);
                                        modal.set(3u8);
                                    })>
                                    components::key(extra: "h-4 w-4")
                                    <span>(gen_pass)</span>
                                </button>
                            </div>
                        </div>
                        <div class="mt-5 flex justify-end gap-2">
                            <button type="button" class="rounded-md bg-input px-4 py-2.5 font-body text-sm font-medium text-text hover:bg-border"
                                @click=$(move |e: Event| { e.prevent_default(); modal.set(0u8); })>(cancel)</button>
                            <button type="button" class="rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-text-inverse hover:bg-inverse"
                                @click=$(async move |e: Event| {
                                    e.prevent_default();
                                    update_user_action(
                                        edit_id.get(),
                                        edit_name.get(),
                                        edit_role.get(),
                                        edit_status.get(),
                                    ).await;
                                    modal.set(0u8);
                                    version.increment();
                                })>(save)</button>
                        </div>
                    </div>
                </div>
            }

            if current_modal == 3 {
                <div class="fixed inset-0 z-50 flex items-center justify-center bg-[#1B3A28]/40 p-4">
                    <div class="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
                        <h2 class="font-heading text-xl font-semibold text-text">(pwd_title)</h2>
                        <p class="mt-1 font-body text-sm text-text-secondary">(pwd_sub)</p>
                        <div class="mt-4 flex items-center justify-between gap-3 rounded-md bg-inverse px-4 py-3">
                            <code class="font-mono text-sm text-text-inverse">$(new_password.get())</code>
                            <button type="button" class="text-text-inverse" aria-label=(copy_label)
                                @click=$(move |e: Event| {
                                    e.prevent_default();
                                })
                                :data-copy=$(new_password.get())>
                                components::copy(extra: "h-4 w-4 text-text-inverse")
                            </button>
                        </div>
                        <script>"document.querySelectorAll('[data-copy]').forEach(function(b){b.onclick=function(){var t=b.getAttribute('data-copy');if(t&&navigator.clipboard)navigator.clipboard.writeText(t);};});"</script>
                        <div class="mt-5 flex justify-end">
                            <button type="button" class="rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-text-inverse hover:bg-inverse"
                                @click=$(move |e: Event| {
                                    e.prevent_default();
                                    new_password.set("".to_owned());
                                    modal.set(0u8);
                                })>(done)</button>
                        </div>
                    </div>
                </div>
            }
        </section>
    })
}

#[page("/users")]
async fn users_page() -> Result<impl View> {
    Ok(view! {
        users_panel()
    })
}

use auth::{
    AuthService, DeleteUserCommand, GeneratePasswordCommand, InviteUsersCommand, ListUsersCommand,
    Permission, Role, UpdateUserCommand, UserId, UserStatus,
};
use serde::{Deserialize, Serialize};
use topcoat::{
    Result,
    context::{Cx, app_context},
    router::page,
    runtime::{Event, Signal, procedure, shard, signal},
    view::{View, component, view},
};

use crate::{
    components,
    i18n::{auth_error, t, t_args, t_pattern},
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
#[allow(clippy::too_many_arguments)]
async fn user_row_checkbox(
    user_id: String,
    is_self: bool,
    selected: Signal<String>,
) -> Result<impl View> {
    Ok(view! {
        <input
            type="checkbox"
            class="h-[18px] w-[18px] shrink-0 cursor-pointer rounded border-border accent-primary focus:ring-primary/30"
            data-user-id=(user_id.clone())
            :checked=$(raw!(
                "(() => { let s = \"\" + ${selected}.get(); if (s === \"\") return false; return s.split(\",\").indexOf(\"\" + ${user_id}) !== -1; })()",
                selected.get().split(',').any(|x| x.trim() == user_id)
            ))
            :disabled=(is_self)
            @change=$(move |e: Event| {
                let csv = selected.get();
                let id = user_id.clone();
                let checked = e.target.checked;
                selected.set(raw!(
                    "(() => { let s = \"\" + ${selected}.get(); let parts = s === \"\" ? [] : s.split(\",\"); let pid = \"\" + ${id}; let idx = parts.indexOf(pid); if (${checked}) { if (idx === -1) parts.push(pid); } else if (idx !== -1) parts.splice(idx, 1); window.__usersSelected = parts.join(\",\"); if (window.__usersSelectionSync) window.__usersSelectionSync(); return window.__usersSelected; })()",
                    {
                        let mut parts: Vec<String> = if csv.is_empty() {
                            Vec::new()
                        } else {
                            csv.split(',').map(str::to_owned).collect()
                        };
                        if checked {
                            if !parts.contains(&id) {
                                parts.push(id);
                            }
                        } else {
                            parts.retain(|x| *x != id);
                        }
                        parts.join(",")
                    }
                ));
            })
        />
    })
}

#[component]
#[allow(clippy::too_many_arguments)]
async fn user_row_actions(
    user_id: String,
    name: String,
    email: String,
    role: String,
    status: String,
    is_self: bool,
    actions_label: String,
    edit_label: String,
    delete_label: String,
    edit_id: Signal<String>,
    edit_name: Signal<String>,
    edit_email: Signal<String>,
    edit_role: Signal<String>,
    edit_status: Signal<String>,
    delete_ids: Signal<String>,
    modal: Signal<u8>,
    row_menu: Signal<String>,
) -> Result<impl View> {
    let open = row_menu.get() == user_id;
    let toggle_user_id = user_id.clone();
    let edit_user_id = user_id.clone();
    let delete_user_id = user_id.clone();
    Ok(view! {
        <div class="relative inline-flex">
            <button
                type="button"
                class="inline-flex cursor-pointer rounded-md p-2 text-text-muted hover:bg-input hover:text-text"
                aria-label=(actions_label)
                aria-haspopup="menu"
                :aria-expanded=$(raw!(
                    "(() => { return (\"\" + ${row_menu}.get()) === \"\" + ${user_id} ? \"true\" : \"false\"; })()",
                    row_menu.get() == user_id
                ))
                @click=$(move |e: Event| {
                    e.prevent_default();
                    let id = toggle_user_id.clone();
                    row_menu.set(raw!(
                        "(() => { let cur = \"\" + ${row_menu}.get(); let pid = \"\" + ${id}; return cur === pid ? \"\" : pid; })()",
                        if open { "".to_owned() } else { id }
                    ));
                })
            >
                components::more_horizontal(extra: "h-4 w-4")
            </button>
            <button
                type="button"
                class="fixed inset-0 z-40 cursor-default"
                tabindex="-1"
                aria-hidden="true"
                :hidden=$(raw!(
                    "(() => { return (\"\" + ${row_menu}.get()) !== \"\" + ${user_id}; })()",
                    row_menu.get() != user_id
                ))
                @click=$(move |e: Event| {
                    e.prevent_default();
                    row_menu.set("".to_owned());
                })
            ></button>
            <div
                class="absolute top-full right-0 z-50 mt-1 w-[200px] rounded-md border border-border bg-surface py-1.5 shadow-lg"
                :hidden=$(raw!(
                    "(() => { return (\"\" + ${row_menu}.get()) !== \"\" + ${user_id}; })()",
                    row_menu.get() != user_id
                ))
            >
                <button
                    type="button"
                    class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left font-body text-sm text-text hover:bg-input"
                    @click=$(move |e: Event| {
                        e.prevent_default();
                        row_menu.set("".to_owned());
                        edit_id.set(edit_user_id.clone());
                        edit_name.set(name.clone());
                        edit_email.set(email.clone());
                        edit_role.set(role.clone());
                        edit_status.set(status.clone());
                        modal.set(2u8);
                    })
                >
                    components::pencil(extra: "h-4 w-4")
                    <span>(edit_label)</span>
                </button>
                if !is_self {
                    <div class="my-1 h-px bg-border"></div>
                    <button
                        type="button"
                        class="flex w-full cursor-pointer items-center gap-2 px-3 py-2 text-left font-body text-sm text-danger hover:bg-input"
                        @click=$(move |e: Event| {
                            e.prevent_default();
                            row_menu.set("".to_owned());
                            delete_ids.set(delete_user_id.clone());
                            modal.set(5u8);
                        })
                    >
                        components::trash(extra: "h-4 w-4")
                        <span>(delete_label)</span>
                    </button>
                }
            </div>
        </div>
    })
}

#[derive(serde::Serialize, Deserialize)]
struct InvitedAccount {
    login: String,
    password: String,
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
    let accounts: Vec<InvitedAccount> = result
        .created
        .into_iter()
        .map(|user| InvitedAccount {
            login: user.login,
            password: user.temporary_password,
        })
        .collect();
    if accounts.is_empty() {
        return Ok(String::new());
    }
    Ok(serde_json::to_string(&accounts).unwrap_or_default())
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

#[derive(Debug, Serialize, Deserialize)]
struct DeleteOutcome {
    deleted: u32,
    skipped: u32,
}

#[procedure]
async fn delete_users_action(cx: &Cx, selected_csv: String) -> Result<String> {
    let (actor, _) = require_permission(cx, Permission::ManageUsers).await?;
    let auth: &AuthService = app_context(cx);

    let mut deleted = 0u32;
    let mut skipped = 0u32;
    for id_text in selected_csv.split(',') {
        let id_text = id_text.trim();
        if id_text.is_empty() {
            continue;
        }
        let Ok(user_id) = id_text.parse::<UserId>() else {
            skipped += 1;
            continue;
        };
        if user_id == actor.user_id {
            skipped += 1;
            continue;
        }
        match auth
            .delete_user(&actor, DeleteUserCommand { user_id })
            .await
        {
            Ok(()) => deleted += 1,
            Err(_) => skipped += 1,
        }
    }

    Ok(serde_json::to_string(&DeleteOutcome { deleted, skipped }).unwrap_or_default())
}

#[shard]
async fn users_panel(cx: &Cx) -> Result<impl View> {
    let (actor, _) = require_permission(cx, Permission::ManageUsers).await?;
    let auth: &AuthService = app_context(cx);

    let search = signal(cx, String::new);
    // 0 all, 1 active, 2 pending
    let filter = signal(cx, || 0u8);
    // 0 none, 1 invite, 2 edit, 3 password, 4 accounts created, 5 delete confirm
    let modal = signal(cx, || 0u8);
    let invite_emails = signal(cx, String::new);
    let created_accounts = signal(cx, String::new);
    let edit_id = signal(cx, String::new);
    let edit_name = signal(cx, String::new);
    let edit_email = signal(cx, String::new);
    let edit_role = signal(cx, || "student".to_owned());
    let edit_status = signal(cx, || "pending".to_owned());
    let new_password = signal(cx, String::new);
    let version = signal(cx, || 0u32);
    // Comma-separated ids of selected rows (checked checkboxes); self is
    // never selectable. CSV because the topcoat client vocabulary has no
    // array mutations for Signal<Vec<T>>.
    let selected = signal(cx, String::new);
    // Id of the row with an open actions menu; empty when closed.
    let row_menu = signal(cx, String::new);
    // Comma-separated ids awaiting delete confirmation (single or bulk).
    let delete_ids = signal(cx, String::new);

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

    // Selection survives re-renders through the client signal, but is
    // effectively scoped to the current view: only ids present in the current
    // (filtered/searched) list are actionable.
    let listed_ids: Vec<String> = users.iter().map(|user| user.id.to_string()).collect();
    let selectable_ids: Vec<String> = users
        .iter()
        .filter(|user| user.id != actor.user_id)
        .map(|user| user.id.to_string())
        .collect();
    let selectable_csv = selectable_ids.join(",");
    let selected_now: Vec<String> = selected
        .get()
        .split(',')
        .map(str::trim)
        .filter(|id| !id.is_empty() && listed_ids.iter().any(|x| x == id))
        .map(str::to_owned)
        .collect();
    let selected_count = selected_now.len() as i64;

    let current_modal = modal.get();
    let current_delete_ids: Vec<String> = delete_ids
        .get()
        .split(',')
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .collect();
    let delete_total = current_delete_ids.len() as i64;
    let shown_delete_users: Vec<(String, String)> = users
        .iter()
        .filter(|user| current_delete_ids.contains(&user.id.to_string()))
        .map(|user| (user.display_name(), user.login.clone()))
        .take(3)
        .collect();

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
    let created_title = t(cx, "users-created-title");
    let created_sub = t(cx, "users-created-sub");
    let created_hint = t(cx, "users-created-hint");
    let created_badge = t(cx, "users-created-badge");
    let created_password_label = t(cx, "users-created-password-label");
    let copy_all_label = t(cx, "action-copy-all");
    let select_all_label = t(cx, "users-select-all");
    let actions_label = t(cx, "users-row-actions");
    let edit_action_label = t(cx, "users-action-edit");
    let delete_action_label = t(cx, "users-action-delete");
    // Raw pattern (placeholders intact) for the live counter in raw!; the
    // expr fallback below renders it server-side with the current count.
    let selected_count_pattern = t_pattern(cx, "users-selected-count");
    let clear_label = t(cx, "users-clear-selection");
    let delete_selected_label = t(cx, "users-delete-selected");
    let delete_title = if delete_total == 1 {
        t(cx, "users-delete-title")
    } else {
        t(cx, "users-delete-title-plural")
    };
    let delete_sub = t(cx, "users-delete-sub");
    let delete_more_label = t_args(
        cx,
        "users-delete-more",
        [(
            "count",
            (delete_total - shown_delete_users.len() as i64).into(),
        )],
    );
    let delete_warning = t(cx, "users-delete-warning");
    let action_delete_label = t(cx, "action-delete");
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
    let created: Vec<InvitedAccount> =
        serde_json::from_str(&created_accounts.get()).unwrap_or_default();
    let copy_all = created
        .iter()
        .map(|account| format!("{} — {}", account.login, account.password))
        .collect::<Vec<_>>()
        .join("\n");
    // JS-side template for the live selection counter (interpolated into the
    // :text binding below); fallback paths render it server-side per render.
    let count_tpl = selected_count_pattern.clone();

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
                        @input=$(|e: Event| {
                            search.set(e.target.value);
                            selected.set(raw!(
                                "(() => { window.__usersSelected = \"\"; if (window.__usersSelectionSync) window.__usersSelectionSync(); return \"\"; })()",
                                "".to_owned()
                            ));
                        })
                        class="h-11 w-full rounded-md border-0 bg-input py-2.5 pr-3 pl-10 font-body text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                </label>
                <div class="flex flex-wrap gap-2">
                    <button type="button" class=(filter_chip(current_filter == 0))
                        @click=$(move |e: Event| { e.prevent_default(); filter.set(0u8); selected.set(raw!("(() => { window.__usersSelected = \"\"; if (window.__usersSelectionSync) window.__usersSelectionSync(); return \"\"; })()", "".to_owned())); })>(filter_all)</button>
                    <button type="button" class=(filter_chip(current_filter == 1))
                        @click=$(move |e: Event| { e.prevent_default(); filter.set(1u8); selected.set(raw!("(() => { window.__usersSelected = \"\"; if (window.__usersSelectionSync) window.__usersSelectionSync(); return \"\"; })()", "".to_owned())); })>(filter_active)</button>
                    <button type="button" class=(filter_chip(current_filter == 2))
                        @click=$(move |e: Event| { e.prevent_default(); filter.set(2u8); selected.set(raw!("(() => { window.__usersSelected = \"\"; if (window.__usersSelectionSync) window.__usersSelectionSync(); return \"\"; })()", "".to_owned())); })>(filter_pending)</button>
                </div>
            </div>

            <div class="hidden rounded-lg border border-border md:block">
                <table class="w-full text-left">
                    <thead class="bg-input/60 font-body text-xs font-medium uppercase tracking-wide text-text-muted">
                        <tr>
                            <th class="px-4 py-3">
                                <div class="flex h-full items-center">
                                    <input
                                        id="users-select-all"
                                        type="checkbox"
                                        class="h-[18px] w-[18px] cursor-pointer rounded border-border accent-primary focus:ring-primary/30"
                                        aria-label=(select_all_label)
                                        data-selectable=(selectable_csv.clone())
                                        :checked=$(raw!(
                                            "(() => { let s = \"\" + ${selected}.get(); let ids = s === \"\" ? [] : s.split(\",\").filter(x => x !== \"\"); let sel = (\"\" + ${selectable_csv}).split(\",\").filter(x => x !== \"\"); return sel.length > 0 && sel.every(x => ids.indexOf(x) !== -1); })()",
                                            {
                                                let csv = selected.get();
                                                let ids: Vec<&str> = if csv.is_empty() {
                                                    Vec::new()
                                                } else {
                                                    csv.split(',').filter(|x| !x.is_empty()).collect()
                                                };
                                                !selectable_ids.is_empty()
                                                    && selectable_ids.iter().all(|x| ids.contains(&x.as_str()))
                                            }
                                        ))
                                        :disabled=(selectable_ids.is_empty())
                                        @change=$(move |e: Event| {
                                            let checked = e.target.checked;
                                            let all_csv = selectable_csv.clone();
                                            if checked {
                                                selected.set(raw!(
                                                    "(() => { window.__usersSelected = \"\" + ${all_csv}; if (window.__usersSelectionSync) window.__usersSelectionSync(); return window.__usersSelected; })()",
                                                    all_csv
                                                ));
                                            } else {
                                                selected.set(raw!(
                                                    "(() => { window.__usersSelected = \"\"; if (window.__usersSelectionSync) window.__usersSelectionSync(); return \"\"; })()",
                                                    "".to_owned()
                                                ));
                                            }
                                        })
                                    />
                                </div>
                            </th>
                            <th class="px-4 py-3">(col_name)</th>
                            <th class="px-4 py-3">(col_email)</th>
                            <th class="px-4 py-3">(col_role)</th>
                            <th class="px-4 py-3">(col_status)</th>
                            <th class="px-4 py-3"></th>
                        </tr>
                    </thead>
                    <tbody>
                        for user in users.clone() {
                            let user_id = user.id.to_string();
                            let is_self = user.id == actor.user_id;
                            <tr class="border-t border-border">
                                <td class="px-4 py-3">
                                    <div class="flex h-full items-center">
                                        user_row_checkbox(
                                            user_id: user_id.clone(),
                                            is_self: is_self,
                                            selected: selected.clone(),
                                        )
                                    </div>
                                </td>
                                <td class="px-4 py-3 font-body text-sm font-medium text-text">(user.display_name())</td>
                                <td class="px-4 py-3 font-body text-sm text-text-secondary">(user.login.clone())</td>
                                <td class="px-4 py-3 font-body text-sm text-text">(role_label(cx, user.role))</td>
                                <td class="px-4 py-3">
                                    <span class=(status_badge_class(user.status))>(status_label(cx, user.status))</span>
                                </td>
                                <td class="relative px-4 py-3 text-right">
                                    user_row_actions(
                                        user_id: user_id.clone(),
                                        name: user.display_name(),
                                        email: user.login.clone(),
                                        role: user.role.as_str().to_owned(),
                                        status: user.status.as_str().to_owned(),
                                        is_self: is_self,
                                        actions_label: actions_label.clone(),
                                        edit_label: edit_action_label.clone(),
                                        delete_label: delete_action_label.clone(),
                                        edit_id: edit_id.clone(),
                                        edit_name: edit_name.clone(),
                                        edit_email: edit_email.clone(),
                                        edit_role: edit_role.clone(),
                                        edit_status: edit_status.clone(),
                                        delete_ids: delete_ids.clone(),
                                        modal: modal.clone(),
                                        row_menu: row_menu.clone(),
                                    )
                                </td>
                            </tr>
                        }
                    </tbody>
                </table>
            </div>

            <div class="flex flex-col gap-3 md:hidden">
                for user in users.clone() {
                    let user_id = user.id.to_string();
                    let is_self = user.id == actor.user_id;
                    <article class="rounded-lg border border-border bg-bg/40 p-4">
                        <div class="flex items-start justify-between gap-3">
                            <label class="flex min-w-0 flex-1 items-start gap-3">
                                user_row_checkbox(
                                    user_id: user_id.clone(),
                                    is_self: is_self,
                                    selected: selected.clone(),
                                )
                                <span class="min-w-0">
                                    <span class="block truncate font-body text-sm font-semibold text-text">(user.display_name())</span>
                                    <span class="block truncate font-body text-xs text-text-secondary">(user.login.clone())</span>
                                </span>
                            </label>
                            user_row_actions(
                                user_id: user_id.clone(),
                                name: user.display_name(),
                                email: user.login.clone(),
                                role: user.role.as_str().to_owned(),
                                status: user.status.as_str().to_owned(),
                                is_self: is_self,
                                actions_label: actions_label.clone(),
                                edit_label: edit_action_label.clone(),
                                delete_label: delete_action_label.clone(),
                                edit_id: edit_id.clone(),
                                edit_name: edit_name.clone(),
                                edit_email: edit_email.clone(),
                                edit_role: edit_role.clone(),
                                edit_status: edit_status.clone(),
                                delete_ids: delete_ids.clone(),
                                modal: modal.clone(),
                                row_menu: row_menu.clone(),
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

            <div
                id="users-bulk-bar"
                class="sticky bottom-0 z-30 -mx-5 -mb-5 rounded-b-xl bg-[#F0EDE6] px-4 py-3 md:-mx-8 md:-mb-8 md:px-6"
                :hidden=$(raw!(
                    "(() => { let s = \"\" + ${selected}.get(); return s.split(\",\").filter(x => x !== \"\").length === 0; })()",
                    selected
                        .get()
                        .split(',')
                        .map(str::trim)
                        .filter(|id| !id.is_empty())
                        .count()
                        == 0
                ))
            >
                <div class="flex items-center justify-between gap-3">
                    <div class="flex items-center gap-2">
                        <span
                            id="users-bulk-count"
                            class="font-body text-[13px] font-semibold text-text"
                            data-count-tpl=(count_tpl.clone())
                        >
                            $(raw!(
                                "(() => { let n = (\"\" + ${selected}.get()).split(\",\").filter(x => x !== \"\").length; let tpl = \"\" + ${count_tpl}; return tpl.split(\"[[COUNT]]\").join(String(n)); })()",
                                {
                                    let csv = selected.get();
                                    let n = csv.split(',').filter(|id| !id.trim().is_empty()).count() as i64;
                                    selected_count_pattern.replace("[[COUNT]]", &n.to_string())
                                }
                            ))
                        </span>
                        <button type="button" class="cursor-pointer font-body text-[13px] font-medium text-text-secondary hover:text-text"
                            @click=$(move |e: Event| {
                                e.prevent_default();
                                selected.set(raw!(
                                    "(() => { window.__usersSelected = \"\"; if (window.__usersSelectionSync) window.__usersSelectionSync(); return \"\"; })()",
                                    "".to_owned()
                                ));
                            })>
                            (clear_label)
                        </button>
                    </div>
                    <button type="button" class="inline-flex cursor-pointer items-center gap-1.5 rounded-sm bg-danger px-3.5 py-2 font-body text-[13px] font-semibold text-text-inverse hover:opacity-90"
                        @click=$(move |e: Event| {
                            e.prevent_default();
                            let current_csv = selected.get();
                            delete_ids.set(raw!(
                                "(() => { return window.__usersSelected === undefined ? (\"\" + ${current_csv}) : window.__usersSelected; })()",
                                current_csv
                            ));
                            modal.set(5u8);
                        })>
                        components::trash(extra: "h-4 w-4 text-text-inverse")
                        <span>(delete_selected_label)</span>
                    </button>
                </div>
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
                                    let json = invite_users_action(invite_emails.get()).await;
                                    invite_emails.set("".to_owned());
                                    created_accounts.set(json.clone());
                                    modal.set(if json.is_empty() { 0u8 } else { 4u8 });
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
                                @click=$(move |e: Event| { e.prevent_default(); modal.set(0u8); })>(cancel.clone())</button>
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
                            <button type="button" title=(copy_label.clone()) aria-label=(copy_label.clone())
                                class="rounded-md p-1.5 text-text-inverse transition-colors hover:bg-white/10"
                                :data-copy=$(new_password.get())>
                                components::copy(extra: "h-4 w-4 text-text-inverse")
                            </button>
                        </div>
                        <div class="mt-5 flex justify-end">
                            <button type="button" class="rounded-md bg-primary px-4 py-2.5 font-body text-sm font-semibold text-text-inverse hover:bg-inverse"
                                @click=$(move |e: Event| {
                                    e.prevent_default();
                                    new_password.set("".to_owned());
                                    modal.set(0u8);
                                })>(done.clone())</button>
                        </div>
                    </div>
                </div>
            }

            if current_modal == 4 {
                <div class="fixed inset-0 z-50 flex items-center justify-center bg-[#1B3A28]/40 p-4">
                    <div class="flex max-h-[90vh] w-full max-w-xl flex-col gap-5 overflow-y-auto rounded-xl bg-surface p-7 shadow-xl">
                        <div class="flex items-start justify-between gap-4">
                            <div class="flex flex-col gap-1">
                                <h2 class="font-heading text-[22px] leading-tight font-semibold text-text">(created_title)</h2>
                                <p class="font-body text-[13px] text-text-secondary">(created_sub)</p>
                            </div>
                            <button type="button" class="rounded-md p-1 text-text-secondary hover:bg-input"
                                @click=$(move |e: Event| { e.prevent_default(); modal.set(0u8); })>
                                components::x(extra: "h-5 w-5")
                            </button>
                        </div>
                        for account in created {
                            <div class="flex flex-col gap-3 rounded-md bg-input p-4">
                                <div class="flex items-center justify-between gap-3">
                                    <span class="font-body text-sm font-semibold text-text">(account.login)</span>
                                    <span class="inline-flex rounded-sm bg-primary-soft px-2.5 py-1 font-body text-[11px] font-semibold text-text">(created_badge.clone())</span>
                                </div>
                                <div class="flex items-center justify-between gap-3">
                                    <span class="flex items-center gap-2">
                                        <span class="font-body text-[13px] text-text-muted">(created_password_label.clone())</span>
                                        <code class="font-mono text-sm font-medium text-text">(account.password.clone())</code>
                                    </span>
                                    <button type="button"
                                        class="inline-flex items-center gap-1.5 rounded-sm border border-border px-2.5 py-1.5 font-body text-xs font-medium text-text-secondary hover:bg-border/40"
                                        :data-copy=(account.password.clone())>
                                        components::copy(extra: "h-3.5 w-3.5")
                                        <span>(copy_label.clone())</span>
                                    </button>
                                </div>
                            </div>
                        }
                        <p class="font-body text-xs text-text-muted">(created_hint)</p>
                        <div class="flex items-center justify-between gap-3">
                            <button type="button"
                                class="inline-flex items-center gap-2 rounded-md border border-border px-4 py-3 font-body text-sm font-medium text-text-secondary hover:bg-input"
                                :data-copy=(copy_all)>
                                components::copy(extra: "h-4 w-4")
                                <span>(copy_all_label)</span>
                            </button>
                            <button type="button"
                                class="rounded-md bg-primary px-6 py-3 font-body text-sm font-semibold text-text-inverse hover:bg-inverse"
                                @click=$(move |e: Event| {
                                    e.prevent_default();
                                    created_accounts.set("".to_owned());
                                    modal.set(0u8);
                                })>(done)</button>
                        </div>
                    </div>
                </div>
            }

            if current_modal == 5 {
                <div class="fixed inset-0 z-50 flex items-center justify-center bg-[#1B3A28]/40 p-4">
                    <div class="w-full max-w-md rounded-xl bg-surface p-6 shadow-xl">
                        <div class="flex items-start justify-between gap-4">
                            <div>
                                <h2 class="font-heading text-xl font-semibold text-text">(delete_title)</h2>
                                <p class="mt-1 font-body text-sm text-text-secondary">(delete_sub)</p>
                            </div>
                            <button type="button" class="rounded-md p-1 text-text-secondary hover:bg-input"
                                @click=$(move |e: Event| {
                                    e.prevent_default();
                                    delete_ids.set("".to_owned());
                                    modal.set(0u8);
                                })>
                                components::x(extra: "h-5 w-5")
                            </button>
                        </div>
                        <div class="mt-4 flex flex-col gap-3 rounded-md bg-input p-4">
                            for (name, email) in shown_delete_users.clone() {
                                <div class="flex flex-col gap-0.5">
                                    <p class="font-body text-sm font-semibold text-text">(name)</p>
                                    <p class="font-body text-xs text-text-secondary">(email)</p>
                                </div>
                            }
                            if selected_count > shown_delete_users.len() as i64 {
                                <p class="mt-2 font-body text-xs font-medium text-text-muted">(delete_more_label)</p>
                            }
                        </div>
                        <p class="mt-3 flex items-start gap-2 font-body text-xs text-text-muted">
                            components::trash(extra: "mt-0.5 h-4 w-4 shrink-0 text-danger")
                            <span>(delete_warning)</span>
                        </p>
                        <div class="mt-5 flex justify-end gap-2">
                            <button type="button" class="rounded-md bg-input px-4 py-2.5 font-body text-sm font-medium text-text hover:bg-border"
                                @click=$(move |e: Event| {
                                    e.prevent_default();
                                    delete_ids.set("".to_owned());
                                    modal.set(0u8);
                                })>(cancel.clone())</button>
                            <button type="button" class="inline-flex cursor-pointer items-center gap-2 rounded-md bg-danger px-4 py-2.5 font-body text-sm font-semibold text-text-inverse hover:opacity-90"
                                @click=$(async move |e: Event| {
                                    e.prevent_default();
                                    delete_users_action(delete_ids.get()).await;
                                    delete_ids.set("".to_owned());
                                    selected.set(raw!("(() => { window.__usersSelected = \"\"; if (window.__usersSelectionSync) window.__usersSelectionSync(); return \"\"; })()", "".to_owned()));
                                    modal.set(0u8);
                                    version.increment();
                                })>
                                components::trash(extra: "h-4 w-4 text-text-inverse")
                                <span>(action_delete_label)</span>
                            </button>
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

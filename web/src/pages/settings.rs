use auth::{AuthService, ChangePasswordCommand, UpdateOwnProfileCommand};
use topcoat::{
    Result,
    context::{Cx, app_context},
    router::page,
    runtime::{Event, procedure, shard, signal},
    view::{View, view},
};

use crate::{
    components,
    i18n::{auth_error, t},
    session::require_onboarded,
};

#[procedure]
async fn save_settings_action(
    cx: &Cx,
    first_name: String,
    last_name: String,
    current_password: String,
    new_password: String,
) -> Result<String> {
    let (actor, _) = require_onboarded(cx).await?;
    let auth: &AuthService = app_context(cx);

    auth.update_own_profile(
        &actor,
        UpdateOwnProfileCommand {
            first_name,
            last_name,
        },
    )
    .await
    .map_err(|error| auth_error(cx, error))?;

    if !current_password.is_empty() || !new_password.is_empty() {
        auth.change_password(
            &actor,
            ChangePasswordCommand {
                current_password,
                new_password,
            },
        )
        .await
        .map_err(|error| auth_error(cx, error))?;
    }

    Ok(t(cx, "settings-saved"))
}

#[shard]
async fn settings_panel(cx: &Cx) -> Result<impl View> {
    let (_actor, user) = require_onboarded(cx).await?;

    let first_name = signal(cx, || user.first_name.clone().unwrap_or_default());
    let last_name = signal(cx, || user.last_name.clone().unwrap_or_default());
    let current_password = signal(cx, String::new);
    let new_password = signal(cx, String::new);
    let message = signal(cx, String::new);

    let title = t(cx, "settings-title");
    let subtitle = t(cx, "settings-subtitle");
    let first_label = t(cx, "field-first-name");
    let last_label = t(cx, "field-last-name");
    let email_label = t(cx, "field-email");
    let pass_section = t(cx, "settings-password-section");
    let current_label = t(cx, "settings-current-password");
    let new_label = t(cx, "settings-new-password");
    let new_placeholder = t(cx, "settings-new-password-placeholder");
    let save = t(cx, "action-save");
    let email = user.login.clone();

    Ok(view! {
        <section class="flex h-full min-h-[calc(100vh-2rem)] flex-col gap-6 rounded-xl bg-surface p-5 shadow-[0_4px_24px_rgba(27,58,40,0.06)] md:max-w-xl md:p-8">
            <div class="flex flex-col gap-1">
                <h1 class="font-heading text-3xl font-semibold text-text">(title)</h1>
                <p class="font-body text-sm text-text-secondary">(subtitle)</p>
            </div>

            if !message.get().is_empty() {
                <p class="rounded-md border border-primary/20 bg-primary-soft/40 px-3 py-2 text-sm text-primary">
                    $(message.get())
                </p>
            }

            <form
                class="flex flex-col gap-4"
                @submit=$(async |e: Event| {
                    e.prevent_default();
                    let msg = save_settings_action(
                        first_name.get(),
                        last_name.get(),
                        current_password.get(),
                        new_password.get(),
                    ).await;
                    current_password.set("".to_owned());
                    new_password.set("".to_owned());
                    message.set(msg);
                })
            >
                <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
                    (first_label)
                    <input
                        type="text"
                        required=""
                        :value=$(first_name.get())
                        @input=$(|e: Event| first_name.set(e.target.value))
                        class="h-12 w-full rounded-md border-0 bg-input px-4 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                </label>
                <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
                    (last_label)
                    <input
                        type="text"
                        required=""
                        :value=$(last_name.get())
                        @input=$(|e: Event| last_name.set(e.target.value))
                        class="h-12 w-full rounded-md border-0 bg-input px-4 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                    />
                </label>
                <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
                    (email_label)
                    <div class="relative">
                        <input
                            type="email"
                            readonly=""
                            value=(email)
                            class="h-12 w-full rounded-md border-0 bg-input py-3 pr-10 pl-4 font-body text-sm text-text-muted"
                        />
                        <span class="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 text-text-muted">
                            components::lock(extra: "h-4 w-4")
                        </span>
                    </div>
                </label>

                <div class="rounded-lg bg-input p-4">
                    <p class="mb-3 font-body text-sm font-semibold text-text">(pass_section)</p>
                    <div class="flex flex-col gap-3">
                        <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
                            (current_label)
                            <input
                                type="password"
                                autocomplete="current-password"
                                :value=$(current_password.get())
                                @input=$(|e: Event| current_password.set(e.target.value))
                                class="h-12 w-full rounded-md border-0 bg-surface px-4 font-body text-sm text-text focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                        </label>
                        <label class="flex flex-col gap-1.5 font-body text-[13px] font-medium text-text">
                            (new_label)
                            <input
                                type="password"
                                autocomplete="new-password"
                                placeholder=(new_placeholder)
                                :value=$(new_password.get())
                                @input=$(|e: Event| new_password.set(e.target.value))
                                class="h-12 w-full rounded-md border-0 bg-surface px-4 font-body text-sm text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary/30"
                            />
                        </label>
                    </div>
                </div>

                <button
                    type="submit"
                    class="mt-2 inline-flex h-12 w-full items-center justify-center rounded-md bg-primary font-body text-[15px] font-semibold text-text-inverse hover:bg-inverse md:w-auto md:px-8"
                >
                    (save)
                </button>
            </form>
        </section>
    })
}

#[page("/settings")]
async fn settings_page() -> Result<impl View> {
    Ok(view! {
        settings_panel()
    })
}

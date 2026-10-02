use crate::{
    i18n::{t, t_args},
    session::{current_user, require_onboarded},
};
use auth::{AuthService, Permission};
use topcoat::{
    Result,
    context::{Cx, app_context},
    router::page,
    view::{View, view},
};

#[page("/")]
async fn home(cx: &Cx) -> Result<impl View> {
    let user = current_user(cx).await?;
    let signed_in = user.is_some();

    if signed_in {
        let _ = require_onboarded(cx).await?;
    }

    let auth: &AuthService = app_context(cx);
    let can_manage_users = user.as_ref().is_some_and(|u| {
        let actor = kernel::Actor::new(u.id, [u.role]);
        auth.permits(&actor, Permission::ManageUsers)
    });

    let welcome = t(cx, "home-welcome");
    let display = user.as_ref().map(|u| u.display_name()).unwrap_or_default();
    let signed_in_as = t_args(cx, "home-signed-in", [("user", display.into())]);
    let manage_users = t(cx, "home-manage-users");
    let log_out = t(cx, "home-log-out");
    let sign_in_prompt = t(cx, "home-sign-in-prompt");
    let log_in = t(cx, "home-log-in");
    let open_settings = t(cx, "home-open-settings");

    Ok(view! {
        <section class="space-y-6 rounded-xl bg-surface p-6 shadow-[0_4px_24px_rgba(27,58,40,0.06)] md:p-8">
            <h1 class="font-heading text-3xl font-semibold tracking-tight text-text">(welcome)</h1>
            if signed_in {
                <div class="space-y-4">
                    <p class="font-body text-text-secondary">(signed_in_as)</p>
                    <div class="flex flex-wrap gap-3">
                        if can_manage_users {
                            <a
                                href="/users"
                                class="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-inverse"
                            >
                                (manage_users)
                            </a>
                        }
                        <a
                            href="/settings"
                            class="inline-flex rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text hover:bg-input"
                        >
                            (open_settings)
                        </a>
                        <form method="post" action="/logout">
                            <button
                                type="submit"
                                class="inline-flex rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text hover:bg-input"
                            >
                                (log_out)
                            </button>
                        </form>
                    </div>
                </div>
            } else {
                <div class="space-y-4">
                    <p class="font-body text-text-secondary">(sign_in_prompt)</p>
                    <a
                        href="/login"
                        class="inline-flex rounded-md bg-primary px-4 py-2 text-sm font-medium text-text-inverse hover:bg-inverse"
                    >
                        (log_in)
                    </a>
                </div>
            }
        </section>
    })
}

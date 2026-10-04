use auth::{AuthService, CompleteOnboardingCommand};
use topcoat::{
    Result,
    context::{Cx, app_context},
    router::{error::see_other, page},
    runtime::{Event, procedure, shard, signal},
    view::{View, view},
};

use crate::{
    components,
    i18n::{auth_error, t},
    logo::{LogoVariant, dino_logo},
    session::require_needs_onboarding,
};

#[procedure]
async fn complete_onboarding_action(cx: &Cx, first_name: String, last_name: String) -> Result<()> {
    let (actor, _) = require_needs_onboarding(cx).await?;
    let auth: &AuthService = app_context(cx);
    auth.complete_onboarding(
        &actor,
        CompleteOnboardingCommand {
            first_name,
            last_name,
        },
    )
    .await
    .map_err(|error| auth_error(cx, error))?;
    Ok(())
}

#[shard]
async fn onboarding_panel(cx: &Cx) -> Result<impl View> {
    let (_actor, user) = require_needs_onboarding(cx).await?;

    let first_name = signal(cx, || user.first_name.clone().unwrap_or_default());
    let last_name = signal(cx, || user.last_name.clone().unwrap_or_default());
    let done = signal(cx, || false);

    let brand = t(cx, "brand-name");
    let title = t(cx, "onboarding-title");
    let subtitle = t(cx, "onboarding-subtitle");
    let email_label = t(cx, "field-email");
    let first_label = t(cx, "field-first-name");
    let last_label = t(cx, "field-last-name");
    let submit = t(cx, "onboarding-continue");
    let email = user.login.clone();

    if done.get() {
        return Err(see_other("/courses").into());
    }

    Ok(view! {
        <div class="flex min-h-screen items-center justify-center bg-bg px-4 py-10">
                <section class="w-full max-w-[440px] rounded-xl bg-surface p-8 shadow-[0_4px_24px_rgba(27,58,40,0.08)]">
                    <div class="mb-6 flex items-center gap-3">
                        dino_logo(size_class: "h-10 w-10 rounded-[12px]", variant: LogoVariant::OnSurface)
                        <span class="font-heading text-lg font-semibold text-text">(brand)</span>
                    </div>
                    <h1 class="font-heading text-[28px] font-semibold text-text">(title)</h1>
                    <p class="mt-2 font-body text-sm text-text-secondary">(subtitle)</p>

                    <form
                        class="mt-6 flex flex-col gap-4"
                        @submit=$(async |e: Event| {
                            e.prevent_default();
                            complete_onboarding_action(first_name.get(), last_name.get()).await;
                            done.set(true);
                        })
                    >
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
                        <button
                            type="submit"
                            class="mt-2 inline-flex h-12 w-full items-center justify-center rounded-md bg-primary font-body text-[15px] font-semibold text-text-inverse hover:bg-inverse"
                        >
                            (submit)
                        </button>
                    </form>
                </section>
            </div>
    })
}

#[page("/onboarding")]
async fn onboarding_page() -> Result<impl View> {
    Ok(view! {
        onboarding_panel()
    })
}

use crate::{
    components::arrow_right,
    i18n::{locale_code, t, t_args},
    logo::{LogoVariant, dino_logo},
    session::{current_user, require_onboarded},
};
use auth::{AuthService, Permission};
use topcoat::{
    Result,
    asset::asset,
    context::{Cx, app_context},
    router::page,
    view::{View, view},
};

const WELCOME_HERO: topcoat::asset::Asset = asset!("assets/welcome-hero.jpg");

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
    let open_settings = t(cx, "home-open-settings");

    let brand_name = t(cx, "brand-name");
    let brand_footer = t(cx, "brand-footer");
    let welcome_tagline = t(cx, "welcome-tagline");
    let welcome_desc = t(cx, "welcome-desc");
    let welcome_cta = t(cx, "welcome-cta");
    let welcome_status = t(cx, "welcome-status");
    let welcome_footer_hint = t(cx, "welcome-footer-hint");
    let nav_en = t(cx, "nav-lang-en");
    let nav_ru = t(cx, "nav-lang-ru");
    let lang = locale_code(cx);
    let en_active = lang == "en";
    let ru_active = lang == "ru";

    Ok(view! {
        if signed_in {
            <section class="space-y-6 rounded-xl bg-surface p-6 shadow-[0_4px_24px_rgba(27,58,40,0.06)] md:p-8">
                <h1 class="font-heading text-3xl font-semibold tracking-tight text-text">(welcome)</h1>
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
            </section>
        } else {
            <div class="welcome relative min-h-screen overflow-hidden bg-inverse text-text-inverse">
                <img
                    class="absolute inset-0 h-full w-full object-cover"
                    src=(WELCOME_HERO)
                    alt=""
                    aria-hidden="true"
                />
                <div class="welcome__overlay absolute inset-0" aria-hidden="true"></div>

                <div class="relative z-10 flex min-h-screen flex-col justify-between px-6 py-10 md:px-16 md:py-14 xl:px-24 xl:py-[72px]">
                    <header class="welcome__brand flex items-center justify-between gap-4">
                        <div class="flex items-center gap-3">
                            dino_logo(
                                size_class: "h-9 w-9 rounded-[10px] md:h-10 md:w-10 md:rounded-xl",
                                variant: LogoVariant::OnInverse,
                            )
                            <span class="font-heading text-lg font-semibold md:text-[22px]">
                                (brand_name.clone())
                            </span>
                        </div>
                        <div class="flex items-center gap-4">
                            <p class="hidden font-body text-[13px] text-primary-soft md:block">
                                (welcome_status)
                            </p>
                            <div class="flex items-center gap-1 text-sm text-text-muted">
                                <form method="post" action="/locale">
                                    <input type="hidden" name="lang" value="en" />
                                    <button
                                        type="submit"
                                        class=(if en_active {
                                            "font-semibold text-text-inverse"
                                        } else {
                                            "hover:text-text-inverse"
                                        })
                                    >
                                        (nav_en)
                                    </button>
                                </form>
                                <span>"/"</span>
                                <form method="post" action="/locale">
                                    <input type="hidden" name="lang" value="ru" />
                                    <button
                                        type="submit"
                                        class=(if ru_active {
                                            "font-semibold text-text-inverse"
                                        } else {
                                            "hover:text-text-inverse"
                                        })
                                    >
                                        (nav_ru)
                                    </button>
                                </form>
                            </div>
                        </div>
                    </header>

                    <section class="welcome__hero flex w-full max-w-xl flex-col items-start gap-5 md:gap-6">
                        <h1 class="font-heading text-5xl font-semibold tracking-tight md:text-6xl xl:text-[72px] xl:tracking-[-0.02em]">
                            (brand_name)
                        </h1>
                        <p class="font-heading text-[22px] font-medium leading-snug text-primary-soft whitespace-pre-line md:text-[28px]">
                            (welcome_tagline)
                        </p>
                        <p class="max-w-xl font-body text-base leading-normal text-text-inverse/80 md:text-lg">
                            (welcome_desc)
                        </p>
                        <a
                            href="/login"
                            class="welcome__cta mt-2 inline-flex h-[52px] items-center justify-center gap-2 rounded-md bg-surface px-7 font-body text-base font-semibold text-primary hover:bg-surface/95 focus:outline-none focus:ring-2 focus:ring-primary-soft/50 md:w-auto w-full"
                        >
                            (welcome_cta)
                            arrow_right(extra: "text-primary")
                        </a>
                    </section>

                    <footer class="welcome__footer flex flex-col gap-2 font-body text-xs text-text-inverse/40 sm:flex-row sm:items-center sm:justify-between">
                        <p>(brand_footer)</p>
                        <p class="hidden sm:block">(welcome_footer_hint)</p>
                    </footer>
                </div>
            </div>
        }
    })
}

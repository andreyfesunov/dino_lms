use crate::{
    components::arrow_right,
    i18n::{locale_code, t},
    logo::{LogoVariant, dino_logo},
    session::current_user,
};
use auth::AuthService;
use topcoat::{
    Result,
    asset::asset,
    context::{Cx, app_context},
    router::{error::RouterErrorExt, page},
    view::{View, view},
};

const WELCOME_HERO: topcoat::asset::Asset = asset!("assets/welcome-hero.jpg");

#[page("/")]
async fn home(cx: &Cx) -> Result<impl View> {
    let user = current_user(cx).await?;

    if user.is_some() {
        // `/courses` is the app: authenticated users land there directly.
        None::<()>.ok_or_redirect("/courses")?;
    }

    let auth: &AuthService = app_context(cx);
    let has_admin = auth
        .has_admin()
        .await
        .map_err(|error| topcoat::Error::msg(error.to_string()))?;

    let brand_name = t(cx, "brand-name");
    let brand_footer = t(cx, "brand-footer");
    let welcome_tagline = t(cx, "welcome-tagline");
    let welcome_desc = t(cx, "welcome-desc");
    let welcome_cta = if has_admin {
        t(cx, "welcome-cta")
    } else {
        t(cx, "welcome-cta-setup")
    };
    let welcome_status = if has_admin {
        t(cx, "welcome-status")
    } else {
        t(cx, "welcome-status-setup")
    };
    let welcome_footer_hint = if has_admin {
        t(cx, "welcome-footer-hint")
    } else {
        t(cx, "welcome-footer-hint-setup")
    };
    let welcome_href = if has_admin { "/login" } else { "/setup" };
    let nav_en = t(cx, "nav-lang-en");
    let nav_ru = t(cx, "nav-lang-ru");
    let lang = locale_code(cx);
    let en_active = lang == "en";
    let ru_active = lang == "ru";

    Ok(view! {
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
                            href=(welcome_href)
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
    })
}

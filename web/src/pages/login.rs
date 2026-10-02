use auth::{AuthService, LoginCommand};
use topcoat::{
    Result,
    context::{Cx, app_context},
    router::{
        error::{SeeOther, see_other},
        page, route,
    },
    runtime::{Event, shard, signal},
    session,
    view::{View, view},
};

use crate::{
    i18n::{auth_error, locale_code, t},
    logo::{LogoVariant, dino_logo},
};

#[shard]
async fn login_panel(cx: &Cx) -> Result<impl View> {
    let login = signal(cx, String::new);
    let password = signal(cx, String::new);
    let attempts = signal(cx, || 0u32);
    let password_visible = signal(cx, || false);

    let mut error: Option<String> = None;
    let mut signed_in = false;
    let mut needs_onboarding = false;

    if attempts.get() > 0 {
        let auth: &AuthService = app_context(cx);
        match auth
            .login(LoginCommand {
                login: login.get(),
                password: password.get(),
            })
            .await
        {
            Ok(result) => {
                let session = session::start(cx).await?;
                auth.persist_session(result.user.id, &*session.token_hash, session.expires_at)
                    .await
                    .map_err(|error| auth_error(cx, error))?;
                signed_in = true;
                needs_onboarding = result.user.needs_onboarding();
            }
            Err(_) => {
                error = Some(t(cx, "login-error-invalid"));
            }
        }
    }

    let redirecting = t(cx, "login-redirecting");
    let title = t(cx, "login-title");
    let subtitle = t(cx, "login-subtitle");
    let login_label = t(cx, "login-label");
    let login_placeholder = t(cx, "login-placeholder");
    let password_label = t(cx, "login-password");
    let submit = t(cx, "login-submit");
    let brand_name = t(cx, "brand-name");
    let brand_headline = t(cx, "brand-headline");
    let brand_desc = t(cx, "brand-desc");
    let brand_footer = t(cx, "brand-footer");
    let show_password = t(cx, "login-show-password");
    let hide_password = t(cx, "login-hide-password");
    let nav_en = t(cx, "nav-lang-en");
    let nav_ru = t(cx, "nav-lang-ru");
    let lang = locale_code(cx);
    let en_active = lang == "en";
    let ru_active = lang == "ru";
    let password_type = if password_visible.get() {
        "text"
    } else {
        "password"
    };
    let password_toggle_label = if password_visible.get() {
        hide_password
    } else {
        show_password
    };

    Ok(view! {
        if signed_in {
            <div class="flex min-h-screen items-center justify-center bg-bg px-6">
                <p class="text-center font-body text-text-secondary">(redirecting)</p>
                if needs_onboarding {
                    <script>"location.replace('/onboarding')"</script>
                } else {
                    <script>"location.replace('/')"</script>
                }
            </div>
        } else {
            <div class="flex min-h-screen flex-col bg-bg xl:flex-row">
                // Desktop brand panel (≥1280)
                <aside class="hidden w-[560px] shrink-0 flex-col justify-between bg-inverse p-12 text-text-inverse xl:flex">
                    <div class="flex items-center gap-3">
                        dino_logo(
                            size_class: "h-12 w-12 rounded-[14px]",
                            variant: LogoVariant::OnInverse,
                        )
                        <span class="font-heading text-2xl font-semibold">(brand_name.clone())</span>
                    </div>
                    <div class="flex flex-col gap-4">
                        <h1 class="font-heading text-5xl font-semibold leading-[1.15] whitespace-pre-line">
                            (brand_headline.clone())
                        </h1>
                        <p class="max-w-md font-body text-base leading-normal text-primary-soft">
                            (brand_desc.clone())
                        </p>
                    </div>
                    <p class="font-body text-xs text-text-muted">(brand_footer.clone())</p>
                </aside>

                // Tablet brand strip (768–1279)
                <div class="hidden h-80 flex-col justify-end gap-4 bg-inverse px-10 pb-12 pt-10 text-text-inverse md:flex xl:hidden">
                    <div class="flex items-center gap-3">
                        dino_logo(
                            size_class: "h-11 w-11 rounded-xl",
                            variant: LogoVariant::OnInverse,
                        )
                        <span class="font-heading text-[22px] font-semibold">(brand_name.clone())</span>
                    </div>
                    <p class="font-heading text-[32px] font-semibold leading-tight">
                        (brand_headline.clone())
                    </p>
                </div>

                // Form panel
                <section class="relative flex flex-1 flex-col items-center justify-center bg-surface px-6 py-8 md:px-16 md:py-12">
                    <div class="absolute top-4 right-4 flex items-center gap-1 text-sm text-text-muted md:top-6 md:right-6">
                        <form method="post" action="/locale">
                            <input type="hidden" name="lang" value="en" />
                            <button
                                type="submit"
                                class=(if en_active {
                                    "font-semibold text-text"
                                } else {
                                    "hover:text-text"
                                })
                            >
                                (nav_en)
                            </button>
                        </form>
                        <span class="text-border">"/"</span>
                        <form method="post" action="/locale">
                            <input type="hidden" name="lang" value="ru" />
                            <button
                                type="submit"
                                class=(if ru_active {
                                    "font-semibold text-text"
                                } else {
                                    "hover:text-text"
                                })
                            >
                                (nav_ru)
                            </button>
                        </form>
                    </div>

                    <div class="flex w-full max-w-[400px] flex-col gap-8">
                        // Mobile brand
                        <div class="flex flex-col items-center gap-4 text-center md:hidden">
                            dino_logo(
                                size_class: "h-16 w-16 rounded-2xl",
                                variant: LogoVariant::OnSurface,
                            )
                            <div class="flex flex-col gap-1">
                                <span class="font-heading text-[26px] font-semibold text-text">
                                    (brand_name)
                                </span>
                                <p class="font-body text-sm text-text-secondary">
                                    (brand_headline)
                                </p>
                            </div>
                        </div>

                        <form
                            class="flex w-full flex-col gap-5"
                            @submit=$(|e: Event| {
                                e.prevent_default();
                                attempts.increment();
                            })
                        >
                            <div class="flex flex-col gap-2">
                                <h2 class="font-heading text-[28px] font-semibold text-text">
                                    (title)
                                </h2>
                                <p class="font-body text-sm text-text-secondary">(subtitle)</p>
                            </div>

                            if let Some(message) = error.as_ref() {
                                <p class="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                                    (message)
                                </p>
                            }

                            <div class="flex flex-col gap-4">
                                <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
                                    (login_label)
                                    <input
                                        name="login"
                                        required=""
                                        autocomplete="username"
                                        placeholder=(login_placeholder)
                                        :value=$(login.get())
                                        @input=$(|e: Event| login.set(e.target.value))
                                        class="h-12 w-full rounded-md border border-border bg-input px-4 font-body text-sm text-text placeholder:text-text-muted shadow-none focus:border-primary focus:outline-none"
                                    />
                                </label>

                                <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
                                    (password_label)
                                    <div class="relative">
                                        <input
                                            name="password"
                                            type=(password_type)
                                            required=""
                                            autocomplete="current-password"
                                            placeholder="••••••••"
                                            :value=$(password.get())
                                            @input=$(|e: Event| password.set(e.target.value))
                                            class="h-12 w-full rounded-md border border-border bg-input py-3.5 pr-12 pl-4 font-body text-sm text-text placeholder:text-text-muted shadow-none focus:border-primary focus:outline-none"
                                        />
                                        <button
                                            type="button"
                                            class="absolute top-1/2 right-3 -translate-y-1/2 text-text-muted hover:text-text"
                                            aria-label=(password_toggle_label)
                                            @click=$(|e: Event| {
                                                e.prevent_default();
                                                password_visible.set(!password_visible.get());
                                            })
                                        >
                                            if password_visible.get() {
                                                <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                                    <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
                                                    <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
                                                    <path d="M14.12 14.12a3 3 0 1 1-4.24-4.24" />
                                                    <line x1="1" y1="1" x2="23" y2="23" />
                                                </svg>
                                            } else {
                                                <svg class="h-[18px] w-[18px]" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
                                                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                                                    <circle cx="12" cy="12" r="3" />
                                                </svg>
                                            }
                                        </button>
                                    </div>
                                </label>
                            </div>

                            <button
                                type="submit"
                                class="inline-flex h-12 w-full items-center justify-center rounded-md bg-primary px-5 font-body text-[15px] font-semibold text-text-inverse hover:bg-inverse focus:outline-none focus:ring-2 focus:ring-primary/40"
                            >
                                (submit)
                            </button>
                        </form>
                    </div>
                </section>
            </div>
        }
    })
}

#[page("/login")]
async fn login_page() -> Result<impl View> {
    Ok(view! {
        login_panel()
    })
}

#[route(POST "/logout")]
async fn logout(cx: &Cx) -> Result<SeeOther> {
    if let Some(hash) = session::stop(cx).await? {
        let auth: &AuthService = app_context(cx);
        auth.delete_session(&*hash)
            .await
            .map_err(|error| auth_error(cx, error))?;
    }
    Ok(see_other("/login"))
}

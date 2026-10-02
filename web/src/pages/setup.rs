use auth::{AuthError, AuthService, BootstrapAdminCommand, LoginCommand};
use topcoat::{
    Result,
    context::{Cx, app_context},
    router::{
        error::{RouterErrorExt, see_other},
        page,
    },
    runtime::{Event, shard, signal},
    session,
    view::{View, view},
};

use crate::{
    components::arrow_right,
    i18n::{locale_code, t},
    logo::{LogoVariant, dino_logo},
};

#[shard]
async fn setup_panel(cx: &Cx) -> Result<impl View> {
    let name = signal(cx, String::new);
    let last_name = signal(cx, String::new);
    let email = signal(cx, String::new);
    let password = signal(cx, String::new);
    let password_confirm = signal(cx, String::new);
    let attempts = signal(cx, || 0u32);
    let password_visible = signal(cx, || false);
    let confirm_visible = signal(cx, || false);

    let mut error: Option<String> = None;

    if attempts.get() > 0 {
        let password_value = password.get();
        let confirm_value = password_confirm.get();

        if password_value.chars().count() < 8 {
            error = Some(t(cx, "setup-error-short"));
        } else if password_value != confirm_value {
            error = Some(t(cx, "setup-error-mismatch"));
        } else {
            let auth: &AuthService = app_context(cx);
            let login_value = email.get().trim().to_owned();
            let first_name = name.get().trim().to_owned();
            let last_name_value = last_name.get().trim().to_owned();
            match auth
                .bootstrap_admin(BootstrapAdminCommand {
                    login: login_value.clone(),
                    password: Some(password_value.clone()),
                    first_name: Some(first_name).filter(|value| !value.is_empty()),
                    last_name: Some(last_name_value).filter(|value| !value.is_empty()),
                })
                .await
            {
                Ok(_) => match auth
                    .login(LoginCommand {
                        login: login_value,
                        password: password_value,
                    })
                    .await
                {
                    Ok(result) => {
                        let session = session::start(cx).await?;
                        auth.persist_session(
                            result.user.id,
                            &*session.token_hash,
                            session.expires_at,
                        )
                        .await
                        .map_err(|_| topcoat::Error::msg(t(cx, "setup-error-failed")))?;
                        let target = if result.user.needs_onboarding() {
                            "/onboarding"
                        } else {
                            "/"
                        };
                        return Err(see_other(target).into());
                    }
                    Err(_) => {
                        error = Some(t(cx, "setup-error-failed"));
                    }
                },
                Err(err) => {
                    error = Some(match err {
                        AuthError::AdminExists => t(cx, "setup-error-exists"),
                        _ => t(cx, "setup-error-failed"),
                    });
                }
            }
        }
    }

    let badge = t(cx, "setup-badge");
    let brand_headline = t(cx, "setup-brand-headline");
    let brand_desc = t(cx, "setup-brand-desc");
    let step1 = t(cx, "setup-step-1");
    let step2 = t(cx, "setup-step-2");
    let step3 = t(cx, "setup-step-3");
    let brand_footer = t(cx, "setup-brand-footer");
    let title = t(cx, "setup-title");
    let subtitle = t(cx, "setup-subtitle");
    let mobile_sub = t(cx, "setup-mobile-sub");
    let name_label = t(cx, "field-first-name");
    let name_placeholder = t(cx, "setup-name-placeholder");
    let last_name_label = t(cx, "field-last-name");
    let last_name_placeholder = t(cx, "setup-last-name-placeholder");
    let email_label = t(cx, "field-email");
    let email_placeholder = t(cx, "setup-email-placeholder");
    let password_label = t(cx, "login-password");
    let password_placeholder = t(cx, "setup-password-placeholder");
    let confirm_label = t(cx, "setup-confirm-label");
    let confirm_placeholder = t(cx, "setup-confirm-placeholder");
    let submit = t(cx, "setup-submit");
    let note = t(cx, "setup-note");
    let mobile_note = t(cx, "setup-mobile-note");
    let brand_name = t(cx, "brand-name");
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
    let confirm_type = if confirm_visible.get() {
        "text"
    } else {
        "password"
    };
    let password_toggle_label = if password_visible.get() {
        hide_password.clone()
    } else {
        show_password.clone()
    };
    let confirm_toggle_label = if confirm_visible.get() {
        hide_password
    } else {
        show_password
    };

    Ok(view! {
        <div class="flex min-h-screen flex-col bg-bg xl:flex-row">
                <aside class="hidden w-[560px] shrink-0 flex-col justify-between bg-inverse p-12 text-text-inverse xl:flex">
                    <div class="flex items-center gap-3">
                        dino_logo(
                            size_class: "h-12 w-12 rounded-[14px]",
                            variant: LogoVariant::OnInverse,
                        )
                        <span class="font-heading text-2xl font-semibold">(brand_name.clone())</span>
                    </div>
                    <div class="flex flex-col gap-6">
                        <div class="inline-flex w-fit items-center gap-2 rounded-full bg-white/10 px-3 py-1.5">
                            <svg class="h-3.5 w-3.5 text-primary-soft" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                <path d="M12 2l1.8 5.5L19 9.3l-4.2 3.2L16.2 18 12 14.8 7.8 18l1.4-5.5L5 9.3l5.2-1.8L12 2z" />
                            </svg>
                            <span class="font-body text-xs font-medium text-primary-soft">(badge.clone())</span>
                        </div>
                        <div class="flex flex-col gap-3">
                            <h1 class="font-heading text-4xl font-semibold leading-[1.15]">
                                (brand_headline)
                            </h1>
                            <p class="max-w-md font-body text-base leading-normal text-primary-soft">
                                (brand_desc)
                            </p>
                        </div>
                        <ol class="flex flex-col gap-3">
                            <li class="flex items-center gap-3">
                                <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-surface font-body text-sm font-semibold text-primary">
                                    "1"
                                </span>
                                <span class="font-body text-sm font-medium text-text-inverse">(step1)</span>
                            </li>
                            <li class="flex items-center gap-3">
                                <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 font-body text-sm font-semibold text-text-muted">
                                    "2"
                                </span>
                                <span class="font-body text-sm text-text-muted">(step2)</span>
                            </li>
                            <li class="flex items-center gap-3">
                                <span class="inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/10 font-body text-sm font-semibold text-text-muted">
                                    "3"
                                </span>
                                <span class="font-body text-sm text-text-muted">(step3)</span>
                            </li>
                        </ol>
                    </div>
                    <p class="font-body text-xs text-text-muted">(brand_footer)</p>
                </aside>

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
                        <div class="flex flex-col items-center gap-4 text-center xl:hidden">
                            dino_logo(
                                size_class: "h-16 w-16 rounded-2xl",
                                variant: LogoVariant::OnSurface,
                            )
                            <div class="inline-flex items-center gap-2 rounded-full bg-primary-soft/40 px-3 py-1.5">
                                <svg class="h-3.5 w-3.5 text-primary" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                                    <path d="M12 2l1.8 5.5L19 9.3l-4.2 3.2L16.2 18 12 14.8 7.8 18l1.4-5.5L5 9.3l5.2-1.8L12 2z" />
                                </svg>
                                <span class="font-body text-xs font-medium text-primary">(badge)</span>
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
                                <p class="hidden font-body text-sm text-text-secondary xl:block">
                                    (subtitle)
                                </p>
                                <p class="font-body text-sm text-text-secondary xl:hidden">
                                    (mobile_sub)
                                </p>
                            </div>

                            if let Some(message) = error.as_ref() {
                                <p class="rounded-md border border-danger/30 bg-danger/10 px-3 py-2 text-sm text-danger">
                                    (message)
                                </p>
                            }

                            <div class="flex flex-col gap-4">
                                <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
                                    (name_label)
                                    <input
                                        name="name"
                                        required=""
                                        autocomplete="given-name"
                                        placeholder=(name_placeholder)
                                        :value=$(name.get())
                                        @input=$(|e: Event| name.set(e.target.value))
                                        class="h-12 w-full rounded-md border border-border bg-input px-4 font-body text-sm text-text placeholder:text-text-muted shadow-none focus:border-primary focus:outline-none"
                                    />
                                </label>

                                <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
                                    (last_name_label)
                                    <input
                                        name="last_name"
                                        required=""
                                        autocomplete="family-name"
                                        placeholder=(last_name_placeholder)
                                        :value=$(last_name.get())
                                        @input=$(|e: Event| last_name.set(e.target.value))
                                        class="h-12 w-full rounded-md border border-border bg-input px-4 font-body text-sm text-text placeholder:text-text-muted shadow-none focus:border-primary focus:outline-none"
                                    />
                                </label>

                                <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
                                    (email_label)
                                    <input
                                        name="email"
                                        type="email"
                                        required=""
                                        autocomplete="username"
                                        placeholder=(email_placeholder)
                                        :value=$(email.get())
                                        @input=$(|e: Event| email.set(e.target.value))
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
                                            autocomplete="new-password"
                                            minlength="8"
                                            placeholder=(password_placeholder)
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

                                <label class="flex flex-col gap-2 font-body text-[13px] font-medium text-text">
                                    (confirm_label)
                                    <div class="relative">
                                        <input
                                            name="password_confirm"
                                            type=(confirm_type)
                                            required=""
                                            autocomplete="new-password"
                                            minlength="8"
                                            placeholder=(confirm_placeholder)
                                            :value=$(password_confirm.get())
                                            @input=$(|e: Event| password_confirm.set(e.target.value))
                                            class="h-12 w-full rounded-md border border-border bg-input py-3.5 pr-12 pl-4 font-body text-sm text-text placeholder:text-text-muted shadow-none focus:border-primary focus:outline-none"
                                        />
                                        <button
                                            type="button"
                                            class="absolute top-1/2 right-3 -translate-y-1/2 text-text-muted hover:text-text"
                                            aria-label=(confirm_toggle_label)
                                            @click=$(|e: Event| {
                                                e.prevent_default();
                                                confirm_visible.set(!confirm_visible.get());
                                            })
                                        >
                                            if confirm_visible.get() {
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
                                class="inline-flex h-12 w-full items-center justify-center gap-2 rounded-md bg-primary px-5 font-body text-[15px] font-semibold text-text-inverse hover:bg-inverse focus:outline-none focus:ring-2 focus:ring-primary/40"
                            >
                                (submit)
                                arrow_right(extra: "text-text-inverse")
                            </button>

                            <p class="hidden text-center font-body text-xs text-text-muted xl:block">
                                (note)
                            </p>
                            <p class="text-center font-body text-xs text-text-muted xl:hidden">
                                (mobile_note)
                            </p>
                        </form>
                    </div>
                </section>
            </div>
    })
}

#[page("/setup")]
async fn setup_page(cx: &Cx) -> Result<impl View> {
    let auth: &AuthService = app_context(cx);
    if auth
        .has_admin()
        .await
        .map_err(|error| topcoat::Error::msg(error.to_string()))?
    {
        None::<()>.ok_or_redirect("/login")?;
    }

    Ok(view! {
        setup_panel()
    })
}

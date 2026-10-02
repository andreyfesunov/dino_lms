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

use crate::i18n::{auth_error, t};

#[shard]
async fn login_panel(cx: &Cx) -> Result<impl View> {
    let login = signal(cx, String::new);
    let password = signal(cx, String::new);
    let attempts = signal(cx, || 0u32);

    let mut error: Option<String> = None;
    let mut signed_in = false;

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
            }
            Err(_) => {
                error = Some(t(cx, "login-error-invalid"));
            }
        }
    }

    let redirecting = t(cx, "login-redirecting");
    let title = t(cx, "login-title");
    let login_label = t(cx, "login-label");
    let password_label = t(cx, "login-password");
    let submit = t(cx, "login-submit");

    Ok(view! {
        <section class="mx-auto max-w-md space-y-6">
            if signed_in {
                <p class="text-center text-zinc-700">(redirecting)</p>
                <script>"location.replace('/')"</script>
            } else {
                <h1 class="text-3xl font-semibold tracking-tight">(title)</h1>
                if let Some(message) = error.as_ref() {
                    <p class="rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                        (message)
                    </p>
                }
                <form
                    class="space-y-4 rounded-lg border border-zinc-200 bg-white p-6 shadow-sm"
                    @submit=$(|e: Event| {
                        e.prevent_default();
                        attempts.increment();
                    })
                >
                    <label class="block space-y-2 text-sm font-medium text-zinc-700">
                        (login_label)
                        <input
                            name="login"
                            required=""
                            autocomplete="username"
                            :value=$(login.get())
                            @input=$(|e: Event| login.set(e.target.value))
                            class="block w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none"
                        />
                    </label>
                    <label class="block space-y-2 text-sm font-medium text-zinc-700">
                        (password_label)
                        <input
                            name="password"
                            type="password"
                            required=""
                            autocomplete="current-password"
                            :value=$(password.get())
                            @input=$(|e: Event| password.set(e.target.value))
                            class="block w-full rounded-md border border-zinc-300 px-3 py-2 text-zinc-900 shadow-sm focus:border-zinc-500 focus:outline-none"
                        />
                    </label>
                    <button
                        type="submit"
                        class="inline-flex w-full justify-center rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
                    >
                        (submit)
                    </button>
                </form>
            }
        </section>
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

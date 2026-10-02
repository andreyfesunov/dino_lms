use crate::{
    i18n::{t, t_args},
    session::current_actor,
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
    let actor = current_actor(cx).await?;
    let signed_in = actor.is_some();
    let user_label = actor
        .as_ref()
        .map(|actor| actor.user_id.to_string())
        .unwrap_or_default();
    let auth: &AuthService = app_context(cx);
    let can_create_student = actor
        .as_ref()
        .is_some_and(|actor| auth.permits(actor, Permission::CreateStudentAccount));

    let welcome = t(cx, "home-welcome");
    let signed_in_as = t_args(cx, "home-signed-in", [("user", user_label.into())]);
    let create_student = t(cx, "home-create-student");
    let log_out = t(cx, "home-log-out");
    let sign_in_prompt = t(cx, "home-sign-in-prompt");
    let log_in = t(cx, "home-log-in");

    Ok(view! {
        <section class="space-y-6">
            <h1 class="text-3xl font-semibold tracking-tight">(welcome)</h1>
            if signed_in {
                <div class="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
                    <p class="text-zinc-700">(signed_in_as)</p>
                    <div class="mt-4 flex flex-wrap gap-3">
                        if can_create_student {
                            <a
                                href="/students/new"
                                class="inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
                            >
                                (create_student)
                            </a>
                        }
                        <form method="post" action="/logout">
                            <button
                                type="submit"
                                class="inline-flex rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                            >
                                (log_out)
                            </button>
                        </form>
                    </div>
                </div>
            } else {
                <div class="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
                    <p class="text-zinc-600">(sign_in_prompt)</p>
                    <a
                        href="/login"
                        class="mt-4 inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
                    >
                        (log_in)
                    </a>
                </div>
            }
        </section>
    })
}

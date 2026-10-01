use crate::session::current_actor;
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

    Ok(view! {
        <section class="space-y-6">
            <h1 class="text-3xl font-semibold tracking-tight">"Welcome"</h1>
            if signed_in {
                <div class="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
                    <p class="text-zinc-700">"Signed in as " <span class="font-medium text-zinc-900">(user_label)</span></p>
                    <div class="mt-4 flex flex-wrap gap-3">
                        if can_create_student {
                            <a
                                href="/students/new"
                                class="inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
                            >
                                "Create student"
                            </a>
                        }
                        <form method="post" action="/logout">
                            <button
                                type="submit"
                                class="inline-flex rounded-md border border-zinc-300 bg-white px-4 py-2 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                            >
                                "Log out"
                            </button>
                        </form>
                    </div>
                </div>
            } else {
                <div class="rounded-lg border border-zinc-200 bg-white p-6 shadow-sm">
                    <p class="text-zinc-600">"Sign in to manage the LMS."</p>
                    <a
                        href="/login"
                        class="mt-4 inline-flex rounded-md bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700"
                    >
                        "Log in"
                    </a>
                </div>
            }
        </section>
    })
}

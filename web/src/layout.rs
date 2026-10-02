use topcoat::{
    Result,
    context::Cx,
    router::{Slot, layout, request::uri},
    tailwind,
    view::{View, view},
};

use crate::{
    components::app_sidebar,
    i18n::{locale_code, t},
    session::current_user,
};

#[layout("/")]
async fn root_layout(cx: &Cx, slot: Slot<'_>) -> Result<impl View> {
    let lang = locale_code(cx);
    let brand = t(cx, "brand-title");
    let path = uri(cx).path();
    let is_login = path == "/login";
    let is_onboarding = path == "/onboarding";
    let signed_in = current_user(cx).await?.is_some();
    let is_welcome = path == "/" && !signed_in;
    let bare = is_login || is_onboarding || is_welcome;
    let show_shell = signed_in && !bare;

    Ok(view! {
        <!DOCTYPE html>
        <html lang=(lang) class="h-full">
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>(brand.clone())</title>
                <link rel="preconnect" href="https://fonts.googleapis.com" />
                <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin="" />
                <link
                    rel="stylesheet"
                    href="https://fonts.googleapis.com/css2?family=Funnel+Sans:wght@400;500;600;700&family=Geist:wght@400;500;600&display=swap"
                />
                <link rel="stylesheet" href=(tailwind::stylesheet!()) />
                topcoat::runtime::script()
                topcoat::dev::script()
            </head>
            <body class="min-h-full bg-bg font-body text-text antialiased">
                if show_shell {
                    <div class="flex min-h-screen gap-4 p-4 pb-24 md:pb-4">
                        app_sidebar()
                        <main class="min-w-0 flex-1">(slot)</main>
                    </div>
                } else {
                    <div class="contents">(slot)</div>
                }
            </body>
        </html>
    })
}

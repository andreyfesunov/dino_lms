use topcoat::{
    Result,
    context::Cx,
    router::{Slot, layout, request::uri},
    tailwind,
    view::{View, view},
};

use crate::i18n::{locale_code, t};

#[layout("/")]
async fn root_layout(cx: &Cx, slot: Slot<'_>) -> Result<impl View> {
    let lang = locale_code(cx);
    let brand = t(cx, "brand-title");
    let is_login = uri(cx).path() == "/login";
    let nav_login = t(cx, "nav-login");
    let nav_students = t(cx, "nav-students");
    let nav_en = t(cx, "nav-lang-en");
    let nav_ru = t(cx, "nav-lang-ru");
    let en_active = lang == "en";
    let ru_active = lang == "ru";
    let body_class = if is_login {
        "min-h-full bg-bg font-body text-text antialiased"
    } else {
        "min-h-full bg-zinc-50 font-body text-zinc-900 antialiased"
    };

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
            <body class=(body_class)>
                if !is_login {
                    <header class="border-b border-zinc-200 bg-white">
                        <div class="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
                            <a href="/" class="text-lg font-semibold tracking-tight">
                                (brand)
                            </a>
                            <nav class="flex items-center gap-4 text-sm text-zinc-600">
                                <a href="/login" class="hover:text-zinc-900">(nav_login)</a>
                                <a href="/students/new" class="hover:text-zinc-900">(nav_students)</a>
                                <div class="flex items-center gap-1 border-l border-zinc-200 pl-4">
                                    <form method="post" action="/locale">
                                        <input type="hidden" name="lang" value="en" />
                                        <button
                                            type="submit"
                                            class=(if en_active {
                                                "font-semibold text-zinc-900"
                                            } else {
                                                "hover:text-zinc-900"
                                            })
                                        >
                                            (nav_en)
                                        </button>
                                    </form>
                                    <span class="text-zinc-300">"/"</span>
                                    <form method="post" action="/locale">
                                        <input type="hidden" name="lang" value="ru" />
                                        <button
                                            type="submit"
                                            class=(if ru_active {
                                                "font-semibold text-zinc-900"
                                            } else {
                                                "hover:text-zinc-900"
                                            })
                                        >
                                            (nav_ru)
                                        </button>
                                    </form>
                                </div>
                            </nav>
                        </div>
                    </header>
                }
                <div class=(if is_login {
                    "contents"
                } else {
                    "mx-auto max-w-3xl px-4 py-10"
                })>
                    (slot)
                </div>
            </body>
        </html>
    })
}

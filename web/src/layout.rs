use topcoat::{
    Result,
    router::{Slot, layout},
    tailwind,
    view::{View, view},
};

#[layout("/")]
async fn root_layout(slot: Slot<'_>) -> Result<impl View> {
    Ok(view! {
        <!DOCTYPE html>
        <html lang="en" class="h-full">
            <head>
                <meta charset="utf-8" />
                <meta name="viewport" content="width=device-width, initial-scale=1" />
                <title>"dino_lms"</title>
                <link rel="stylesheet" href=(tailwind::stylesheet!()) />
                topcoat::runtime::script()
                topcoat::dev::script()
            </head>
            <body class="min-h-full bg-zinc-50 text-zinc-900 antialiased">
                <header class="border-b border-zinc-200 bg-white">
                    <div class="mx-auto flex max-w-3xl items-center justify-between px-4 py-4">
                        <a href="/" class="text-lg font-semibold tracking-tight">
                            "dino_lms"
                        </a>
                        <nav class="flex gap-4 text-sm text-zinc-600">
                            <a href="/login" class="hover:text-zinc-900">"Login"</a>
                            <a href="/students/new" class="hover:text-zinc-900">"Students"</a>
                        </nav>
                    </div>
                </header>
                <main class="mx-auto max-w-3xl px-4 py-10">
                    (slot)
                </main>
            </body>
        </html>
    })
}

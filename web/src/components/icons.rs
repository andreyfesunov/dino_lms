use topcoat::{
    Result,
    view::{View, component, view},
};

fn icon_class(extra: &str) -> String {
    format!("h-[18px] w-[18px] shrink-0 {extra}")
}

#[component]
pub async fn arrow_left(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m12 19-7-7 7-7" />
            <path d="M19 12H5" />
        </svg>
    })
}

#[component]
pub async fn plus(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="M12 5v14" />
        </svg>
    })
}

#[component]
pub async fn layers(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m12.83 2.18a2 2 0 0 0-1.66 0L2.6 6.08a1 1 0 0 0 0 1.83l8.58 3.91a2 2 0 0 0 1.66 0l8.58-3.9a1 1 0 0 0 0-1.83Z" />
            <path d="m22 12.65-9.17 4.16a2 2 0 0 1-1.66 0L2 12.65" />
            <path d="m22 17.65-9.17 4.16a2 2 0 0 1-1.66 0L2 17.65" />
        </svg>
    })
}

#[component]
pub async fn folder(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z" />
        </svg>
    })
}

#[component]
pub async fn users(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />
            <circle cx="9" cy="7" r="4" />
            <path d="M22 21v-2a4 4 0 0 0-3-3.87" />
            <path d="M16 3.13a4 4 0 0 1 0 7.75" />
        </svg>
    })
}

#[component]
pub async fn user_cog(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="18" cy="15" r="3" />
            <circle cx="9" cy="7" r="4" />
            <path d="M10 15H6a4 4 0 0 0-4 4v2" />
            <path d="m21.7 16.4-.9-.3" />
            <path d="m15.2 13.9-.9-.3" />
            <path d="m16.6 18.7.3-.9" />
            <path d="m19.1 12.2.3-.9" />
            <path d="m19.6 18.7-.4-1" />
            <path d="m16.8 12.3-.4-1" />
            <path d="m14.3 16.6 1-.4" />
            <path d="m20.7 13.8 1-.4" />
        </svg>
    })
}

#[component]
pub async fn settings(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" />
            <circle cx="12" cy="12" r="3" />
        </svg>
    })
}

#[component]
pub async fn log_out(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" x2="9" y1="12" y2="12" />
        </svg>
    })
}

#[component]
pub async fn user(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />
            <circle cx="12" cy="7" r="4" />
        </svg>
    })
}

#[component]
pub async fn search(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
        </svg>
    })
}

#[component]
pub async fn pencil(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
            <path d="m15 5 4 4" />
        </svg>
    })
}

#[component]
pub async fn x(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M18 6 6 18" />
            <path d="m6 6 12 12" />
        </svg>
    })
}

#[component]
pub async fn lock(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect width="18" height="11" x="3" y="11" rx="2" ry="2" />
            <path d="M7 11V7a5 5 0 0 1 10 0v4" />
        </svg>
    })
}

#[component]
pub async fn key(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="m15.5 7.5 2.3 2.3a1 1 0 0 0 1.4 0l2.1-2.1a1 1 0 0 0 0-1.4L19 4" />
            <path d="m21 2-9.6 9.6" />
            <circle cx="7.5" cy="15.5" r="5.5" />
        </svg>
    })
}

#[component]
pub async fn copy(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <rect width="14" height="14" x="8" y="8" rx="2" ry="2" />
            <path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />
        </svg>
    })
}

#[component]
pub async fn more_horizontal(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <circle cx="12" cy="12" r="1" />
            <circle cx="19" cy="12" r="1" />
            <circle cx="5" cy="12" r="1" />
        </svg>
    })
}

#[component]
pub async fn arrow_right(extra: &'static str) -> Result<impl View> {
    let class = icon_class(extra);
    Ok(view! {
        <svg class=(class) viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
            <path d="M5 12h14" />
            <path d="m12 5 7 7-7 7" />
        </svg>
    })
}

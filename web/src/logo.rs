use topcoat::{
    Result,
    view::{View, component, view},
};

/// Path data for the dino mark (`assets/dino-mark.path`). Prefer editing
/// [`assets/dino-mark.svg`](../../assets/dino-mark.svg) and keeping the `.path` in sync.
const DINO_PATH: &str = include_str!(concat!(
    env!("CARGO_MANIFEST_DIR"),
    "/../assets/dino-mark.path"
));

#[derive(Clone, Copy)]
pub enum LogoVariant {
    /// White square, primary dino (brand panels on inverse).
    OnInverse,
    /// Primary square, white dino (mobile / light surfaces).
    OnSurface,
}

#[component]
pub async fn dino_logo(size_class: &'static str, variant: LogoVariant) -> Result<impl View> {
    let shell = match variant {
        LogoVariant::OnInverse => "bg-surface",
        LogoVariant::OnSurface => "bg-primary",
    };
    let mark = match variant {
        LogoVariant::OnInverse => "fill-primary",
        LogoVariant::OnSurface => "fill-text-inverse",
    };
    let class = format!(
        "inline-flex shrink-0 items-center justify-center overflow-hidden {size_class} {shell}"
    );

    Ok(view! {
        <div class=(class)>
            <svg
                class="h-full w-full"
                viewBox="-24.8064 -22.6368 96 96"
                xmlns="http://www.w3.org/2000/svg"
                aria-hidden="true"
            >
                <path class=(mark) d=(DINO_PATH.trim()) />
            </svg>
        </div>
    })
}

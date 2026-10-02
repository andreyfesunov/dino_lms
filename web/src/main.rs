use auth::AuthService;
use topcoat::{
    asset::{AssetBundle, RouterBuilderAssetExt},
    cookie::RouterBuilderCookieExt,
    router::{Router, RouterBuilderDiscoverExt},
    runtime::RouterBuilderRuntimeExt,
    session::{RouterBuilderSessionExt, SessionConfig},
};

#[tokio::main]
async fn main() {
    let cfg = config::Config::load().expect("failed to load config");
    let pool = db::connect(&cfg.database.url())
        .await
        .expect("failed to connect to database");
    let auth = AuthService::new(pool);

    let router = Router::builder()
        .discover()
        .cookies()
        .sessions(SessionConfig::default())
        .assets(AssetBundle::load().expect("failed to load asset bundle"))
        .app_context(auth)
        .runtime()
        .build();

    topcoat::start(router).await.unwrap();
}

mod components;
mod i18n;
mod layout;
mod logo;
mod pages;
mod session;

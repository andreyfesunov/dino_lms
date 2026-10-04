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
    let auth = AuthService::new(pool.clone());
    let course_repo = std::sync::Arc::new(courses::SqlxCourseRepository::new(pool));
    let course_catalog = courses::Catalog::open(&cfg.courses.dir);
    let courses = courses::CourseService::new(course_catalog, course_repo);

    let router = Router::builder()
        .discover()
        .cookies()
        .sessions(SessionConfig::default())
        .assets(AssetBundle::load().expect("failed to load asset bundle"))
        .app_context(auth)
        .app_context(courses)
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

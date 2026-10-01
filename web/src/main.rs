use topcoat::router::{Router, RouterBuilderDiscoverExt};

#[tokio::main]
async fn main() {
    let cfg = config::Config::load().expect("failed to load config");
    let _pool = db::connect(&cfg.database.url())
        .await
        .expect("failed to connect to database");

    topcoat::start(Router::builder().discover().build())
        .await
        .unwrap();
}

use sqlx::{
    Error as SqlxError, SqlitePool,
    migrate::MigrateError,
    sqlite::{SqliteConnectOptions, SqlitePoolOptions},
};
use std::str::FromStr;

pub type Pool = SqlitePool;

pub async fn connect(database_url: &str) -> Result<Pool, SqlxError> {
    let options = SqliteConnectOptions::from_str(database_url)?.create_if_missing(true);

    SqlitePoolOptions::new()
        .max_connections(5)
        .connect_with(options)
        .await
}

pub async fn migrate(pool: &Pool) -> Result<(), MigrateError> {
    sqlx::migrate!("./migrations").run(pool).await
}

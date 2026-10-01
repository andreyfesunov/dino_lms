use clap::{Parser, Subcommand};

#[derive(Parser)]
#[command(name = "initializer", about = "dino_lms maintenance CLI")]
struct Cli {
    #[command(subcommand)]
    command: Commands,
}

#[derive(Subcommand)]
enum Commands {
    /// Apply pending database migrations
    Migrate,
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Migrate => migrate().await,
    }
}

async fn migrate() {
    let cfg = config::Config::load().unwrap_or_else(|error| {
        eprintln!("failed to load config: {error}");
        std::process::exit(1);
    });

    if let Some(parent) = cfg.database.path.parent() {
        if !parent.as_os_str().is_empty() {
            std::fs::create_dir_all(parent).unwrap_or_else(|error| {
                eprintln!("failed to create database directory: {error}");
                std::process::exit(1);
            });
        }
    }

    let pool = db::connect(&cfg.database.url())
        .await
        .unwrap_or_else(|error| {
            eprintln!("failed to connect to database: {error}");
            std::process::exit(1);
        });

    db::migrate(&pool).await.unwrap_or_else(|error| {
        eprintln!("migration failed: {error}");
        std::process::exit(1);
    });

    println!(
        "migrations applied successfully ({})",
        cfg.database.path.display()
    );
}

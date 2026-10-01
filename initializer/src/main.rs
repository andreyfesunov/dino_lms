use auth::{AuthService, BootstrapAdminCommand};
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
    /// Create the first admin account when none exists
    BootstrapAdmin {
        #[arg(long, default_value = "admin")]
        login: String,
        #[arg(long)]
        password: Option<String>,
    },
}

#[tokio::main]
async fn main() {
    let cli = Cli::parse();

    match cli.command {
        Commands::Migrate => migrate().await,
        Commands::BootstrapAdmin { login, password } => {
            bootstrap_admin(login, password).await;
        }
    }
}

async fn migrate() {
    let pool = connect_pool().await;
    db::migrate(&pool).await.unwrap_or_else(|error| {
        eprintln!("migration failed: {error}");
        std::process::exit(1);
    });
    println!("migrations applied successfully");
}

async fn bootstrap_admin(login: String, password: Option<String>) {
    let pool = connect_pool().await;
    let auth = AuthService::new(pool);
    let result = auth
        .bootstrap_admin(BootstrapAdminCommand { login, password })
        .await
        .unwrap_or_else(|error| {
            eprintln!("bootstrap-admin failed: {error}");
            std::process::exit(1);
        });

    println!(
        "admin created: login={} id={}",
        result.login, result.user_id
    );
    if let Some(temporary_password) = result.temporary_password {
        println!("temporary password: {temporary_password}");
    }
}

async fn connect_pool() -> db::Pool {
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

    db::connect(&cfg.database.url())
        .await
        .unwrap_or_else(|error| {
            eprintln!("failed to connect to database: {error}");
            std::process::exit(1);
        })
}

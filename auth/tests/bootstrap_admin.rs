use auth::{AuthError, AuthService, BootstrapAdminCommand, LoginCommand, Role, UserStatus};
use sqlx::sqlite::SqlitePoolOptions;

async fn service() -> AuthService {
    // A single connection keeps the in-memory database shared across statements.
    let pool = SqlitePoolOptions::new()
        .max_connections(1)
        .connect("sqlite::memory:")
        .await
        .expect("connect in-memory database");
    db::migrate(&pool).await.expect("apply migrations");
    AuthService::new(pool)
}

fn command(login: &str, password: &str) -> BootstrapAdminCommand {
    BootstrapAdminCommand {
        login: login.to_owned(),
        password: Some(password.to_owned()),
        first_name: Some("Алексей".to_owned()),
        last_name: Some("Иванов".to_owned()),
    }
}

#[tokio::test]
async fn fresh_database_has_no_admin() {
    let auth = service().await;
    assert!(!auth.has_admin().await.unwrap());
}

#[tokio::test]
async fn bootstrap_creates_active_admin_and_login_works() {
    let auth = service().await;

    let result = auth
        .bootstrap_admin(command("admin@dino.lms", "correct horse"))
        .await
        .unwrap();
    assert!(auth.has_admin().await.unwrap());

    let actor = auth::Actor::new(result.user_id, [Role::Admin]);
    let user = auth.current_user(&actor).await.unwrap();
    assert_eq!(user.role, Role::Admin);
    assert_eq!(user.status, UserStatus::Active);
    assert_eq!(user.first_name.as_deref(), Some("Алексей"));
    assert_eq!(user.last_name.as_deref(), Some("Иванов"));
    assert!(!user.needs_onboarding());

    let login = auth
        .login(LoginCommand {
            login: "admin@dino.lms".to_owned(),
            password: "correct horse".to_owned(),
        })
        .await
        .unwrap();
    assert_eq!(login.user.id, result.user_id);
}

#[tokio::test]
async fn second_bootstrap_is_refused() {
    let auth = service().await;
    auth.bootstrap_admin(command("admin@dino.lms", "correct horse"))
        .await
        .unwrap();

    let error = auth
        .bootstrap_admin(command("other@dino.lms", "another horse"))
        .await
        .unwrap_err();
    assert!(matches!(error, AuthError::AdminExists));
}

#[tokio::test]
async fn short_password_is_rejected_without_creating_a_user() {
    let auth = service().await;

    let error = auth
        .bootstrap_admin(command("admin@dino.lms", "short"))
        .await
        .unwrap_err();
    assert!(!matches!(error, AuthError::AdminExists));
    assert!(!auth.has_admin().await.unwrap());
}

#[tokio::test]
async fn blank_names_are_stored_as_none() {
    let auth = service().await;

    let result = auth
        .bootstrap_admin(BootstrapAdminCommand {
            login: "admin@dino.lms".to_owned(),
            password: Some("correct horse".to_owned()),
            first_name: Some("   ".to_owned()),
            last_name: Some(String::new()),
        })
        .await
        .unwrap();

    let actor = auth::Actor::new(result.user_id, [Role::Admin]);
    let user = auth.current_user(&actor).await.unwrap();
    assert_eq!(user.first_name, None);
    assert_eq!(user.last_name, None);
    assert_eq!(user.status, UserStatus::Pending);
    assert!(user.needs_onboarding());
}

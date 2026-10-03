use auth::{Actor, AuthService, DeleteUserCommand, ListUsersCommand, LoginCommand, Role};
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

struct Fixture {
    auth: AuthService,
    admin: Actor,
    admin_id: auth::UserId,
    ivan_id: auth::UserId,
    ivan_password: String,
}

/// The schema allows at most one admin (`users_admin_singleton` partial
/// unique index), so the fixture invites a plain student.
async fn fixture() -> Fixture {
    let auth = service().await;
    let admin_id = auth
        .bootstrap_admin(auth::BootstrapAdminCommand {
            login: "admin@dino.lms".to_owned(),
            password: Some("correct horse".to_owned()),
            first_name: Some("Алексей".to_owned()),
            last_name: Some("Иванов".to_owned()),
        })
        .await
        .unwrap()
        .user_id;
    let admin = Actor::new(admin_id, [Role::Admin]);

    let invited = auth
        .invite_users(
            &admin,
            auth::InviteUsersCommand {
                emails: vec!["ivanov@school.ru".to_owned()],
            },
        )
        .await
        .unwrap();
    let invited = &invited.created[0];

    Fixture {
        auth,
        admin,
        admin_id,
        ivan_id: invited.user_id,
        ivan_password: invited.temporary_password.clone(),
    }
}

#[tokio::test]
async fn admin_deletes_another_user() {
    let f = fixture().await;

    f.auth
        .delete_user(&f.admin, DeleteUserCommand { user_id: f.ivan_id })
        .await
        .unwrap();

    let users = f
        .auth
        .list_users(
            &f.admin,
            ListUsersCommand {
                query: None,
                status: None,
            },
        )
        .await
        .unwrap();
    assert_eq!(users.len(), 1); // only the acting admin remains
    assert_eq!(users[0].id, f.admin_id);

    // The deleted user can no longer sign in: the row (and the password hash)
    // is gone, so login falls back to invalid credentials.
    let error = f
        .auth
        .login(LoginCommand {
            login: "ivanov@school.ru".to_owned(),
            password: f.ivan_password.clone(),
        })
        .await
        .unwrap_err();
    assert!(matches!(error, auth::AuthError::InvalidCredentials));
}

#[tokio::test]
async fn admin_cannot_delete_self() {
    let f = fixture().await;
    let error = f
        .auth
        .delete_user(
            &f.admin,
            DeleteUserCommand {
                user_id: f.admin_id,
            },
        )
        .await
        .unwrap_err();
    assert!(matches!(error, auth::AuthError::SelfDelete));

    // The admin is still in place.
    let users = f
        .auth
        .list_users(
            &f.admin,
            ListUsersCommand {
                query: None,
                status: None,
            },
        )
        .await
        .unwrap();
    assert_eq!(users.len(), 2);
}

#[tokio::test]
async fn deleting_a_missing_user_is_an_error() {
    let f = fixture().await;
    let missing = auth::UserId::new();
    let error = f
        .auth
        .delete_user(&f.admin, DeleteUserCommand { user_id: missing })
        .await
        .unwrap_err();
    assert!(error.to_string().contains("user not found"));
}

#[tokio::test]
async fn non_admin_cannot_delete() {
    let f = fixture().await;
    let student = Actor::new(f.ivan_id, [Role::Student]);

    let error = f
        .auth
        .delete_user(
            &student,
            DeleteUserCommand {
                user_id: f.admin_id,
            },
        )
        .await
        .unwrap_err();
    assert!(matches!(error, auth::AuthError::Authz(_)));
}

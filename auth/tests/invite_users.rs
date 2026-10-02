use auth::{AuthService, InviteUsersCommand, UserStatus};
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

fn command(emails: &[&str]) -> InviteUsersCommand {
    InviteUsersCommand {
        emails: emails.iter().map(|email| email.to_string()).collect(),
    }
}

#[tokio::test]
async fn invite_creates_pending_users_with_passwords() {
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
    let actor = auth::Actor::new(admin_id, [auth::Role::Admin]);

    let result = auth
        .invite_users(&actor, command(&["ivanov@school.ru", "petrova@school.ru"]))
        .await
        .unwrap();

    assert_eq!(result.created.len(), 2);
    assert!(result.skipped.is_empty());
    for invited in &result.created {
        assert!(!invited.temporary_password.is_empty());
        assert_eq!(invited.temporary_password.len(), 16);
    }

    let users = auth
        .list_users(
            &actor,
            auth::ListUsersCommand {
                query: None,
                status: None,
            },
        )
        .await
        .unwrap();
    assert_eq!(users.len(), 3); // admin + 2 invited
    for user in users.iter().filter(|user| user.role == auth::Role::Student) {
        assert_eq!(user.status, UserStatus::Pending);
    }

    // The temporary password actually authenticates the new user.
    let invited = &result.created[0];
    let login = auth
        .login(auth::LoginCommand {
            login: invited.login.clone(),
            password: invited.temporary_password.clone(),
        })
        .await
        .unwrap();
    assert_eq!(login.user.id, invited.user_id);
    assert_eq!(login.user.status, UserStatus::Pending);
}

#[tokio::test]
async fn existing_logins_are_skipped() {
    let auth = service().await;
    let admin_id = auth
        .bootstrap_admin(auth::BootstrapAdminCommand {
            login: "admin@dino.lms".to_owned(),
            password: Some("correct horse".to_owned()),
            first_name: None,
            last_name: None,
        })
        .await
        .unwrap()
        .user_id;
    let actor = auth::Actor::new(admin_id, [auth::Role::Admin]);

    let first = auth
        .invite_users(&actor, command(&["ivanov@school.ru"]))
        .await
        .unwrap();
    assert_eq!(first.created.len(), 1);

    let second = auth
        .invite_users(&actor, command(&["ivanov@school.ru", "petrova@school.ru"]))
        .await
        .unwrap();
    assert_eq!(second.created.len(), 1);
    assert_eq!(second.created[0].login, "petrova@school.ru");
    assert_eq!(second.skipped, vec!["ivanov@school.ru".to_owned()]);

    // The first user keeps their original password.
    let login = auth
        .login(auth::LoginCommand {
            login: "ivanov@school.ru".to_owned(),
            password: first.created[0].temporary_password.clone(),
        })
        .await
        .unwrap();
    assert_eq!(login.user.login, "ivanov@school.ru");
}

#[tokio::test]
async fn blank_entries_are_ignored() {
    let auth = service().await;
    let admin_id = auth
        .bootstrap_admin(auth::BootstrapAdminCommand {
            login: "admin@dino.lms".to_owned(),
            password: Some("correct horse".to_owned()),
            first_name: None,
            last_name: None,
        })
        .await
        .unwrap()
        .user_id;
    let actor = auth::Actor::new(admin_id, [auth::Role::Admin]);

    let result = auth
        .invite_users(&actor, command(&["  ", "", "ivanov@school.ru"]))
        .await
        .unwrap();
    assert_eq!(result.created.len(), 1);
    assert_eq!(result.created[0].login, "ivanov@school.ru");
}

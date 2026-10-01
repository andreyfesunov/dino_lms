use async_trait::async_trait;
use kernel::{Role, UserId};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    domain::{NewUser, PasswordHash, User},
    ports::UserRepository,
};

#[derive(Clone)]
pub struct SqlxUserRepository {
    pool: db::Pool,
}

impl SqlxUserRepository {
    pub fn new(pool: db::Pool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl UserRepository for SqlxUserRepository {
    async fn create(&self, user: NewUser) -> Result<User, String> {
        sqlx::query(
            r#"
            INSERT INTO users (id, login, password_hash, role, created_at)
            VALUES (?, ?, ?, ?, ?)
            "#,
        )
        .bind(user.id.to_string())
        .bind(&user.login)
        .bind(user.password_hash.as_str())
        .bind(user.role.as_str())
        .bind(user.created_at)
        .execute(&self.pool)
        .await
        .map_err(|error| error.to_string())?;

        Ok(User {
            id: user.id,
            login: user.login,
            password_hash: user.password_hash,
            role: user.role,
            created_at: user.created_at,
        })
    }

    async fn find_by_login(&self, login: &str) -> Result<Option<User>, String> {
        let row = sqlx::query(
            r#"
            SELECT id, login, password_hash, role, created_at
            FROM users
            WHERE login = ? COLLATE NOCASE
            "#,
        )
        .bind(login)
        .fetch_optional(&self.pool)
        .await
        .map_err(|error| error.to_string())?;

        row.map(map_user).transpose()
    }

    async fn find_by_id(&self, id: UserId) -> Result<Option<User>, String> {
        let row = sqlx::query(
            r#"
            SELECT id, login, password_hash, role, created_at
            FROM users
            WHERE id = ?
            "#,
        )
        .bind(id.to_string())
        .fetch_optional(&self.pool)
        .await
        .map_err(|error| error.to_string())?;

        row.map(map_user).transpose()
    }

    async fn count_by_role(&self, role: Role) -> Result<i64, String> {
        let count: i64 = sqlx::query_scalar("SELECT COUNT(*) FROM users WHERE role = ?")
            .bind(role.as_str())
            .fetch_one(&self.pool)
            .await
            .map_err(|error| error.to_string())?;
        Ok(count)
    }
}

fn map_user(row: sqlx::sqlite::SqliteRow) -> Result<User, String> {
    let id =
        Uuid::parse_str(row.get::<String, _>("id").as_str()).map_err(|error| error.to_string())?;
    let role = row
        .get::<String, _>("role")
        .parse::<Role>()
        .map_err(|error| error.to_string())?;

    Ok(User {
        id: UserId::from_uuid(id),
        login: row.get("login"),
        password_hash: PasswordHash::new(row.get::<String, _>("password_hash")),
        role,
        created_at: row.get("created_at"),
    })
}

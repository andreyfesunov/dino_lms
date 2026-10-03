use async_trait::async_trait;
use kernel::{Role, UserId};
use sqlx::Row;
use uuid::Uuid;

use crate::{
    domain::{NewUser, PasswordHash, User, UserListFilter, UserProfileUpdate, UserStatus},
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
            INSERT INTO users (
                id, login, password_hash, role, status, first_name, last_name, created_at
            )
            VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            "#,
        )
        .bind(user.id.to_string())
        .bind(&user.login)
        .bind(user.password_hash.as_ref().map(PasswordHash::as_str))
        .bind(user.role.as_str())
        .bind(user.status.as_str())
        .bind(&user.first_name)
        .bind(&user.last_name)
        .bind(user.created_at)
        .execute(&self.pool)
        .await
        .map_err(|error| error.to_string())?;

        Ok(User {
            id: user.id,
            login: user.login,
            password_hash: user.password_hash,
            role: user.role,
            status: user.status,
            first_name: user.first_name,
            last_name: user.last_name,
            created_at: user.created_at,
        })
    }

    async fn create_first_admin(&self, user: NewUser) -> Result<Option<User>, String> {
        let row = sqlx::query(
            r#"
            INSERT INTO users (
                id, login, password_hash, role, status, first_name, last_name, created_at
            )
            SELECT ?, ?, ?, ?, ?, ?, ?, ?
            WHERE NOT EXISTS (SELECT 1 FROM users WHERE role = 'admin')
            RETURNING id, login, password_hash, role, status, first_name, last_name, created_at
            "#,
        )
        .bind(user.id.to_string())
        .bind(&user.login)
        .bind(user.password_hash.as_ref().map(PasswordHash::as_str))
        .bind(user.role.as_str())
        .bind(user.status.as_str())
        .bind(&user.first_name)
        .bind(&user.last_name)
        .bind(user.created_at)
        .fetch_optional(&self.pool)
        .await
        .map_err(|error| error.to_string())?;

        row.map(map_user).transpose()
    }

    async fn find_by_login(&self, login: &str) -> Result<Option<User>, String> {
        let row = sqlx::query(
            r#"
            SELECT id, login, password_hash, role, status, first_name, last_name, created_at
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
            SELECT id, login, password_hash, role, status, first_name, last_name, created_at
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

    async fn list(&self, filter: &UserListFilter) -> Result<Vec<User>, String> {
        let mut sql = String::from(
            r#"
            SELECT id, login, password_hash, role, status, first_name, last_name, created_at
            FROM users
            WHERE 1 = 1
            "#,
        );
        let mut binds: Vec<String> = Vec::new();

        if let Some(status) = filter.status {
            sql.push_str(" AND status = ?");
            binds.push(status.as_str().to_owned());
        }

        if let Some(query) = filter
            .query
            .as_ref()
            .map(|q| q.trim())
            .filter(|q| !q.is_empty())
        {
            sql.push_str(
                " AND (
                    login LIKE ? COLLATE NOCASE
                    OR IFNULL(first_name, '') LIKE ? COLLATE NOCASE
                    OR IFNULL(last_name, '') LIKE ? COLLATE NOCASE
                    OR (IFNULL(last_name, '') || ' ' || IFNULL(first_name, '')) LIKE ? COLLATE NOCASE
                )",
            );
            let pattern = format!("%{query}%");
            binds.push(pattern.clone());
            binds.push(pattern.clone());
            binds.push(pattern.clone());
            binds.push(pattern);
        }

        sql.push_str(" ORDER BY created_at DESC, login ASC");

        let mut query = sqlx::query(&sql);
        for value in &binds {
            query = query.bind(value);
        }

        let rows = query
            .fetch_all(&self.pool)
            .await
            .map_err(|error| error.to_string())?;

        rows.into_iter().map(map_user).collect()
    }

    async fn update_profile(&self, id: UserId, update: UserProfileUpdate) -> Result<User, String> {
        let current = self
            .find_by_id(id)
            .await?
            .ok_or_else(|| "user not found".to_owned())?;

        let first_name = update.first_name.or(current.first_name.clone());
        let last_name = update.last_name.or(current.last_name.clone());
        let role = update.role.unwrap_or(current.role);
        let status = update.status.unwrap_or(current.status);

        sqlx::query(
            r#"
            UPDATE users
            SET first_name = ?, last_name = ?, role = ?, status = ?
            WHERE id = ?
            "#,
        )
        .bind(&first_name)
        .bind(&last_name)
        .bind(role.as_str())
        .bind(status.as_str())
        .bind(id.to_string())
        .execute(&self.pool)
        .await
        .map_err(|error| error.to_string())?;

        self.find_by_id(id)
            .await?
            .ok_or_else(|| "user not found after update".to_owned())
    }

    async fn set_password(&self, id: UserId, password_hash: PasswordHash) -> Result<(), String> {
        let result = sqlx::query("UPDATE users SET password_hash = ? WHERE id = ?")
            .bind(password_hash.as_str())
            .bind(id.to_string())
            .execute(&self.pool)
            .await
            .map_err(|error| error.to_string())?;

        if result.rows_affected() == 0 {
            return Err("user not found".into());
        }
        Ok(())
    }

    async fn complete_onboarding(
        &self,
        id: UserId,
        first_name: String,
        last_name: String,
    ) -> Result<User, String> {
        sqlx::query(
            r#"
            UPDATE users
            SET first_name = ?, last_name = ?, status = ?
            WHERE id = ?
            "#,
        )
        .bind(&first_name)
        .bind(&last_name)
        .bind(UserStatus::Active.as_str())
        .bind(id.to_string())
        .execute(&self.pool)
        .await
        .map_err(|error| error.to_string())?;

        self.find_by_id(id)
            .await?
            .ok_or_else(|| "user not found after onboarding".to_owned())
    }

    async fn delete(&self, id: UserId) -> Result<bool, String> {
        let result = sqlx::query("DELETE FROM users WHERE id = ?")
            .bind(id.to_string())
            .execute(&self.pool)
            .await
            .map_err(|error| error.to_string())?;
        Ok(result.rows_affected() > 0)
    }
}

fn map_user(row: sqlx::sqlite::SqliteRow) -> Result<User, String> {
    let id =
        Uuid::parse_str(row.get::<String, _>("id").as_str()).map_err(|error| error.to_string())?;
    let role = row
        .get::<String, _>("role")
        .parse::<Role>()
        .map_err(|error| error.to_string())?;
    let status = row
        .get::<String, _>("status")
        .parse::<UserStatus>()
        .map_err(|error| error.to_string())?;
    let password_hash = row
        .get::<Option<String>, _>("password_hash")
        .map(PasswordHash::new);

    Ok(User {
        id: UserId::from_uuid(id),
        login: row.get("login"),
        password_hash,
        role,
        status,
        first_name: row.get("first_name"),
        last_name: row.get("last_name"),
        created_at: row.get("created_at"),
    })
}

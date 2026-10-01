use async_trait::async_trait;
use kernel::UserId;
use sqlx::Row;
use uuid::Uuid;

use crate::ports::{NewSession, SessionRecord, SessionRepository};

#[derive(Clone)]
pub struct SqlxSessionRepository {
    pool: db::Pool,
}

impl SqlxSessionRepository {
    pub fn new(pool: db::Pool) -> Self {
        Self { pool }
    }
}

#[async_trait]
impl SessionRepository for SqlxSessionRepository {
    async fn create(&self, session: NewSession) -> Result<(), String> {
        sqlx::query(
            r#"
            INSERT INTO sessions (token_hash, user_id, expires_at)
            VALUES (?, ?, ?)
            "#,
        )
        .bind(&session.token_hash)
        .bind(session.user_id.to_string())
        .bind(session.expires_at)
        .execute(&self.pool)
        .await
        .map_err(|error| error.to_string())?;
        Ok(())
    }

    async fn find_valid(
        &self,
        token_hash: &str,
        now: i64,
    ) -> Result<Option<SessionRecord>, String> {
        let row = sqlx::query(
            r#"
            SELECT token_hash, user_id, expires_at
            FROM sessions
            WHERE token_hash = ? AND expires_at > ?
            "#,
        )
        .bind(token_hash)
        .bind(now)
        .fetch_optional(&self.pool)
        .await
        .map_err(|error| error.to_string())?;

        row.map(|row| {
            let user_id = Uuid::parse_str(row.get::<String, _>("user_id").as_str())
                .map_err(|error| error.to_string())?;
            Ok(SessionRecord {
                token_hash: row.get("token_hash"),
                user_id: UserId::from_uuid(user_id),
                expires_at: row.get("expires_at"),
            })
        })
        .transpose()
    }

    async fn delete(&self, token_hash: &str) -> Result<(), String> {
        sqlx::query("DELETE FROM sessions WHERE token_hash = ?")
            .bind(token_hash)
            .execute(&self.pool)
            .await
            .map_err(|error| error.to_string())?;
        Ok(())
    }
}

use async_trait::async_trait;
use kernel::UserId;

#[derive(Debug, Clone)]
pub struct NewSession {
    pub token_hash: String,
    pub user_id: UserId,
    pub expires_at: i64,
}

#[derive(Debug, Clone)]
#[allow(dead_code)]
pub struct SessionRecord {
    pub token_hash: String,
    pub user_id: UserId,
    pub expires_at: i64,
}

#[async_trait]
pub trait SessionRepository: Send + Sync {
    async fn create(&self, session: NewSession) -> Result<(), String>;
    async fn find_valid(&self, token_hash: &str, now: i64)
    -> Result<Option<SessionRecord>, String>;
    async fn delete(&self, token_hash: &str) -> Result<(), String>;
}

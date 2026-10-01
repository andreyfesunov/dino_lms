use async_trait::async_trait;
use kernel::{Role, UserId};

use crate::domain::{NewUser, User};

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn create(&self, user: NewUser) -> Result<User, String>;
    async fn find_by_login(&self, login: &str) -> Result<Option<User>, String>;
    async fn find_by_id(&self, id: UserId) -> Result<Option<User>, String>;
    async fn count_by_role(&self, role: Role) -> Result<i64, String>;
}

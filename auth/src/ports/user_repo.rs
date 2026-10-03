use async_trait::async_trait;
use kernel::{Role, UserId};

use crate::domain::{NewUser, PasswordHash, User, UserListFilter, UserProfileUpdate};

#[async_trait]
pub trait UserRepository: Send + Sync {
    async fn create(&self, user: NewUser) -> Result<User, String>;
    async fn create_first_admin(&self, user: NewUser) -> Result<Option<User>, String>;
    async fn find_by_login(&self, login: &str) -> Result<Option<User>, String>;
    async fn find_by_id(&self, id: UserId) -> Result<Option<User>, String>;
    async fn count_by_role(&self, role: Role) -> Result<i64, String>;
    async fn list(&self, filter: &UserListFilter) -> Result<Vec<User>, String>;
    async fn update_profile(&self, id: UserId, update: UserProfileUpdate) -> Result<User, String>;
    async fn set_password(&self, id: UserId, password_hash: PasswordHash) -> Result<(), String>;
    /// Removes the user row. Returns `false` when the user does not exist.
    async fn delete(&self, id: UserId) -> Result<bool, String>;
    async fn complete_onboarding(
        &self,
        id: UserId,
        first_name: String,
        last_name: String,
    ) -> Result<User, String>;
}

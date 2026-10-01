use async_trait::async_trait;

use crate::{Actor, AuthzError, Permission};

#[async_trait]
pub trait Authorizer: Send + Sync {
    async fn authorize(&self, actor: &Actor, permission: Permission) -> Result<(), AuthzError>;

    fn permits(&self, actor: &Actor, permission: Permission) -> bool;
}

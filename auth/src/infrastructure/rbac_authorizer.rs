use async_trait::async_trait;
use kernel::{Actor, Authorizer, AuthzError, Permission};

use crate::domain::Ability;

#[derive(Debug, Default, Clone, Copy)]
pub struct RbacAuthorizer;

#[async_trait]
impl Authorizer for RbacAuthorizer {
    async fn authorize(&self, actor: &Actor, permission: Permission) -> Result<(), AuthzError> {
        if self.permits(actor, permission) {
            Ok(())
        } else {
            Err(AuthzError::Forbidden(permission))
        }
    }

    fn permits(&self, actor: &Actor, permission: Permission) -> bool {
        Ability::allows_any(&actor.roles, permission)
    }
}

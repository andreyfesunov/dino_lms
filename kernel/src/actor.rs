use crate::{Role, UserId};

#[derive(Debug, Clone)]
pub struct Actor {
    pub user_id: UserId,
    pub roles: Vec<Role>,
}

impl Actor {
    pub fn new(user_id: UserId, roles: impl IntoIterator<Item = Role>) -> Self {
        Self {
            user_id,
            roles: roles.into_iter().collect(),
        }
    }

    pub fn has_role(&self, role: Role) -> bool {
        self.roles.contains(&role)
    }
}

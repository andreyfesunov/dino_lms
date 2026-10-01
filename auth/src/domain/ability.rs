use kernel::{Permission, Role};

pub struct Ability;

impl Ability {
    pub fn allows(role: Role, permission: Permission) -> bool {
        match (role, permission) {
            (Role::Admin, Permission::CreateStudentAccount) => true,
            (Role::Student, _) => false,
        }
    }

    pub fn allows_any(roles: &[Role], permission: Permission) -> bool {
        roles.iter().any(|role| Self::allows(*role, permission))
    }
}

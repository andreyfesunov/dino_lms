use kernel::Actor;

use crate::domain::User;

pub fn actor_from_user(user: &User) -> Actor {
    Actor::new(user.id, [user.role])
}

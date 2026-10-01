use kernel::{Role, UserId};

use super::PasswordHash;

#[derive(Debug, Clone)]
pub struct User {
    pub id: UserId,
    pub login: String,
    pub password_hash: PasswordHash,
    pub role: Role,
    pub created_at: i64,
}

#[derive(Debug, Clone)]
pub struct NewUser {
    pub id: UserId,
    pub login: String,
    pub password_hash: PasswordHash,
    pub role: Role,
    pub created_at: i64,
}

use kernel::{Role, UserId};
use serde::Deserialize;

use crate::domain::UserStatus;

#[derive(Debug, Clone, Deserialize)]
pub struct InviteUsersCommand {
    pub emails: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct InviteUsersResult {
    pub created: Vec<InvitedUser>,
    pub skipped: Vec<String>,
}

#[derive(Debug, Clone)]
pub struct InvitedUser {
    pub user_id: UserId,
    pub login: String,
    pub temporary_password: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ListUsersCommand {
    pub query: Option<String>,
    pub status: Option<UserStatus>,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateUserCommand {
    pub user_id: UserId,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub role: Role,
    pub status: UserStatus,
}

#[derive(Debug, Clone, Deserialize)]
pub struct DeleteUserCommand {
    pub user_id: UserId,
}

#[derive(Debug, Clone, Deserialize)]
pub struct GeneratePasswordCommand {
    pub user_id: UserId,
}

#[derive(Debug, Clone)]
pub struct GeneratePasswordResult {
    pub user_id: UserId,
    pub login: String,
    pub temporary_password: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CompleteOnboardingCommand {
    pub first_name: String,
    pub last_name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct UpdateOwnProfileCommand {
    pub first_name: String,
    pub last_name: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ChangePasswordCommand {
    pub current_password: String,
    pub new_password: String,
}

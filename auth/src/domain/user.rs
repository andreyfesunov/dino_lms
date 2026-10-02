use kernel::{Role, UserId};

use super::{PasswordHash, UserStatus};

#[derive(Debug, Clone)]
pub struct User {
    pub id: UserId,
    pub login: String,
    pub password_hash: Option<PasswordHash>,
    pub role: Role,
    pub status: UserStatus,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub created_at: i64,
}

impl User {
    pub fn needs_onboarding(&self) -> bool {
        self.first_name
            .as_ref()
            .map(|value| value.trim().is_empty())
            .unwrap_or(true)
            || self
                .last_name
                .as_ref()
                .map(|value| value.trim().is_empty())
                .unwrap_or(true)
    }

    pub fn display_name(&self) -> String {
        match (
            self.first_name
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty()),
            self.last_name
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty()),
        ) {
            (Some(first), Some(last)) => format!("{last} {first}"),
            (Some(first), None) => first.to_owned(),
            (None, Some(last)) => last.to_owned(),
            (None, None) => self.login.clone(),
        }
    }

    pub fn short_name(&self) -> String {
        match (
            self.first_name
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty()),
            self.last_name
                .as_deref()
                .map(str::trim)
                .filter(|s| !s.is_empty()),
        ) {
            (Some(first), Some(last)) => {
                let initial = first.chars().next().unwrap_or(' ');
                format!("{last} {initial}.")
            }
            (Some(first), None) => first.to_owned(),
            (None, Some(last)) => last.to_owned(),
            (None, None) => self.login.clone(),
        }
    }
}

#[derive(Debug, Clone)]
pub struct NewUser {
    pub id: UserId,
    pub login: String,
    pub password_hash: Option<PasswordHash>,
    pub role: Role,
    pub status: UserStatus,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub created_at: i64,
}

#[derive(Debug, Clone, Default)]
pub struct UserListFilter {
    pub query: Option<String>,
    pub status: Option<UserStatus>,
}

#[derive(Debug, Clone)]
pub struct UserProfileUpdate {
    pub first_name: Option<String>,
    pub last_name: Option<String>,
    pub role: Option<Role>,
    pub status: Option<UserStatus>,
}

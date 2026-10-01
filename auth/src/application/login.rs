use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct LoginCommand {
    pub login: String,
    pub password: String,
}

#[derive(Debug, Clone)]
pub struct LoginResult {
    pub user: crate::domain::User,
}

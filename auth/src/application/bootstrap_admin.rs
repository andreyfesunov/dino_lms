use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct BootstrapAdminCommand {
    pub login: String,
    pub password: Option<String>,
}

#[derive(Debug, Clone)]
pub struct BootstrapAdminResult {
    pub user_id: kernel::UserId,
    pub login: String,
    pub temporary_password: Option<String>,
}

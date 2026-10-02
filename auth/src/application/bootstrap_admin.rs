use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct BootstrapAdminCommand {
    pub login: String,
    pub password: Option<String>,
    pub first_name: Option<String>,
    pub last_name: Option<String>,
}

#[derive(Debug, Clone)]
pub struct BootstrapAdminResult {
    pub user_id: kernel::UserId,
    pub login: String,
    pub temporary_password: Option<String>,
}

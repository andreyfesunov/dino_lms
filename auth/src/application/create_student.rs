use kernel::Actor;
use serde::Deserialize;

#[derive(Debug, Clone, Deserialize)]
pub struct CreateStudentCommand {
    pub login: String,
    pub password: Option<String>,
}

#[derive(Debug, Clone)]
pub struct CreateStudentResult {
    pub user_id: kernel::UserId,
    pub login: String,
    pub temporary_password: Option<String>,
    pub actor: Actor,
}

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum Permission {
    ManageUsers,
}

impl Permission {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::ManageUsers => "manage_users",
        }
    }
}

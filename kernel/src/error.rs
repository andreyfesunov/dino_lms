use thiserror::Error;

use crate::Permission;

#[derive(Debug, Error)]
pub enum AuthzError {
    #[error("unauthenticated")]
    Unauthenticated,
    #[error("forbidden: missing permission {0:?}")]
    Forbidden(Permission),
}

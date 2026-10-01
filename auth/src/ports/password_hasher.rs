use crate::domain::PasswordHash;

pub trait PasswordHasher: Send + Sync {
    fn hash(&self, password: &str) -> Result<PasswordHash, String>;
    fn verify(&self, password: &str, hash: &PasswordHash) -> Result<bool, String>;
}

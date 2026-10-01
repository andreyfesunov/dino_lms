use argon2::{
    Argon2,
    password_hash::{PasswordHash as PhcHash, PasswordHasher as _, PasswordVerifier, SaltString},
};
use rand::RngCore;

use crate::{domain::PasswordHash, ports::PasswordHasher};

#[derive(Debug, Default, Clone, Copy)]
pub struct Argon2Hasher;

impl PasswordHasher for Argon2Hasher {
    fn hash(&self, password: &str) -> Result<PasswordHash, String> {
        let mut salt_bytes = [0u8; 16];
        rand::rng().fill_bytes(&mut salt_bytes);
        let salt = SaltString::encode_b64(&salt_bytes).map_err(|error| error.to_string())?;
        let hash = Argon2::default()
            .hash_password(password.as_bytes(), &salt)
            .map_err(|error| error.to_string())?;
        Ok(PasswordHash::new(hash.to_string()))
    }

    fn verify(&self, password: &str, hash: &PasswordHash) -> Result<bool, String> {
        let parsed = PhcHash::new(hash.as_str()).map_err(|error| error.to_string())?;
        Ok(Argon2::default()
            .verify_password(password.as_bytes(), &parsed)
            .is_ok())
    }
}

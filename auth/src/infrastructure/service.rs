use std::time::{SystemTime, UNIX_EPOCH};

use kernel::{Actor, Authorizer, AuthzError, Permission, Role, UserId};
use thiserror::Error;

use crate::{
    application::{
        BootstrapAdminCommand, BootstrapAdminResult, CreateStudentCommand, CreateStudentResult,
        LoginCommand, LoginResult, actor_from_user,
    },
    domain::{NewUser, generate_password},
    infrastructure::{Argon2Hasher, RbacAuthorizer, SqlxSessionRepository, SqlxUserRepository},
    ports::{NewSession, PasswordHasher, SessionRepository, UserRepository},
};

#[derive(Debug, Error)]
pub enum AuthError {
    #[error(transparent)]
    Authz(#[from] AuthzError),
    #[error("invalid login or password")]
    InvalidCredentials,
    #[error("session user missing")]
    SessionUserMissing,
    #[error("{0}")]
    Message(String),
}

#[derive(Clone)]
pub struct AuthService {
    users: SqlxUserRepository,
    sessions: SqlxSessionRepository,
    hasher: Argon2Hasher,
    authorizer: RbacAuthorizer,
}

impl AuthService {
    pub fn new(pool: db::Pool) -> Self {
        Self {
            users: SqlxUserRepository::new(pool.clone()),
            sessions: SqlxSessionRepository::new(pool),
            hasher: Argon2Hasher,
            authorizer: RbacAuthorizer,
        }
    }

    pub fn authorizer(&self) -> &RbacAuthorizer {
        &self.authorizer
    }

    pub async fn bootstrap_admin(
        &self,
        command: BootstrapAdminCommand,
    ) -> Result<BootstrapAdminResult, AuthError> {
        let admins = self
            .users
            .count_by_role(Role::Admin)
            .await
            .map_err(AuthError::Message)?;
        if admins > 0 {
            return Err(AuthError::Message(
                "admin already exists; bootstrap refused".into(),
            ));
        }

        let (temporary_password, password) = match command.password {
            Some(password) if !password.is_empty() => (None, password),
            _ => {
                let generated = generate_password();
                (Some(generated.clone()), generated)
            }
        };

        let password_hash = self.hasher.hash(&password).map_err(AuthError::Message)?;
        let now = unix_now();
        let user = self
            .users
            .create(NewUser {
                id: UserId::new(),
                login: command.login.clone(),
                password_hash,
                role: Role::Admin,
                created_at: now,
            })
            .await
            .map_err(AuthError::Message)?;

        Ok(BootstrapAdminResult {
            user_id: user.id,
            login: user.login,
            temporary_password,
        })
    }

    pub async fn login(&self, command: LoginCommand) -> Result<LoginResult, AuthError> {
        let user = self
            .users
            .find_by_login(&command.login)
            .await
            .map_err(AuthError::Message)?
            .ok_or(AuthError::InvalidCredentials)?;

        let valid = self
            .hasher
            .verify(&command.password, &user.password_hash)
            .map_err(AuthError::Message)?;
        if !valid {
            return Err(AuthError::InvalidCredentials);
        }

        Ok(LoginResult { user })
    }

    pub async fn create_student(
        &self,
        actor: &Actor,
        command: CreateStudentCommand,
    ) -> Result<CreateStudentResult, AuthError> {
        self.authorizer
            .authorize(actor, Permission::CreateStudentAccount)
            .await?;

        let (temporary_password, password) = match command.password {
            Some(password) if !password.is_empty() => (None, password),
            _ => {
                let generated = generate_password();
                (Some(generated.clone()), generated)
            }
        };

        let password_hash = self.hasher.hash(&password).map_err(AuthError::Message)?;
        let now = unix_now();
        let user = self
            .users
            .create(NewUser {
                id: UserId::new(),
                login: command.login.clone(),
                password_hash,
                role: Role::Student,
                created_at: now,
            })
            .await
            .map_err(AuthError::Message)?;

        Ok(CreateStudentResult {
            user_id: user.id,
            login: user.login.clone(),
            temporary_password,
            actor: actor_from_user(&user),
        })
    }

    pub async fn persist_session(
        &self,
        user_id: UserId,
        token_hash: &[u8; 32],
        expires_at: SystemTime,
    ) -> Result<(), AuthError> {
        let expires_at = system_time_to_unix(expires_at)?;
        self.sessions
            .create(NewSession {
                token_hash: hex::encode(token_hash),
                user_id,
                expires_at,
            })
            .await
            .map_err(AuthError::Message)
    }

    pub async fn delete_session(&self, token_hash: &[u8; 32]) -> Result<(), AuthError> {
        self.sessions
            .delete(&hex::encode(token_hash))
            .await
            .map_err(AuthError::Message)
    }

    pub async fn actor_from_token_hash(
        &self,
        token_hash: &[u8; 32],
    ) -> Result<Option<Actor>, AuthError> {
        let now = unix_now();
        let Some(session) = self
            .sessions
            .find_valid(&hex::encode(token_hash), now)
            .await
            .map_err(AuthError::Message)?
        else {
            return Ok(None);
        };

        let user = self
            .users
            .find_by_id(session.user_id)
            .await
            .map_err(AuthError::Message)?
            .ok_or(AuthError::SessionUserMissing)?;

        Ok(Some(actor_from_user(&user)))
    }

    pub fn permits(&self, actor: &Actor, permission: Permission) -> bool {
        self.authorizer.permits(actor, permission)
    }
}

fn unix_now() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .unwrap_or(0)
}

fn system_time_to_unix(value: SystemTime) -> Result<i64, AuthError> {
    value
        .duration_since(UNIX_EPOCH)
        .map(|duration| duration.as_secs() as i64)
        .map_err(|error| AuthError::Message(error.to_string()))
}

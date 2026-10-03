use std::time::{SystemTime, UNIX_EPOCH};

use kernel::{Actor, Authorizer, AuthzError, Permission, Role, UserId};
use thiserror::Error;

use crate::{
    application::{
        BootstrapAdminCommand, BootstrapAdminResult, ChangePasswordCommand,
        CompleteOnboardingCommand, CreateStudentCommand, CreateStudentResult, DeleteUserCommand,
        GeneratePasswordCommand, GeneratePasswordResult, InviteUsersCommand, InviteUsersResult,
        InvitedUser, ListUsersCommand, LoginCommand, LoginResult, UpdateOwnProfileCommand,
        UpdateUserCommand, actor_from_user,
    },
    domain::{NewUser, User, UserListFilter, UserProfileUpdate, UserStatus, generate_password},
    infrastructure::{Argon2Hasher, RbacAuthorizer, SqlxSessionRepository, SqlxUserRepository},
    ports::{NewSession, PasswordHasher, SessionRepository, UserRepository},
};

#[derive(Debug, Error)]
pub enum AuthError {
    #[error(transparent)]
    Authz(#[from] AuthzError),
    #[error("an administrator already exists")]
    AdminExists,
    #[error("invalid login or password")]
    InvalidCredentials,
    #[error("session user missing")]
    SessionUserMissing,
    #[error("cannot delete your own account")]
    SelfDelete,
    #[error("user not found")]
    UserNotFound,
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

    pub async fn has_admin(&self) -> Result<bool, AuthError> {
        let admins = self
            .users
            .count_by_role(Role::Admin)
            .await
            .map_err(AuthError::Message)?;
        Ok(admins > 0)
    }

    pub async fn bootstrap_admin(
        &self,
        command: BootstrapAdminCommand,
    ) -> Result<BootstrapAdminResult, AuthError> {
        if self.has_admin().await? {
            return Err(AuthError::AdminExists);
        }

        let (temporary_password, password) = match command.password {
            Some(password) if !password.is_empty() => {
                if password.chars().count() < 8 {
                    return Err(AuthError::Message(
                        "password must be at least 8 characters".into(),
                    ));
                }
                (None, password)
            }
            _ => {
                let generated = generate_password();
                (Some(generated.clone()), generated)
            }
        };

        let clean = |value: &Option<String>| {
            value
                .as_deref()
                .map(str::trim)
                .filter(|value| !value.is_empty())
                .map(str::to_owned)
        };
        let first_name = clean(&command.first_name);
        let last_name = clean(&command.last_name);

        // A fully named admin is onboarded right away; a nameless one
        // (e.g. created via CLI) completes `/onboarding` on first sign-in.
        let status = if first_name.is_some() && last_name.is_some() {
            UserStatus::Active
        } else {
            UserStatus::Pending
        };

        let password_hash = self.hasher.hash(&password).map_err(AuthError::Message)?;
        let now = unix_now();
        let user = self
            .users
            .create_first_admin(NewUser {
                id: UserId::new(),
                login: command.login.clone(),
                password_hash: Some(password_hash),
                role: Role::Admin,
                status,
                first_name,
                last_name,
                created_at: now,
            })
            .await
            .map_err(AuthError::Message)?
            .ok_or(AuthError::AdminExists)?;

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

        let Some(password_hash) = user.password_hash.as_ref() else {
            return Err(AuthError::InvalidCredentials);
        };

        let valid = self
            .hasher
            .verify(&command.password, password_hash)
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
            .authorize(actor, Permission::ManageUsers)
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
                password_hash: Some(password_hash),
                role: Role::Student,
                status: UserStatus::Pending,
                first_name: None,
                last_name: None,
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

    pub async fn invite_users(
        &self,
        actor: &Actor,
        command: InviteUsersCommand,
    ) -> Result<InviteUsersResult, AuthError> {
        self.authorizer
            .authorize(actor, Permission::ManageUsers)
            .await?;

        let mut created = Vec::new();
        let mut skipped = Vec::new();
        let now = unix_now();

        for raw in command.emails {
            let login = raw.trim().to_owned();
            if login.is_empty() {
                continue;
            }

            if self
                .users
                .find_by_login(&login)
                .await
                .map_err(AuthError::Message)?
                .is_some()
            {
                skipped.push(login);
                continue;
            }

            let temporary_password = generate_password();
            let password_hash = self
                .hasher
                .hash(&temporary_password)
                .map_err(AuthError::Message)?;

            let user = self
                .users
                .create(NewUser {
                    id: UserId::new(),
                    login: login.clone(),
                    password_hash: Some(password_hash),
                    role: Role::Student,
                    status: UserStatus::Pending,
                    first_name: None,
                    last_name: None,
                    created_at: now,
                })
                .await
                .map_err(AuthError::Message)?;

            created.push(InvitedUser {
                user_id: user.id,
                login: user.login,
                temporary_password,
            });
        }

        Ok(InviteUsersResult { created, skipped })
    }

    pub async fn list_users(
        &self,
        actor: &Actor,
        command: ListUsersCommand,
    ) -> Result<Vec<User>, AuthError> {
        self.authorizer
            .authorize(actor, Permission::ManageUsers)
            .await?;

        self.users
            .list(&UserListFilter {
                query: command.query,
                status: command.status,
            })
            .await
            .map_err(AuthError::Message)
    }

    pub async fn get_user(&self, actor: &Actor, user_id: UserId) -> Result<User, AuthError> {
        self.authorizer
            .authorize(actor, Permission::ManageUsers)
            .await?;

        self.users
            .find_by_id(user_id)
            .await
            .map_err(AuthError::Message)?
            .ok_or_else(|| AuthError::Message("user not found".into()))
    }

    pub async fn current_user(&self, actor: &Actor) -> Result<User, AuthError> {
        self.users
            .find_by_id(actor.user_id)
            .await
            .map_err(AuthError::Message)?
            .ok_or(AuthError::SessionUserMissing)
    }

    pub async fn update_user(
        &self,
        actor: &Actor,
        command: UpdateUserCommand,
    ) -> Result<User, AuthError> {
        self.authorizer
            .authorize(actor, Permission::ManageUsers)
            .await?;

        // Keep first/last as a single "name" field UI may send "Last First" —
        // callers pass explicit first_name/last_name.
        self.users
            .update_profile(
                command.user_id,
                UserProfileUpdate {
                    first_name: command.first_name,
                    last_name: command.last_name,
                    role: Some(command.role),
                    status: Some(command.status),
                },
            )
            .await
            .map_err(AuthError::Message)
    }

    pub async fn generate_user_password(
        &self,
        actor: &Actor,
        command: GeneratePasswordCommand,
    ) -> Result<GeneratePasswordResult, AuthError> {
        self.authorizer
            .authorize(actor, Permission::ManageUsers)
            .await?;

        let user = self
            .users
            .find_by_id(command.user_id)
            .await
            .map_err(AuthError::Message)?
            .ok_or_else(|| AuthError::Message("user not found".into()))?;

        let temporary_password = generate_password();
        let password_hash = self
            .hasher
            .hash(&temporary_password)
            .map_err(AuthError::Message)?;
        self.users
            .set_password(user.id, password_hash)
            .await
            .map_err(AuthError::Message)?;

        Ok(GeneratePasswordResult {
            user_id: user.id,
            login: user.login,
            temporary_password,
        })
    }

    pub async fn delete_user(
        &self,
        actor: &Actor,
        command: DeleteUserCommand,
    ) -> Result<(), AuthError> {
        self.authorizer
            .authorize(actor, Permission::ManageUsers)
            .await?;

        if command.user_id == actor.user_id {
            return Err(AuthError::SelfDelete);
        }

        let user = self
            .users
            .find_by_id(command.user_id)
            .await
            .map_err(AuthError::Message)?
            .ok_or(AuthError::UserNotFound)?;

        // Sessions cascade at the database level (`sessions.user_id ... ON
        // DELETE CASCADE`), so a deleted user is signed out everywhere.
        let deleted = self
            .users
            .delete(user.id)
            .await
            .map_err(AuthError::Message)?;
        if !deleted {
            return Err(AuthError::UserNotFound);
        }

        Ok(())
    }

    pub async fn complete_onboarding(
        &self,
        actor: &Actor,
        command: CompleteOnboardingCommand,
    ) -> Result<User, AuthError> {
        let first_name = command.first_name.trim().to_owned();
        let last_name = command.last_name.trim().to_owned();
        if first_name.is_empty() || last_name.is_empty() {
            return Err(AuthError::Message(
                "first and last name are required".into(),
            ));
        }

        self.users
            .complete_onboarding(actor.user_id, first_name, last_name)
            .await
            .map_err(AuthError::Message)
    }

    pub async fn update_own_profile(
        &self,
        actor: &Actor,
        command: UpdateOwnProfileCommand,
    ) -> Result<User, AuthError> {
        let first_name = command.first_name.trim().to_owned();
        let last_name = command.last_name.trim().to_owned();
        if first_name.is_empty() || last_name.is_empty() {
            return Err(AuthError::Message(
                "first and last name are required".into(),
            ));
        }

        self.users
            .update_profile(
                actor.user_id,
                UserProfileUpdate {
                    first_name: Some(first_name),
                    last_name: Some(last_name),
                    role: None,
                    status: None,
                },
            )
            .await
            .map_err(AuthError::Message)
    }

    pub async fn change_password(
        &self,
        actor: &Actor,
        command: ChangePasswordCommand,
    ) -> Result<(), AuthError> {
        let user = self.current_user(actor).await?;
        let Some(password_hash) = user.password_hash.as_ref() else {
            return Err(AuthError::InvalidCredentials);
        };

        let valid = self
            .hasher
            .verify(&command.current_password, password_hash)
            .map_err(AuthError::Message)?;
        if !valid {
            return Err(AuthError::InvalidCredentials);
        }

        let new_password = command.new_password.trim();
        if new_password.len() < 8 {
            return Err(AuthError::Message(
                "new password must be at least 8 characters".into(),
            ));
        }

        let password_hash = self.hasher.hash(new_password).map_err(AuthError::Message)?;
        self.users
            .set_password(actor.user_id, password_hash)
            .await
            .map_err(AuthError::Message)
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

mod application;
mod domain;
mod infrastructure;
mod ports;

pub use application::{
    BootstrapAdminCommand, BootstrapAdminResult, CreateStudentCommand, CreateStudentResult,
    LoginCommand, LoginResult,
};
pub use domain::{NewUser, User};
pub use infrastructure::{AuthError, AuthService};
pub use kernel::{Actor, Authorizer, AuthzError, Permission, Role, UserId};

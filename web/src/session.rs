use auth::{AuthService, Permission, User};
use kernel::Actor;
use topcoat::{
    Result,
    context::{Cx, app_context},
    router::{error::RouterErrorExt, request::uri},
    session,
};

use crate::i18n::{auth_error, t};

pub async fn current_actor(cx: &Cx) -> Result<Option<Actor>> {
    let Some(hash) = session::token_hash(cx).await? else {
        return Ok(None);
    };

    let auth: &AuthService = app_context(cx);
    auth.actor_from_token_hash(&*hash)
        .await
        .map_err(|error| auth_error(cx, error))
}

pub async fn current_user(cx: &Cx) -> Result<Option<User>> {
    let Some(actor) = current_actor(cx).await? else {
        return Ok(None);
    };
    let auth: &AuthService = app_context(cx);
    Ok(Some(
        auth.current_user(&actor)
            .await
            .map_err(|error| auth_error(cx, error))?,
    ))
}

pub async fn require_actor(cx: &Cx) -> Result<Actor> {
    Ok(current_actor(cx).await?.ok_or_redirect("/login")?)
}

pub async fn require_user(cx: &Cx) -> Result<(Actor, User)> {
    let actor = require_actor(cx).await?;
    let auth: &AuthService = app_context(cx);
    let user = auth
        .current_user(&actor)
        .await
        .map_err(|error| auth_error(cx, error))?;
    Ok((actor, user))
}

pub async fn require_permission(cx: &Cx, permission: Permission) -> Result<(Actor, User)> {
    let (actor, user) = require_onboarded(cx).await?;
    let auth: &AuthService = app_context(cx);
    if !auth.permits(&actor, permission) {
        return Err(topcoat::Error::msg(t(cx, "error-forbidden")));
    }
    Ok((actor, user))
}

/// Authenticated user who still needs onboarding may only stay on onboarding.
pub async fn require_onboarded(cx: &Cx) -> Result<(Actor, User)> {
    let (actor, user) = require_user(cx).await?;
    if user.needs_onboarding() && uri(cx).path() != "/onboarding" {
        None::<()>.ok_or_redirect("/onboarding")?;
    }
    Ok((actor, user))
}

pub async fn require_needs_onboarding(cx: &Cx) -> Result<(Actor, User)> {
    let (actor, user) = require_user(cx).await?;
    if !user.needs_onboarding() {
        None::<()>.ok_or_redirect("/")?;
    }
    Ok((actor, user))
}

use auth::{AuthService, Permission};
use kernel::Actor;
use topcoat::{
    Result,
    context::{Cx, app_context},
    router::error::RouterErrorExt,
    session,
};

pub async fn current_actor(cx: &Cx) -> Result<Option<Actor>> {
    let Some(hash) = session::token_hash(cx).await? else {
        return Ok(None);
    };

    let auth: &AuthService = app_context(cx);
    auth.actor_from_token_hash(&*hash)
        .await
        .map_err(|error| topcoat::Error::msg(error.to_string()))
}

pub async fn require_actor(cx: &Cx) -> Result<Actor> {
    Ok(current_actor(cx).await?.ok_or_redirect("/login")?)
}

pub async fn require_permission(cx: &Cx, permission: Permission) -> Result<Actor> {
    let actor = require_actor(cx).await?;
    let auth: &AuthService = app_context(cx);
    if !auth.permits(&actor, permission) {
        return Err(topcoat::Error::msg("forbidden"));
    }
    Ok(actor)
}

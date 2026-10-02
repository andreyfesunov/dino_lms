use std::{borrow::Cow, collections::HashMap};

use auth::{AuthError, AuthzError};
use fluent_templates::{
    LanguageIdentifier, Loader, fluent_bundle::FluentValue, langid, static_loader,
};
use serde::Deserialize;
use topcoat::{
    Result,
    context::Cx,
    cookie::{Cookie, Cookies, SameSite, cookies, time::Duration},
    router::{
        content::Form,
        error::{SeeOther, see_other},
        request::headers,
        route,
    },
};

static_loader! {
    static LOCALES = {
        locales: "./locales",
        fallback_language: "en",
        customise: |bundle| bundle.set_use_isolating(false),
    };
}

const COOKIE_NAME: &str = "lang";
const EN: LanguageIdentifier = langid!("en");
const RU: LanguageIdentifier = langid!("ru");

#[derive(Debug, Deserialize)]
pub struct LocaleForm {
    pub lang: String,
}

pub fn locale(cx: &Cx) -> LanguageIdentifier {
    if let Some(cookie) = cookies(cx).get(COOKIE_NAME)
        && let Some(lang) = parse_supported(cookie.value())
    {
        return lang;
    }

    if let Some(header) = headers(cx).get("accept-language")
        && let Ok(value) = header.to_str()
    {
        for part in value.split(',') {
            let tag = part.split(';').next().unwrap_or("").trim();
            if let Some(lang) = parse_supported(tag) {
                return lang;
            }
        }
    }

    EN
}

pub fn locale_code(cx: &Cx) -> &'static str {
    lang_code(&locale(cx))
}

pub fn t(cx: &Cx, key: &str) -> String {
    LOCALES.lookup(&locale(cx), key)
}

pub fn t_args<'a>(
    cx: &Cx,
    key: &str,
    args: impl IntoIterator<Item = (&'static str, FluentValue<'a>)>,
) -> String {
    let map: HashMap<Cow<'static, str>, FluentValue<'a>> = args
        .into_iter()
        .map(|(k, v)| (Cow::Borrowed(k), v))
        .collect();
    LOCALES.lookup_with_args(&locale(cx), key, &map)
}

pub fn auth_error(cx: &Cx, error: AuthError) -> topcoat::Error {
    let key = match &error {
        AuthError::InvalidCredentials => "error-invalid-credentials",
        AuthError::SessionUserMissing => "error-session-user-missing",
        AuthError::Authz(AuthzError::Unauthenticated) => "error-unauthenticated",
        AuthError::Authz(AuthzError::Forbidden(_)) => "error-forbidden",
        AuthError::Message(_) => "error-generic",
    };
    topcoat::Error::msg(t(cx, key))
}

#[route(POST "/locale")]
async fn set_locale(cx: &Cx, Form(input): Form<LocaleForm>) -> Result<SeeOther> {
    if let Some(lang) = parse_supported(&input.lang) {
        cookies(cx).add(
            Cookie::build((COOKIE_NAME, lang_code(&lang)))
                .path("/")
                .max_age(Duration::days(365))
                .same_site(SameSite::Lax)
                .build(),
        );
    }

    let redirect = headers(cx)
        .get("referer")
        .and_then(|value| value.to_str().ok())
        .and_then(http_path_from_referer)
        .unwrap_or_else(|| "/".to_owned());

    Ok(see_other(redirect))
}

fn parse_supported(value: &str) -> Option<LanguageIdentifier> {
    let primary = value
        .split(['-', '_', ';', ','])
        .next()
        .unwrap_or(value)
        .trim()
        .to_ascii_lowercase();
    match primary.as_str() {
        "en" => Some(EN),
        "ru" => Some(RU),
        _ => None,
    }
}

fn lang_code(lang: &LanguageIdentifier) -> &'static str {
    if lang.language == RU.language {
        "ru"
    } else {
        "en"
    }
}

fn http_path_from_referer(referer: &str) -> Option<String> {
    if referer.starts_with('/') {
        return Some(referer.to_owned());
    }
    let rest = referer
        .strip_prefix("http://")
        .or_else(|| referer.strip_prefix("https://"))?;
    let path = rest.find('/').map(|idx| &rest[idx..]).unwrap_or("/");
    Some(path.to_owned())
}

use std::path::{Path, PathBuf};

use figment::{
    Figment,
    providers::{Env, Format, Serialized, Toml},
};
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Config {
    pub database: DatabaseConfig,
    pub courses: CoursesConfig,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DatabaseConfig {
    pub path: PathBuf,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoursesConfig {
    /// Directory holding declarative course bundles
    /// (`{course-id}/config.toml`, chapters, lessons, media).
    pub dir: PathBuf,
}

impl Default for CoursesConfig {
    fn default() -> Self {
        Self {
            dir: PathBuf::from("courses"),
        }
    }
}

impl Default for Config {
    fn default() -> Self {
        Self {
            database: DatabaseConfig {
                path: PathBuf::from("data/dino.sqlite"),
            },
            courses: CoursesConfig::default(),
        }
    }
}

impl DatabaseConfig {
    pub fn url(&self) -> String {
        sqlite_url(&self.path)
    }
}

impl Config {
    pub fn load() -> Result<Self, figment::Error> {
        Figment::new()
            .merge(Serialized::defaults(Config::default()))
            .merge(Toml::file("dino.toml"))
            .merge(Env::prefixed("DINO_").split("__"))
            .extract()
    }
}

fn sqlite_url(path: &Path) -> String {
    let path = path.to_string_lossy().replace('\\', "/");
    format!("sqlite:{path}?mode=rwc")
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn default_sqlite_url() {
        let cfg = Config::default();
        assert_eq!(cfg.database.url(), "sqlite:data/dino.sqlite?mode=rwc");
    }

    #[test]
    fn default_courses_dir() {
        let cfg = Config::default();
        assert_eq!(cfg.courses.dir, PathBuf::from("courses"));
    }
}

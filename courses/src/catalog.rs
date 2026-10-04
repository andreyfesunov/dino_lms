use std::{
    path::{Path, PathBuf},
    sync::RwLock,
    time::SystemTime,
};

use crate::config::CourseConfig;

/// In-memory directory of course bundles loaded from disk.
///
/// The directory scans `{root}/{course-id}/config.toml` bundles and caches
/// them, invalidating when any config file (or bundle directory) changes its
/// modification time, so editing a course does not require a restart.
#[derive(Debug)]
pub struct Catalog {
    root: PathBuf,
    cache: RwLock<Cache>,
}

#[derive(Debug, Default)]
struct Cache {
    stamp: Option<u128>,
    courses: Vec<CourseConfig>,
}

impl Catalog {
    pub fn open(root: impl Into<PathBuf>) -> Self {
        Self {
            root: root.into(),
            cache: RwLock::new(Cache::default()),
        }
    }

    /// Root directory holding the course bundles.
    pub fn root(&self) -> &Path {
        &self.root
    }

    /// All courses in stable id order. Missing or invalid bundles are skipped
    /// so one broken course cannot take the catalog down.
    pub fn list(&self) -> Vec<CourseConfig> {
        self.refresh()
    }

    pub fn get(&self, course_id: &str) -> Option<CourseConfig> {
        self.refresh()
            .iter()
            .find(|course| course.id == course_id)
            .cloned()
    }

    /// Filesystem path of a lesson markdown file.
    pub fn lesson_file(&self, course_id: &str, chapter_id: &str, lesson_id: &str) -> PathBuf {
        self.root
            .join(course_id)
            .join(chapter_id)
            .join(format!("{lesson_id}.md"))
    }

    /// Number of lessons declared by a course, if it exists.
    pub fn total_lessons(&self, course_id: &str) -> Option<usize> {
        self.get(course_id).map(|course| course.total_lessons())
    }

    fn refresh(&self) -> Vec<CourseConfig> {
        let stamp = scan_stamp(&self.root);
        {
            let cache = self.cache.read().expect("catalog cache poisoned");
            if cache.stamp == stamp {
                return cache.courses.clone();
            }
        }
        let courses = load_courses(&self.root);
        {
            let mut cache = self.cache.write().expect("catalog cache poisoned");
            if cache.stamp != stamp {
                cache.stamp = stamp;
                cache.courses = courses.clone();
            }
        }
        // Re-read through the read lock: a racing writer may have refreshed
        // with a newer stamp, and its scan is the authoritative one.
        let cache = self.cache.read().expect("catalog cache poisoned");
        cache.courses.clone()
    }
}

fn load_courses(root: &Path) -> Vec<CourseConfig> {
    let mut courses = Vec::new();
    let Ok(entries) = std::fs::read_dir(root) else {
        return courses;
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        if path.join("config.toml").is_file()
            && let Ok(config) = CourseConfig::load(&path)
        {
            courses.push(config);
        }
    }
    courses.sort_by(|a, b| a.id.cmp(&b.id));
    courses
}

/// Fingerprint of the catalog: max mtime over the root directory, its bundle
/// subdirectories, and their `config.toml` files.
fn scan_stamp(root: &Path) -> Option<u128> {
    let mut newest: Option<SystemTime> = None;
    let mut consider = |time: std::io::Result<SystemTime>| {
        if let Ok(time) = time
            && newest.is_none_or(|current| time > current)
        {
            newest = Some(time);
        }
    };

    consider(std::fs::metadata(root).and_then(|m| m.modified()));
    let Ok(entries) = std::fs::read_dir(root) else {
        return newest.map(duration_u128);
    };
    for entry in entries.flatten() {
        let path = entry.path();
        if !path.is_dir() {
            continue;
        }
        consider(entry.metadata().and_then(|m| m.modified()));
        let config = path.join("config.toml");
        if config.is_file() {
            consider(std::fs::metadata(&config).and_then(|m| m.modified()));
        }
    }
    newest.map(duration_u128)
}

fn duration_u128(time: SystemTime) -> u128 {
    time.duration_since(SystemTime::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0)
}

#[cfg(test)]
mod tests {
    use super::*;

    fn write_course(root: &Path, id: &str, chapters: &str) {
        let dir = root.join(id);
        std::fs::create_dir_all(dir.join("ch1")).unwrap();
        std::fs::write(
            dir.join("config.toml"),
            format!(
                "id = \"{id}\"\ntitle = \"Course {id}\"\n\n[[chapters]]\nid = \"ch1\"\ntitle = \"Chapter 1\"\n{chapters}\n"
            ),
        )
        .unwrap();
        std::fs::write(dir.join("ch1").join("intro.md"), "# intro").unwrap();
    }

    #[test]
    fn lists_and_gets_courses() {
        let tmp = std::env::temp_dir().join(format!(
            "dino-catalog-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(&tmp).unwrap();
        write_course(&tmp, "b-course", "lessons = [{ id = \"intro\" }]");
        write_course(&tmp, "a-course", "lessons = [{ id = \"intro\" }]");

        let catalog = Catalog::open(&tmp);
        let ids: Vec<String> = catalog.list().iter().map(|c| c.id.clone()).collect();
        assert_eq!(ids, ["a-course", "b-course"]);
        assert!(catalog.get("b-course").is_some());
        assert!(catalog.get("missing").is_none());
        assert_eq!(catalog.total_lessons("b-course"), Some(1));

        std::fs::remove_dir_all(&tmp).unwrap();
    }

    #[test]
    fn skips_invalid_bundles() {
        let tmp = std::env::temp_dir().join(format!(
            "dino-catalog-bad-{}-{}",
            std::process::id(),
            std::time::SystemTime::now()
                .duration_since(std::time::UNIX_EPOCH)
                .unwrap()
                .as_millis()
        ));
        let _ = std::fs::remove_dir_all(&tmp);
        std::fs::create_dir_all(tmp.join("broken")).unwrap();
        std::fs::write(tmp.join("broken").join("config.toml"), "not = toml").unwrap();

        let catalog = Catalog::open(&tmp);
        assert!(catalog.list().is_empty());

        std::fs::remove_dir_all(&tmp).unwrap();
    }
}

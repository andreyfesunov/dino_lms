use async_trait::async_trait;
use kernel::UserId;
use sqlx::Row;

use crate::ports::CourseRepository;
use crate::service::CourseAccess;

/// SQLite-backed store of course grants and lesson progress.
#[derive(Clone)]
pub struct SqlxCourseRepository {
    pool: db::Pool,
}

impl SqlxCourseRepository {
    pub fn new(pool: db::Pool) -> Self {
        Self { pool }
    }
}

fn parse_open_chapters(raw: &str) -> Vec<String> {
    if raw.trim() == "*" {
        return vec!["*".to_owned()];
    }
    raw.split(',')
        .map(str::trim)
        .filter(|id| !id.is_empty())
        .map(str::to_owned)
        .collect()
}

#[async_trait]
impl CourseRepository for SqlxCourseRepository {
    async fn access(
        &self,
        user_id: UserId,
        course_id: &str,
    ) -> Result<Option<CourseAccess>, String> {
        let row = sqlx::query(
            r#"
            SELECT open_chapters
            FROM course_access
            WHERE user_id = ? AND course_id = ?
            "#,
        )
        .bind(user_id.to_string())
        .bind(course_id)
        .fetch_optional(&self.pool)
        .await
        .map_err(|error| error.to_string())?;

        Ok(row.map(|row| CourseAccess {
            user_id,
            course_id: course_id.to_owned(),
            open_chapters: parse_open_chapters(&row.get::<String, _>("open_chapters")),
        }))
    }

    async fn access_list(&self, user_id: UserId) -> Result<Vec<CourseAccess>, String> {
        let rows = sqlx::query(
            r#"
            SELECT course_id, open_chapters
            FROM course_access
            WHERE user_id = ?
            "#,
        )
        .bind(user_id.to_string())
        .fetch_all(&self.pool)
        .await
        .map_err(|error| error.to_string())?;

        Ok(rows
            .into_iter()
            .map(|row| CourseAccess {
                user_id,
                course_id: row.get("course_id"),
                open_chapters: parse_open_chapters(&row.get::<String, _>("open_chapters")),
            })
            .collect())
    }

    async fn course_students(&self, course_id: &str) -> Result<Vec<UserId>, String> {
        let rows = sqlx::query(
            r#"
            SELECT user_id
            FROM course_access
            WHERE course_id = ?
            ORDER BY created_at
            "#,
        )
        .bind(course_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|error| error.to_string())?;

        rows.into_iter()
            .map(|row| {
                let raw: String = row.get("user_id");
                raw.parse::<UserId>().map_err(|error| error.to_string())
            })
            .collect()
    }

    async fn grant(
        &self,
        user_id: UserId,
        course_id: &str,
        open_chapters: &[String],
        granted_by: UserId,
    ) -> Result<(), String> {
        let mut joined = open_chapters.join(",");
        if joined.is_empty() {
            joined.push('*');
        }
        sqlx::query(
            r#"
            INSERT INTO course_access (user_id, course_id, open_chapters, granted_by, created_at)
            VALUES (?, ?, ?, ?, unixepoch())
            ON CONFLICT (user_id, course_id)
            DO UPDATE SET open_chapters = excluded.open_chapters,
                          granted_by = excluded.granted_by
            "#,
        )
        .bind(user_id.to_string())
        .bind(course_id)
        .bind(joined)
        .bind(granted_by.to_string())
        .execute(&self.pool)
        .await
        .map_err(|error| error.to_string())?;
        Ok(())
    }

    async fn revoke(&self, user_id: UserId, course_id: &str) -> Result<(), String> {
        sqlx::query("DELETE FROM course_access WHERE user_id = ? AND course_id = ?")
            .bind(user_id.to_string())
            .bind(course_id)
            .execute(&self.pool)
            .await
            .map_err(|error| error.to_string())?;
        Ok(())
    }

    async fn completed_lessons(
        &self,
        user_id: UserId,
        course_id: &str,
    ) -> Result<Vec<String>, String> {
        let rows = sqlx::query(
            r#"
            SELECT lesson_key
            FROM lesson_progress
            WHERE user_id = ? AND course_id = ?
            "#,
        )
        .bind(user_id.to_string())
        .bind(course_id)
        .fetch_all(&self.pool)
        .await
        .map_err(|error| error.to_string())?;

        Ok(rows
            .into_iter()
            .map(|row| row.get::<String, _>("lesson_key"))
            .collect())
    }

    async fn mark_lesson_done(
        &self,
        user_id: UserId,
        course_id: &str,
        lesson_key: &str,
    ) -> Result<(), String> {
        sqlx::query(
            r#"
            INSERT INTO lesson_progress (user_id, course_id, lesson_key, completed_at)
            VALUES (?, ?, ?, unixepoch())
            ON CONFLICT (user_id, course_id, lesson_key) DO NOTHING
            "#,
        )
        .bind(user_id.to_string())
        .bind(course_id)
        .bind(lesson_key)
        .execute(&self.pool)
        .await
        .map_err(|error| error.to_string())?;
        Ok(())
    }

    async fn mark_lesson_undone(
        &self,
        user_id: UserId,
        course_id: &str,
        lesson_key: &str,
    ) -> Result<(), String> {
        sqlx::query(
            "DELETE FROM lesson_progress WHERE user_id = ? AND course_id = ? AND lesson_key = ?",
        )
        .bind(user_id.to_string())
        .bind(course_id)
        .bind(lesson_key)
        .execute(&self.pool)
        .await
        .map_err(|error| error.to_string())?;
        Ok(())
    }
}

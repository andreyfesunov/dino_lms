-- Course access grants and lesson progress.
--
-- course_access: one row per (user, course) grant. `open_chapters` is either
-- '*' (every chapter) or a comma-separated list of chapter ids.
-- lesson_progress: one row per completed lesson per user, keyed by
-- "{chapter-id}/{lesson-id}" so the on-disk layout stays the source of truth.
CREATE TABLE course_access (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL,
    open_chapters TEXT NOT NULL DEFAULT '*' CHECK (length(open_chapters) > 0),
    granted_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, course_id)
);

CREATE TABLE lesson_progress (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL,
    lesson_key TEXT NOT NULL CHECK (length(lesson_key) > 0),
    completed_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, course_id, lesson_key)
);

CREATE INDEX course_access_course_idx ON course_access(course_id);
CREATE INDEX lesson_progress_course_idx ON lesson_progress(course_id);

CREATE TABLE lesson_version_state (
    id INTEGER PRIMARY KEY CHECK (id = 1)
);

CREATE TABLE lesson_versions (
    course_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    current_hash TEXT NOT NULL,
    previous_hash TEXT,
    change_type TEXT NOT NULL DEFAULT '',
    changed_at INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (course_id, chapter_id, lesson_id)
);

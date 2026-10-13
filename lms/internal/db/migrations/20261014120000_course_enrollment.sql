-- A course assignment may remain even when every chapter is closed.
CREATE TABLE course_access_new (
    user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL,
    open_chapters TEXT NOT NULL DEFAULT '',
    granted_by TEXT NOT NULL REFERENCES users(id),
    created_at INTEGER NOT NULL,
    PRIMARY KEY (user_id, course_id)
);

INSERT INTO course_access_new SELECT * FROM course_access;
DROP TABLE course_access;
ALTER TABLE course_access_new RENAME TO course_access;
CREATE INDEX course_access_course_idx ON course_access(course_id);

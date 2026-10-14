CREATE TABLE practice_attempts (
    id TEXT PRIMARY KEY NOT NULL,
    student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    course_id TEXT NOT NULL,
    chapter_id TEXT NOT NULL,
    lesson_id TEXT NOT NULL,
    attempt_number INTEGER NOT NULL CHECK (attempt_number > 0),
    repository_url TEXT NOT NULL,
    report TEXT NOT NULL DEFAULT '',
    message TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK (status IN ('submitted', 'revision_requested', 'accepted')),
    feedback TEXT NOT NULL DEFAULT '',
    submitted_at INTEGER NOT NULL,
    reviewed_by TEXT REFERENCES users(id) ON DELETE SET NULL,
    reviewed_at INTEGER,
    UNIQUE(student_id, course_id, chapter_id, lesson_id, attempt_number)
);

CREATE INDEX practice_attempts_course_status ON practice_attempts(course_id, status, submitted_at DESC);
CREATE INDEX practice_attempts_student ON practice_attempts(student_id, submitted_at DESC);

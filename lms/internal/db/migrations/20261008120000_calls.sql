CREATE TABLE call_settings (
 course_id TEXT NOT NULL,
 chapter_id TEXT NOT NULL,
 lesson_id TEXT NOT NULL,
 teacher_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 duration_min INTEGER NOT NULL DEFAULT 30 CHECK(duration_min BETWEEN 5 AND 480),
 timezone TEXT NOT NULL DEFAULT 'UTC',
 version INTEGER NOT NULL DEFAULT 1,
 PRIMARY KEY(course_id, chapter_id, lesson_id)
);
CREATE TABLE call_windows (
 id TEXT PRIMARY KEY,
 course_id TEXT NOT NULL,
 chapter_id TEXT NOT NULL,
 lesson_id TEXT NOT NULL,
 starts_at INTEGER NOT NULL,
 ends_at INTEGER NOT NULL CHECK(ends_at > starts_at),
 FOREIGN KEY(course_id, chapter_id, lesson_id) REFERENCES call_settings ON DELETE CASCADE
);
CREATE INDEX call_windows_lesson ON call_windows(course_id, chapter_id, lesson_id, starts_at);
CREATE TABLE calls (
 id TEXT PRIMARY KEY,
 course_id TEXT NOT NULL,
 chapter_id TEXT NOT NULL,
 lesson_id TEXT NOT NULL,
 course_title TEXT NOT NULL,
 lesson_title TEXT NOT NULL,
 teacher_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 student_id TEXT REFERENCES users(id) ON DELETE SET NULL,
 teacher_name TEXT NOT NULL,
 student_name TEXT NOT NULL,
 starts_at INTEGER NOT NULL,
 ends_at INTEGER NOT NULL CHECK(ends_at > starts_at),
 status TEXT NOT NULL DEFAULT 'scheduled' CHECK(status IN ('scheduled','cancelled','completed')),
 meeting_url TEXT NOT NULL DEFAULT '',
 version INTEGER NOT NULL DEFAULT 1,
 created_at INTEGER NOT NULL
);
CREATE UNIQUE INDEX calls_one_lesson ON calls(student_id, course_id, chapter_id, lesson_id) WHERE status IN ('scheduled','completed');
CREATE INDEX calls_teacher_time ON calls(teacher_id, status, starts_at, ends_at);
CREATE INDEX calls_student_time ON calls(student_id, status, starts_at, ends_at);

-- Protect user lifecycle at the database boundary, including bulk operations.
CREATE TRIGGER calls_user_delete BEFORE DELETE ON users
WHEN EXISTS(SELECT 1 FROM call_settings WHERE teacher_id = OLD.id)
 OR EXISTS(SELECT 1 FROM calls WHERE status = 'scheduled' AND (teacher_id = OLD.id OR student_id = OLD.id))
BEGIN SELECT RAISE(ABORT, 'calls_user_busy'); END;
CREATE TRIGGER calls_teacher_role BEFORE UPDATE OF role ON users
WHEN OLD.role = 'teacher' AND NEW.role != 'teacher' AND (
 EXISTS(SELECT 1 FROM call_settings WHERE teacher_id = OLD.id)
 OR EXISTS(SELECT 1 FROM calls WHERE status = 'scheduled' AND teacher_id = OLD.id))
BEGIN SELECT RAISE(ABORT, 'calls_user_busy'); END;

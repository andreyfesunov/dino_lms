CREATE TABLE teacher_schedules (
    teacher_id TEXT PRIMARY KEY NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    timezone TEXT NOT NULL,
    horizon_weeks INTEGER NOT NULL DEFAULT 12 CHECK(horizon_weeks BETWEEN 1 AND 52),
    version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE teacher_weekly_windows (
    id TEXT PRIMARY KEY NOT NULL,
    teacher_id TEXT NOT NULL REFERENCES teacher_schedules(teacher_id) ON DELETE CASCADE,
    weekday INTEGER NOT NULL CHECK(weekday BETWEEN 0 AND 6),
    start_minute INTEGER NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
    end_minute INTEGER NOT NULL CHECK(end_minute BETWEEN 1 AND 1440 AND end_minute > start_minute)
);
CREATE INDEX teacher_weekly_windows_day ON teacher_weekly_windows(teacher_id,weekday,start_minute);

CREATE TABLE teacher_schedule_exceptions (
    teacher_id TEXT NOT NULL REFERENCES teacher_schedules(teacher_id) ON DELETE CASCADE,
    local_date TEXT NOT NULL,
    PRIMARY KEY(teacher_id,local_date)
);

CREATE TABLE teacher_exception_windows (
    teacher_id TEXT NOT NULL,
    local_date TEXT NOT NULL,
    start_minute INTEGER NOT NULL CHECK(start_minute BETWEEN 0 AND 1439),
    end_minute INTEGER NOT NULL CHECK(end_minute BETWEEN 1 AND 1440 AND end_minute > start_minute),
    PRIMARY KEY(teacher_id,local_date,start_minute),
    FOREIGN KEY(teacher_id,local_date) REFERENCES teacher_schedule_exceptions(teacher_id,local_date) ON DELETE CASCADE
);

DELETE FROM call_windows;

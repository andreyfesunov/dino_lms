-- Rebuild users to widen role check, add profile fields, and allow nullable password.
CREATE TABLE users_new (
    id TEXT PRIMARY KEY NOT NULL,
    login TEXT NOT NULL UNIQUE COLLATE NOCASE,
    password_hash TEXT,
    role TEXT NOT NULL CHECK (role IN ('admin', 'teacher', 'student')),
    status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'active')),
    first_name TEXT,
    last_name TEXT,
    created_at INTEGER NOT NULL
);

INSERT INTO users_new (id, login, password_hash, role, status, first_name, last_name, created_at)
SELECT
    id,
    login,
    password_hash,
    role,
    CASE WHEN role = 'admin' THEN 'active' ELSE 'pending' END,
    NULL,
    NULL,
    created_at
FROM users;

DROP TABLE users;
ALTER TABLE users_new RENAME TO users;

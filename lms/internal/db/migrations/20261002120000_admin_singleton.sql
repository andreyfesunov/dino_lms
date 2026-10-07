-- A system may have at most one bootstrap administrator: this partial unique
-- index is the hard guarantee behind `create_first_admin`.
CREATE UNIQUE INDEX IF NOT EXISTS users_admin_singleton
ON users(role)
WHERE role = 'admin';

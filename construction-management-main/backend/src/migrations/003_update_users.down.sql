-- Prevent writes between the data checks and schema changes.
LOCK TABLE users IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE role_id IS NOT NULL) THEN
        RAISE EXCEPTION 'Cannot rollback users: role assignments would be lost.';
    END IF;

    IF EXISTS (SELECT 1 FROM users WHERE char_length(email) > 150) THEN
        RAISE EXCEPTION 'Cannot rollback users: some emails exceed the original 150-character limit.';
    END IF;

    IF EXISTS (SELECT 1 FROM users WHERE username IS NULL) THEN
        RAISE EXCEPTION 'Cannot rollback users: the original schema requires a username for every user.';
    END IF;
END;
$$;

DROP INDEX users_role_id_idx;

ALTER TABLE users
    DROP COLUMN role_id,
    ALTER COLUMN email TYPE VARCHAR(150),
    ALTER COLUMN username SET NOT NULL;

ALTER TABLE users RENAME COLUMN password_hash TO password;

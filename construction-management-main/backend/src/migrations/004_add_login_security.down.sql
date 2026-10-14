-- Keep security-state checks and schema changes in the same transaction.
LOCK TABLE users IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM users
        WHERE COALESCE(failed_login_attempts, 0) <> 0
            OR locked_until IS NOT NULL
    ) THEN
        RAISE EXCEPTION 'Cannot rollback login security: failed attempts or account locks would be lost.';
    END IF;
END;
$$;

ALTER TABLE users
    DROP COLUMN locked_until,
    DROP COLUMN failed_login_attempts;

LOCK TABLE users IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM users WHERE fullname IS NOT NULL) THEN
        RAISE EXCEPTION 'Cannot rollback fullname: existing names would be lost.';
    END IF;
END;
$$;

ALTER TABLE users DROP COLUMN fullname;

-- Keep the data check and DROP in the runner's transaction.
LOCK TABLE roles IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM roles) THEN
        RAISE EXCEPTION 'Cannot rollback roles: the table contains data.';
    END IF;
END;
$$;

DROP TABLE roles;

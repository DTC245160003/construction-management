LOCK TABLE dependencies IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM dependencies) THEN
        RAISE EXCEPTION 'Cannot rollback dependencies: dependencies contain data.';
    END IF;
END;
$$;

DROP TABLE dependencies;

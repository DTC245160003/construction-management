LOCK TABLE tasks IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM tasks) THEN
        RAISE EXCEPTION 'Cannot rollback tasks: tasks contain data.';
    END IF;
END;
$$;

DROP TABLE tasks;

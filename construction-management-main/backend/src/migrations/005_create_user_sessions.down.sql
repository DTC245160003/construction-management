LOCK TABLE user_sessions IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM user_sessions) THEN
        RAISE EXCEPTION 'Cannot rollback sessions: the table contains session data.';
    END IF;
END;
$$;

DROP TABLE user_sessions;

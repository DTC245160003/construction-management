DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM project_invitations) THEN
        RAISE EXCEPTION '014 contains invitation history; archive it before rollback';
    END IF;
END; $$;
DROP TABLE project_invitations;
ALTER TABLE users DROP COLUMN last_login_at;

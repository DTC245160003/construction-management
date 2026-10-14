LOCK TABLE project_members IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM project_members) THEN
        RAISE EXCEPTION 'Cannot rollback project members: the table contains membership data.';
    END IF;
END;
$$;

DROP INDEX project_members_project_id_idx;
DROP TABLE project_members;

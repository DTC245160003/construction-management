ALTER TABLE project_members
    DROP CONSTRAINT project_members_project_id_fkey;

LOCK TABLE work_items IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM work_items) THEN
        RAISE EXCEPTION 'Cannot rollback projects and work items: work items contain data.';
    END IF;
END;
$$;

DROP INDEX work_items_parent_id_idx;
DROP INDEX work_items_project_id_idx;
DROP TABLE work_items;

LOCK TABLE projects IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM projects) THEN
        RAISE EXCEPTION 'Cannot rollback projects and work items: projects contain data.';
    END IF;
END;
$$;

DROP TABLE projects;

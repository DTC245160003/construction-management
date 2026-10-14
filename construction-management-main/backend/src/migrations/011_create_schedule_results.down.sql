LOCK TABLE schedule_results IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM schedule_results) THEN
        RAISE EXCEPTION 'Cannot rollback schedule results: schedule_results contain data.';
    END IF;
END;
$$;

DROP TRIGGER dependencies_mark_schedule_dirty ON dependencies;
DROP TRIGGER tasks_mark_schedule_dirty ON tasks;
DROP FUNCTION mark_schedule_dirty_from_dependency();
DROP FUNCTION mark_schedule_dirty_from_task();
DROP TABLE schedule_results;
ALTER TABLE projects DROP COLUMN schedule_needs_recalc;

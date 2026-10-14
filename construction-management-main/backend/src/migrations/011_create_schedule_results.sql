ALTER TABLE projects ADD COLUMN schedule_needs_recalc BOOLEAN NOT NULL DEFAULT TRUE;

CREATE TABLE schedule_results (
    id SERIAL PRIMARY KEY,
    task_id INTEGER NOT NULL UNIQUE
        CONSTRAINT schedule_results_task_id_fkey REFERENCES tasks(id) ON DELETE CASCADE,
    early_start BIGINT NOT NULL,
    early_finish BIGINT NOT NULL,
    late_start BIGINT NOT NULL,
    late_finish BIGINT NOT NULL,
    total_float BIGINT NOT NULL,
    is_critical BOOLEAN NOT NULL,
    calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- Invalidate in the same transaction as the change, including direct SQL writes.
CREATE FUNCTION mark_schedule_dirty_from_task() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        UPDATE projects SET schedule_needs_recalc = TRUE
        WHERE id = (SELECT project_id FROM work_items WHERE id = OLD.work_item_id);
    END IF;
    IF TG_OP <> 'DELETE' THEN
        UPDATE projects SET schedule_needs_recalc = TRUE
        WHERE id = (SELECT project_id FROM work_items WHERE id = NEW.work_item_id);
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER tasks_mark_schedule_dirty
AFTER INSERT OR UPDATE OR DELETE ON tasks
FOR EACH ROW EXECUTE FUNCTION mark_schedule_dirty_from_task();

CREATE FUNCTION mark_schedule_dirty_from_dependency() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP <> 'INSERT' THEN
        UPDATE projects SET schedule_needs_recalc = TRUE
        WHERE id IN (
            SELECT w.project_id FROM tasks t JOIN work_items w ON w.id = t.work_item_id
            WHERE t.id IN (OLD.predecessor_task_id, OLD.successor_task_id)
        );
    END IF;
    IF TG_OP <> 'DELETE' THEN
        UPDATE projects SET schedule_needs_recalc = TRUE
        WHERE id IN (
            SELECT w.project_id FROM tasks t JOIN work_items w ON w.id = t.work_item_id
            WHERE t.id IN (NEW.predecessor_task_id, NEW.successor_task_id)
        );
    END IF;
    RETURN NULL;
END;
$$;

CREATE TRIGGER dependencies_mark_schedule_dirty
AFTER INSERT OR UPDATE OR DELETE ON dependencies
FOR EACH ROW EXECUTE FUNCTION mark_schedule_dirty_from_dependency();

LOCK TABLE tasks IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM tasks WHERE actual_start IS NOT NULL OR actual_finish IS NOT NULL OR progress_percent > 0) THEN
        RAISE EXCEPTION 'Cannot rollback task actuals: tasks contain actual progress data.';
    END IF;
END;
$$;

ALTER TABLE schedule_results
    DROP COLUMN IF EXISTS planned_early_finish,
    DROP COLUMN IF EXISTS initially_critical;

ALTER TABLE tasks
    DROP CONSTRAINT tasks_actual_dates_check,
    DROP CONSTRAINT tasks_progress_percent_check,
    DROP COLUMN progress_percent,
    DROP COLUMN actual_finish,
    DROP COLUMN actual_start;

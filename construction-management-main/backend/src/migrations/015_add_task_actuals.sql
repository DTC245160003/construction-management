ALTER TABLE tasks
    ADD COLUMN actual_start DATE,
    ADD COLUMN actual_finish DATE,
    ADD COLUMN progress_percent INTEGER DEFAULT 0
        CONSTRAINT tasks_progress_percent_check CHECK (progress_percent >= 0 AND progress_percent <= 100),
    ADD CONSTRAINT tasks_actual_dates_check CHECK (actual_finish IS NULL OR actual_start IS NULL OR actual_finish >= actual_start);

ALTER TABLE schedule_results
    ADD COLUMN initially_critical BOOLEAN NOT NULL DEFAULT FALSE,
    ADD COLUMN planned_early_finish BIGINT;

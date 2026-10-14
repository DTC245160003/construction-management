CREATE TABLE dependencies (
    id SERIAL PRIMARY KEY,
    predecessor_task_id INTEGER NOT NULL
        CONSTRAINT dependencies_predecessor_task_id_fkey REFERENCES tasks(id) ON DELETE RESTRICT,
    successor_task_id INTEGER NOT NULL
        CONSTRAINT dependencies_successor_task_id_fkey REFERENCES tasks(id) ON DELETE RESTRICT,
    dependency_type VARCHAR(2) NOT NULL
        CONSTRAINT dependencies_type_check CHECK (dependency_type IN ('FS', 'SS', 'FF', 'SF')),
    lag_days INTEGER NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT dependencies_no_self_check CHECK (predecessor_task_id <> successor_task_id),
    CONSTRAINT dependencies_pair_key UNIQUE (predecessor_task_id, successor_task_id)
);

CREATE INDEX dependencies_predecessor_task_id_idx ON dependencies (predecessor_task_id);
CREATE INDEX dependencies_successor_task_id_idx ON dependencies (successor_task_id);

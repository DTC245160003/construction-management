CREATE TABLE tasks (
    id SERIAL PRIMARY KEY,
    work_item_id INTEGER NOT NULL
        CONSTRAINT tasks_work_item_id_fkey REFERENCES work_items(id) ON DELETE RESTRICT,
    name VARCHAR(255) NOT NULL,
    duration_days INTEGER NOT NULL CONSTRAINT tasks_duration_days_check CHECK (duration_days > 0),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX tasks_work_item_id_idx ON tasks (work_item_id);

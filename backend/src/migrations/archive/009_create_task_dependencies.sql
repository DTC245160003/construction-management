CREATE TABLE IF NOT EXISTS task_dependencies (
    id SERIAL PRIMARY KEY,
    predecessor_id INT NOT NULL,
    successor_id INT NOT NULL,
    dependency_type VARCHAR(2) NOT NULL CHECK (dependency_type IN ('FS', 'SS', 'FF', 'SF')),
    lag_days INT DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (predecessor_id) REFERENCES tasks(id) ON DELETE CASCADE,
    FOREIGN KEY (successor_id) REFERENCES tasks(id) ON DELETE CASCADE
);

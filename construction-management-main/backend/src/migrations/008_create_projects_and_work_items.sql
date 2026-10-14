CREATE TABLE projects (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    description TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE work_items (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL
        CONSTRAINT work_items_project_id_fkey REFERENCES projects(id) ON DELETE CASCADE,
    parent_id INTEGER
        CONSTRAINT work_items_parent_id_fkey REFERENCES work_items(id) ON DELETE RESTRICT,
    title VARCHAR(255) NOT NULL,
    description TEXT,
    status VARCHAR(50) NOT NULL DEFAULT 'todo',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX work_items_project_id_idx ON work_items (project_id);
CREATE INDEX work_items_parent_id_idx ON work_items (parent_id);

ALTER TABLE project_members
    ADD CONSTRAINT project_members_project_id_fkey
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE RESTRICT;

CREATE TABLE project_members (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL
        CONSTRAINT project_members_user_id_fkey REFERENCES users(id),
    project_id INTEGER NOT NULL,
    role_id INTEGER NOT NULL
        CONSTRAINT project_members_role_id_fkey REFERENCES roles(id),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT project_members_user_project_unique UNIQUE (user_id, project_id)
);

CREATE INDEX project_members_project_id_idx ON project_members (project_id);

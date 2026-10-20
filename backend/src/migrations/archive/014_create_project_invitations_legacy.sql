ALTER TABLE users ADD COLUMN last_login_at TIMESTAMPTZ;

CREATE TABLE project_invitations (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    email VARCHAR(255) NOT NULL,
    role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE RESTRICT,
    invited_by INTEGER NOT NULL REFERENCES users(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','accepted','cancelled')),
    accepted_by INTEGER REFERENCES users(id) ON DELETE RESTRICT,
    accepted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK (email = lower(trim(email))),
    CHECK ((status = 'accepted') = (accepted_by IS NOT NULL AND accepted_at IS NOT NULL))
);

CREATE UNIQUE INDEX project_invitations_pending_email_idx
    ON project_invitations(project_id, lower(email)) WHERE status = 'pending';
CREATE INDEX project_invitations_email_idx ON project_invitations(lower(email), status);

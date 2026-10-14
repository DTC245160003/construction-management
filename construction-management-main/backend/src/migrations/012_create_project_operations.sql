ALTER TABLE projects
    ADD COLUMN location TEXT NOT NULL DEFAULT '',
    ADD COLUMN start_date DATE,
    ADD COLUMN status VARCHAR(20) NOT NULL DEFAULT 'active'
        CHECK (status IN ('planned', 'active', 'on_hold', 'completed'));

CREATE FUNCTION valid_working_days(days INTEGER[]) RETURNS BOOLEAN
LANGUAGE SQL IMMUTABLE AS $$
    SELECT cardinality(days) BETWEEN 1 AND 7
       AND days <@ ARRAY[0,1,2,3,4,5,6]
       AND cardinality(days) = (SELECT COUNT(DISTINCT day) FROM unnest(days) day)
$$;
CREATE TABLE project_calendars (
    project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
    working_days INTEGER[] NOT NULL DEFAULT ARRAY[1,2,3,4,5,6] CHECK (valid_working_days(working_days)),
    revision INTEGER NOT NULL DEFAULT 1,
    updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
INSERT INTO project_calendars (project_id) SELECT id FROM projects;
CREATE FUNCTION seed_project_calendar() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO project_calendars (project_id) VALUES (NEW.id);
    RETURN NEW;
END;
$$;
CREATE TRIGGER projects_seed_calendar AFTER INSERT ON projects
FOR EACH ROW EXECUTE FUNCTION seed_project_calendar();

CREATE TABLE project_holidays (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    day DATE NOT NULL,
    name VARCHAR(255) NOT NULL,
    notes TEXT NOT NULL DEFAULT '',
    UNIQUE(project_id, day)
);
CREATE FUNCTION dirty_schedule_from_calendar() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP = 'DELETE' THEN
        UPDATE projects SET schedule_needs_recalc = TRUE WHERE id = OLD.project_id;
        RETURN OLD;
    END IF;
    UPDATE projects SET schedule_needs_recalc = TRUE WHERE id = NEW.project_id;
    RETURN NEW;
END;
$$;
CREATE TRIGGER calendar_dirty AFTER UPDATE ON project_calendars
FOR EACH ROW EXECUTE FUNCTION dirty_schedule_from_calendar();
CREATE TRIGGER holidays_dirty AFTER INSERT OR UPDATE OR DELETE ON project_holidays
FOR EACH ROW EXECUTE FUNCTION dirty_schedule_from_calendar();

CREATE TABLE teams (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    name VARCHAR(255) NOT NULL,
    UNIQUE(project_id, name),
    UNIQUE(project_id, id)
);
CREATE TABLE team_members (
    project_id INTEGER NOT NULL,
    team_id INTEGER NOT NULL,
    user_id INTEGER NOT NULL,
    PRIMARY KEY(team_id, user_id),
    FOREIGN KEY(project_id, team_id) REFERENCES teams(project_id, id) ON DELETE CASCADE,
    FOREIGN KEY(user_id, project_id) REFERENCES project_members(user_id, project_id) ON DELETE CASCADE
);
CREATE INDEX team_members_user_idx ON team_members(project_id, user_id);
CREATE TABLE task_assignments (
    task_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    team_id INTEGER NOT NULL,
    assigned_by INTEGER NOT NULL REFERENCES users(id),
    assigned_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY(project_id, team_id) REFERENCES teams(project_id, id)
);
CREATE INDEX assignments_project_idx ON task_assignments(project_id, team_id);
CREATE TABLE task_assignment_history (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    previous_team_id INTEGER REFERENCES teams(id),
    team_id INTEGER NOT NULL REFERENCES teams(id),
    changed_by INTEGER NOT NULL REFERENCES users(id),
    changed_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX assignment_history_idx ON task_assignment_history(project_id, task_id, changed_at);
CREATE TABLE task_field_quantities (
    task_id INTEGER PRIMARY KEY REFERENCES tasks(id) ON DELETE CASCADE,
    planned_quantity NUMERIC(18,4) NOT NULL CHECK (planned_quantity > 0),
    unit VARCHAR(30) NOT NULL
);
CREATE TABLE daily_progress (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    team_id INTEGER NOT NULL REFERENCES teams(id),
    reported_by INTEGER NOT NULL REFERENCES users(id),
    day DATE NOT NULL,
    quantity NUMERIC(18,4) NOT NULL CHECK (quantity > 0),
    notes TEXT NOT NULL DEFAULT '',
    client_uuid UUID NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX daily_progress_task_idx ON daily_progress(project_id, task_id);
CREATE TABLE task_issues (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    task_id INTEGER NOT NULL REFERENCES tasks(id),
    team_id INTEGER NOT NULL REFERENCES teams(id),
    reported_by INTEGER NOT NULL REFERENCES users(id),
    description TEXT NOT NULL,
    status VARCHAR(10) NOT NULL DEFAULT 'open' CHECK(status IN ('open','closed')),
    resolution TEXT,
    closed_by INTEGER REFERENCES users(id),
    closed_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK ((status = 'open' AND closed_at IS NULL) OR
        (status = 'closed' AND closed_at IS NOT NULL AND closed_by IS NOT NULL AND length(trim(resolution)) > 0))
);
CREATE INDEX task_issues_project_idx ON task_issues(project_id, task_id);
CREATE TABLE notifications (
    id SERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    user_id INTEGER NOT NULL REFERENCES users(id),
    type VARCHAR(50) NOT NULL,
    message TEXT NOT NULL,
    target_path TEXT NOT NULL,
    read_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX notifications_unread_idx ON notifications(project_id, user_id) WHERE read_at IS NULL;
CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    project_id INTEGER NOT NULL REFERENCES projects(id),
    actor_id INTEGER NOT NULL REFERENCES users(id),
    module VARCHAR(50) NOT NULL,
    action VARCHAR(50) NOT NULL,
    object_id TEXT NOT NULL,
    before_value JSONB,
    after_value JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX audit_logs_project_idx ON audit_logs(project_id, created_at DESC);
CREATE FUNCTION reject_history_change() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN RAISE EXCEPTION 'History is append-only' USING ERRCODE = '23514'; END;
$$;
CREATE TRIGGER audit_append_only BEFORE UPDATE OR DELETE ON audit_logs
FOR EACH ROW EXECUTE FUNCTION reject_history_change();
CREATE TRIGGER assignments_append_only BEFORE UPDATE OR DELETE ON task_assignment_history
FOR EACH ROW EXECUTE FUNCTION reject_history_change();

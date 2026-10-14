-- Refuse to discard operational data; rollback is safe on an unused migration.
DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM teams) OR EXISTS (SELECT 1 FROM daily_progress)
       OR EXISTS (SELECT 1 FROM task_issues) OR EXISTS (SELECT 1 FROM audit_logs)
       OR EXISTS (SELECT 1 FROM notifications) OR EXISTS (SELECT 1 FROM project_holidays)
       OR EXISTS (SELECT 1 FROM task_field_quantities)
       OR EXISTS (SELECT 1 FROM projects WHERE start_date IS NOT NULL OR location <> '' OR status <> 'active')
       OR EXISTS (SELECT 1 FROM project_calendars WHERE working_days <> ARRAY[1,2,3,4,5,6]) THEN
        RAISE EXCEPTION '012 contains operational data; archive it before rollback';
    END IF;
END; $$;
DROP TABLE audit_logs, notifications, task_issues, daily_progress, task_field_quantities,
    task_assignment_history, task_assignments, team_members, teams;
DROP FUNCTION reject_history_change();
DROP TRIGGER projects_seed_calendar ON projects;
DROP FUNCTION seed_project_calendar();
DROP TABLE project_holidays, project_calendars;
DROP FUNCTION dirty_schedule_from_calendar();
DROP FUNCTION valid_working_days(INTEGER[]);
ALTER TABLE projects DROP COLUMN location, DROP COLUMN start_date, DROP COLUMN status;

DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM users WHERE system_role<>'user' OR NOT is_active)
       OR EXISTS(SELECT 1 FROM audit_logs WHERE module='system_admin' OR project_id IS NULL OR actor_id IS NULL)
    THEN RAISE EXCEPTION 'System administration rollback refused: preserve privileges and audit data'; END IF;
END; $$;
DROP TRIGGER last_system_admin_guard ON users;
DROP FUNCTION protect_last_system_admin();
DROP TABLE system_admin_guard;
ALTER TABLE audit_logs ALTER COLUMN project_id SET NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN actor_id SET NOT NULL;
ALTER TABLE users DROP COLUMN system_role,DROP COLUMN is_active;

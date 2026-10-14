-- System privileges are independent from the existing project roles.
ALTER TABLE users ADD COLUMN system_role TEXT NOT NULL DEFAULT 'user'
    CHECK (system_role IN ('user','super_admin'));
ALTER TABLE users ADD COLUMN is_active BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE audit_logs ALTER COLUMN project_id DROP NOT NULL;
ALTER TABLE audit_logs ALTER COLUMN actor_id DROP NOT NULL;

-- An atomic counter serializes concurrent attempts to remove the last active admin.
CREATE TABLE system_admin_guard (
    singleton BOOLEAN PRIMARY KEY DEFAULT TRUE CHECK (singleton),
    active_count INTEGER NOT NULL DEFAULT 0 CHECK (active_count >= 0)
);
INSERT INTO system_admin_guard(singleton,active_count) VALUES(TRUE,0);
CREATE FUNCTION protect_last_system_admin() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE was_admin BOOLEAN := FALSE; is_admin BOOLEAN := FALSE;
BEGIN
    IF TG_OP <> 'INSERT' THEN was_admin := OLD.system_role='super_admin' AND OLD.is_active; END IF;
    IF TG_OP <> 'DELETE' THEN is_admin := NEW.system_role='super_admin' AND NEW.is_active; END IF;
    IF was_admin AND NOT is_admin THEN
        UPDATE system_admin_guard SET active_count=active_count-1 WHERE singleton AND active_count>1;
        IF NOT FOUND THEN RAISE EXCEPTION 'Cannot remove the last active Super Admin' USING ERRCODE='23514'; END IF;
    ELSIF is_admin AND NOT was_admin THEN
        UPDATE system_admin_guard SET active_count=active_count+1 WHERE singleton;
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER last_system_admin_guard BEFORE INSERT OR DELETE OR UPDATE OF system_role,is_active
    ON users FOR EACH ROW EXECUTE FUNCTION protect_last_system_admin();

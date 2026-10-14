CREATE TABLE project_site_settings (
    project_id INTEGER PRIMARY KEY REFERENCES projects(id),
    latitude DOUBLE PRECISION CHECK(latitude BETWEEN -90 AND 90),
    longitude DOUBLE PRECISION CHECK(longitude BETWEEN -180 AND 180),
    radius_m INTEGER CHECK(radius_m > 0),
    revision INTEGER NOT NULL DEFAULT 1,
    CHECK ((latitude IS NULL AND longitude IS NULL AND radius_m IS NULL) OR
        (latitude IS NOT NULL AND longitude IS NOT NULL AND radius_m IS NOT NULL))
);
CREATE TABLE site_photos (
    id SERIAL PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
    work_item_id INTEGER NOT NULL REFERENCES work_items(id), uploaded_by INTEGER NOT NULL REFERENCES users(id),
    client_uuid UUID NOT NULL UNIQUE, content_hash TEXT NOT NULL, filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(50) NOT NULL, original BYTEA NOT NULL, thumbnail BYTEA NOT NULL,
    taken_at TIMESTAMPTZ, latitude DOUBLE PRECISION, longitude DOUBLE PRECISION,
    metadata JSONB NOT NULL DEFAULT '{}', distance_m DOUBLE PRECISION, suspicious BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK(octet_length(thumbnail) < 1048576), CHECK(octet_length(original) <= 10485760)
);
CREATE INDEX site_photos_project_idx ON site_photos(project_id,created_at DESC);
CREATE TABLE journal_daily_info (
    project_id INTEGER NOT NULL REFERENCES projects(id), day DATE NOT NULL,
    manpower INTEGER NOT NULL CHECK(manpower >= 0), equipment TEXT NOT NULL DEFAULT '', weather VARCHAR(255) NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1, PRIMARY KEY(project_id,day)
);
CREATE TABLE journal_day_locks (
    project_id INTEGER NOT NULL REFERENCES projects(id), day DATE NOT NULL, locked BOOLEAN NOT NULL DEFAULT TRUE,
    changed_by INTEGER NOT NULL REFERENCES users(id), reason TEXT, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(project_id,day)
);
CREATE TABLE site_journals (
    id SERIAL PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
    work_item_id INTEGER NOT NULL REFERENCES work_items(id), author_id INTEGER NOT NULL REFERENCES users(id),
    client_uuid UUID NOT NULL UNIQUE, input_hash TEXT NOT NULL, day DATE NOT NULL, time TIME NOT NULL, content TEXT NOT NULL,
    revision INTEGER NOT NULL DEFAULT 1, deleted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP, updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX site_journals_project_idx ON site_journals(project_id,day DESC);
CREATE TABLE journal_photos (journal_id INTEGER REFERENCES site_journals(id),photo_id INTEGER REFERENCES site_photos(id),PRIMARY KEY(journal_id,photo_id));
CREATE TABLE issue_photos (issue_id INTEGER REFERENCES task_issues(id),photo_id INTEGER REFERENCES site_photos(id),PRIMARY KEY(issue_id,photo_id));
CREATE FUNCTION protect_locked_journal() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE pid INTEGER; target_day DATE;
BEGIN
    pid := COALESCE(NEW.project_id,OLD.project_id); target_day := COALESCE(NEW.day,OLD.day);
    PERFORM 1 FROM projects WHERE id=pid FOR NO KEY UPDATE;
    IF EXISTS(SELECT 1 FROM journal_day_locks WHERE project_id=pid AND locked AND
        (day=target_day OR (TG_OP <> 'INSERT' AND day=OLD.day))) THEN
        RAISE EXCEPTION 'Journal day is locked' USING ERRCODE='23514';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER journal_lock_guard BEFORE INSERT OR UPDATE OR DELETE ON site_journals FOR EACH ROW EXECUTE FUNCTION protect_locked_journal();
CREATE TRIGGER journal_daily_lock_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_daily_info FOR EACH ROW EXECUTE FUNCTION protect_locked_journal();

CREATE TABLE item_contracts (
    work_item_id INTEGER PRIMARY KEY REFERENCES work_items(id), project_id INTEGER NOT NULL REFERENCES projects(id),
    quantity NUMERIC(18,4) NOT NULL CHECK(quantity > 0), unit VARCHAR(30) NOT NULL,
    unit_price NUMERIC(18,2) NOT NULL CHECK(unit_price >= 0), revision INTEGER NOT NULL DEFAULT 1
);
CREATE TABLE acceptance_forms (
    id SERIAL PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id), work_item_id INTEGER NOT NULL REFERENCES work_items(id),
    period VARCHAR(255) NOT NULL, day DATE NOT NULL, cumulative NUMERIC(18,4) NOT NULL CHECK(cumulative > 0),
    previous_cumulative NUMERIC(18,4) NOT NULL CHECK(previous_cumulative >= 0),
    quantity NUMERIC(18,4) NOT NULL CHECK(quantity > 0), unit VARCHAR(30) NOT NULL, unit_price NUMERIC(18,2) NOT NULL CHECK(unit_price >= 0),
    notes TEXT NOT NULL DEFAULT '', status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','returned')),
    created_by INTEGER NOT NULL REFERENCES users(id), approved_by INTEGER REFERENCES users(id), approved_at TIMESTAMPTZ,
    return_reason TEXT, revision INTEGER NOT NULL DEFAULT 1, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK(quantity=cumulative-previous_cumulative),
    CHECK(status<>'returned' OR length(trim(return_reason)) > 0),
    CHECK(status<>'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE INDEX acceptance_project_idx ON acceptance_forms(project_id,work_item_id,status);
CREATE TABLE acceptance_photos (acceptance_id INTEGER REFERENCES acceptance_forms(id),photo_id INTEGER REFERENCES site_photos(id),PRIMARY KEY(acceptance_id,photo_id));
CREATE FUNCTION protect_approved_acceptance() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE approved NUMERIC; contracted NUMERIC;
BEGIN
    IF TG_OP<>'INSERT' AND OLD.status='approved' THEN RAISE EXCEPTION 'Approved acceptance is immutable' USING ERRCODE='23514'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    PERFORM 1 FROM projects WHERE id=NEW.project_id FOR NO KEY UPDATE;
    SELECT quantity INTO contracted FROM item_contracts WHERE work_item_id=NEW.work_item_id AND project_id=NEW.project_id FOR UPDATE;
    IF contracted IS NULL OR NEW.cumulative>contracted THEN RAISE EXCEPTION 'Acceptance exceeds contract' USING ERRCODE='23514'; END IF;
    IF NEW.status='approved' THEN
        SELECT COALESCE(sum(quantity),0) INTO approved FROM acceptance_forms WHERE work_item_id=NEW.work_item_id AND status='approved' AND id<>NEW.id;
        IF NEW.previous_cumulative<>approved OR approved+NEW.quantity>contracted THEN
            RAISE EXCEPTION 'Acceptance cumulative conflict' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER acceptance_guard BEFORE INSERT OR UPDATE OR DELETE ON acceptance_forms FOR EACH ROW EXECUTE FUNCTION protect_approved_acceptance();
CREATE FUNCTION protect_contract() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM projects WHERE id=NEW.project_id FOR NO KEY UPDATE;
    PERFORM 1 FROM work_items WHERE id=NEW.work_item_id FOR UPDATE;
    IF NOT EXISTS(SELECT 1 FROM work_items WHERE id=NEW.work_item_id AND project_id=NEW.project_id) OR
        EXISTS(SELECT 1 FROM work_items WHERE parent_id=NEW.work_item_id) THEN RAISE EXCEPTION 'Contract requires a project leaf item' USING ERRCODE='23514'; END IF;
    IF NEW.quantity < (SELECT coalesce(sum(quantity),0) FROM acceptance_forms WHERE work_item_id=NEW.work_item_id AND status='approved') THEN
        RAISE EXCEPTION 'Contract below approved quantity' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER contract_guard BEFORE INSERT OR UPDATE ON item_contracts FOR EACH ROW EXECUTE FUNCTION protect_contract();

CREATE TABLE payment_requests (
    id SERIAL PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),period VARCHAR(255) NOT NULL,day DATE NOT NULL,
    retention_rate NUMERIC(5,2) NOT NULL CHECK(retention_rate BETWEEN 0 AND 100),
    gross NUMERIC(24,2) NOT NULL DEFAULT 0,retained NUMERIC(24,2) NOT NULL DEFAULT 0,net NUMERIC(24,2) NOT NULL DEFAULT 0,
    status VARCHAR(20) NOT NULL DEFAULT 'draft' CHECK(status IN ('draft','submitted','approved','returned')),
    created_by INTEGER NOT NULL REFERENCES users(id),approved_by INTEGER REFERENCES users(id),approved_at TIMESTAMPTZ,
    return_reason TEXT,revision INTEGER NOT NULL DEFAULT 1,created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK(gross>=0 AND retained>=0 AND net=gross-retained),
    CHECK(status<>'returned' OR length(trim(return_reason))>0),
    CHECK(status<>'approved' OR (approved_by IS NOT NULL AND approved_at IS NOT NULL))
);
CREATE TABLE payment_items (
    payment_id INTEGER NOT NULL REFERENCES payment_requests(id),acceptance_id INTEGER NOT NULL UNIQUE REFERENCES acceptance_forms(id),
    quantity NUMERIC(18,4) NOT NULL,unit_price NUMERIC(18,2) NOT NULL,amount NUMERIC(24,2) NOT NULL,
    PRIMARY KEY(payment_id,acceptance_id)
);
CREATE FUNCTION protect_payment() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP<>'INSERT' AND OLD.status='approved' THEN RAISE EXCEPTION 'Approved payment is immutable' USING ERRCODE='23514'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF; RETURN NEW;
END; $$;
CREATE TRIGGER payment_guard BEFORE UPDATE OR DELETE ON payment_requests FOR EACH ROW EXECUTE FUNCTION protect_payment();
CREATE FUNCTION protect_payment_item() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE pid INTEGER; approved BOOLEAN; matching BOOLEAN;
BEGIN
    pid := COALESCE(NEW.payment_id,OLD.payment_id);
    SELECT status='approved' INTO approved FROM payment_requests WHERE id=pid FOR UPDATE;
    IF approved THEN RAISE EXCEPTION 'Approved payment lines are immutable' USING ERRCODE='23514'; END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    SELECT a.status='approved' AND a.project_id=p.project_id AND NEW.quantity=a.quantity AND NEW.unit_price=a.unit_price AND NEW.amount=round(a.quantity*a.unit_price,2)
        INTO matching FROM acceptance_forms a JOIN payment_requests p ON p.id=pid WHERE a.id=NEW.acceptance_id;
    IF matching IS DISTINCT FROM TRUE THEN RAISE EXCEPTION 'Payment requires matching approved acceptance' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER payment_item_guard BEFORE INSERT OR UPDATE OR DELETE ON payment_items FOR EACH ROW EXECUTE FUNCTION protect_payment_item();

CREATE TABLE budget_versions (
    id SERIAL PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),work_item_id INTEGER NOT NULL REFERENCES work_items(id),
    version INTEGER NOT NULL,amount NUMERIC(18,2) NOT NULL CHECK(amount>=0),notes TEXT NOT NULL DEFAULT '',
    created_by INTEGER NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,UNIQUE(work_item_id,version)
);
CREATE TRIGGER budget_history_guard BEFORE UPDATE OR DELETE ON budget_versions FOR EACH ROW EXECUTE FUNCTION reject_history_change();
CREATE TABLE actual_costs (
    id SERIAL PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),work_item_id INTEGER REFERENCES work_items(id),
    day DATE NOT NULL,amount NUMERIC(18,2) NOT NULL CHECK(amount>0),type VARCHAR(100) NOT NULL,notes TEXT NOT NULL DEFAULT '',
    client_uuid UUID NOT NULL UNIQUE,revision INTEGER NOT NULL DEFAULT 1,created_by INTEGER NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE materials (
    id SERIAL PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),name VARCHAR(255) NOT NULL,unit VARCHAR(30) NOT NULL,
    stock NUMERIC(18,4) NOT NULL DEFAULT 0 CHECK(stock>=0),UNIQUE(project_id,name)
);
CREATE TABLE inventory_transactions (
    id SERIAL PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),material_id INTEGER NOT NULL REFERENCES materials(id),
    work_item_id INTEGER REFERENCES work_items(id),direction VARCHAR(3) NOT NULL CHECK(direction IN ('in','out')),
    quantity NUMERIC(18,4) NOT NULL CHECK(quantity>0),day DATE NOT NULL,notes TEXT NOT NULL DEFAULT '',client_uuid UUID NOT NULL UNIQUE,
    created_by INTEGER NOT NULL REFERENCES users(id),created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CHECK(direction<>'out' OR work_item_id IS NOT NULL)
);
CREATE FUNCTION apply_inventory() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    UPDATE materials SET stock=stock+CASE WHEN NEW.direction='in' THEN NEW.quantity ELSE -NEW.quantity END
        WHERE id=NEW.material_id AND project_id=NEW.project_id AND stock+CASE WHEN NEW.direction='in' THEN NEW.quantity ELSE -NEW.quantity END>=0;
    IF NOT FOUND THEN RAISE EXCEPTION 'Insufficient inventory or invalid material' USING ERRCODE='23514'; END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER inventory_stock_guard BEFORE INSERT ON inventory_transactions FOR EACH ROW EXECUTE FUNCTION apply_inventory();
CREATE TRIGGER inventory_history_guard BEFORE UPDATE OR DELETE ON inventory_transactions FOR EACH ROW EXECUTE FUNCTION reject_history_change();
CREATE TABLE material_norms (
    project_id INTEGER NOT NULL REFERENCES projects(id),work_item_id INTEGER NOT NULL REFERENCES work_items(id),material_id INTEGER NOT NULL REFERENCES materials(id),
    quantity_per_unit NUMERIC(18,4) NOT NULL CHECK(quantity_per_unit>0),PRIMARY KEY(work_item_id,material_id)
);
CREATE TABLE notification_preferences (
    user_id INTEGER NOT NULL REFERENCES users(id),type VARCHAR(50) NOT NULL CHECK(type IN ('acceptance_returned','payment_returned','milestone_overdue')),
    email_enabled BOOLEAN NOT NULL DEFAULT TRUE,PRIMARY KEY(user_id,type)
);
ALTER TABLE notifications ADD COLUMN event_key TEXT;
CREATE UNIQUE INDEX notifications_event_key ON notifications(project_id,user_id,event_key) WHERE event_key IS NOT NULL;
CREATE TABLE email_outbox (
    id BIGSERIAL PRIMARY KEY,notification_id INTEGER NOT NULL UNIQUE REFERENCES notifications(id),
    attempts INTEGER NOT NULL DEFAULT 0,sent_at TIMESTAMPTZ,skipped_at TIMESTAMPTZ,next_attempt_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,last_error TEXT
);
CREATE TABLE project_milestones (
    id SERIAL PRIMARY KEY,project_id INTEGER NOT NULL REFERENCES projects(id),task_id INTEGER NOT NULL REFERENCES tasks(id),
    title VARCHAR(255) NOT NULL,due_date DATE NOT NULL,created_by INTEGER NOT NULL REFERENCES users(id),UNIQUE(project_id,task_id,title)
);
CREATE FUNCTION preserve_financial_leaf() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF NEW.parent_id IS NOT NULL THEN
        PERFORM 1 FROM work_items WHERE id=NEW.parent_id FOR UPDATE;
        IF EXISTS(SELECT 1 FROM item_contracts WHERE work_item_id=NEW.parent_id) OR EXISTS(SELECT 1 FROM budget_versions WHERE work_item_id=NEW.parent_id) THEN
            RAISE EXCEPTION 'Financial leaf cannot become a parent' USING ERRCODE='23514';
        END IF;
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER financial_leaf_guard BEFORE INSERT OR UPDATE OF parent_id ON work_items FOR EACH ROW EXECUTE FUNCTION preserve_financial_leaf();
CREATE FUNCTION validate_budget_leaf() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1 FROM work_items WHERE id=NEW.work_item_id AND project_id=NEW.project_id FOR UPDATE;
    IF NOT FOUND OR EXISTS(SELECT 1 FROM work_items WHERE parent_id=NEW.work_item_id) THEN
        RAISE EXCEPTION 'Budget requires project leaf item' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER budget_leaf_guard BEFORE INSERT ON budget_versions FOR EACH ROW EXECUTE FUNCTION validate_budget_leaf();

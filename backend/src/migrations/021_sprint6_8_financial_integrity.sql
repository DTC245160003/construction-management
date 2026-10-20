-- Keep released migrations, including 017/018/019/020, unchanged.
CREATE TABLE project_payment_terms (
 project_id INTEGER PRIMARY KEY REFERENCES projects(id),
 retention_rate NUMERIC(5,2) NOT NULL CHECK(retention_rate BETWEEN 0 AND 100),
 revision INTEGER NOT NULL DEFAULT 1, updated_by INTEGER NOT NULL REFERENCES users(id),
 updated_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE original_baseline_context (
 project_id INTEGER PRIMARY KEY REFERENCES projects(id) ON DELETE CASCADE,
 original_start_date DATE NOT NULL,working_days INTEGER[] NOT NULL,holidays DATE[] NOT NULL,
 captured_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION capture_original_baseline_context() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 INSERT INTO original_baseline_context(project_id,original_start_date,working_days,holidays)
 SELECT p.id,p.start_date,c.working_days,ARRAY(SELECT day FROM project_holidays WHERE project_id=p.id ORDER BY day)
 FROM projects p JOIN project_calendars c ON c.project_id=p.id WHERE p.id=NEW.project_id AND p.start_date IS NOT NULL AND cardinality(c.working_days)>0
 ON CONFLICT(project_id) DO NOTHING;
 RETURN NEW;
END; $$;
CREATE TRIGGER baseline_context_capture AFTER INSERT ON baselines FOR EACH ROW EXECUTE FUNCTION capture_original_baseline_context();
ALTER TABLE acceptance_forms ADD COLUMN adjustment_of INTEGER REFERENCES acceptance_forms(id),
 ADD COLUMN adjustment_reason TEXT;
ALTER TABLE acceptance_forms ADD CONSTRAINT adjustment_requires_reason CHECK
 (adjustment_of IS NULL OR (adjustment_of<>id AND length(trim(adjustment_reason))>0));
-- A draft reserves the right to prepare the next period, not recognized quantity.
-- Existing competing drafts require an explicit business review before upgrading.
CREATE UNIQUE INDEX acceptance_active_period ON acceptance_forms(work_item_id)
 WHERE status IN ('draft','submitted');
CREATE UNIQUE INDEX acceptance_one_replacement ON acceptance_forms(adjustment_of)
 WHERE adjustment_of IS NOT NULL AND status IN ('draft','submitted','approved');
CREATE VIEW effective_acceptances AS SELECT a.* FROM acceptance_forms a
 WHERE a.status='approved' AND NOT EXISTS(SELECT 1 FROM acceptance_forms next
 WHERE next.adjustment_of=a.id AND next.status='approved');

ALTER TABLE payment_items ADD COLUMN released BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE payment_items DROP CONSTRAINT payment_items_acceptance_id_key;
CREATE UNIQUE INDEX payment_one_active_acceptance ON payment_items(acceptance_id) WHERE NOT released;

CREATE OR REPLACE FUNCTION protect_approved_acceptance() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE contracted NUMERIC; approved NUMERIC; original acceptance_forms%ROWTYPE;
BEGIN
 IF TG_OP<>'INSERT' AND OLD.status='approved' THEN
  RAISE EXCEPTION 'Approved acceptance is immutable; create an adjustment' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 PERFORM 1 FROM projects WHERE id=NEW.project_id FOR NO KEY UPDATE;
 IF NEW.status='returned' THEN RETURN NEW; END IF;
 SELECT quantity INTO contracted FROM item_contracts WHERE work_item_id=NEW.work_item_id AND project_id=NEW.project_id FOR UPDATE;
 IF contracted IS NULL OR NEW.cumulative>contracted THEN
  RAISE EXCEPTION 'Acceptance cumulative % exceeds contract %',NEW.cumulative,contracted USING ERRCODE='23514';
 END IF;
 SELECT coalesce(sum(quantity),0) INTO approved FROM effective_acceptances
 WHERE work_item_id=NEW.work_item_id AND id<>NEW.id;
 IF NEW.adjustment_of IS NOT NULL THEN
  SELECT * INTO original FROM effective_acceptances WHERE id=NEW.adjustment_of AND project_id=NEW.project_id AND work_item_id=NEW.work_item_id;
  IF original.id IS NULL OR
    EXISTS(SELECT 1 FROM payment_items WHERE acceptance_id=original.id AND NOT released) THEN
   RAISE EXCEPTION 'Only an effective unpaid approved period can be adjusted' USING ERRCODE='23514';
  END IF;
  approved:=approved-original.quantity;
 END IF;
 IF NEW.previous_cumulative<>(CASE WHEN NEW.adjustment_of IS NULL THEN approved ELSE original.previous_cumulative END) THEN
  RAISE EXCEPTION 'Previous approved cumulative changed: expected %, received %',approved,NEW.previous_cumulative USING ERRCODE='23514';
 END IF;
 IF NEW.quantity+approved>contracted THEN
  RAISE EXCEPTION 'Acceptance quantity exceeds contract' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION protect_contract() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 PERFORM 1 FROM projects WHERE id=NEW.project_id FOR NO KEY UPDATE;
 PERFORM 1 FROM work_items WHERE id=NEW.work_item_id FOR UPDATE;
 IF NOT EXISTS(SELECT 1 FROM work_items WHERE id=NEW.work_item_id AND project_id=NEW.project_id)
 OR EXISTS(SELECT 1 FROM work_items WHERE parent_id=NEW.work_item_id) THEN
  RAISE EXCEPTION 'Contract requires a project leaf item' USING ERRCODE='23514';
 END IF;
 IF NEW.quantity<(SELECT coalesce(sum(quantity),0) FROM effective_acceptances WHERE work_item_id=NEW.work_item_id)
 OR EXISTS(SELECT 1 FROM acceptance_forms WHERE work_item_id=NEW.work_item_id AND status IN ('draft','submitted') AND cumulative>NEW.quantity) THEN
  RAISE EXCEPTION 'Contract below recognized or reserved cumulative' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;

CREATE FUNCTION protect_acceptance_photo() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE form acceptance_forms%ROWTYPE; target INTEGER; other INTEGER;
BEGIN
 target:=coalesce(NEW.acceptance_id,OLD.acceptance_id);
 IF TG_OP<>'INSERT' THEN other:=OLD.acceptance_id; END IF;
 IF EXISTS(SELECT 1 FROM acceptance_forms WHERE id IN(target,other) AND status IN('submitted','approved')) THEN
  RAISE EXCEPTION 'Submitted or approved acceptance evidence is immutable' USING ERRCODE='23514';
 END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 SELECT * INTO form FROM acceptance_forms WHERE id=NEW.acceptance_id;
 IF NOT EXISTS(SELECT 1 FROM site_photos WHERE id=NEW.photo_id AND project_id=form.project_id AND work_item_id=form.work_item_id) THEN
  RAISE EXCEPTION 'Acceptance photo must match project and item' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER acceptance_evidence_guard BEFORE INSERT OR UPDATE OR DELETE ON acceptance_photos
 FOR EACH ROW EXECUTE FUNCTION protect_acceptance_photo();

CREATE OR REPLACE FUNCTION protect_payment_item() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE pid INTEGER; state TEXT; matching BOOLEAN;
BEGIN
 pid:=coalesce(NEW.payment_id,OLD.payment_id);
 SELECT status INTO state FROM payment_requests WHERE id=pid FOR UPDATE;
 IF state='approved' THEN RAISE EXCEPTION 'Approved payment lines are immutable' USING ERRCODE='23514'; END IF;
 IF TG_OP='DELETE' THEN RETURN OLD; END IF;
 IF state='returned' AND NOT NEW.released THEN
  RAISE EXCEPTION 'Returned payment cannot reserve acceptance' USING ERRCODE='23514';
 END IF;
 SELECT (a.project_id=p.project_id AND a.quantity=NEW.quantity AND a.unit_price=NEW.unit_price
  AND NEW.amount=round(a.quantity*a.unit_price,2)) INTO matching
 FROM acceptance_forms a JOIN payment_requests p ON p.id=pid WHERE a.id=NEW.acceptance_id AND a.status='approved';
 IF NOT coalesce(matching,FALSE) OR (NOT NEW.released AND NOT EXISTS(SELECT 1 FROM effective_acceptances WHERE id=NEW.acceptance_id)) THEN
  RAISE EXCEPTION 'Payment requires matching effective approved acceptance' USING ERRCODE='23514';
 END IF;
 RETURN NEW;
END; $$;
-- Releasing reservations retains historical lines and their monetary snapshots.
UPDATE payment_items i SET released=TRUE FROM payment_requests p WHERE p.id=i.payment_id AND p.status='returned';
CREATE FUNCTION release_returned_payment() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF NEW.status='returned' THEN UPDATE payment_items SET released=TRUE WHERE payment_id=NEW.id AND NOT released; END IF;
 RETURN NEW;
END; $$;
CREATE TRIGGER payment_return_release AFTER UPDATE OF status ON payment_requests FOR EACH ROW EXECUTE FUNCTION release_returned_payment();

CREATE FUNCTION mirror_contract_to_work_item() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
 UPDATE work_items SET contract_quantity=NEW.quantity,unit=NEW.unit,contract_unit_price=NEW.unit_price WHERE id=NEW.work_item_id;
 RETURN NEW;
END; $$;
CREATE TRIGGER contract_work_item_mirror AFTER INSERT OR UPDATE ON item_contracts FOR EACH ROW EXECUTE FUNCTION mirror_contract_to_work_item();
CREATE FUNCTION mirror_work_item_contract() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE previous JSONB; result JSONB; aid INTEGER;
BEGIN
 IF pg_trigger_depth()>1 THEN RETURN NEW; END IF;
 IF TG_OP='UPDATE' AND (NEW.contract_quantity,NEW.unit,NEW.contract_unit_price)
 IS NOT DISTINCT FROM (OLD.contract_quantity,OLD.unit,OLD.contract_unit_price) THEN RETURN NEW; END IF;
 IF length(NEW.unit)>30 THEN RAISE EXCEPTION 'Contract unit must have at most 30 characters' USING ERRCODE='23514'; END IF;
 IF NEW.contract_quantity IS NULL OR NEW.contract_unit_price IS NULL OR nullif(trim(NEW.unit),'') IS NULL THEN
  IF EXISTS(SELECT 1 FROM item_contracts WHERE work_item_id=NEW.id) THEN
   RAISE EXCEPTION 'An existing contract cannot be cleared or partially removed' USING ERRCODE='23514';
  END IF;
  RETURN NEW;
 END IF;
 SELECT to_jsonb(c) INTO previous FROM item_contracts c WHERE work_item_id=NEW.id;
 INSERT INTO item_contracts(work_item_id,project_id,quantity,unit,unit_price)
 VALUES(NEW.id,NEW.project_id,NEW.contract_quantity,NEW.unit,NEW.contract_unit_price)
 ON CONFLICT(work_item_id) DO UPDATE SET quantity=EXCLUDED.quantity,unit=EXCLUDED.unit,unit_price=EXCLUDED.unit_price,revision=item_contracts.revision+1
 RETURNING to_jsonb(item_contracts.*) INTO result;
 aid:=nullif(current_setting('app.actor_id',TRUE),'')::integer;
 INSERT INTO audit_logs(project_id,actor_id,module,action,object_id,before_value,after_value)
 VALUES(NEW.project_id,aid,'acceptance','work_item_contract',NEW.id::text,previous,result||jsonb_build_object('database_operator',current_user));
 RETURN NEW;
END; $$;
CREATE TRIGGER work_item_contract_mirror AFTER INSERT OR UPDATE OF contract_quantity,unit,contract_unit_price
 ON work_items FOR EACH ROW EXECUTE FUNCTION mirror_work_item_contract();
-- Bridge S-35 fields already in main with the existing acceptance/payment ledger.
INSERT INTO item_contracts(work_item_id,project_id,quantity,unit,unit_price)
 SELECT id,project_id,contract_quantity,unit,contract_unit_price FROM work_items w
 WHERE contract_quantity IS NOT NULL AND contract_unit_price IS NOT NULL AND nullif(trim(unit),'') IS NOT NULL
 AND NOT EXISTS(SELECT 1 FROM work_items c WHERE c.parent_id=w.id)
 ON CONFLICT(work_item_id) DO NOTHING;

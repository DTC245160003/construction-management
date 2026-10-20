DO $$ BEGIN IF EXISTS(SELECT 1 FROM original_baseline_context) OR EXISTS(SELECT 1 FROM project_payment_terms) OR EXISTS(SELECT 1 FROM acceptance_forms WHERE adjustment_of IS NOT NULL) OR EXISTS(SELECT 1 FROM payment_items WHERE released) THEN RAISE EXCEPTION 'Sprint 6-8 rollback refused: preserve payment terms, adjustments and released history'; END IF; END; $$;
DROP TRIGGER work_item_contract_mirror ON work_items;
DROP FUNCTION mirror_work_item_contract();
DROP TRIGGER contract_work_item_mirror ON item_contracts;
DROP FUNCTION mirror_contract_to_work_item();
DROP TRIGGER acceptance_evidence_guard ON acceptance_photos;
DROP FUNCTION protect_acceptance_photo();
DROP VIEW effective_acceptances;
DROP INDEX acceptance_active_period;
DROP INDEX acceptance_one_replacement;
DROP INDEX payment_one_active_acceptance;
DROP TRIGGER payment_return_release ON payment_requests;
DROP FUNCTION release_returned_payment();
ALTER TABLE payment_items DROP COLUMN released;
ALTER TABLE payment_items ADD UNIQUE(acceptance_id);
ALTER TABLE acceptance_forms DROP CONSTRAINT adjustment_requires_reason;
ALTER TABLE acceptance_forms DROP COLUMN adjustment_of,DROP COLUMN adjustment_reason;
DROP TABLE project_payment_terms;
DROP TRIGGER baseline_context_capture ON baselines;
DROP FUNCTION capture_original_baseline_context();
DROP TABLE original_baseline_context;
CREATE OR REPLACE FUNCTION protect_approved_acceptance() RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
CREATE OR REPLACE FUNCTION protect_contract() RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
CREATE OR REPLACE FUNCTION protect_payment_item() RETURNS TRIGGER LANGUAGE plpgsql AS $$
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

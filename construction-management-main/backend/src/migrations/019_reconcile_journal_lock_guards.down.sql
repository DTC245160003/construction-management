-- Refuse to remove protection while S-24 lock state or metadata is in use.
DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM site_journals WHERE is_locked OR locked_at IS NOT NULL OR locked_by IS NOT NULL)
        OR EXISTS(SELECT 1 FROM journal_daily_info WHERE is_locked OR locked_at IS NOT NULL OR locked_by IS NOT NULL)
    THEN RAISE EXCEPTION 'Journal lock reconciliation rollback refused: preserve lock metadata'; END IF;
END; $$;

CREATE OR REPLACE FUNCTION protect_locked_journal() RETURNS TRIGGER LANGUAGE plpgsql AS $$
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

CREATE OR REPLACE FUNCTION protect_journal_photo_link() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE jid INTEGER; pid INTEGER; target_day DATE; item_id INTEGER; photo_pid INTEGER; photo_item INTEGER;
BEGIN
    jid := COALESCE(NEW.journal_id,OLD.journal_id);
    SELECT project_id,day,work_item_id INTO pid,target_day,item_id FROM site_journals WHERE id=jid;
    PERFORM 1 FROM projects WHERE id=pid FOR NO KEY UPDATE;
    IF EXISTS(SELECT 1 FROM journal_day_locks WHERE project_id=pid AND day=target_day AND locked) THEN
        RAISE EXCEPTION 'Journal day is locked' USING ERRCODE='23514';
    END IF;
    IF TG_OP <> 'DELETE' AND NEW.photo_id IS NOT NULL THEN
        SELECT project_id,work_item_id INTO photo_pid,photo_item FROM site_photos WHERE id=NEW.photo_id;
        IF photo_pid IS DISTINCT FROM pid OR photo_item IS DISTINCT FROM item_id THEN
            RAISE EXCEPTION 'Photo must match journal project and item' USING ERRCODE='23514';
        END IF;
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

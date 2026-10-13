-- Reconcile S-24 record locks with Sprint 4-5 journal, daily and upload guards.
-- Released migrations remain unchanged, including both independent 017 files.
CREATE OR REPLACE FUNCTION protect_locked_journal() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE pid INTEGER; target_day DATE; old_pid INTEGER; old_day DATE;
BEGIN
    pid := COALESCE(NEW.project_id,OLD.project_id);
    target_day := COALESCE(NEW.day,OLD.day);
    IF TG_OP <> 'INSERT' THEN old_pid := OLD.project_id; old_day := OLD.day; END IF;
    PERFORM 1 FROM projects WHERE id IN (pid,old_pid) ORDER BY id FOR NO KEY UPDATE;

    -- The service authorizes metadata transitions. They must remain possible
    -- while locked so an authorized unlock and day-lock flag sync can finish.
    IF TG_OP='UPDATE' AND (to_jsonb(NEW)-ARRAY['is_locked','locked_at','locked_by'])
        IS NOT DISTINCT FROM (to_jsonb(OLD)-ARRAY['is_locked','locked_at','locked_by']) THEN
        RETURN NEW;
    END IF;
    IF (TG_OP <> 'INSERT' AND OLD.is_locked)
        OR EXISTS(SELECT 1 FROM journal_day_locks WHERE locked AND
            ((project_id=pid AND day=target_day) OR (project_id=old_pid AND day=old_day))) THEN
        RAISE EXCEPTION 'Journal day or record is locked' USING ERRCODE='23514';
    END IF;
    -- A daily header is shared by every record on that day, including locked
    -- records. Another unlocked entry must not change their daily information.
    IF TG_TABLE_NAME='journal_daily_info' AND EXISTS(
        SELECT 1 FROM site_journals WHERE is_locked AND
            ((project_id=pid AND day=target_day) OR (project_id=old_pid AND day=old_day))
    ) THEN
        RAISE EXCEPTION 'Journal daily information is locked' USING ERRCODE='23514';
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

CREATE OR REPLACE FUNCTION protect_journal_photo_link() RETURNS TRIGGER LANGUAGE plpgsql AS $$
DECLARE jid INTEGER; old_jid INTEGER; pid INTEGER; item_id INTEGER; photo_pid INTEGER; photo_item INTEGER;
BEGIN
    jid := COALESCE(NEW.journal_id,OLD.journal_id);
    IF TG_OP <> 'INSERT' THEN old_jid := OLD.journal_id; END IF;
    PERFORM 1 FROM projects WHERE id IN (
        SELECT project_id FROM site_journals WHERE id IN (jid,old_jid)
    ) ORDER BY id FOR NO KEY UPDATE;
    -- Check both ends when moving a link/upload between journal records.
    IF EXISTS(SELECT 1 FROM site_journals j WHERE j.id IN (jid,old_jid)
        AND (j.is_locked OR EXISTS(SELECT 1 FROM journal_day_locks l
            WHERE l.project_id=j.project_id AND l.day=j.day AND l.locked))) THEN
        RAISE EXCEPTION 'Journal day or record is locked' USING ERRCODE='23514';
    END IF;
    SELECT project_id,work_item_id INTO pid,item_id FROM site_journals WHERE id=jid;
    IF TG_OP <> 'DELETE' AND NEW.photo_id IS NOT NULL THEN
        SELECT project_id,work_item_id INTO photo_pid,photo_item FROM site_photos WHERE id=NEW.photo_id;
        IF photo_pid IS DISTINCT FROM pid OR photo_item IS DISTINCT FROM item_id THEN
            RAISE EXCEPTION 'Photo must match journal project and item' USING ERRCODE='23514';
        END IF;
    END IF;
    IF TG_OP='DELETE' THEN RETURN OLD; END IF;
    RETURN NEW;
END; $$;

-- Older Sprint 4-5 day locks predate S-24's per-row metadata. Main's repeated
-- day locks also advanced the day event without refreshing its row flags.
-- Normalize a true record flag only when immutable audit timestamps prove it
-- came from a day event, with no explicit record lock in that transaction.
-- Preserve ambiguous/individual locks; JSON audit snapshots lose precision.
UPDATE site_journals j SET is_locked=TRUE,locked_at=l.updated_at,locked_by=l.changed_by
FROM journal_day_locks l WHERE l.project_id=j.project_id AND l.day=j.day AND l.locked AND (
    NOT j.is_locked OR (
        EXISTS(SELECT 1 FROM audit_logs a WHERE a.project_id=j.project_id AND a.module='journal'
            AND a.action='lock_day' AND a.object_id=j.day::text AND a.actor_id=j.locked_by AND a.created_at=j.locked_at)
        AND NOT EXISTS(SELECT 1 FROM audit_logs a WHERE a.project_id=j.project_id AND a.module='journal'
            AND a.action='lock_record' AND a.object_id=j.id::text AND a.created_at=j.locked_at)
    )
);
-- Daily headers have no independent record-lock operation. Their metadata
-- always follows the current day event so an authorized day unlock clears it.
UPDATE journal_daily_info d SET is_locked=TRUE,locked_at=l.updated_at,locked_by=l.changed_by
FROM journal_day_locks l WHERE l.project_id=d.project_id AND l.day=d.day AND l.locked;

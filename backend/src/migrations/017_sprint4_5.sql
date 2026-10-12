ALTER TABLE project_invitations ADD COLUMN token_hash TEXT;
ALTER TABLE project_invitations ADD COLUMN expires_at TIMESTAMPTZ;
CREATE UNIQUE INDEX invitation_token_unique ON project_invitations(token_hash) WHERE token_hash IS NOT NULL;

CREATE TABLE journal_catalog (
    project_id INTEGER NOT NULL REFERENCES projects(id),
    kind TEXT NOT NULL CHECK(kind IN ('weather','equipment')),
    code TEXT NOT NULL CHECK(length(code) BETWEEN 1 AND 80),
    label TEXT NOT NULL CHECK(length(trim(label)) BETWEEN 1 AND 255),
    all_day_rain BOOLEAN NOT NULL DEFAULT FALSE,
    active BOOLEAN NOT NULL DEFAULT TRUE,
    PRIMARY KEY(project_id,kind,code),
    CHECK(kind='weather' OR NOT all_day_rain)
);
-- Defaults are editable data; UI and validation both read this catalog.
CREATE FUNCTION seed_journal_catalog() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    INSERT INTO journal_catalog(project_id,kind,code,label,all_day_rain) VALUES
      (NEW.id,'weather','sunny','Nắng',FALSE),(NEW.id,'weather','cloudy','Nhiều mây',FALSE),
      (NEW.id,'weather','rain','Mưa',FALSE),(NEW.id,'weather','all_day_rain','Mưa cả ngày',TRUE),
      (NEW.id,'equipment','compactor','Máy đầm',FALSE),(NEW.id,'equipment','crane','Cẩu',FALSE),
      (NEW.id,'equipment','excavator','Máy đào',FALSE);
    RETURN NEW;
END; $$;
CREATE TRIGGER journal_catalog_defaults AFTER INSERT ON projects FOR EACH ROW EXECUTE FUNCTION seed_journal_catalog();
INSERT INTO journal_catalog(project_id,kind,code,label,all_day_rain)
SELECT p.id,v.kind,v.code,v.label,v.rain FROM projects p CROSS JOIN
 (VALUES ('weather','sunny','Nắng',FALSE),('weather','cloudy','Nhiều mây',FALSE),
 ('weather','rain','Mưa',FALSE),('weather','all_day_rain','Mưa cả ngày',TRUE),
 ('equipment','compactor','Máy đầm',FALSE),('equipment','crane','Cẩu',FALSE),('equipment','excavator','Máy đào',FALSE)) v(kind,code,label,rain);
ALTER TABLE journal_daily_info ADD COLUMN weather_code TEXT;
ALTER TABLE journal_daily_info ADD COLUMN equipment_codes JSONB NOT NULL DEFAULT '[]';
ALTER TABLE journal_daily_info ADD COLUMN all_day_rain BOOLEAN NOT NULL DEFAULT FALSE;

CREATE TABLE journal_versions (
    journal_id INTEGER NOT NULL REFERENCES site_journals(id),
    revision INTEGER NOT NULL, snapshot JSONB NOT NULL,
    actor_id INTEGER NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    PRIMARY KEY(journal_id,revision)
);
INSERT INTO journal_versions(journal_id,revision,snapshot,actor_id)
SELECT id,revision,to_jsonb(j)||jsonb_build_object('time',to_char(j.time,'HH24:MI'),'photo_ids',
    coalesce((SELECT jsonb_agg(photo_id ORDER BY photo_id) FROM journal_photos WHERE journal_id=j.id),'[]'::jsonb)),author_id FROM site_journals j;
CREATE TRIGGER journal_versions_immutable BEFORE UPDATE OR DELETE ON journal_versions FOR EACH ROW EXECUTE FUNCTION reject_history_change();
CREATE TABLE journal_conflicts (
    id BIGSERIAL PRIMARY KEY, journal_id INTEGER NOT NULL REFERENCES site_journals(id),
    operation_uuid UUID NOT NULL UNIQUE,
    actor_id INTEGER NOT NULL REFERENCES users(id), base_revision INTEGER NOT NULL,
    base_snapshot JSONB NOT NULL, server_snapshot JSONB NOT NULL, incoming_snapshot JSONB NOT NULL,
    resolved_by INTEGER REFERENCES users(id), resolved_at TIMESTAMPTZ, chosen TEXT CHECK(chosen IN ('server','incoming')),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE journal_writes (
    operation_uuid UUID PRIMARY KEY, project_id INTEGER NOT NULL REFERENCES projects(id),
    actor_id INTEGER NOT NULL REFERENCES users(id), input_hash TEXT NOT NULL,
    result JSONB NOT NULL, created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION protect_journal_conflict_history() RETURNS TRIGGER LANGUAGE plpgsql AS $$
BEGIN
    IF TG_OP='DELETE' OR (to_jsonb(NEW)-ARRAY['resolved_by','resolved_at','chosen'])
        IS DISTINCT FROM (to_jsonb(OLD)-ARRAY['resolved_by','resolved_at','chosen'])
        OR OLD.resolved_at IS NOT NULL THEN
      RAISE EXCEPTION 'Conflict history is immutable' USING ERRCODE='23514';
    END IF;
    RETURN NEW;
END; $$;
CREATE TRIGGER journal_conflicts_history_guard BEFORE UPDATE OR DELETE ON journal_conflicts FOR EACH ROW EXECUTE FUNCTION protect_journal_conflict_history();
CREATE TRIGGER journal_writes_immutable BEFORE UPDATE OR DELETE ON journal_writes FOR EACH ROW EXECUTE FUNCTION reject_history_change();
-- Upload manifests describe missing photos without introducing a second photo store.
CREATE TABLE journal_photo_uploads (
    client_uuid UUID PRIMARY KEY, journal_id INTEGER NOT NULL REFERENCES site_journals(id),
    uploaded_by INTEGER NOT NULL REFERENCES users(id), filename TEXT NOT NULL,
    photo_id INTEGER REFERENCES site_photos(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE FUNCTION protect_journal_photo_link() RETURNS TRIGGER LANGUAGE plpgsql AS $$
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
CREATE TRIGGER journal_photo_link_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_photos FOR EACH ROW EXECUTE FUNCTION protect_journal_photo_link();
CREATE TRIGGER journal_upload_lock_guard BEFORE INSERT OR UPDATE OR DELETE ON journal_photo_uploads FOR EACH ROW EXECUTE FUNCTION protect_journal_photo_link();

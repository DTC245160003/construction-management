-- Refuse a rollback that would discard new business data.
DO $$ BEGIN
 IF EXISTS(SELECT 1 FROM journal_conflicts) OR EXISTS(SELECT 1 FROM journal_writes)
 OR EXISTS(SELECT 1 FROM journal_photo_uploads)
 OR EXISTS(SELECT 1 FROM journal_versions v JOIN site_journals j ON j.id=v.journal_id WHERE v.revision<>j.revision)
 OR EXISTS(SELECT 1 FROM project_invitations WHERE token_hash IS NOT NULL)
 OR EXISTS(SELECT 1 FROM journal_daily_info WHERE weather_code IS NOT NULL OR equipment_codes<>'[]'::jsonb OR all_day_rain)
 OR EXISTS(SELECT 1 FROM projects p WHERE (SELECT count(*) FROM journal_catalog c WHERE c.project_id=p.id)<>7)
 OR EXISTS(
   SELECT project_id,kind,code,label,all_day_rain,active FROM journal_catalog
   EXCEPT SELECT p.id,v.kind,v.code,v.label,v.rain,TRUE FROM projects p CROSS JOIN
     (VALUES ('weather','sunny','Nắng',FALSE),('weather','cloudy','Nhiều mây',FALSE),
     ('weather','rain','Mưa',FALSE),('weather','all_day_rain','Mưa cả ngày',TRUE),
     ('equipment','compactor','Máy đầm',FALSE),('equipment','crane','Cẩu',FALSE),('equipment','excavator','Máy đào',FALSE)) v(kind,code,label,rain)
 )
 THEN RAISE EXCEPTION 'Sprint 4-5 rollback refused: preserve business data before reverting'; END IF;
END; $$;
DROP TRIGGER journal_upload_lock_guard ON journal_photo_uploads;
DROP TRIGGER journal_photo_link_guard ON journal_photos;
DROP FUNCTION protect_journal_photo_link();
DROP TABLE journal_photo_uploads,journal_writes,journal_conflicts,journal_versions;
DROP FUNCTION protect_journal_conflict_history();
ALTER TABLE journal_daily_info DROP COLUMN weather_code,DROP COLUMN equipment_codes,DROP COLUMN all_day_rain;
DROP TRIGGER journal_catalog_defaults ON projects;
DROP FUNCTION seed_journal_catalog();
DROP TABLE journal_catalog;
DROP INDEX invitation_token_unique;
ALTER TABLE project_invitations DROP COLUMN token_hash,DROP COLUMN expires_at;

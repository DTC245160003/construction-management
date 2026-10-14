ALTER TABLE journal_daily_info DROP COLUMN IF EXISTS locked_by;
ALTER TABLE journal_daily_info DROP COLUMN IF EXISTS locked_at;
ALTER TABLE journal_daily_info DROP COLUMN IF EXISTS is_locked;

ALTER TABLE site_journals DROP COLUMN IF EXISTS locked_by;
ALTER TABLE site_journals DROP COLUMN IF EXISTS locked_at;
ALTER TABLE site_journals DROP COLUMN IF EXISTS is_locked;

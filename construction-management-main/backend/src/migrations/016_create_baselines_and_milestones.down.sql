DO $$ BEGIN
    IF EXISTS (SELECT 1 FROM baselines) OR EXISTS (SELECT 1 FROM baseline_history)
       OR EXISTS (SELECT 1 FROM milestones) OR EXISTS (SELECT 1 FROM milestone_alerts) THEN
        RAISE EXCEPTION '016 contains project baselines or milestone records; archive them before rollback';
    END IF;
END; $$;

DROP TABLE IF EXISTS milestone_alerts;
DROP TABLE IF EXISTS milestones;
DROP TABLE IF EXISTS baseline_history;
DROP TABLE IF EXISTS baselines;

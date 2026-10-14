DO $$ BEGIN
    IF EXISTS(SELECT 1 FROM site_journals) OR EXISTS(SELECT 1 FROM site_photos) OR EXISTS(SELECT 1 FROM item_contracts)
       OR EXISTS(SELECT 1 FROM acceptance_forms) OR EXISTS(SELECT 1 FROM payment_requests) OR EXISTS(SELECT 1 FROM budget_versions)
       OR EXISTS(SELECT 1 FROM actual_costs) OR EXISTS(SELECT 1 FROM materials) OR EXISTS(SELECT 1 FROM project_site_settings)
       OR EXISTS(SELECT 1 FROM journal_daily_info) OR EXISTS(SELECT 1 FROM journal_day_locks)
       OR EXISTS(SELECT 1 FROM notification_preferences) OR EXISTS(SELECT 1 FROM email_outbox) OR EXISTS(SELECT 1 FROM project_milestones)
       OR EXISTS(SELECT 1 FROM notifications WHERE event_key IS NOT NULL) THEN
        RAISE EXCEPTION '013 contains operational data; archive it before rollback';
    END IF;
END; $$;
DROP TRIGGER financial_leaf_guard ON work_items;
DROP TABLE project_milestones,email_outbox,notification_preferences,material_norms,inventory_transactions,materials,actual_costs,budget_versions,
    payment_items,payment_requests,acceptance_photos,acceptance_forms,item_contracts,issue_photos,journal_photos,
    site_journals,journal_day_locks,journal_daily_info,site_photos,project_site_settings;
ALTER TABLE notifications DROP COLUMN event_key;
DROP FUNCTION apply_inventory(),protect_payment_item(),protect_payment(),protect_contract(),protect_approved_acceptance(),protect_locked_journal();
DROP FUNCTION preserve_financial_leaf(),validate_budget_leaf();

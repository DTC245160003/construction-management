function createNotificationDeliveryModel(pool) {
    return {
        async projects() { return (await pool.query("SELECT id FROM projects ORDER BY id")).rows; },
        async deliverOne(send) {
            const client=await pool.connect();
            try {
                await client.query("BEGIN");
                const row=(await client.query(`SELECT e.*,n.user_id,n.project_id,n.type,n.message,n.target_path,u.email,
                    coalesce(p.email_enabled,TRUE) AS enabled,EXISTS(SELECT 1 FROM project_members m WHERE m.user_id=n.user_id AND m.project_id=n.project_id) AS member
                    FROM email_outbox e JOIN notifications n ON n.id=e.notification_id JOIN users u ON u.id=n.user_id
                    LEFT JOIN notification_preferences p ON p.user_id=n.user_id AND p.type=n.type
                    WHERE e.sent_at IS NULL AND e.skipped_at IS NULL AND e.next_attempt_at<=CURRENT_TIMESTAMP
                    ORDER BY e.id FOR UPDATE OF e SKIP LOCKED LIMIT 1`)).rows[0];
                if (!row) { await client.query("COMMIT"); return false; }
                if (!row.enabled || !row.member) await client.query("UPDATE email_outbox SET skipped_at=CURRENT_TIMESTAMP,last_error='disabled_or_no_membership' WHERE id=$1",[row.id]);
                else {
                    try { await send(row); await client.query("UPDATE email_outbox SET sent_at=CURRENT_TIMESTAMP,attempts=attempts+1,last_error=NULL WHERE id=$1",[row.id]); }
                    catch (error) { await client.query("UPDATE email_outbox SET attempts=attempts+1,next_attempt_at=CURRENT_TIMESTAMP+make_interval(mins=>least((attempts+1)*2,30)),last_error=$2 WHERE id=$1",[row.id,String(error.code || "delivery_failed").slice(0,100)]); }
                }
                await client.query("COMMIT"); return true;
            } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); }
        }
    };
}
module.exports = { createNotificationDeliveryModel };

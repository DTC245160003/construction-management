// Serialize graph edits and schedule reads/calculations on the same project row.
// READ COMMITTED ensures a waiter sees the previous writer's committed changes.
async function withProjectTransaction(pool, projectId, operation) {
    const client = await pool.connect();
    try {
        await client.query("BEGIN ISOLATION LEVEL READ COMMITTED");
        const { rows } = await client.query(
            "SELECT id, schedule_needs_recalc FROM projects WHERE id = $1 FOR NO KEY UPDATE", [projectId]
        );
        if (!rows[0]) {
            throw Object.assign(new Error("Không tìm thấy dự án"), { status: 404, expose: true });
        }
        const result = await operation(client, rows[0]);
        await client.query("COMMIT");
        return result;
    } catch (error) {
        await client.query("ROLLBACK");
        throw error;
    } finally {
        client.release();
    }
}

module.exports = { withProjectTransaction };

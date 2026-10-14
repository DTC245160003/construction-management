const { withProjectTransaction } = require("./projectTransaction");

// Separate adapter: the existing task/CPM models stay unchanged.
function createTaskProgressModel(pool) {
    return {
        withProjectTransaction(projectId, operation) {
            return withProjectTransaction(pool, projectId, client => operation(createTaskProgressModel(client)));
        },
        async findById(projectId, taskId) {
            const { rows } = await pool.query(`
                SELECT t.*, t.actual_start::text, t.actual_finish::text
                FROM tasks t JOIN work_items w ON w.id = t.work_item_id
                WHERE w.project_id = $1 AND t.id = $2
            `, [projectId, taskId]);
            return rows[0] || null;
        },
        async updateProgress(projectId, taskId, values) {
            const { rows } = await pool.query(`
                UPDATE tasks t SET actual_start = $3, actual_finish = $4,
                    progress_percent = $5, updated_at = CURRENT_TIMESTAMP
                FROM work_items w
                WHERE t.id = $2 AND w.id = t.work_item_id AND w.project_id = $1
                RETURNING t.*, t.actual_start::text, t.actual_finish::text
            `, [projectId, taskId, values.actual_start, values.actual_finish, values.progress_percent]);
            return rows[0] || null;
        }
    };
}
module.exports = { createTaskProgressModel };

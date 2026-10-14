const { withProjectTransaction } = require("./projectTransaction");

function createTaskModel(pool) {
    return {
        withProjectTransaction(projectId, operation) {
            return withProjectTransaction(pool, projectId, (client) => operation(createTaskModel(client)));
        },
        async list(projectId) {
            const { rows } = await pool.query(`
                SELECT t.* FROM tasks t
                JOIN work_items w ON w.id = t.work_item_id
                WHERE w.project_id = $1 ORDER BY t.id
            `, [projectId]);
            return rows;
        },

        async findById(projectId, taskId) {
            const { rows } = await pool.query(`
                SELECT t.* FROM tasks t
                JOIN work_items w ON w.id = t.work_item_id
                WHERE w.project_id = $1 AND t.id = $2
            `, [projectId, taskId]);
            return rows[0] || null;
        },

        async save(projectId, taskId, { work_item_id, name, duration_days, actual_start = null, actual_finish = null, progress_percent = 0 }) {
            return withProjectTransaction(pool, projectId, async (client) => {
                // Child creation/reparenting takes the same lock before checking tasks.
                const item = await client.query(`
                    SELECT id FROM work_items WHERE project_id = $1 AND id = $2 FOR UPDATE
                `, [projectId, work_item_id]);
                if (!item.rowCount) throw Object.assign(new Error(), { code: "ITEM_NOT_FOUND" });
                const children = await client.query(
                    "SELECT 1 FROM work_items WHERE parent_id = $1 LIMIT 1", [work_item_id]
                );
                if (children.rowCount) throw Object.assign(new Error(), { code: "ITEM_NOT_LEAF" });

                const result = taskId == null
                    ? await client.query(`
                        INSERT INTO tasks (work_item_id, name, duration_days, actual_start, actual_finish, progress_percent)
                        VALUES ($1, $2, $3, $4, $5, $6) RETURNING *
                    `, [work_item_id, name, duration_days, actual_start, actual_finish, progress_percent])
                    : await client.query(`
                        UPDATE tasks t SET work_item_id = $1, name = $2, duration_days = $3,
                            actual_start = $4, actual_finish = $5, progress_percent = $6,
                            updated_at = CURRENT_TIMESTAMP
                        FROM work_items w
                        WHERE t.id = $7 AND w.id = t.work_item_id AND w.project_id = $8
                        RETURNING t.*
                    `, [work_item_id, name, duration_days, actual_start, actual_finish, progress_percent, taskId, projectId]);
                return result.rows[0] || null;
            });
        },

        async listDependencies(projectId) {
            const { rows } = await pool.query(`
                SELECT d.* FROM dependencies d
                JOIN tasks p ON p.id = d.predecessor_task_id
                JOIN work_items pw ON pw.id = p.work_item_id
                JOIN tasks s ON s.id = d.successor_task_id
                JOIN work_items sw ON sw.id = s.work_item_id
                WHERE pw.project_id = $1 AND sw.project_id = $1 ORDER BY d.id
            `, [projectId]);
            return rows;
        },

        async createDependency(projectId, successorId, { predecessor_task_id, dependency_type, lag_days }) {
            // Both endpoints must belong to this project, even for direct API calls.
            const { rows } = await pool.query(`
                INSERT INTO dependencies
                    (predecessor_task_id, successor_task_id, dependency_type, lag_days)
                SELECT p.id, s.id, $4, $5
                FROM tasks p JOIN work_items pw ON pw.id = p.work_item_id
                CROSS JOIN tasks s JOIN work_items sw ON sw.id = s.work_item_id
                WHERE p.id = $2 AND s.id = $3 AND pw.project_id = $1 AND sw.project_id = $1
                RETURNING *
            `, [projectId, predecessor_task_id, successorId, dependency_type, lag_days]);
            return rows[0] || null;
        },

        async removeDependency(projectId, successorId, dependencyId) {
            const { rowCount } = await pool.query(`
                DELETE FROM dependencies d USING tasks t, work_items w
                WHERE d.id = $3 AND d.successor_task_id = $2
                    AND t.id = d.successor_task_id AND w.id = t.work_item_id AND w.project_id = $1
            `, [projectId, successorId, dependencyId]);
            return rowCount > 0;
        }
    };
}

module.exports = { createTaskModel };

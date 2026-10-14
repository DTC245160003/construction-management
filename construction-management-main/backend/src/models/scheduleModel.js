const { createTaskModel } = require("./taskModel");
const { withProjectTransaction } = require("./projectTransaction");

function createScheduleModel(pool) {
    return {
        pool,
        tasks: createTaskModel(pool),

        async hasOngoingActuals(projectId) {
            const { rows } = await pool.query(`SELECT EXISTS (
                SELECT 1 FROM tasks t JOIN work_items w ON w.id = t.work_item_id
                WHERE w.project_id = $1 AND t.actual_finish IS NULL
                    AND (t.actual_start IS NOT NULL OR t.progress_percent > 0)
            ) AS ongoing`, [projectId]);
            return rows[0].ongoing;
        },

        withProjectTransaction(projectId, operation) {
            return withProjectTransaction(pool, projectId, (client, project) =>
                operation(createScheduleModel(client), project));
        },

        async getProjectCalendarInfo(projectId) {
            const project = (await pool.query("SELECT *, start_date::text AS start_date FROM projects WHERE id = $1", [projectId])).rows[0];
            const calendar = (await pool.query("SELECT * FROM project_calendars WHERE project_id = $1", [projectId])).rows[0];
            const holidays = (await pool.query("SELECT day::text AS day FROM project_holidays WHERE project_id = $1", [projectId])).rows.map(r => r.day);
            return { project, calendar, holidays };
        },

        async replaceResults(projectId, results) {
            await pool.query(`
                DELETE FROM schedule_results r USING tasks t, work_items w
                WHERE r.task_id = t.id AND t.work_item_id = w.id AND w.project_id = $1
            `, [projectId]);
            // One bulk write, including all tasks; never a query per task.
            await pool.query(`
                INSERT INTO schedule_results
                    (task_id, early_start, early_finish, late_start, late_finish, total_float, is_critical, initially_critical, planned_early_finish)
                SELECT id, es, ef, ls, lf, slack, "isCritical", coalesce("initiallyCritical", "isCritical"), coalesce("plannedEf", ef)
                FROM jsonb_to_recordset($1::jsonb) AS result(
                    id INTEGER, es BIGINT, ef BIGINT, ls BIGINT, lf BIGINT, slack BIGINT, "isCritical" BOOLEAN, "initiallyCritical" BOOLEAN, "plannedEf" BIGINT
                )
            `, [JSON.stringify(results.map(({ id, es, ef, ls, lf, slack, isCritical, initiallyCritical, plannedEf }) => ({
                id, es, ef, ls, lf, slack, isCritical, initiallyCritical: initiallyCritical ?? isCritical, plannedEf: plannedEf ?? ef
            })))]);
            await pool.query("UPDATE projects SET schedule_needs_recalc = FALSE WHERE id = $1", [projectId]);
        },

        async listResults(projectId, criticalOnly = false) {
            const { rows } = await pool.query(`
                SELECT t.id, t.name, t.duration_days, t.work_item_id,
                    t.actual_start::text AS actual_start, t.actual_finish::text AS actual_finish,
                    coalesce(t.progress_percent, 0) AS progress_percent,
                    r.early_start::double precision AS es, r.early_finish::double precision AS ef,
                    r.late_start::double precision AS ls, r.late_finish::double precision AS lf,
                    r.total_float::double precision AS slack, r.is_critical AS "isCritical",
                    coalesce(r.initially_critical, r.is_critical) AS "initiallyCritical",
                    (r.is_critical AND NOT coalesce(r.initially_critical, false)) AS "newlyCritical",
                    coalesce(r.planned_early_finish, r.early_finish)::double precision AS "plannedEf",
                    r.calculated_at,
                    b.early_start::double precision AS baseline_es,
                    b.early_finish::double precision AS baseline_ef,
                    b.late_start::double precision AS baseline_ls,
                    b.late_finish::double precision AS baseline_lf,
                    b.created_at AS baseline_created_at
                FROM schedule_results r
                JOIN tasks t ON t.id = r.task_id
                JOIN work_items w ON w.id = t.work_item_id
                LEFT JOIN baselines b ON b.task_id = t.id AND b.project_id = w.project_id
                WHERE w.project_id = $1 AND (NOT $2::boolean OR r.is_critical)
                ORDER BY r.early_start, t.id
            `, [projectId, criticalOnly]);
            return rows;
        },

        async saveBaseline(projectId, userId) {
            // Check if baseline already exists for this project
            const existing = await pool.query(
                "SELECT task_id, early_start, early_finish, late_start, late_finish, user_id, created_at FROM baselines WHERE project_id = $1",
                [projectId]
            );

            if (existing.rows.length > 0) {
                // Archive previous baseline in history
                await pool.query(`
                    INSERT INTO baseline_history (project_id, task_id, early_start, early_finish, late_start, late_finish, user_id, created_at)
                    SELECT project_id, task_id, early_start, early_finish, late_start, late_finish, user_id, created_at
                    FROM baselines
                    WHERE project_id = $1
                `, [projectId]);

                await pool.query("DELETE FROM baselines WHERE project_id = $1", [projectId]);
            }

            // Insert new baseline snapshot from current schedule_results in a single atomic statement
            const { rows } = await pool.query(`
                INSERT INTO baselines (project_id, task_id, early_start, early_finish, late_start, late_finish, user_id, created_at)
                SELECT w.project_id, r.task_id, r.early_start, r.early_finish, r.late_start, r.late_finish, $2, CURRENT_TIMESTAMP
                FROM schedule_results r
                JOIN tasks t ON t.id = r.task_id
                JOIN work_items w ON w.id = t.work_item_id
                WHERE w.project_id = $1
                RETURNING *
            `, [projectId, userId]);

            return rows;
        },

        async baselineHistory(projectId) {
            const { rows } = await pool.query(`
                SELECT h.*, u.fullname AS user_fullname
                FROM baseline_history h
                JOIN users u ON u.id = h.user_id
                WHERE h.project_id = $1
                ORDER BY h.created_at DESC, h.id DESC
            `, [projectId]);
            return rows;
        },

        async listMilestones(projectId) {
            const { rows } = await pool.query(`
                SELECT m.*, m.target_date::text AS target_date,
                    w.title AS work_item_title, u.fullname AS created_by_name
                FROM milestones m
                JOIN work_items w ON w.id = m.work_item_id
                JOIN users u ON u.id = m.created_by
                WHERE m.project_id = $1
                ORDER BY m.target_date, m.id
            `, [projectId]);
            return rows;
        },

        async createMilestone(projectId, userId, { work_item_id, name, target_date }) {
            const { rows } = await pool.query(`
                INSERT INTO milestones (project_id, work_item_id, name, target_date, created_by)
                VALUES ($1, $2, $3, $4, $5)
                RETURNING *, target_date::text AS target_date
            `, [projectId, work_item_id, name, target_date, userId]);
            return rows[0];
        },

        async deleteMilestone(projectId, milestoneId) {
            const { rows } = await pool.query(`
                DELETE FROM milestones WHERE project_id = $1 AND id = $2 RETURNING id
            `, [projectId, milestoneId]);
            return rows[0] || null;
        },

        async listMilestoneAlerts(projectId, status = null) {
            const { rows } = await pool.query(`
                SELECT a.*, m.name AS milestone_name, m.target_date::text AS milestone_target_date,
                    w.title AS work_item_title
                FROM milestone_alerts a
                JOIN milestones m ON m.id = a.milestone_id
                JOIN work_items w ON w.id = a.work_item_id
                WHERE a.project_id = $1 AND ($2::varchar IS NULL OR a.status = $2)
                ORDER BY a.created_at DESC, a.id DESC
            `, [projectId, status]);
            return rows;
        },

        async syncMilestoneAlert(projectId, milestoneId, workItemId, overdueWorkingDays, criticalPath) {
            if (overdueWorkingDays > 0) {
                const existing = await pool.query(`
                    SELECT id FROM milestone_alerts
                    WHERE project_id = $1 AND milestone_id = $2 AND status = 'open'
                `, [projectId, milestoneId]);

                if (existing.rows.length > 0) {
                    await pool.query(`
                        UPDATE milestone_alerts
                        SET overdue_working_days = $2,
                            critical_path = $3::jsonb
                        WHERE id = $1
                    `, [existing.rows[0].id, overdueWorkingDays, JSON.stringify(criticalPath)]);
                } else {
                    await pool.query(`
                        INSERT INTO milestone_alerts
                            (project_id, milestone_id, work_item_id, overdue_working_days, critical_path, status)
                        VALUES ($1, $2, $3, $4, $5::jsonb, 'open')
                    `, [projectId, milestoneId, workItemId, overdueWorkingDays, JSON.stringify(criticalPath)]);
                }
            } else {
                // Not overdue anymore -> resolve open alerts
                await pool.query(`
                    UPDATE milestone_alerts
                    SET status = 'resolved',
                        resolved_at = CURRENT_TIMESTAMP
                    WHERE project_id = $1 AND milestone_id = $2 AND status = 'open'
                `, [projectId, milestoneId]);
            }
        }
    };
}

module.exports = { createScheduleModel };

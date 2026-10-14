function createAcceptanceSheetModel(pool) {
    const query = (sql, params = []) => pool.query(sql, params);
    const one = async (sql, params = []) => (await query(sql, params)).rows[0] || null;

    return {
        query,
        one,

        // Lấy thông tin đợt trước đã duyệt của từng hạng mục
        async getPreviousApprovedCumulative(projectId, workItemId) {
            const row = await one(
                `SELECT COALESCE(ai.current_cumulative, 0)::text AS previous_approved_cumulative
                 FROM acceptance_items ai
                 JOIN acceptance_sheets s ON s.id = ai.acceptance_sheet_id
                 WHERE s.project_id = $1 AND ai.work_item_id = $2 AND s.status = 'APPROVED'
                 ORDER BY s.sheet_date DESC, s.id DESC
                 LIMIT 1`,
                [projectId, workItemId]
            );
            return row ? row.previous_approved_cumulative : "0";
        },

        // Danh sách phiếu nghiệm thu theo dự án
        async listSheets(projectId) {
            const res = await query(
                `SELECT s.*,
                        s.sheet_date::text AS sheet_date,
                        u.fullname AS creator_name,
                        COALESCE(json_agg(
                            json_build_object(
                                'id', i.id,
                                'work_item_id', i.work_item_id,
                                'item_name', w.title,
                                'unit', COALESCE(w.unit, '—'),
                                'current_cumulative', i.current_cumulative::text,
                                'previous_approved_cumulative', i.previous_approved_cumulative::text,
                                'period_qty', i.period_qty::text,
                                'site_photos', i.site_photos
                            ) ORDER BY i.id
                        ) FILTER (WHERE i.id IS NOT NULL), '[]'::json) AS items
                 FROM acceptance_sheets s
                 LEFT JOIN users u ON u.id = s.created_by
                 LEFT JOIN acceptance_items i ON i.acceptance_sheet_id = s.id
                 LEFT JOIN work_items w ON w.id = i.work_item_id
                 WHERE s.project_id = $1
                 GROUP BY s.id, u.fullname
                 ORDER BY s.sheet_date DESC, s.id DESC`,
                [projectId]
            );
            return res.rows;
        },

        // Chi tiết phiếu nghiệm thu
        async getSheetById(id) {
            const sheet = await one(
                `SELECT s.*, s.sheet_date::text AS sheet_date, u.fullname AS creator_name
                 FROM acceptance_sheets s
                 LEFT JOIN users u ON u.id = s.created_by
                 WHERE s.id = $1`,
                [id]
            );
            if (!sheet) return null;

            const itemsRes = await query(
                `SELECT i.*,
                        w.title AS item_name,
                        COALESCE(w.unit, '—') AS unit,
                        w.contract_quantity::text AS contract_quantity,
                        i.current_cumulative::text AS current_cumulative,
                        i.previous_approved_cumulative::text AS previous_approved_cumulative,
                        i.period_qty::text AS period_qty
                 FROM acceptance_items i
                 JOIN work_items w ON w.id = i.work_item_id
                 WHERE i.acceptance_sheet_id = $1
                 ORDER BY i.id ASC`,
                [id]
            );
            return {
                ...sheet,
                items: itemsRes.rows
            };
        },

        // Lấy danh sách hạng mục lá để kỹ sư lập phiếu nghiệm thu kèm khối lượng hợp đồng và khối lượng đội báo (S-26)
        async getSheetInputData(projectId) {
            const res = await query(
                `SELECT w.id AS work_item_id,
                        w.title AS item_name,
                        COALESCE(w.unit, '—') AS unit,
                        COALESCE(w.contract_quantity, 0)::text AS contract_quantity,
                        COALESCE(w.contract_unit_price, 0)::text AS contract_unit_price,
                        COALESCE(d.reported, 0)::text AS reported_quantity,
                        COALESCE(latest_app.approved_cumulative, 0)::text AS previous_approved_cumulative
                 FROM work_items w
                 LEFT JOIN (
                     SELECT t.work_item_id, sum(dp.quantity) AS reported
                     FROM daily_progress dp
                     JOIN tasks t ON t.id = dp.task_id
                     GROUP BY t.work_item_id
                 ) d ON d.work_item_id = w.id
                 LEFT JOIN (
                     SELECT DISTINCT ON (ai.work_item_id)
                            ai.work_item_id,
                            ai.current_cumulative AS approved_cumulative
                     FROM acceptance_items ai
                     JOIN acceptance_sheets s ON s.id = ai.acceptance_sheet_id
                     WHERE s.project_id = $1 AND s.status = 'APPROVED'
                     ORDER BY ai.work_item_id, s.sheet_date DESC, s.id DESC
                 ) latest_app ON latest_app.work_item_id = w.id
                 WHERE w.project_id = $1
                   AND NOT EXISTS (SELECT 1 FROM work_items child WHERE child.parent_id = w.id)
                 ORDER BY w.id ASC`,
                [projectId]
            );
            return res.rows;
        },

        // Tạo phiếu nghiệm thu cùng các items trong một transaction
        async createSheet(client, { projectId, periodNumber, sheetDate, status = "DRAFT", notes = "", createdBy, items }) {
            const runner = client || pool;
            const sheetRes = await runner.query(
                `INSERT INTO acceptance_sheets (project_id, period_number, sheet_date, status, notes, created_by)
                 VALUES ($1, $2, $3, $4, $5, $6)
                 RETURNING *, sheet_date::text AS sheet_date`,
                [projectId, periodNumber, sheetDate, status, notes, createdBy]
            );
            const sheet = sheetRes.rows[0];

            const createdItems = [];
            for (const item of items) {
                const itemRes = await runner.query(
                    `INSERT INTO acceptance_items
                     (acceptance_sheet_id, work_item_id, current_cumulative, previous_approved_cumulative, period_qty, site_photos)
                     VALUES ($1, $2, $3, $4, $5, $6)
                     RETURNING *,
                               current_cumulative::text AS current_cumulative,
                               previous_approved_cumulative::text AS previous_approved_cumulative,
                               period_qty::text AS period_qty`,
                    [
                        sheet.id,
                        item.work_item_id,
                        item.current_cumulative,
                        item.previous_approved_cumulative,
                        item.period_qty,
                        JSON.stringify(item.site_photos || [])
                    ]
                );
                createdItems.push(itemRes.rows[0]);
            }

            return {
                ...sheet,
                items: createdItems
            };
        }
    };
}

module.exports = { createAcceptanceSheetModel };

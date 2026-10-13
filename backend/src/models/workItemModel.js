function createWorkItemModel(pool) {
  async function findSubtree({ projectId, rootItemId }) {
    const query = `
      WITH RECURSIVE item_tree AS (
        SELECT id, parent_id, project_id, title, description, status, created_at, updated_at, 1 AS depth, ARRAY[id] AS path
        FROM work_items
        WHERE id = $2 AND project_id = $1
        UNION ALL
        SELECT child.id, child.parent_id, child.project_id, child.title, child.description, child.status, child.created_at, child.updated_at, item_tree.depth + 1, item_tree.path || child.id
        FROM work_items AS child
        JOIN item_tree ON child.parent_id = item_tree.id AND child.project_id = item_tree.project_id
        WHERE NOT child.id = ANY(item_tree.path)
      )
      SELECT * FROM item_tree ORDER BY path
    `;
    const { rows } = await pool.query(query, [projectId, rootItemId]);
    return rows;
  }

  async function createAcceptanceNote({ workItemId, quantity }) {
    const client = await pool.connect();
    try {
      await client.query('BEGIN');

      // 1. Khoá dòng hạng mục (Row-level Lock: FOR UPDATE)
      const workItemRes = await client.query(
        `SELECT id, contract_quantity 
         FROM work_items 
         WHERE id = $1 FOR UPDATE`,
        [workItemId]
      );

      if (workItemRes.rows.length === 0) {
        throw { statusCode: 404, message: 'Hạng mục không tồn tại' };
      }

      const contractQuantity = Number(workItemRes.rows[0].contract_quantity || 0);

      // 2. Tính tổng lũy kế đã nghiệm thu
      const accumRes = await client.query(
        `SELECT COALESCE(SUM(quantity), 0) AS total_accepted 
         FROM acceptance_note_items 
         WHERE work_item_id = $1`,
        [workItemId]
      );

      const currentAccumulated = Number(accumRes.rows[0].total_accepted);
      const requestedQuantity = Number(quantity);
      const newTotal = currentAccumulated + requestedQuantity;

      // 3. Kiểm tra chặn vượt khối lượng hợp đồng
      if (newTotal > contractQuantity) {
        throw {
          statusCode: 400,
          message: 'Lũy kế nghiệm thu vượt khối lượng hợp đồng',
          details: {
            contractQuantity,
            currentAccumulated,
            requestedQuantity,
            maxAllowed: contractQuantity - currentAccumulated
          }
        };
      }

      // 4. Tạo phiếu nghiệm thu
      const insertRes = await client.query(
        `INSERT INTO acceptance_note_items (work_item_id, quantity) 
         VALUES ($1, $2) RETURNING *`,
        [workItemId, requestedQuantity]
      );

      await client.query('COMMIT');
      return insertRes.rows[0];

    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  return {
    findSubtree,
    createAcceptanceNote
  };
}

module.exports = { createWorkItemModel };
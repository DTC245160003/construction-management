function createWorkItemModel(pool) {
    return {
        async findSubtree({ projectId, rootItemId }) {
            const { rows } = await pool.query(`
                WITH RECURSIVE item_tree AS (
                    SELECT
                        work_items.id,
                        work_items.project_id,
                        work_items.parent_id,
                        work_items.title,
                        work_items.description,
                        work_items.status,
                        work_items.created_at,
                        work_items.updated_at,
                        0 AS depth,
                        ARRAY[work_items.id] AS path
                    FROM work_items
                    WHERE work_items.project_id = $1
                      AND work_items.id = $2

                    UNION ALL

                    SELECT
                        child.id,
                        child.project_id,
                        child.parent_id,
                        child.title,
                        child.description,
                        child.status,
                        child.created_at,
                        child.updated_at,
                        item_tree.depth + 1,
                        item_tree.path || child.id
                    FROM work_items AS child
                    JOIN item_tree
                        ON child.parent_id = item_tree.id
                       AND child.project_id = item_tree.project_id
                    WHERE NOT child.id = ANY(item_tree.path)
                )
                SELECT *
                FROM item_tree
                ORDER BY path
            `, [projectId, rootItemId]);
            return rows;
        }
    };
}

module.exports = { createWorkItemModel };

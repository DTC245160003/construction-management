const { parseDecimal, calculateContractAmount, rollupWorkItemTree } = require("../utils/contractDecimal");

function createWorkItemCrudModel(pool) {
    async function getClient() {
        if (typeof pool.connect === "function") {
            const client = await pool.connect();
            return {
                client,
                release: () => client.release()
            };
        }
        return {
            client: pool,
            release: () => {}
        };
    }

    async function withParent(projectId, parentId, operation, actorId) {
        const { client, release } = await getClient();
        try {
            await client.query("BEGIN");
            await client.query('SELECT id FROM projects WHERE id=$1 FOR NO KEY UPDATE',[projectId]);
            if(actorId)await client.query("SELECT set_config('app.actor_id',$1,true)",[String(actorId)]);
            if(parentId!=null){
            const parent = await client.query(
                "SELECT id, contract_quantity, contract_unit_price FROM work_items WHERE project_id = $1 AND id = $2 FOR UPDATE",
                [projectId, parentId]
            );
            if (!parent.rowCount) {
                throw Object.assign(new Error("Không tìm thấy hạng mục cha trong dự án"), { status: 400, expose: true });
            }
            const parentRow = parent.rows[0];
            if (parentRow.contract_quantity != null || parentRow.contract_unit_price != null) {
                throw Object.assign(new Error("Hạng mục đã khai báo hợp đồng trực tiếp, không thể thêm hạng mục con"), { status: 409, expose: true });
            }
            const tasks = await client.query("SELECT 1 FROM tasks WHERE work_item_id = $1 LIMIT 1", [parentId]);
            if (tasks.rowCount) {
                throw Object.assign(new Error("Hạng mục đã có công việc, không thể thêm hạng mục con"), { status: 409, expose: true });
            }
            }
            const result = await operation(client);
            await client.query("COMMIT");
            return result;
        } catch (error) {
            await client.query("ROLLBACK");
            throw error;
        } finally {
            release();
        }
    }

    return {
        async findTree(projectId) {
            const { rows } = await pool.query(`
                WITH RECURSIVE item_tree AS (
                    SELECT
                        id, project_id, parent_id, title, description, status,
                        contract_quantity, unit, contract_unit_price,
                        created_at, updated_at, 0 AS depth, ARRAY[id] AS path
                    FROM work_items
                    WHERE project_id = $1 AND parent_id IS NULL

                    UNION ALL

                    SELECT
                        child.id, child.project_id, child.parent_id, child.title,
                        child.description, child.status,
                        child.contract_quantity, child.unit, child.contract_unit_price,
                        child.created_at,
                        child.updated_at, item_tree.depth + 1,
                        item_tree.path || child.id
                    FROM work_items AS child
                    JOIN item_tree
                      ON child.parent_id = item_tree.id
                     AND child.project_id = item_tree.project_id
                    WHERE NOT child.id = ANY(item_tree.path)
                )
                SELECT * FROM item_tree ORDER BY path
            `, [projectId]);
            return rollupWorkItemTree(rows);
        },

        async create({ projectId, parentId, title, description, status, contract_quantity, unit, contract_unit_price,actorId }) {
            const parsedQuantity = contract_quantity !== undefined && contract_quantity !== null && contract_quantity !== ""
                ? parseDecimal(contract_quantity, 4, false)
                : null;
            const parsedUnit = unit !== undefined && unit !== null
                ? String(unit).trim().slice(0, 50)
                : null;
            const parsedPrice = contract_unit_price !== undefined && contract_unit_price !== null && contract_unit_price !== ""
                ? parseDecimal(contract_unit_price, 2, true)
                : null;

            const { rows } = await withParent(projectId, parentId, async (client) => {
                const res = await client.query(`
                    INSERT INTO work_items (project_id, parent_id, title, description, status, contract_quantity, unit, contract_unit_price)
                    VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
                    RETURNING *
                `, [projectId, parentId || null, title, description || null, status || "todo", parsedQuantity, parsedUnit, parsedPrice]);
                
                return res;
            },actorId);
            const item = rows[0];
            return {
                ...item,
                is_leaf: true,
                contract_amount: calculateContractAmount(item.contract_quantity, item.contract_unit_price)
            };
        },

        async update({ projectId, itemId, parentId, title, description, status, contract_quantity, unit, contract_unit_price,actorId }) {
            const { client, release } = await getClient();
            try {
                await client.query("BEGIN");
                await client.query('SELECT id FROM projects WHERE id=$1 FOR NO KEY UPDATE',[projectId]);
                if(actorId)await client.query("SELECT set_config('app.actor_id',$1,true)",[String(actorId)]);
                
                // Check if current item exists and whether it has children
                const currentRes = await client.query(
                    "SELECT id, parent_id, title, description, status, contract_quantity, unit, contract_unit_price FROM work_items WHERE project_id = $1 AND id = $2 FOR UPDATE",
                    [projectId, itemId]
                );
                if (!currentRes.rowCount) {
                    await client.query("ROLLBACK");
                    return null;
                }
                const current = currentRes.rows[0];

                const childrenCheck = await client.query(
                    "SELECT 1 FROM work_items WHERE project_id = $1 AND parent_id = $2 LIMIT 1",
                    [projectId, itemId]
                );
                const isParent = childrenCheck.rowCount > 0;

                const hasContractPayload = contract_quantity !== undefined || contract_unit_price !== undefined || unit !== undefined;
                const hasNonEmptyContract = (contract_quantity !== undefined && contract_quantity !== null && contract_quantity !== "")
                    || (contract_unit_price !== undefined && contract_unit_price !== null && contract_unit_price !== "")
                    || (unit !== undefined && unit !== null && String(unit).trim() !== "");

                if (isParent && hasNonEmptyContract) {
                    throw Object.assign(
                        new Error("Hạng mục cha không được nhập trực tiếp các giá trị hợp đồng; giá trị hợp đồng được tổng hợp từ các hạng mục lá"),
                        { status: 422, expose: true }
                    );
                }

                // If parentId is being updated
                const nextParentId = parentId !== undefined ? (parentId || null) : current.parent_id;
                if (nextParentId != null && nextParentId !== current.parent_id) {
                    const parentCheck = await client.query(
                        "SELECT id, contract_quantity, contract_unit_price FROM work_items WHERE project_id = $1 AND id = $2 FOR UPDATE",
                        [projectId, nextParentId]
                    );
                    if (!parentCheck.rowCount) {
                        throw Object.assign(new Error("Không tìm thấy hạng mục cha trong dự án"), { status: 400, expose: true });
                    }
                    if (parentCheck.rows[0].contract_quantity != null || parentCheck.rows[0].contract_unit_price != null) {
                        throw Object.assign(new Error("Hạng mục cha đã khai báo hợp đồng trực tiếp, không thể thêm hạng mục con"), { status: 409, expose: true });
                    }
                    const tasks = await client.query("SELECT 1 FROM tasks WHERE work_item_id = $1 LIMIT 1", [nextParentId]);
                    if (tasks.rowCount) {
                        throw Object.assign(new Error("Hạng mục đã có công việc, không thể thêm hạng mục con"), { status: 409, expose: true });
                    }
                }

                let parsedQuantity = current.contract_quantity;
                let parsedUnit = current.unit;
                let parsedPrice = current.contract_unit_price;

                if (!isParent && hasContractPayload) {
                    if (contract_quantity !== undefined) {
                        parsedQuantity = (contract_quantity !== null && contract_quantity !== "")
                            ? parseDecimal(contract_quantity, 4, false)
                            : null;
                    }
                    if (unit !== undefined) {
                        parsedUnit = (unit !== null && String(unit).trim() !== "")
                            ? String(unit).trim().slice(0, 50)
                            : null;
                    }
                    if (contract_unit_price !== undefined) {
                        parsedPrice = (contract_unit_price !== null && contract_unit_price !== "")
                            ? parseDecimal(contract_unit_price, 2, true)
                            : null;
                    }
                } else if (isParent) {
                    // Parents never have direct contract fields
                    parsedQuantity = null;
                    parsedUnit = null;
                    parsedPrice = null;
                }

                const nextTitle = title !== undefined ? title : current.title;
                const nextDesc = description !== undefined ? (description || null) : current.description;
                const nextStatus = status !== undefined ? (status || "todo") : current.status;

                const updateRes = await client.query(`
                    UPDATE work_items
                    SET parent_id = $3,
                        title = $4,
                        description = $5,
                        status = $6,
                        contract_quantity = $7,
                        unit = $8,
                        contract_unit_price = $9,
                        updated_at = CURRENT_TIMESTAMP
                    WHERE project_id = $1 AND id = $2
                    RETURNING *
                `, [projectId, itemId, nextParentId, nextTitle, nextDesc, nextStatus, parsedQuantity, parsedUnit, parsedPrice]);

                const updated = updateRes.rows[0];

                await client.query("COMMIT");
                return {
                    ...updated,
                    is_leaf: !isParent,
                    contract_amount: !isParent
                        ? calculateContractAmount(updated.contract_quantity, updated.contract_unit_price)
                        : null
                };
            } catch (error) {
                await client.query("ROLLBACK");
                throw error;
            } finally {
                release();
            }
        },

        async findParentCycle({ projectId, itemId, parentId }) {
            const { rows } = await pool.query(`
                WITH RECURSIVE descendants AS (
                    SELECT id, parent_id
                    FROM work_items
                    WHERE project_id = $1 AND id = $2

                    UNION ALL

                    SELECT child.id, child.parent_id
                    FROM work_items AS child
                    JOIN descendants ON child.parent_id = descendants.id
                    WHERE child.project_id = $1
                )
                SELECT
                    source.title AS source_title,
                    proposed_parent.title AS parent_title
                FROM work_items AS source
                JOIN work_items AS proposed_parent ON proposed_parent.id = $3
                WHERE source.project_id = $1
                  AND source.id = $2
                  AND EXISTS (
                      SELECT 1 FROM descendants WHERE descendants.id = $3
                  )
            `, [projectId, itemId, parentId]);
            return rows[0] || null;
        },

        async findSubtreeSummary({ projectId, itemId }) {
            const { rows } = await pool.query(`
                WITH RECURSIVE item_tree AS (
                    SELECT id, parent_id, title
                    FROM work_items
                    WHERE project_id = $1 AND id = $2

                    UNION ALL

                    SELECT child.id, child.parent_id, child.title
                    FROM work_items AS child
                    JOIN item_tree ON child.parent_id = item_tree.id
                    WHERE child.project_id = $1
                )
                SELECT
                    MAX(title) FILTER (WHERE id = $2) AS item_title,
                    COUNT(*)::INTEGER AS subtree_count,
                    COUNT(*) FILTER (WHERE id <> $2)::INTEGER AS descendant_count
                FROM item_tree
            `, [projectId, itemId]);
            return rows[0] || null;
        },

        async remove({ projectId, itemId }) {
            const { rowCount } = await pool.query(
                "DELETE FROM work_items WHERE project_id = $1 AND id = $2",
                [projectId, itemId]
            );
            return rowCount > 0;
        }
    };
}

module.exports = { createWorkItemCrudModel };

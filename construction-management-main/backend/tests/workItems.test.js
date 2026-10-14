const { createWorkItemModel } = require("../src/models/workItemModel");

describe("Work item tree query", () => {
    test("loads an item and all descendants with a recursive query", async () => {
        const rows = [
            { id: 10, parent_id: null, depth: 0 },
            { id: 11, parent_id: 10, depth: 1 },
            { id: 12, parent_id: 11, depth: 2 }
        ];
        const pool = { query: jest.fn(async () => ({ rows })) };
        const model = createWorkItemModel(pool);

        await expect(model.findSubtree({ projectId: 3, rootItemId: 10 })).resolves.toEqual(rows);

        const [query, values] = pool.query.mock.calls[0];
        expect(query).toMatch(/WITH RECURSIVE item_tree AS/i);
        expect(query).toMatch(/UNION ALL/i);
        expect(query).toMatch(/ORDER BY path/i);
        expect(values).toEqual([3, 10]);
    });
});

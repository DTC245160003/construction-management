const request = require("supertest");
const express = require("express");
const { calculateContractAmount, rollupWorkItemTree, parseDecimal } = require("../src/utils/contractDecimal");
const { createWorkItemRoutes } = require("../src/routes/workItemRoutes");
const errorHandler = require("../src/middleware/errorHandler");

describe("S-35 Contract Decimal Calculations", () => {
    test("calculates exact contract value from quantity and unit price without floating-point errors", () => {
        // Examples from task S-35 description
        expect(calculateContractAmount("120.50", "1250000")).toBe("150625000.00");
        expect(calculateContractAmount("80.25", "350000")).toBe("28087500.00");
        expect(calculateContractAmount("10.1234", "1000")).toBe("10123.40");
        expect(calculateContractAmount(null, "1000")).toBeNull();
        expect(calculateContractAmount("100", null)).toBeNull();
    });

    test("validates decimal strings and rejects invalid, negative, or zero inputs where appropriate", () => {
        expect(parseDecimal("120.50", 4, false)).toBe("120.50");
        expect(parseDecimal("0", 2, true)).toBe("0");
        expect(() => parseDecimal("0", 4, false)).toThrow("Giá trị phải lớn hơn 0");
        expect(() => parseDecimal("-5", 2, true)).toThrow();
        expect(() => parseDecimal("abc", 2, true)).toThrow();
        expect(() => parseDecimal("12.345", 2, true)).toThrow(); // exceeds 2 decimal places
    });

    test("rolls up contract amounts to parent items without double counting", () => {
        const rawItems = [
            { id: 1, parent_id: null, title: "Dự án tổng", contract_quantity: null, unit: null, contract_unit_price: null },
            { id: 2, parent_id: 1, title: "Khối nhà A", contract_quantity: null, unit: null, contract_unit_price: null },
            { id: 3, parent_id: 2, title: "Đổ bê tông", contract_quantity: "120.50", unit: "m³", contract_unit_price: "1250000" },
            { id: 4, parent_id: 2, title: "Xây tường", contract_quantity: "80.25", unit: "m²", contract_unit_price: "350000" },
            { id: 5, parent_id: 1, title: "Cổng chính", contract_quantity: "1", unit: "bộ", contract_unit_price: "10000000" }
        ];

        const tree = rollupWorkItemTree(rawItems);

        // Leaf 3: 120.50 * 1,250,000 = 150,625,000.00
        const leaf3 = tree.find(i => i.id === 3);
        expect(leaf3.is_leaf).toBe(true);
        expect(leaf3.contract_amount).toBe("150625000.00");

        // Leaf 4: 80.25 * 350,000 = 28,087,500.00
        const leaf4 = tree.find(i => i.id === 4);
        expect(leaf4.is_leaf).toBe(true);
        expect(leaf4.contract_amount).toBe("28087500.00");

        // Parent 2: Sum of leaves 3 & 4 = 150,625,000 + 28,087,500 = 178,712,500.00
        const parent2 = tree.find(i => i.id === 2);
        expect(parent2.is_leaf).toBe(false);
        expect(parent2.contract_quantity).toBeNull();
        expect(parent2.contract_unit_price).toBeNull();
        expect(parent2.contract_amount).toBe("178712500.00");

        // Leaf 5: 1 * 10,000,000 = 10,000,000.00
        const leaf5 = tree.find(i => i.id === 5);
        expect(leaf5.is_leaf).toBe(true);
        expect(leaf5.contract_amount).toBe("10000000.00");

        // Root 1: Sum of leaf 3 + leaf 4 + leaf 5 = 178,712,500 + 10,000,000 = 188,712,500.00
        // (Ensuring no double counting of parent 2)
        const root1 = tree.find(i => i.id === 1);
        expect(root1.is_leaf).toBe(false);
        expect(root1.contract_amount).toBe("188712500.00");
    });
});

describe("S-35 Work Item Contract API", () => {
    function createApp(modelOverrides = {}) {
        const model = {
            findTree: jest.fn(async () => [
                {
                    id: 1,
                    parent_id: null,
                    title: "Hạng mục cha",
                    is_leaf: false,
                    contract_quantity: null,
                    unit: null,
                    contract_unit_price: null,
                    contract_amount: "5000000.00"
                },
                {
                    id: 2,
                    parent_id: 1,
                    title: "Hạng mục lá",
                    is_leaf: true,
                    contract_quantity: "50.0000",
                    unit: "m³",
                    contract_unit_price: "100000.00",
                    contract_amount: "5000000.00"
                }
            ]),
            create: jest.fn(async (values) => ({
                id: 3,
                ...values,
                is_leaf: true,
                contract_amount: calculateContractAmount(values.contract_quantity, values.contract_unit_price)
            })),
            update: jest.fn(async (values) => {
                if (values.itemId === 1 && (values.contract_quantity || values.contract_unit_price)) {
                    throw Object.assign(
                        new Error("Hạng mục cha không được nhập trực tiếp các giá trị hợp đồng; giá trị hợp đồng được tổng hợp từ các hạng mục lá"),
                        { status: 422, expose: true }
                    );
                }
                return {
                    id: values.itemId,
                    ...values,
                    is_leaf: true,
                    contract_amount: calculateContractAmount(values.contract_quantity, values.contract_unit_price)
                };
            }),
            remove: jest.fn(async () => true),
            ...modelOverrides
        };

        const app = express();
        app.use(express.json());
        app.use("/projects", createWorkItemRoutes({
            authorization: {
                requireAuth: (req, res, next) => {
                    req.user = { id: 1 };
                    next();
                }
            },
            memberModel: { findByProjectAndUser: jest.fn(async () => ({ role: "engineer" })) },
            model
        }));
        app.use(errorHandler);
        return { app, model };
    }

    test("GET /projects/:projectId/items returns items with contract fields and rollup", async () => {
        const { app, model } = createApp();
        const res = await request(app).get("/projects/10/items").expect(200);
        expect(res.body.items).toHaveLength(2);
        expect(res.body.items[0].contract_amount).toBe("5000000.00");
        expect(res.body.items[1].contract_quantity).toBe("50.0000");
        expect(model.findTree).toHaveBeenCalledWith(10);
    });

    test("POST /projects/:projectId/items allows leaf item contract declaration", async () => {
        const { app, model } = createApp();
        const payload = {
            title: "Đổ bê tông",
            contract_quantity: "120.50",
            unit: "m³",
            contract_unit_price: "1250000"
        };
        const res = await request(app).post("/projects/10/items").send(payload).expect(201);
        expect(res.body.item.title).toBe("Đổ bê tông");
        expect(model.create).toHaveBeenCalledWith(expect.objectContaining({
            contract_quantity: "120.50",
            unit: "m³",
            contract_unit_price: "1250000"
        }));
    });

    test("PATCH /projects/:projectId/items/:itemId rejects setting contract values on a parent item with 422", async () => {
        const { app } = createApp();
        const res = await request(app)
            .patch("/projects/10/items/1")
            .send({
                title: "Hạng mục cha",
                contract_quantity: "100",
                contract_unit_price: "50000"
            })
            .expect(422);

        expect(res.body.message).toContain("Hạng mục cha không được nhập trực tiếp các giá trị hợp đồng");
    });

    test("POST /projects/:projectId/items validates invalid decimal formats", async () => {
        const { app } = createApp({
            create: jest.fn(() => {
                parseDecimal("-10", 4, false);
            })
        });
        const res = await request(app)
            .post("/projects/10/items")
            .send({
                title: "Hạng mục lá sai định dạng",
                contract_quantity: "-10",
                unit: "m³",
                contract_unit_price: "1000"
            })
            .expect(400);

        expect(res.body.message).toBeDefined();
    });
});

describe("S-35 Multi-level Rollup & Dynamic Child Updates", () => {
    test("supports deep 4-level hierarchy and recalculates parent totals accurately when child data changes", () => {
        // Level 0: Root (1)
        // Level 1: Div A (2), Div B (3)
        // Level 2: Sub A1 (4)
        // Level 3: Leaf A1.1 (5), Leaf A1.2 (6)
        // Level 2: Leaf B1 (7)
        let items = [
            { id: 1, parent_id: null, title: "Dự án gốc" },
            { id: 2, parent_id: 1, title: "Phần thô (Khối A)" },
            { id: 3, parent_id: 1, title: "Phần hoàn thiện (Khối B)" },
            { id: 4, parent_id: 2, title: "Tầng hầm A1" },
            { id: 5, parent_id: 4, title: "Đào đất móng", contract_quantity: "10.5000", unit: "m³", contract_unit_price: "200.00" },
            { id: 6, parent_id: 4, title: "Bê tông móng", contract_quantity: "5.0000", unit: "m³", contract_unit_price: "1000.00" },
            { id: 7, parent_id: 3, title: "Sơn tường ngoài", contract_quantity: "3.2500", unit: "m²", contract_unit_price: "400.00" }
        ];

        // 1st Rollup:
        // Leaf 5 = 10.5000 * 200.00 = 2100.00
        // Leaf 6 = 5.0000 * 1000.00 = 5000.00
        // Sub A1 (4) = 2100.00 + 5000.00 = 7100.00
        // Div A (2) = 7100.00
        // Leaf 7 = 3.2500 * 400.00 = 1300.00
        // Div B (3) = 1300.00
        // Root (1) = 7100.00 + 1300.00 = 8400.00
        let tree = rollupWorkItemTree(items);
        expect(tree.find(i => i.id === 5).contract_amount).toBe("2100.00");
        expect(tree.find(i => i.id === 6).contract_amount).toBe("5000.00");
        expect(tree.find(i => i.id === 4).contract_amount).toBe("7100.00");
        expect(tree.find(i => i.id === 2).contract_amount).toBe("7100.00");
        expect(tree.find(i => i.id === 7).contract_amount).toBe("1300.00");
        expect(tree.find(i => i.id === 3).contract_amount).toBe("1300.00");
        expect(tree.find(i => i.id === 1).contract_amount).toBe("8400.00");

        // Dynamic change 1: Leaf 5 unit price increases from 200.00 to 300.00
        // New Leaf 5 = 10.5000 * 300.00 = 3150.00
        // New Sub A1 = 3150.00 + 5000.00 = 8150.00
        // New Div A = 8150.00
        // New Root = 8150.00 + 1300.00 = 9450.00
        items = items.map(item => item.id === 5 ? { ...item, contract_unit_price: "300.00" } : item);
        tree = rollupWorkItemTree(items);
        expect(tree.find(i => i.id === 5).contract_amount).toBe("3150.00");
        expect(tree.find(i => i.id === 4).contract_amount).toBe("8150.00");
        expect(tree.find(i => i.id === 2).contract_amount).toBe("8150.00");
        expect(tree.find(i => i.id === 1).contract_amount).toBe("9450.00");

        // Dynamic change 2: Add a new child leaf under Div B (3)
        // Leaf 8: 2.0000 * 500.00 = 1000.00
        // New Div B = 1300.00 + 1000.00 = 2300.00
        // New Root = 8150.00 + 2300.00 = 10450.00
        items.push({ id: 8, parent_id: 3, title: "Lát sàn", contract_quantity: "2.0000", unit: "m²", contract_unit_price: "500.00" });
        tree = rollupWorkItemTree(items);
        expect(tree.find(i => i.id === 8).contract_amount).toBe("1000.00");
        expect(tree.find(i => i.id === 3).contract_amount).toBe("2300.00");
        expect(tree.find(i => i.id === 1).contract_amount).toBe("10450.00");
    });

    test("handles edge cases: nodes with missing prices, zero quantities, and empty branches", () => {
        const items = [
            { id: 1, parent_id: null, title: "Cha" },
            { id: 2, parent_id: 1, title: "Con 1 chưa có hợp đồng" },
            { id: 3, parent_id: 1, title: "Con 2 có giá nhưng chưa có khối lượng", contract_unit_price: "50000" },
            { id: 4, parent_id: 1, title: "Con 3 có đủ", contract_quantity: "10.0000", contract_unit_price: "100.00" }
        ];
        const tree = rollupWorkItemTree(items);
        expect(tree.find(i => i.id === 2).contract_amount).toBeNull();
        expect(tree.find(i => i.id === 3).contract_amount).toBeNull();
        expect(tree.find(i => i.id === 4).contract_amount).toBe("1000.00");
        expect(tree.find(i => i.id === 1).contract_amount).toBe("1000.00");
    });
});


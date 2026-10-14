const request = require("supertest");
const express = require("express");
const { calculatePeriodQty, createAcceptanceSheetService } = require("../src/services/acceptanceSheetService");
const { createAcceptanceSheetController } = require("../src/controllers/acceptanceSheetController");
const errorHandler = require("../src/middleware/errorHandler");

describe("S-36 Acceptance Sheet Core Calculations", () => {
    test("calculates period_qty when no previous approved sheet exists (previous = 0)", () => {
        // Case chưa có đợt trước: previous_approved_cumulative = 0
        const currentCumulative = "45.5000";
        const previousApproved = "0.0000";
        const periodQty = calculatePeriodQty(currentCumulative, previousApproved);
        expect(periodQty).toBe("45.5000");
    });

    test("calculates period_qty correctly when a previous approved sheet exists", () => {
        // Case đã có đợt trước: previous = 30.25, current = 85.75 -> period = 55.50
        const currentCumulative = "85.7500";
        const previousApproved = "30.2500";
        const periodQty = calculatePeriodQty(currentCumulative, previousApproved);
        expect(periodQty).toBe("55.5000");
    });

    test("handles edge decimal values without precision artifacts", () => {
        expect(calculatePeriodQty("10.1234", "0")).toBe("10.1234");
        expect(calculatePeriodQty("100.0000", "99.9999")).toBe("0.0001");
        expect(calculatePeriodQty("50.0000", "50.0000")).toBe("0.0000");
    });
});

describe("S-36 Acceptance Sheet API & Service Logic", () => {
    function createApp(mockModelOverrides = {}) {
        const mockModel = {
            getPreviousApprovedCumulative: jest.fn(async (projectId, workItemId) => {
                if (workItemId === 101) return "20.5000";
                return "0";
            }),
            listSheets: jest.fn(async (projectId) => [
                { id: 1, project_id: projectId, period_number: "Đợt 1", sheet_date: "2026-10-14", status: "APPROVED", items: [] }
            ]),
            getSheetById: jest.fn(async (id) => ({
                id,
                project_id: 1,
                period_number: "Đợt 1",
                sheet_date: "2026-10-14",
                status: "APPROVED",
                items: [
                    { id: 10, work_item_id: 101, item_name: "Đào đất móng", current_cumulative: "20.5000", previous_approved_cumulative: "0.0000", period_qty: "20.5000" }
                ]
            })),
            getSheetInputData: jest.fn(async (projectId) => [
                { work_item_id: 101, item_name: "Đào đất móng", unit: "m³", contract_quantity: "100.0000", reported_quantity: "25.0000", previous_approved_cumulative: "0.0000" },
                { work_item_id: 102, item_name: "Bê tông lót", unit: "m³", contract_quantity: "50.0000", reported_quantity: "15.0000", previous_approved_cumulative: "0.0000" }
            ]),
            createSheet: jest.fn(async (client, payload) => ({
                id: 99,
                project_id: payload.projectId,
                period_number: payload.periodNumber,
                sheet_date: payload.sheetDate,
                status: payload.status,
                items: payload.items
            })),
            ...mockModelOverrides
        };

        const service = createAcceptanceSheetService({ model: mockModel });
        const controller = createAcceptanceSheetController({ service });
        const app = express();
        app.use(express.json());
        app.get("/api/acceptance-sheets/prepare", controller.prepare);
        app.get("/api/acceptance-sheets", controller.list);
        app.get("/api/acceptance-sheets/:id", controller.detail);
        app.post("/api/acceptance-sheets", controller.create);
        app.use(errorHandler);
        return { app, mockModel };
    }

    test("GET /api/acceptance-sheets returns list of sheets", async () => {
        const { app } = createApp();
        const res = await request(app).get("/api/acceptance-sheets?projectId=1").expect(200);
        expect(res.body.sheets).toHaveLength(1);
        expect(res.body.sheets[0].period_number).toBe("Đợt 1");
    });

    test("GET /api/acceptance-sheets/prepare returns item contracts and team reported quantities (S-26/S-35)", async () => {
        const { app } = createApp();
        const res = await request(app).get("/api/acceptance-sheets/prepare?projectId=1").expect(200);
        expect(res.body.items).toHaveLength(2);
        expect(res.body.items[0].reported_quantity).toBe("25.0000"); // Từ S-26
        expect(res.body.items[0].contract_quantity).toBe("100.0000"); // Từ S-35
    });

    test("POST /api/acceptance-sheets creates sheet and automatically calculates period_qty from previous approved or 0", async () => {
        const { app, mockModel } = createApp();

        const payload = {
            project_id: 1,
            period_number: "Đợt 2",
            sheet_date: "2026-10-15",
            notes: "Nghiệm thu giai đoạn móng",
            items: [
                {
                    work_item_id: 101, // Có đợt duyệt trước là 20.5000
                    current_cumulative: "50.0000",
                    site_photos: ["https://example.com/photo1.jpg"]
                },
                {
                    work_item_id: 102, // Chưa có đợt duyệt trước -> previous_approved = 0
                    current_cumulative: "12.5000",
                    site_photos: []
                }
            ]
        };

        const res = await request(app)
            .post("/api/acceptance-sheets")
            .send(payload)
            .expect(201);

        expect(mockModel.createSheet).toHaveBeenCalledTimes(1);
        const savedData = res.body.sheet;
        expect(savedData.period_number).toBe("Đợt 2");

        // Item 101: 50.0000 - 20.5000 = 29.5000
        expect(savedData.items[0].work_item_id).toBe(101);
        expect(savedData.items[0].previous_approved_cumulative).toBe("20.5000");
        expect(savedData.items[0].period_qty).toBe("29.5000");
        expect(savedData.items[0].site_photos).toEqual(["https://example.com/photo1.jpg"]);

        // Item 102: 12.5000 - 0 = 12.5000
        expect(savedData.items[1].work_item_id).toBe(102);
        expect(savedData.items[1].previous_approved_cumulative).toBe("0");
        expect(savedData.items[1].period_qty).toBe("12.5000");
    });

    test("POST /api/acceptance-sheets validates required fields", async () => {
        const { app } = createApp();
        await request(app)
            .post("/api/acceptance-sheets")
            .send({ project_id: 1, items: [] })
            .expect(400);

        await request(app)
            .post("/api/acceptance-sheets")
            .send({ project_id: 1, period_number: "Đợt 1", items: [{ work_item_id: 101, current_cumulative: "invalid" }] })
            .expect(400);
    });
});

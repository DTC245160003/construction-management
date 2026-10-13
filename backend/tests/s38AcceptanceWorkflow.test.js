const request = require("supertest");
const express = require("express");
const { createSiteManagementService } = require("../src/services/siteManagementService");
const { createSiteManagementController } = require("../src/controllers/siteManagementController");
const errorHandler = require("../src/middleware/errorHandler");

describe("S-38 Acceptance Note Approval and Return Workflow", () => {
    function setupEnvironment(customData = {}) {
        const state = {
            workItems: [
                { id: 10, project_id: 1, title: "Hạng mục gốc", parent_id: null },
                { id: 20, project_id: 1, title: "Bê tông dầm sàn", parent_id: 10 }
            ],
            contracts: {
                20: {
                    work_item_id: 20,
                    project_id: 1,
                    quantity: "100.0000",
                    unit: "m³",
                    unit_price: "250000.00",
                    revision: 1
                }
            },
            acceptances: {
                101: {
                    id: 101,
                    project_id: 1,
                    work_item_id: 20,
                    period: "Đợt 1",
                    day: "2026-10-15",
                    cumulative: "20.0000",
                    previous_cumulative: "0.0000",
                    quantity: "20.0000",
                    unit: "m³",
                    unit_price: "250000.00",
                    notes: "Nghiệm thu đợt 1",
                    status: "submitted",
                    created_by: 2, // engineer
                    approved_by: null,
                    approved_at: null,
                    return_reason: null,
                    revision: 1
                }
            },
            photos: {},
            acceptancePhotos: {},
            auditLogs: [],
            notifications: [],
            ...customData
        };

        const model = {
            acceptances: async (pId) => Object.values(state.acceptances),
            contracts: async (pId) => Object.values(state.contracts).map(c => {
                const approvedForms = Object.values(state.acceptances).filter(a => a.work_item_id === c.work_item_id && a.status === "approved");
                const approvedQty = approvedForms.reduce((sum, a) => sum + Number(a.quantity), 0);
                return { ...c, item_name: "Bê tông dầm sàn", approved_quantity: approvedQty.toFixed(4), reported_quantity: "0.0000" };
            }),
            items: async (pId) => state.workItems.map(w => ({
                ...w,
                is_leaf: !state.workItems.some(c => c.parent_id === w.id)
            })),
            transaction: async (projectId, callback) => {
                const t = {
                    item: async (pId, itemId) => {
                        const found = state.workItems.find(w => w.id === itemId);
                        if (!found) return null;
                        return {
                            ...found,
                            is_leaf: !state.workItems.some(c => c.parent_id === found.id)
                        };
                    },
                    items: async (pId) => state.workItems.map(w => ({
                        ...w,
                        is_leaf: !state.workItems.some(c => c.parent_id === w.id)
                    })),
                    contract: async (pId, itemId) => {
                        const c = state.contracts[itemId];
                        if (!c) return null;
                        const approvedForms = Object.values(state.acceptances).filter(a => a.work_item_id === itemId && a.status === "approved");
                        const approvedQty = approvedForms.reduce((sum, a) => sum + Number(a.quantity), 0);
                        return { ...c, approved_quantity: approvedQty.toFixed(4) };
                    },
                    contracts: async (pId) => Object.values(state.contracts).map(c => {
                        const approvedForms = Object.values(state.acceptances).filter(a => a.work_item_id === c.work_item_id && a.status === "approved");
                        const approvedQty = approvedForms.reduce((sum, a) => sum + Number(a.quantity), 0);
                        return { ...c, item_name: "Bê tông dầm sàn", approved_quantity: approvedQty.toFixed(4), reported_quantity: "0.0000" };
                    }),
                    saveContract: async (pId, itemId, values) => {
                        state.contracts[itemId] = { work_item_id: itemId, project_id: pId, ...values, revision: (state.contracts[itemId]?.revision || 0) + 1 };
                        return state.contracts[itemId];
                    },
                    acceptance: async (pId, id) => state.acceptances[id] ? { ...state.acceptances[id] } : null,
                    acceptances: async (pId) => Object.values(state.acceptances),
                    saveAcceptance: async (pId, userId, id, data) => {
                        if (id) {
                            const prev = state.acceptances[id];
                            state.acceptances[id] = {
                                ...prev,
                                period: data.period,
                                day: data.day,
                                cumulative: data.cumulative,
                                previous_cumulative: data.previous_cumulative,
                                quantity: (Number(data.cumulative) - Number(data.previous_cumulative)).toFixed(4),
                                notes: data.notes,
                                unit: data.unit,
                                unit_price: data.unit_price,
                                status: "draft",
                                return_reason: null,
                                revision: prev.revision + 1
                            };
                            return state.acceptances[id];
                        } else {
                            const newId = Math.max(0, ...Object.keys(state.acceptances).map(Number)) + 1;
                            const created = {
                                id: newId,
                                project_id: pId,
                                work_item_id: data.work_item_id,
                                created_by: userId,
                                period: data.period,
                                day: data.day,
                                cumulative: data.cumulative,
                                previous_cumulative: data.previous_cumulative,
                                quantity: (Number(data.cumulative) - Number(data.previous_cumulative)).toFixed(4),
                                unit: data.unit,
                                unit_price: data.unit_price,
                                notes: data.notes,
                                status: "draft",
                                approved_by: null,
                                approved_at: null,
                                return_reason: null,
                                revision: 1
                            };
                            state.acceptances[newId] = created;
                            return created;
                        }
                    },
                    linkAcceptancePhotos: async (id, photoIds) => {
                        state.acceptancePhotos[id] = photoIds;
                    },
                    photoIds: async (pId, ids) => (ids || []).map(id => state.photos[id] || { id, uploaded_by: 2, work_item_id: 20 }),
                    photo: async (pId, photoId) => state.photos[photoId] || null,
                    transitionAcceptance: async (pId, id, actorId, status, reason) => {
                        const acc = state.acceptances[id];
                        acc.status = status;
                        acc.return_reason = reason;
                        acc.revision += 1;
                        if (status === "approved") {
                            acc.approved_by = actorId;
                            acc.approved_at = new Date().toISOString();
                        } else {
                            acc.approved_by = null;
                            acc.approved_at = null;
                        }
                        return { ...acc };
                    },
                    audit: async (pId, userId, module, action, targetId, prev, current) => {
                        state.auditLogs.push({ pId, userId, module, action, targetId, prev, current });
                    },
                    notify: async (pId, userId, type, message, link, eventKey) => {
                        state.notifications.push({ pId, userId, type, message, link, eventKey });
                    }
                };
                return callback(t);
            }
        };

        const service = createSiteManagementService({ model });
        const controller = createSiteManagementController({ service });

        function createApp(currentUser) {
            const app = express();
            app.use(express.json());
            app.use((req, res, next) => {
                req.user = currentUser;
                req.projectMember = { role: currentUser.role };
                req.params.projectId = "1";
                next();
            });

            // Mock project routes
            app.get("/projects/:projectId/acceptance", controller.acceptance);
            app.post("/projects/:projectId/acceptance", controller.saveAcceptance);
            app.put("/projects/:projectId/acceptance/:recordId", controller.saveAcceptance);
            app.post("/projects/:projectId/acceptance/:recordId/transition", controller.transitionAcceptance);
            app.use(errorHandler);
            return app;
        }

        return { state, model, service, controller, createApp };
    }

    const bqlUser = { id: 1, role: "project_manager" }; // Ban quản lý dự án
    const adminUser = { id: 9, role: "admin" };          // Admin (thuộc BQL)
    const engineerUser = { id: 2, role: "engineer" };    // Kỹ sư lập phiếu
    const workerUser = { id: 3, role: "worker" };        // Công nhân (không có quyền)

    describe("AC 1: Phiếu chỉ tính vào luỹ kế sau khi được duyệt", () => {
        test("khối lượng chưa được tính vào luỹ kế đã duyệt khi phiếu ở trạng thái submitted", async () => {
            const { service, state } = setupEnvironment();
            const dataBefore = await service.acceptanceData(1, bqlUser);
            const contract = dataBefore.contracts.find(c => c.work_item_id === 20);
            expect(contract.approved_quantity).toBe("0.0000");
            expect(state.acceptances[101].status).toBe("submitted");
        });

        test("Ban quản lý duyệt phiếu thành công thì luỹ kế đã duyệt mới được cập nhật", async () => {
            const { createApp, service, state } = setupEnvironment();
            const app = createApp(bqlUser);

            const res = await request(app)
                .post("/projects/1/acceptance/101/transition")
                .send({ action: "approve", revision: 1 })
                .expect(200);

            expect(res.body.form.status).toBe("approved");
            expect(res.body.form.approved_by).toBe(bqlUser.id);
            expect(res.body.form.approved_at).toBeDefined();

            // Luỹ kế đã duyệt hiện đã tăng lên 20.0000
            const dataAfter = await service.acceptanceData(1, bqlUser);
            const contract = dataAfter.contracts.find(c => c.work_item_id === 20);
            expect(contract.approved_quantity).toBe("20.0000");
        });

        test("chặn duyệt phiếu nếu luỹ kế trước đó không khớp với luỹ kế thực tế đã duyệt (chống conflict)", async () => {
            const { createApp, state } = setupEnvironment();
            // Giả lập hợp đồng đã có một đợt duyệt khác (5.0000) làm previous_cumulative (0.0000) của phiếu 101 bị lỗi thời
            state.acceptances[99] = {
                id: 99,
                project_id: 1,
                work_item_id: 20,
                quantity: "5.0000",
                status: "approved"
            };

            const app = createApp(bqlUser);
            const res = await request(app)
                .post("/projects/1/acceptance/101/transition")
                .send({ action: "approve", revision: 1 })
                .expect(409);

            expect(res.body.message).toContain("Lũy kế đã thay đổi. Trả lại phiếu để cập nhật trước khi duyệt.");
        });
    });

    describe("AC 2: Trả lại bắt buộc nhập lý do và phiếu quay về cho người lập sửa", () => {
        test("trả lại mà không có lý do hoặc lý do rỗng thì bị từ chối 400", async () => {
            const { createApp } = setupEnvironment();
            const app = createApp(bqlUser);

            const resNoReason = await request(app)
                .post("/projects/1/acceptance/101/transition")
                .send({ action: "return", revision: 1 })
                .expect(400);

            expect(resNoReason.body.message).toContain("Lý do trả lại");

            const resEmptyReason = await request(app)
                .post("/projects/1/acceptance/101/transition")
                .send({ action: "return", reason: "   ", revision: 1 })
                .expect(400);

            expect(resEmptyReason.body.message).toContain("Lý do trả lại");
        });

        test("vai trò không thuộc ban quản lý (worker, engineer) không được phép duyệt hoặc trả lại (403)", async () => {
            const { createApp } = setupEnvironment();
            const workerApp = createApp(workerUser);

            await request(workerApp)
                .post("/projects/1/acceptance/101/transition")
                .send({ action: "return", reason: "Không đồng ý", revision: 1 })
                .expect(403);

            const engineerApp = createApp(engineerUser);
            await request(engineerApp)
                .post("/projects/1/acceptance/101/transition")
                .send({ action: "approve", revision: 1 })
                .expect(403);
        });

        test("Ban quản lý trả lại kèm lý do thành công: lưu return_reason và gửi thông báo", async () => {
            const { createApp, state } = setupEnvironment();
            const app = createApp(bqlUser);

            const res = await request(app)
                .post("/projects/1/acceptance/101/transition")
                .send({ action: "return", reason: "Thiếu ảnh chụp đo đạc cao độ dầm sàn", revision: 1 })
                .expect(200);

            expect(res.body.form.status).toBe("returned");
            expect(res.body.form.return_reason).toBe("Thiếu ảnh chụp đo đạc cao độ dầm sàn");

            // Kiểm tra thông báo được gửi cho người lập phiếu (engineer id = 2)
            const notif = state.notifications.find(n => n.userId === 2 && n.type === "acceptance_returned");
            expect(notif).toBeDefined();
            expect(notif.message).toContain("Phiếu của bạn đã được trả lại. Xem lý do và cập nhật hồ sơ.");

            // Kiểm tra audit log
            const audit = state.auditLogs.find(a => a.action === "return" && a.module === "acceptance");
            expect(audit).toBeDefined();
        });

        test("phiếu bị trả lại quay về cho người lập sửa và khi lưu trạng thái chuyển về draft để trình duyệt lại", async () => {
            const { createApp, state } = setupEnvironment();
            // Đặt trạng thái phiếu 101 là 'returned'
            state.acceptances[101].status = "returned";
            state.acceptances[101].return_reason = "Thiếu ảnh chụp";
            state.acceptances[101].revision = 2;

            const app = createApp(engineerUser);

            // Người lập sửa phiếu
            const updateRes = await request(app)
                .put("/projects/1/acceptance/101")
                .send({
                    work_item_id: 20,
                    period: "Đợt 1 (đã bổ sung)",
                    day: "2026-10-15",
                    cumulative: "22.0000",
                    notes: "Đã bổ sung đầy đủ hồ sơ theo yêu cầu",
                    photo_ids: [],
                    revision: 2
                })
                .expect(200);

            // Phiếu quay về trạng thái 'draft', return_reason bị xóa, revision tăng
            expect(updateRes.body.form.status).toBe("draft");
            expect(updateRes.body.form.return_reason).toBeNull();
            expect(updateRes.body.form.period).toBe("Đợt 1 (đã bổ sung)");
            expect(updateRes.body.form.cumulative).toBe("22.0000");

            // Người lập có thể trình duyệt lại
            const submitRes = await request(app)
                .post("/projects/1/acceptance/101/transition")
                .send({ action: "submit", revision: 3 })
                .expect(200);

            expect(submitRes.body.form.status).toBe("submitted");
        });
    });

    describe("AC 3: Phiếu đã duyệt không sửa được, muốn sửa phải lập phiếu điều chỉnh", () => {
        test("chặn không cho chỉnh sửa trực tiếp phiếu đã duyệt (409)", async () => {
            const { createApp, state } = setupEnvironment();
            state.acceptances[101].status = "approved";
            state.acceptances[101].approved_by = 1;
            state.acceptances[101].approved_at = "2026-10-15T08:00:00Z";
            state.acceptances[101].revision = 2;

            const app = createApp(engineerUser);

            const res = await request(app)
                .put("/projects/1/acceptance/101")
                .send({
                    work_item_id: 20,
                    period: "Cố tình sửa phiếu đã duyệt",
                    day: "2026-10-15",
                    cumulative: "25.0000",
                    notes: "Chỉnh sửa",
                    photo_ids: [],
                    revision: 2
                })
                .expect(409);

            expect(res.body.message).toContain("Chỉ sửa phiếu nháp hoặc đã trả lại");
        });

        test("muốn thay đổi khối lượng thì lập phiếu điều chỉnh mới kế thừa luỹ kế đã duyệt", async () => {
            const { createApp, state } = setupEnvironment();
            // Phiếu 101 đã duyệt với khối lượng 20.0000
            state.acceptances[101].status = "approved";
            state.acceptances[101].approved_by = 1;
            state.acceptances[101].approved_at = "2026-10-15T08:00:00Z";

            const app = createApp(engineerUser);

            // Lập phiếu điều chỉnh mới cho hạng mục 20 với luỹ kế tăng lên 35.0000
            const res = await request(app)
                .post("/projects/1/acceptance")
                .send({
                    work_item_id: 20,
                    period: "Điều chỉnh - Đợt 1",
                    day: "2026-10-16",
                    cumulative: "35.0000",
                    notes: "Phiếu điều chỉnh cho phiếu #101",
                    photo_ids: []
                })
                .expect(201);

            const newForm = res.body.form;
            expect(newForm.id).toBe(102);
            expect(newForm.status).toBe("draft");
            expect(newForm.previous_cumulative).toBe("20.0000"); // Kế thừa chính xác luỹ kế đã duyệt trước đó
            expect(newForm.quantity).toBe("15.0000");            // Khối lượng phát sinh thêm đợt này
            expect(newForm.cumulative).toBe("35.0000");
        });

        test("phiếu điều chỉnh không được có luỹ kế nhỏ hơn hoặc bằng phần đã duyệt", async () => {
            const { createApp, state } = setupEnvironment();
            state.acceptances[101].status = "approved";

            const app = createApp(engineerUser);

            // Nhập lũy kế 20.0000 (bằng phần đã duyệt) -> Bị chặn
            await request(app)
                .post("/projects/1/acceptance")
                .send({
                    work_item_id: 20,
                    period: "Điều chỉnh không hợp lệ",
                    day: "2026-10-16",
                    cumulative: "20.0000",
                    notes: "Lũy kế không tăng",
                    photo_ids: []
                })
                .expect(422);

            // Nhập lũy kế vượt hợp đồng (> 100.0000) -> Bị chặn
            await request(app)
                .post("/projects/1/acceptance")
                .send({
                    work_item_id: 20,
                    period: "Vượt hợp đồng",
                    day: "2026-10-16",
                    cumulative: "105.0000",
                    notes: "Vượt 100",
                    photo_ids: []
                })
                .expect(422);
        });
    });
});

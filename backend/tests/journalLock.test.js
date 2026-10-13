const request = require("supertest");
const { createSiteManagementService } = require("../src/services/siteManagementService");
const { createSiteManagementController } = require("../src/controllers/siteManagementController");
const express = require("express");
const { randomUUID } = require("node:crypto");

describe("Journal Locking (TTKN-93 [S-24]) API Tests", () => {
    let app, service, model;

    beforeEach(() => {
        model = {
            transaction: jest.fn(async (projectId, callback) => callback(model)),
            journal: jest.fn(),
            journalWrite: jest.fn(),
            dayLock: jest.fn(),
            setDayLock: jest.fn(),
            lockJournalRecord: jest.fn(),
            audit: jest.fn(),
            journals: jest.fn(),
            item: jest.fn(async () => ({ id: 1, is_leaf: true })),
            photoIds: jest.fn(async () => []),
            updateJournal: jest.fn(),
            deleteJournal: jest.fn()
        };

        service = createSiteManagementService({ model });
        const controller = createSiteManagementController({ service, pdfService: jest.fn() });

        app = express();
        app.use(express.json());
        app.use((req, res, next) => {
            req.user = { id: 10 };
            req.projectMember = { role: "admin" };
            next();
        });

        app.post("/projects/:projectId/journals/lock", controller.lockJournal);
        app.post("/api/v1/projects/:projectId/journals/lock", controller.lockJournal);
        app.post("/projects/:projectId/journals/:recordId/lock", controller.lockJournal);
        app.put("/projects/:projectId/journals/:recordId", controller.saveJournal);
        app.patch("/projects/:projectId/journals/:recordId", controller.saveJournal);
        app.delete("/projects/:projectId/journals/:recordId", controller.deleteJournal);

        // eslint-disable-next-line no-unused-vars
        app.use((err, req, res, next) => {
            res.status(err.status || 500).json({ message: err.message });
        });
    });

    test("Lock journal via POST /projects/:projectId/journals/lock succeeds and returns lock fields", async () => {
        model.dayLock.mockResolvedValue(null);
        model.setDayLock.mockResolvedValue({
            project_id: 1,
            day: "2026-10-10",
            locked: true,
            changed_by: 10,
            updated_at: "2026-10-08T10:00:00.000Z"
        });

        const res = await request(app)
            .post("/projects/1/journals/lock")
            .send({ day: "2026-10-10", is_locked: true })
            .expect(200);

        expect(res.body.lock).toBeDefined();
        expect(res.body.lock.is_locked).toBe(true);
        expect(res.body.lock.locked_at).toBeDefined();
        expect(res.body.lock.locked_by).toBe(10);
    });

    test("Lock journal via POST /api/v1/projects/:projectId/journals/lock succeeds", async () => {
        model.dayLock.mockResolvedValue(null);
        model.setDayLock.mockResolvedValue({
            project_id: 1,
            day: "2026-10-10",
            locked: true,
            changed_by: 10,
            updated_at: "2026-10-08T10:00:00.000Z"
        });

        const res = await request(app)
            .post("/api/v1/projects/1/journals/lock")
            .send({ day: "2026-10-10", is_locked: true })
            .expect(200);

        expect(res.body.lock.is_locked).toBe(true);
    });

    test("Updating locked journal via PUT returns 403 Forbidden with exact message", async () => {
        model.journal.mockResolvedValue({
            id: 5,
            project_id: 1,
            day: "2026-10-10",
            author_id: 10,
            is_locked: true,
            revision: 1
        });
        model.dayLock.mockResolvedValue({ locked: true });

        const res = await request(app)
            .put("/projects/1/journals/5")
            .send({
                work_item_id: 1,
                day: "2026-10-10",
                time: "08:00",
                content: "Attempt update",
                manpower: 5,
                equipment: "",
                weather: "Nắng",
                revision: 1,
                photo_ids: []
            })
            .expect(403);

        expect(res.body.message).toBe("Nhật ký ngày đã bị khóa sổ, không thể chỉnh sửa hoặc xóa.");
    });

    test("Updating locked journal via PATCH returns 403 Forbidden with exact message", async () => {
        model.journal.mockResolvedValue({
            id: 5,
            project_id: 1,
            day: "2026-10-10",
            author_id: 10,
            is_locked: true,
            revision: 1
        });
        model.dayLock.mockResolvedValue({ locked: true });

        const res = await request(app)
            .patch("/projects/1/journals/5")
            .send({
                work_item_id: 1,
                day: "2026-10-10",
                time: "08:00",
                content: "Attempt patch update",
                manpower: 5,
                equipment: "",
                weather: "Nắng",
                revision: 1,
                photo_ids: []
            })
            .expect(403);

        expect(res.body.message).toBe("Nhật ký ngày đã bị khóa sổ, không thể chỉnh sửa hoặc xóa.");
    });

    test("Deleting locked journal via DELETE returns 403 Forbidden with exact message", async () => {
        model.journal.mockResolvedValue({
            id: 5,
            project_id: 1,
            day: "2026-10-10",
            author_id: 10,
            is_locked: true,
            revision: 1
        });
        model.dayLock.mockResolvedValue({ locked: true });

        const res = await request(app)
            .delete("/projects/1/journals/5")
            .send({ revision: 1 })
            .expect(403);

        expect(res.body.message).toBe("Nhật ký ngày đã bị khóa sổ, không thể chỉnh sửa hoặc xóa.");
    });

    test("record lock endpoints derive the original day and return both lock aliases", async () => {
        model.journal.mockResolvedValue({ id: 5, day: "2020-10-10", author_id: 10 });
        model.lockJournalRecord.mockResolvedValue({ id: 5, day: "2020-10-10", is_locked: true, locked_at: "2020-10-11T00:00:00Z", locked_by: 10 });
        const res = await request(app).post("/projects/1/journals/5/lock").send({ is_locked: true }).expect(200);
        expect(res.body.lock).toMatchObject({ is_locked: true, locked: true, locked_by: 10 });
        expect(model.lockJournalRecord).toHaveBeenCalledWith(1, 5, 10, true);
        expect(model.setDayLock).not.toHaveBeenCalled();
        expect(model.audit).toHaveBeenCalledWith(1, 10, "journal", "lock_record", 5, expect.any(Object), expect.any(Object));
    });

    test.each(["engineer", "manager", "project_manager", "viewer"])("%s cannot unlock a day or record", async (role) => {
        await expect(service.lockJournal(1, { id: 10, role }, { day: "2020-10-10", locked: false, reason: "Bổ sung" })).rejects.toMatchObject({ status: 403 });
        await expect(service.lockJournal(1, { id: 10, role }, { recordId: 5, is_locked: false, reason: "Bổ sung" })).rejects.toMatchObject({ status: 403 });
        expect(model.transaction).not.toHaveBeenCalled();
    });

    test("admin unlock requires a reason and clears active lock metadata", async () => {
        await request(app).post("/projects/1/journals/lock").send({ day: "2020-10-10", is_locked: false, reason: "" }).expect(400);
        model.setDayLock.mockResolvedValue({ day: "2020-10-10", locked: false, updated_at: "2020-10-11T00:00:00Z", changed_by: 10 });
        const res = await request(app).post("/projects/1/journals/lock").send({ day: "2020-10-10", is_locked: false, reason: "Bổ sung hồ sơ" }).expect(200);
        expect(res.body.lock).toMatchObject({ locked: false, is_locked: false, locked_at: null, locked_by: null });
        expect(model.audit).toHaveBeenCalledWith(1, 10, "journal", "unlock_day", "2020-10-10", undefined, expect.any(Object));
    });

    test.each([{ locked: "false" }, { is_locked: null }, { locked: true, is_locked: false }])("invalid lock aliases are rejected: %j", async (values) => {
        await request(app).post("/projects/1/journals/lock").send({ day: "2020-10-10", ...values }).expect(400);
        expect(model.setDayLock).not.toHaveBeenCalled();
    });

    test("locking today or a future record is rejected without changing either lock", async () => {
        const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
        await request(app).post("/projects/1/journals/lock").send({ day: today, locked: true }).expect(400);
        model.journal.mockResolvedValue({ id: 5, day: "9999-12-31" });
        await request(app).post("/projects/1/journals/5/lock").send({ locked: true }).expect(400);
        expect(model.setDayLock).not.toHaveBeenCalled();
        expect(model.lockJournalRecord).not.toHaveBeenCalled();
    });

    test("a record cannot lock an unrelated day", async () => {
        model.journal.mockResolvedValue({ id: 5, day: "2020-10-10" });
        await request(app).post("/projects/1/journals/5/lock").send({ day: "2020-10-09", is_locked: true }).expect(400);
        expect(model.setDayLock).not.toHaveBeenCalled();
        expect(model.lockJournalRecord).not.toHaveBeenCalled();
    });

    test("a record lock blocks moving the journal to an unlocked day", async () => {
        model.dayLock.mockResolvedValue(null);
        model.journal.mockResolvedValue({ id: 5, day: "2020-10-10", author_id: 10, is_locked: true, revision: 1 });
        await request(app).patch("/projects/1/journals/5").send({ work_item_id: 1, day: "2020-10-11", time: "08:00", content: "Move", revision: 1, photo_ids: [] }).expect(403);
        expect(model.updateJournal).not.toHaveBeenCalled();
    });

    test("record locks protect shared daily headers and unresolved conflict choices", async () => {
        model.daily = jest.fn(async () => ({ revision: 1, is_locked: true }));
        await expect(service.saveDaily(1, { id: 10, role: "admin" }, { day: "2020-10-10", revision: 1 })).rejects.toMatchObject({ status: 403 });
        model.conflict = jest.fn(async () => ({ id: 3, journal_id: 5 }));
        model.journal.mockResolvedValue({ id: 5, day: "2020-10-10", is_locked: true, revision: 1 });
        await expect(service.resolve(1, { id: 10, role: "engineer" }, 3, { chosen: "server", revision: 1 })).rejects.toMatchObject({ status: 403 });
        expect(model.updateJournal).not.toHaveBeenCalled();
    });

    test("accepted operation replay after locking returns its saved result without another write", async () => {
        const operation_uuid = randomUUID();
        const body = { operation_uuid, work_item_id: 1, day: "2020-10-10", time: "08:00", content: "Saved", revision: 1, photo_ids: [] };
        const v = require("../src/services/siteValidation");
        const j = { work_item_id: 1, day: body.day, time: body.time, content: body.content, photo_ids: [] };
        const input_hash = v.hash({ id: 5, j, revision: 1, pending_photos: [] });
        model.journalWrite.mockResolvedValue({ project_id: 1, actor_id: 10, input_hash, result: { journal: { id: 5, revision: 2 }, replayed: false } });
        model.dayLock.mockResolvedValue({ locked: true });
        const res = await request(app).patch("/projects/1/journals/5").send(body).expect(200);
        expect(res.body).toMatchObject({ replayed: true, journal: { id: 5, revision: 2 } });
        expect(model.dayLock).not.toHaveBeenCalled();
        expect(model.updateJournal).not.toHaveBeenCalled();
    });
});

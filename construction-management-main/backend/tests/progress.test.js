const request = require("supertest");
const express = require("express");
const { createTaskRoutes } = require("../src/routes/taskRoutes");
const errorHandler = require("../src/middleware/errorHandler");

function createApp(model, role = "member") {
    const app = express();
    app.use(express.json());
    app.use("/projects", createTaskRoutes({
        authorization: { requireAuth: (req, res, next) => {
            req.user = { id: 1 };
            next();
        } },
        memberModel: { findByProjectAndUser: jest.fn(async () => ({ role })) },
        model
    }));
    app.use(errorHandler);
    return app;
}

describe("T-35 actual progress endpoint", () => {
    function model() {
        const task = { id: 8, name: "Foundation", actual_start: null, actual_finish: null, progress_percent: 0 };
        return {
            findById: jest.fn(async () => task),
            updateProgress: jest.fn(async (_, taskId, values) => ({ ...task, id: taskId, ...values }))
        };
    }

    test("validates date order before touching the model", async () => {
        const fake = model();
        await request(createApp(fake)).patch("/projects/4/tasks/8/progress")
            .send({ actualStart: "2026-04-12", actualEnd: "2026-04-11", percentComplete: 50 })
            .expect(400, { message: "Ngày kết thúc thực tế không được sớm hơn ngày bắt đầu thực tế" });
        expect(fake.updateProgress).not.toHaveBeenCalled();
    });

    test("rejects invalid percent values", async () => {
        const fake = model();
        await request(createApp(fake)).patch("/projects/4/tasks/8/progress")
            .send({ percentComplete: 101 })
            .expect(400, { message: "Phần trăm hoàn thành phải nằm trong khoảng 0 đến 100" });
        expect(fake.updateProgress).not.toHaveBeenCalled();
    });

    test("accepts nullable dates and returns the persisted task", async () => {
        const fake = model();
        await request(createApp(fake)).patch("/projects/4/tasks/8/progress")
            .send({ actualStart: null, actualEnd: "2026-04-12", percentComplete: 25 })
            .expect(200, {
                task: { id: 8, name: "Foundation", actual_start: null, actual_finish: "2026-04-12", progress_percent: 25 }
            });
        expect(fake.updateProgress).toHaveBeenCalledWith(4, 8, {
            actual_start: null, actual_finish: "2026-04-12", progress_percent: 25
        });
    });

    test.each(["admin", "manager", "engineer", "member", "project_manager"])(
        "uses the existing project membership policy for %s",
        async (role) => {
            const fake = model();
            await request(createApp(fake, role)).patch("/projects/4/tasks/8/progress")
                .send({ percentComplete: 25 }).expect(200);
        }
    );

    test("does not broaden the existing policy to a viewer", async () => {
        const fake = model();
        await request(createApp(fake, "viewer")).patch("/projects/4/tasks/8/progress")
            .send({ percentComplete: 25 }).expect(403);
        expect(fake.updateProgress).not.toHaveBeenCalled();
    });
});

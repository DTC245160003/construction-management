const request = require("supertest");
const express = require("express");
const { createWorkItemRoutes } = require("../src/routes/workItemRoutes");

function createApp() {
    const model = {
        findTree: jest.fn(async () => [{ id: 1, title: "Foundation", depth: 0 }]),
        create: jest.fn(async (values) => ({ id: 2, ...values })),
        update: jest.fn(async (values) => ({ id: values.itemId, ...values })),
        remove: jest.fn(async () => true)
    };
    const app = express();
    app.use(express.json());
    app.use("/projects", createWorkItemRoutes({
        authorization: { requireAuth: (req, res, next) => {
            req.user = { id: 1 };
            next();
        } },
        memberModel: { findByProjectAndUser: jest.fn(async () => ({ role: "member" })) },
        model
    }));
    return { app, model };
}

describe("Work item CRUD API", () => {
    test("lists the project tree", async () => {
        const { app, model } = createApp();
        await request(app).get("/projects/4/items").expect(200, {
            items: [{ id: 1, title: "Foundation", depth: 0 }]
        });
        expect(model.findTree).toHaveBeenCalledWith(4);
    });

    test("creates, updates, and deletes items", async () => {
        const { app, model } = createApp();
        await request(app).post("/projects/4/items")
            .send({ title: "Walls" }).expect(201);
        await request(app).patch("/projects/4/items/2")
            .send({ title: "Updated walls" }).expect(200);
        await request(app).delete("/projects/4/items/2").expect(204);
        expect(model.create).toHaveBeenCalled();
        expect(model.update).toHaveBeenCalled();
        expect(model.remove).toHaveBeenCalledWith({ projectId: 4, itemId: 2 });
    });
});

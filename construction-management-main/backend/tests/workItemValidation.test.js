const request = require("supertest");
const express = require("express");
const { createWorkItemRoutes } = require("../src/routes/workItemRoutes");

function createApp(model) {
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
    return app;
}

describe("T-10 work item validation", () => {
    test("rejects assigning an item under its descendant with 422 and names", async () => {
        const model = {
            findParentCycle: jest.fn(async () => ({
                source_title: "Foundation",
                parent_title: "Concrete footing"
            })),
            update: jest.fn()
        };

        await request(createApp(model))
            .patch("/projects/1/items/10")
            .send({ title: "Foundation", parentId: 11 })
            .expect(422, {
                message: "Không thể đặt hạng mục \"Foundation\" làm con của hậu duệ \"Concrete footing\""
            });
        expect(model.update).not.toHaveBeenCalled();
    });

    test("rejects deleting an item with descendants with 409 and names", async () => {
        const model = {
            findSubtreeSummary: jest.fn(async () => ({
                item_title: "Foundation",
                descendant_count: 2
            })),
            remove: jest.fn()
        };

        await request(createApp(model))
            .delete("/projects/1/items/10")
            .expect(409, {
                message: "Không thể xóa hạng mục \"Foundation\" vì còn 2 công việc đang gắn"
            });
        expect(model.remove).not.toHaveBeenCalled();
    });
});
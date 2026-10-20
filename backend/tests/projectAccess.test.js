const express = require("express");
const request = require("supertest");
const { createProjectRoutes } = require("../src/routes/projectRoutes");

function createTestApp(member) {
    const app = express();
    app.use("/projects", createProjectRoutes({
        authorization: {
            requireAuth: (req, res, next) => {
                req.user = { id: 7 };
                next();
            }
        },
        memberModel: {
            findByProjectAndUser: jest.fn(async () => member)
        }
    }));
    return app;
}

describe("Project access middleware", () => {
    test('S03 cross-project denial records the actor and route without query secrets',async()=>{
        const model={findByProjectAndUser:jest.fn(async()=>null),recordDeniedAccess:jest.fn(async()=>{})};
        const app=express();app.use('/projects',createProjectRoutes({memberModel:model,authorization:{requireAuth:(req,res,next)=>{req.user={id:7};next();}}}));
        await request(app).get('/projects/12?token=private-value').expect(403);
        expect(model.recordDeniedAccess).toHaveBeenCalledWith({projectId:12,userId:7,route:'/:projectId',method:'GET',reason:'not_a_member'});
    });
    test("denies a user who is not a project member", async () => {
        await request(createTestApp(null))
            .get("/projects/12")
            .expect(403, { message: "Bạn không có quyền truy cập dự án này" });
    });

    test("denies a project route without an allowed-role policy", async () => {
        await request(createTestApp({ role: "member" }))
            .get("/projects/12/unconfigured")
            .expect(403, { message: "Project route has no allowed roles configured" });
    });

    test("allows a member whose role is declared by the route", async () => {
        await request(createTestApp({ role: "member" }))
            .get("/projects/12")
            .expect(200, { projectId: 12 });
    });
});

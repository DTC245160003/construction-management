const request = require("supertest");
const session = require("express-session");
const argon2 = require("argon2");
const { createApp } = require("../src/app");
const { createAuthService } = require("../src/services/authService");
const { createAuthorization } = require("../src/middleware/auth");
const { createUserModel: createDatabaseUserModel } = require("../src/models/userModel");

const EMAIL = "builder@example.com";
const PASSWORD = "A correct password for the test";
const INVALID_CREDENTIALS = {
    message: "Thông tin đăng nhập không chính xác"
};
const ACCOUNT_JUST_LOCKED = {
    message: "Tài khoản đã bị khóa 15 phút do nhập sai mật khẩu quá nhiều lần"
};
const ACCOUNT_LOCKED = {
    message: "Tài khoản đang bị khóa. Vui lòng thử lại sau 15 phút"
};
const LOCK_DURATION_MS = 15 * 60 * 1000;

function createUserModel(passwordHash) {
    let now = Date.parse("2026-09-23T10:00:00.000Z");
    const user = {
        id: 1,
        fullname: "Test Builder",
        email: EMAIL,
        password_hash: passwordHash,
        role_id: 2,
        role: "engineer",
        failed_login_attempts: 0,
        locked_until: null
    };

    const changes = {
        recordFailure: jest.fn(async (attempts) => {
            user.failed_login_attempts = attempts;
            user.locked_until = attempts >= 5
                ? new Date(now + LOCK_DURATION_MS)
                : null;
        }),
        resetFailures: jest.fn(async () => {
            user.failed_login_attempts = 0;
            user.locked_until = null;
        })
    };
    const model = {
        withLockedUser: jest.fn(async (email, callback) => {
            const found = email === user.email;
            const lockedUntil = user.locked_until?.getTime();
            return callback(found ? {
                ...user,
                is_locked: lockedUntil !== undefined && lockedUntil > now,
                lock_expired: lockedUntil !== undefined && lockedUntil <= now
            } : null, changes);
        })
    };

    return {
        model,
        user,
        changes,
        advanceTime: (milliseconds) => { now += milliseconds; },
        currentTime: () => now
    };
}

function storedSessions(store) {
    return new Promise((resolve, reject) => {
        store.all((error, sessions) => {
            if (error) {
                reject(error);
                return;
            }
            resolve(sessions);
        });
    });
}

function sessionCookie(response) {
    const cookie = response.headers["set-cookie"]?.find((value) =>
        value.startsWith("construction.sid="));
    expect(cookie).toBeDefined();
    return cookie.split(";")[0];
}

describe("Authentication", () => {
    let passwordHash;
    let fixture;
    let store;
    let app;

    beforeAll(async () => {
        passwordHash = await argon2.hash(PASSWORD, {
            type: argon2.argon2id,
            memoryCost: 19456,
            timeCost: 2,
            parallelism: 1
        });
    });

    beforeEach(() => {
        fixture = createUserModel(passwordHash);
        store = new session.MemoryStore();
        app = createApp({
            authService: createAuthService({ userModel: fixture.model }),
            sessionStore: store,
            sessionSecret: "test-session-secret-with-at-least-32-characters",
            secureCookies: false,
            trustProxy: false
        });
        app.get("/__test/session", (req, res) => {
            res.json({ userId: req.session.userId ?? null });
        });
    });

    test("valid Argon2id credentials reset failures and create an authenticated session", async () => {
        fixture.user.failed_login_attempts = 3;
        const agent = request.agent(app);

        const response = await agent.post("/auth/login")
            .send({ email: EMAIL, password: PASSWORD })
            .expect(200);

        expect(passwordHash).toMatch(/^\$argon2id\$/);
        expect(response.body).toEqual({
            message: "Đăng nhập thành công",
            user: { id: 1, fullname: "Test Builder", email: EMAIL, role_id: 2, role: "engineer",system_role:"user",is_active:true }
        });
        expect(JSON.stringify(response.body)).not.toContain(passwordHash);
        expect(JSON.stringify(response.body)).not.toContain(PASSWORD);
        expect(response.body.user).not.toHaveProperty("failed_login_attempts");
        expect(response.body.user).not.toHaveProperty("locked_until");
        expect(fixture.user.failed_login_attempts).toBe(0);
        expect(fixture.user.locked_until).toBeNull();
        sessionCookie(response);
        const cookieHeader = response.headers["set-cookie"].find((value) =>
            value.startsWith("construction.sid="));
        expect(cookieHeader).toMatch(/; HttpOnly(?:;|$)/);
        expect(cookieHeader).toMatch(/; SameSite=Lax(?:;|$)/);
        await agent.get("/__test/session").expect(200, { userId: 1 });

        const sessions = Object.values(await storedSessions(store));
        expect(sessions).toHaveLength(1);
        expect(sessions[0].userId).toBe(1);
        expect(JSON.stringify(sessions)).not.toContain(passwordHash);
        expect(JSON.stringify(sessions)).not.toContain(PASSWORD);
    });

    test("incorrect password and unknown email return the same generic error", async () => {
        const incorrectPassword = await request(app).post("/auth/login")
            .send({ email: EMAIL, password: "incorrect password" })
            .expect(401);
        const unknownEmail = await request(app).post("/auth/login")
            .send({ email: "unknown@example.com", password: PASSWORD })
            .expect(401);

        expect(incorrectPassword.body).toEqual(INVALID_CREDENTIALS);
        expect(unknownEmail.body).toEqual(INVALID_CREDENTIALS);
        expect(fixture.user.failed_login_attempts).toBe(1);
        expect(fixture.user.locked_until).toBeNull();
        expect(await storedSessions(store)).toEqual({});
    });

    test.each(["plaintext", "argon2i"])("legacy %s passwords are rejected with the generic error", async (format) => {
        fixture.user.password_hash = format === "plaintext"
            ? PASSWORD
            : await argon2.hash(PASSWORD, {
                type: argon2.argon2i,
                memoryCost: 19456,
                timeCost: 2,
                parallelism: 1
            });

        await request(app).post("/auth/login")
            .send({ email: EMAIL, password: PASSWORD })
            .expect(401, INVALID_CREDENTIALS);

        expect(fixture.user.failed_login_attempts).toBe(1);
        expect(await storedSessions(store)).toEqual({});
    });

    test("a failed session save cannot authenticate through an automatic save retry", async () => {
        jest.spyOn(store, "set").mockImplementationOnce((sessionId, data, callback) => {
            process.nextTick(callback, new Error("Session store unavailable"));
        });
        const agent = request.agent(app);

        await agent.post("/auth/login")
            .send({ email: EMAIL, password: PASSWORD })
            .expect(500);

        const sessions = Object.values(await storedSessions(store));
        expect(sessions.filter((value) => value.userId !== undefined)).toEqual([]);
        await agent.get("/__test/session").expect(200, { userId: null });
    });

    test("five incorrect passwords lock the account for 15 minutes", async () => {
        for (let attempt = 1; attempt <= 5; attempt += 1) {
            const response = await request(app).post("/auth/login")
                .send({ email: EMAIL, password: "incorrect password" })
                .expect(attempt < 5 ? 401 : 423, attempt < 5 ? INVALID_CREDENTIALS : ACCOUNT_JUST_LOCKED);
            expect(response.headers["set-cookie"]).toBeUndefined();
            expect(fixture.user.failed_login_attempts).toBe(attempt);
            if (attempt < 5) {
                expect(fixture.user.locked_until).toBeNull();
            }
        }

        expect(fixture.user.locked_until.getTime()).toBe(
            fixture.currentTime() + LOCK_DURATION_MS);
        expect(await storedSessions(store)).toEqual({});

        await request(app).post("/auth/login")
            .send({ email: EMAIL, password: PASSWORD })
            .expect(423, ACCOUNT_LOCKED);
        expect(fixture.user.failed_login_attempts).toBe(5);
        expect(fixture.user.locked_until.getTime()).toBe(
            fixture.currentTime() + LOCK_DURATION_MS);
        expect(await storedSessions(store)).toEqual({});
    });

    test("a locked account verifies only a dummy hash and leaves counters, lock time, and sessions unchanged", async () => {
        fixture.user.failed_login_attempts = 5;
        fixture.user.locked_until = new Date(fixture.currentTime() + LOCK_DURATION_MS);
        const lockedUntil = fixture.user.locked_until.getTime();
        const verifyPassword = jest.fn().mockResolvedValue(true);
        const lockedApp = createApp({
            authService: createAuthService({ userModel: fixture.model, verifyPassword }),
            sessionStore: store,
            sessionSecret: "locked-test-session-secret-with-at-least-32-characters",
            secureCookies: false
        });

        for (const password of [PASSWORD, "incorrect password"]) {
            const response = await request(lockedApp).post("/auth/login")
                .send({ email: EMAIL, password })
                .expect(423, ACCOUNT_LOCKED);
            expect(response.headers["set-cookie"]).toBeUndefined();
        }

        expect(verifyPassword.mock.calls).toEqual([
            [null, PASSWORD],
            [null, "incorrect password"]
        ]);
        expect(fixture.changes.recordFailure).not.toHaveBeenCalled();
        expect(fixture.changes.resetFailures).not.toHaveBeenCalled();
        expect(fixture.user.failed_login_attempts).toBe(5);
        expect(fixture.user.locked_until.getTime()).toBe(lockedUntil);
        expect(await storedSessions(store)).toEqual({});
    });

    test("correct credentials work at lock expiry and clear the lock and counter", async () => {
        fixture.user.failed_login_attempts = 5;
        fixture.user.locked_until = new Date(fixture.currentTime() + LOCK_DURATION_MS);
        fixture.advanceTime(LOCK_DURATION_MS);

        await request(app).post("/auth/login")
            .send({ email: EMAIL, password: PASSWORD })
            .expect(200);

        expect(fixture.user.failed_login_attempts).toBe(0);
        expect(fixture.user.locked_until).toBeNull();
    });

    test("an incorrect password after lock expiry starts a new failure count", async () => {
        fixture.user.failed_login_attempts = 5;
        fixture.user.locked_until = new Date(fixture.currentTime() + LOCK_DURATION_MS);
        fixture.advanceTime(LOCK_DURATION_MS);

        await request(app).post("/auth/login")
            .send({ email: EMAIL, password: "incorrect password" })
            .expect(401, INVALID_CREDENTIALS);

        expect(fixture.user.failed_login_attempts).toBe(1);
        expect(fixture.user.locked_until).toBeNull();
    });

    test("logout destroys the session, clears the cookie, and invalidates the old cookie", async () => {
        const agent = request.agent(app);
        const loginResponse = await agent.post("/auth/login")
            .send({ email: EMAIL, password: PASSWORD })
            .expect(200);
        const oldCookie = sessionCookie(loginResponse);

        const logoutResponse = await agent.post("/auth/logout")
            .expect(200, { message: "Đăng xuất thành công" });

        expect(logoutResponse.headers["set-cookie"]).toEqual(expect.arrayContaining([
            expect.stringMatching(/^construction\.sid=;/)
        ]));
        expect(await storedSessions(store)).toEqual({});
        await agent.get("/__test/session").expect(200, { userId: null });
        await request(app).get("/__test/session")
            .set("Cookie", oldCookie)
            .expect(200, { userId: null });
    });

    test("successful login rotates the session id and invalidates the previous session", async () => {
        const agent = request.agent(app);
        const first = await agent.post("/auth/login")
            .send({ email: EMAIL, password: PASSWORD })
            .expect(200);
        const firstCookie = sessionCookie(first);
        const second = await agent.post("/auth/login")
            .send({ email: EMAIL, password: PASSWORD })
            .expect(200);

        expect(sessionCookie(second)).not.toBe(firstCookie);
        expect(Object.keys(await storedSessions(store))).toHaveLength(1);
        await request(app).get("/__test/session")
            .set("Cookie", firstCookie)
            .expect(200, { userId: null });
        await agent.get("/__test/session").expect(200, { userId: 1 });
    });

    test.each([
        {},
        { email: EMAIL },
        { password: PASSWORD },
        { email: "", password: PASSWORD },
        { email: EMAIL, password: "" },
        { email: 42, password: PASSWORD },
        { email: EMAIL, password: 42 },
        { email: { value: EMAIL }, password: PASSWORD },
        { email: EMAIL, password: [PASSWORD] }
    ])("malformed credentials return the generic error without querying users: %j", async (body) => {
        await request(app).post("/auth/login")
            .send(body)
            .expect(401, INVALID_CREDENTIALS);

        expect(fixture.model.withLockedUser).not.toHaveBeenCalled();
        expect(await storedSessions(store)).toEqual({});
    });

    test("logout succeeds without an existing authenticated session", async () => {
        await request(app).post("/auth/logout")
            .expect(200, { message: "Đăng xuất thành công" });
        expect(await storedSessions(store)).toEqual({});
    });
});

describe("Login database transactions", () => {
    test("locks only users in the role join and commits the callback update on the same connection", async () => {
        const user = { id: 42, email: EMAIL, role: "engineer", lock_expired: true };
        const client = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [user] })
                .mockResolvedValueOnce({ rows: [] })
                .mockResolvedValueOnce({ rows: [] }),
            release: jest.fn()
        };
        const pool = { connect: jest.fn().mockResolvedValue(client) };
        const userModel = createDatabaseUserModel(pool);
        const operation = jest.fn(async (lockedUser, changes) => {
            expect(lockedUser).toBe(user);
            await changes.recordFailure(1);
            return "failure-recorded";
        });

        await expect(userModel.withLockedUser(EMAIL, operation)).resolves.toBe("failure-recorded");

        expect(pool.connect).toHaveBeenCalledTimes(1);
        expect(client.query).toHaveBeenCalledTimes(4);
        expect(client.query).toHaveBeenNthCalledWith(1, "BEGIN");
        expect(client.query).toHaveBeenNthCalledWith(2,
            expect.stringMatching(/\bFOR\s+UPDATE\s+OF\s+users\b/i), [EMAIL]);
        expect(client.query).toHaveBeenNthCalledWith(3,
            expect.stringMatching(/\bUPDATE\s+users\b/i), [user.id, 1]);
        expect(client.query).toHaveBeenNthCalledWith(4, "COMMIT");
        expect(operation).toHaveBeenCalledTimes(1);
        expect(client.release).toHaveBeenCalledTimes(1);
    });

    test("a failed lock query rolls back and preserves the original PostgreSQL error and operation", async () => {
        const databaseError = Object.assign(new Error("FOR UPDATE cannot be applied to the nullable side of an outer join"), {
            code: "0A000"
        });
        const client = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockRejectedValueOnce(databaseError)
                .mockResolvedValueOnce({ rows: [] }),
            release: jest.fn()
        };
        const userModel = createDatabaseUserModel({ connect: jest.fn().mockResolvedValue(client) });
        const operation = jest.fn();

        await expect(userModel.withLockedUser(EMAIL, operation)).rejects.toBe(databaseError);

        expect(databaseError).toMatchObject({ code: "0A000", operation: "userModel.withLockedUser" });
        expect(client.query).toHaveBeenCalledTimes(3);
        expect(client.query).toHaveBeenNthCalledWith(1, "BEGIN");
        expect(client.query).toHaveBeenLastCalledWith("ROLLBACK");
        expect(operation).not.toHaveBeenCalled();
        expect(client.release).toHaveBeenCalledTimes(1);
    });
});

describe("Registration and RBAC", () => {
    const payload = {
        fullname: "Nguyễn Văn A",
        email: "new-user@example.com",
        password: "Registration password 123",
        role: "engineer"
    };
    const roles = { engineer: 3, worker: 4, viewer: 6 };
    let userModel;
    let app;

    beforeEach(() => {
        userModel = {
            findByEmail: jest.fn(async () => null),
            findRoleByName: jest.fn(async name => roles[name] ? { id: roles[name], name } : null),
            createUser: jest.fn(async user => ({
                id: 10, fullname: user.fullname, email: user.email,
                role_id: user.roleId, created_at: "2026-09-23T10:00:00.000Z"
            })),
            findByIdWithRole: jest.fn(async () => ({
                id: 10, fullname: payload.fullname, email: payload.email,
                role_id: roles.engineer, role: "engineer"
            }))
        };
        const authService = createAuthService({ userModel });
        app = createApp({
            authService,
            sessionStore: new session.MemoryStore(),
            sessionSecret: "registration-test-secret-at-least-32-characters",
            secureCookies: false
        });
        const { requireAuth, requireRoles } = createAuthorization({ userModel });
        app.get("/__test/engineering", requireAuth, requireRoles("engineer", "admin"), (req, res) => {
            res.json({ user: req.user });
        });
        // The fixture logs in a known user; the routes and session middleware remain real.
        authService.login = jest.fn(async () => ({ id: 10, email: payload.email, role_id: roles.engineer }));
    });

    test.each(["engineer", "worker", "viewer"])("registers the public role %s with an Argon2id hash", async role => {
        const response = await request(app).post("/auth/register")
            .send({ ...payload, role, fullname: "  Nguyễn Văn A  ", email: " NEW-USER@EXAMPLE.COM " })
            .expect(201);

        const inserted = userModel.createUser.mock.calls[0][0];
        expect(inserted).toMatchObject({
            fullname: payload.fullname, email: payload.email, roleId: roles[role]
        });
        expect(inserted.passwordHash).toMatch(/^\$argon2id\$/);
        expect(await argon2.verify(inserted.passwordHash, payload.password)).toBe(true);
        expect(response.body.user.role).toBe(role);
        expect(response.body.user.role_id).toBe(roles[role]);
        expect(response.body.user.fullname).toBe(payload.fullname);
        expect(JSON.stringify(response.body)).not.toContain(payload.password);
        expect(JSON.stringify(response.body)).not.toContain(inserted.passwordHash);
        expect(response.headers["set-cookie"]).toBeUndefined();
    });

    test("returns 409 when the email already exists", async () => {
        userModel.findByEmail.mockResolvedValue({ id: 1, email: payload.email });
        await request(app).post("/auth/register").send(payload)
            .expect(409, { message: "Email đã được sử dụng" });
        expect(userModel.createUser).not.toHaveBeenCalled();
    });

    test("maps a concurrent unique email violation to 409", async () => {
        userModel.createUser.mockRejectedValue(Object.assign(new Error("duplicate key"), { code: "23505" }));
        await request(app).post("/auth/register").send(payload)
            .expect(409, { message: "Email đã được sử dụng" });
    });

    test("rejects a missing database role", async () => {
        userModel.findRoleByName.mockResolvedValue(null);
        await request(app).post("/auth/register").send(payload)
            .expect(400, { message: "Vai trò không tồn tại trong hệ thống" });
        expect(userModel.createUser).not.toHaveBeenCalled();
    });

    test.each(["admin", "project_manager", "accountant", "manager", "unknown", "toString"])(
        "rejects public registration for role %s", async role => {
            await request(app).post("/auth/register").send({ ...payload, role }).expect(403);
            expect(userModel.createUser).not.toHaveBeenCalled();
        }
    );

    test("maps legacy employee to worker and ignores injected role_id", async () => {
        await request(app).post("/auth/register")
            .send({ ...payload, role: "employee", role_id: 1 })
            .expect(201);
        expect(userModel.findRoleByName).toHaveBeenCalledWith("worker");
        expect(userModel.createUser.mock.calls[0][0].roleId).toBe(roles.worker);
    });

    test.each([
        { fullname: " " }, { fullname: "a".repeat(256) }, { email: "not-an-email" },
        { password: "short" }, { password: 12345678 }, { password: "a".repeat(1025) },
        { role: "" }, { role: { name: "engineer" } }
    ])("validates registration data before inserting: %j", async invalid => {
        await request(app).post("/auth/register").send({ ...payload, ...invalid }).expect(400);
        expect(userModel.createUser).not.toHaveBeenCalled();
    });

    test("RBAC rejects unauthenticated requests", async () => {
        await request(app).get("/__test/engineering").expect(401);
        expect(userModel.findByIdWithRole).not.toHaveBeenCalled();
    });

    test("RBAC allows the current database role and rejects changed or client-supplied roles", async () => {
        const agent = request.agent(app);
        await agent.post("/auth/login").send({ email: payload.email, password: payload.password }).expect(200);
        await agent.get("/__test/engineering").expect(200);
        expect(userModel.findByIdWithRole).toHaveBeenCalledWith(10);

        userModel.findByIdWithRole.mockResolvedValue({ id: 10, role: "viewer", role_id: roles.viewer });
        await agent.get("/__test/engineering?role=admin").set("X-Role", "admin").expect(403);
        userModel.findByIdWithRole.mockResolvedValue({ id: 10, role: null, role_id: null });
        await agent.get("/__test/engineering").expect(403);
        userModel.findByIdWithRole.mockResolvedValue(null);
        await agent.get("/__test/engineering").expect(401);
    });
});

describe("Registration database diagnostics", () => {
    const registration = {
        fullname: "Private registration name",
        email: "private-registration@example.com",
        password: "Private registration password 123",
        role: "engineer"
    };
    const genericFailure = { message: "Đã xảy ra lỗi, vui lòng thử lại" };

    afterEach(() => {
        jest.restoreAllMocks();
    });

    test.each([
        ["findByEmail", [registration.email]],
        ["findRoleByName", [registration.role]],
        ["createUser", [{
            fullname: registration.fullname,
            email: registration.email,
            passwordHash: "private-password-hash",
            roleId: 3
        }]]
    ])("%s identifies its failing query without replacing or retrying the database error", async (method, args) => {
        const databaseError = Object.assign(new Error("Database schema is unavailable"), { code: "42P01" });
        const pool = { query: jest.fn().mockRejectedValue(databaseError) };
        const userModel = createDatabaseUserModel(pool);

        await expect(userModel[method](...args)).rejects.toBe(databaseError);

        expect(databaseError).toMatchObject({ code: "42P01", operation: `userModel.${method}` });
        expect(pool.query).toHaveBeenCalledTimes(1);
    });

    function createMissingRolesFixture(environment) {
        const databaseError = Object.assign(new Error('relation "roles" does not exist'), {
            code: "42P01",
            schema: "public",
            table: "roles",
            detail: "private-database-detail private-password-hash"
        });
        const pool = {
            query: jest.fn()
                .mockResolvedValueOnce({ rows: [] })
                .mockRejectedValue(databaseError)
        };
        const app = createApp({
            authService: createAuthService({ userModel: createDatabaseUserModel(pool) }),
            sessionStore: new session.MemoryStore(),
            sessionSecret: "diagnostic-test-secret-with-at-least-32-characters",
            secureCookies: false
        });
        app.set("env", environment);
        return { app, pool, databaseError };
    }

    test("development logs the failing model operation without request secrets or PostgreSQL detail", async () => {
        const { app, pool, databaseError } = createMissingRolesFixture("development");
        const log = jest.spyOn(console, "error").mockImplementation(() => {});

        await request(app).post("/auth/register?token=private-query-token")
            .set("X-Debug-Secret", "private-header-secret")
            .send(registration)
            .expect(500, genericFailure);

        expect(pool.query).toHaveBeenCalledTimes(2);
        expect(log).toHaveBeenCalledTimes(1);
        expect(log).toHaveBeenCalledWith("[backend:error]", expect.objectContaining({
            method: "POST",
            path: "/auth/register",
            operation: "userModel.findRoleByName",
            code: "42P01",
            message: databaseError.message,
            stack: databaseError.stack,
            schema: "public",
            table: "roles"
        }));
        const logged = JSON.stringify(log.mock.calls);
        for (const secret of [
            registration.fullname, registration.email, registration.password,
            "private-query-token", "private-header-secret",
            "private-database-detail", "private-password-hash"
        ]) {
            expect(logged).not.toContain(secret);
        }
    });

    test("production returns the generic failure without development diagnostics", async () => {
        const { app, pool } = createMissingRolesFixture("production");
        const log = jest.spyOn(console, "error").mockImplementation(() => {});

        await request(app).post("/auth/register")
            .send(registration)
            .expect(500, genericFailure);

        expect(pool.query).toHaveBeenCalledTimes(2);
        expect(log).not.toHaveBeenCalled();
    });
});

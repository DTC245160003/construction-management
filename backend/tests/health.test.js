const express = require("express");
const request = require("supertest");
const { createHealthService } = require("../src/services/healthService");
const { createHealthRoutes } = require("../src/routes/healthRoutes");

function healthApp(pool, options = {}) {
    const app = express();
    const service = createHealthService({ pool, ...options });
    app.use("/health", createHealthRoutes({ service }));
    return app;
}

test("health is public, checks PostgreSQL and avoids sessions and cached responses", async () => {
    const pool = { query: jest.fn().mockResolvedValue({ rows: [{ alive: 1 }] }) };
    const response = await request(healthApp(pool, { now: () => 1000, uptime: () => 12.8 }))
        .get("/health").expect(200).expect("Cache-Control", "no-store");
    expect(response.headers["set-cookie"]).toBeUndefined();
    expect(response.body).toEqual({
        status: "ok", checkedAt: "1970-01-01T00:00:01.000Z",
        application: { status: "ok", uptimeSeconds: 12 },
        database: { status: "ok", responseTimeMs: 0 }
    });
    expect(pool.query).toHaveBeenCalledWith({ text: "SELECT 1 AS alive", query_timeout: 2000 });
});

test("database failure returns 503 without exposing connection details", async () => {
    const pool = { query: jest.fn().mockRejectedValue(new Error("password=secret host=private-db")) };
    const response = await request(healthApp(pool)).get("/health").expect(503);
    expect(response.body).toMatchObject({ status: "degraded", application: { status: "ok" }, database: { status: "unavailable" } });
    expect(response.text).not.toMatch(/password|secret|private-db/);
});

test("a stalled database is bounded and concurrent probes share one query", async () => {
    let finish;
    const pool = { query: jest.fn(() => new Promise(resolve => { finish = resolve; })) };
    const service = createHealthService({ pool, timeoutMs: 15 });
    const first = await Promise.all([service.check(), service.check(), service.check()]);
    expect(first.every(result => result.status === "degraded")).toBe(true);
    expect(pool.query).toHaveBeenCalledTimes(1);
    await expect(service.check()).resolves.toMatchObject({ status: "degraded" });
    expect(pool.query).toHaveBeenCalledTimes(1);
    finish({ rows: [{ alive: 1 }] });
    await new Promise(resolve => setImmediate(resolve));
    pool.query.mockResolvedValue({ rows: [{ alive: 1 }] });
    await expect(service.check()).resolves.toMatchObject({ status: "ok" });
    expect(pool.query).toHaveBeenCalledTimes(2);
});

const { monitorConfig, createStagingMonitor } = require("../../scripts/staging-health-monitor.cjs");

const healthUrl = "https://staging.example/health", webhookUrl = "https://alerts.example/team-secret";
const healthy = { status: "ok", application: { status: "ok" }, database: { status: "ok" } };

function fixture() {
    let time = 0, up = false, deliveryOk = true;
    const messages = [];
    const fetchImpl = jest.fn(async (url, options) => {
        if (url === healthUrl) return { ok: up, json: async () => healthy };
        messages.push({ text: JSON.parse(options.body).text, headers: options.headers });
        return { ok: deliveryOk };
    });
    const monitor = createStagingMonitor({ healthUrl, webhookUrl, webhookToken: "environment-only-secret", fetchImpl, now: () => time });
    return { monitor, messages, fetchImpl, time: value => { time = value; }, up: value => { up = value; }, delivery: value => { deliveryOk = value; } };
}

test("configuration requires a team webhook and at least five minutes; errors do not echo secret values", () => {
    const env = { STAGING_HEALTH_URL: healthUrl, MONITOR_WEBHOOK_URL: webhookUrl };
    expect(monitorConfig(env)).toMatchObject({ intervalMs: 30000, unavailableAfterMs: 300000, requestTimeoutMs: 10000 });
    expect(() => monitorConfig({ ...env, MONITOR_FAILURE_SECONDS: "299" })).toThrow(/between 300/);
    expect(() => monitorConfig({ ...env, MONITOR_WEBHOOK_URL: undefined })).toThrow(/MONITOR_WEBHOOK_URL/);
    expect(() => monitorConfig({ ...env, MONITOR_WEBHOOK_URL: "https://user:password@private.example" })).toThrow("MONITOR_WEBHOOK_URL must be an HTTP(S) URL without embedded credentials.");
});

test("continuous outage alerts after five minutes, avoids duplicates, and reports recovery", async () => {
    const f = fixture();
    await expect(f.monitor.tick()).resolves.toMatchObject({ status: "unavailable", unavailableSeconds: 0 });
    f.time(299999); await f.monitor.tick();
    expect(f.messages).toHaveLength(0);
    f.time(300000); await f.monitor.tick();
    expect(f.messages).toHaveLength(0);
    f.time(300001);
    await expect(f.monitor.tick()).resolves.toMatchObject({ notification: "outage_delivered" });
    expect(f.messages).toHaveLength(1);
    expect(f.messages[0].text).toMatch(/UNAVAILABLE.*300 seconds/);
    expect(f.messages[0].text).not.toMatch(/team-secret|environment-only-secret/);
    expect(f.messages[0].headers.Authorization).toBe("Bearer environment-only-secret");
    f.time(900000); await f.monitor.tick();
    expect(f.messages).toHaveLength(1);
    f.up(true);
    await expect(f.monitor.tick()).resolves.toMatchObject({ status: "ok", notification: "recovery_delivered" });
    expect(f.messages[1].text).toMatch(/RECOVERED/);
    await f.monitor.tick();
    expect(f.messages).toHaveLength(2);
});

test("a short recovery resets the continuous five-minute window", async () => {
    const f = fixture();
    await f.monitor.tick(); f.time(299999); f.up(true); await f.monitor.tick();
    f.up(false); f.time(300000); await f.monitor.tick(); f.time(599999); await f.monitor.tick();
    expect(f.messages).toHaveLength(0);
    f.time(600001); await f.monitor.tick();
    expect(f.messages).toHaveLength(1);
});

test("failed outage and recovery deliveries retry until the webhook accepts them", async () => {
    const f = fixture();
    await f.monitor.tick(); f.time(300001); f.delivery(false);
    await expect(f.monitor.tick()).resolves.toMatchObject({ notification: "delivery_failed" });
    f.delivery(true);
    await expect(f.monitor.tick()).resolves.toMatchObject({ notification: "outage_delivered" });
    f.up(true); f.delivery(false);
    await expect(f.monitor.tick()).resolves.toMatchObject({ notification: "delivery_failed" });
    f.delivery(true);
    await expect(f.monitor.tick()).resolves.toMatchObject({ notification: "recovery_delivered" });
    await f.monitor.tick();
    expect(f.messages).toHaveLength(4);
});

test("HTTP 200 with a failing database, malformed JSON and network timeouts count as unavailable", async () => {
    for (const response of [
        async () => ({ ok: true, json: async () => ({ ...healthy, database: { status: "unavailable" } }) }),
        async () => ({ ok: true, json: async () => { throw new Error("invalid body"); } }),
        async () => { throw new Error("timeout with secret connection details"); }
    ]) {
        const monitor = createStagingMonitor({ healthUrl, webhookUrl, fetchImpl: response });
        await expect(monitor.tick()).resolves.toEqual({ status: "unavailable", unavailableSeconds: 0 });
    }
});

test("overlapping checks do not issue concurrent probes", async () => {
    let finish;
    const fetchImpl = jest.fn(() => new Promise(resolve => { finish = resolve; }));
    const monitor = createStagingMonitor({ healthUrl, webhookUrl, fetchImpl });
    const first = monitor.tick();
    await expect(monitor.tick()).resolves.toEqual({ status: "skipped" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    finish({ ok: true, json: async () => healthy });
    await expect(first).resolves.toEqual({ status: "ok" });
});

test("real HTTP probes deliver outage and recovery JSON to a local webhook receiver", async () => {
    const http = require("node:http");
    let up = true, time = 0;
    const received = [];
    const server = http.createServer((req, res) => {
        if (req.url === "/health") {
            res.writeHead(up ? 200 : 503, { "Content-Type": "application/json" });
            return res.end(JSON.stringify(up ? healthy : { status: "degraded" }));
        }
        let body = "";
        req.on("data", chunk => { body += chunk; });
        req.on("end", () => {
            received.push({ method: req.method, token: req.headers.authorization, body: JSON.parse(body) });
            res.writeHead(204).end();
        });
    });
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    try {
        const origin = `http://127.0.0.1:${server.address().port}`;
        const monitor = createStagingMonitor({ healthUrl: `${origin}/health`, webhookUrl: `${origin}/webhook`, webhookToken: "local-test-token", now: () => time });
        await expect(monitor.tick()).resolves.toEqual({ status: "ok" });
        up = false; await monitor.tick(); time = 300001;
        await expect(monitor.tick()).resolves.toMatchObject({ notification: "outage_delivered" });
        up = true;
        await expect(monitor.tick()).resolves.toMatchObject({ notification: "recovery_delivered" });
        expect(received).toHaveLength(2);
        expect(received[0]).toMatchObject({ method: "POST", token: "Bearer local-test-token", body: { text: expect.stringContaining("UNAVAILABLE") } });
        expect(received[1].body.text).toContain("RECOVERED");
    } finally {
        server.closeAllConnections();
        await new Promise(resolve => server.close(resolve));
    }
});

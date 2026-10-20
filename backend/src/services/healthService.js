function healthTimeout() {
    const value = Number(process.env.HEALTH_DATABASE_TIMEOUT_MS || 2000);
    if (!Number.isInteger(value) || value < 100 || value > 10000) {
        throw new Error("HEALTH_DATABASE_TIMEOUT_MS must be an integer between 100 and 10000.");
    }
    return value;
}

function createHealthService({ pool, timeoutMs = healthTimeout(), now = Date.now, uptime = process.uptime }) {
    let pending;
    const probe = () => {
        // Share a stalled query across concurrent probes instead of exhausting
        // the application pool while the database is unavailable.
        if (!pending) {
            const startedAt = now();
            pending = Promise.resolve()
                .then(() => pool.query({ text: "SELECT 1 AS alive", query_timeout: timeoutMs }))
                .then(() => ({ status: "ok", responseTimeMs: Math.max(0, now() - startedAt) }),
                    () => ({ status: "unavailable" }))
                .finally(() => { pending = undefined; });
        }
        return pending;
    };
    return {
        async check() {
            let timer;
            let database;
            try {
                database = await Promise.race([
                    probe(),
                    new Promise(resolve => {
                        timer = setTimeout(() => resolve({ status: "unavailable" }), timeoutMs);
                    })
                ]);
            } finally {
                clearTimeout(timer);
            }
            return {
                status: database.status === "ok" ? "ok" : "degraded",
                checkedAt: new Date(now()).toISOString(),
                application: { status: "ok", uptimeSeconds: Math.floor(uptime()) },
                database
            };
        }
    };
}

module.exports = { createHealthService };

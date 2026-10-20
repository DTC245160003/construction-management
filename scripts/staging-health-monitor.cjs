// Run on an independent monitoring host to detect loss of the staging host.
// Webhook credentials are supplied only through the process environment.
function endpoint(value, name) {
    let url;
    try { url = new URL(value); } catch { throw new Error(`${name} must be an HTTP(S) URL.`); }
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) {
        throw new Error(`${name} must be an HTTP(S) URL without embedded credentials.`);
    }
    return url.href;
}

function seconds(env, name, fallback, minimum, maximum) {
    const value = Number(env[name] || fallback);
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
        throw new Error(`${name} must be an integer between ${minimum} and ${maximum}.`);
    }
    return value * 1000;
}

function monitorConfig(env = process.env) {
    const environment = env.MONITOR_ENVIRONMENT || "staging";
    if (!/^[\p{L}\p{N} ._-]{1,80}$/u.test(environment)) {
        throw new Error("MONITOR_ENVIRONMENT must be a short environment label.");
    }
    return {
        healthUrl: endpoint(env.STAGING_HEALTH_URL, "STAGING_HEALTH_URL"),
        webhookUrl: endpoint(env.MONITOR_WEBHOOK_URL, "MONITOR_WEBHOOK_URL"),
        webhookToken: env.MONITOR_WEBHOOK_TOKEN || "",
        environment,
        intervalMs: seconds(env, "MONITOR_INTERVAL_SECONDS", 30, 1, 300),
        unavailableAfterMs: seconds(env, "MONITOR_FAILURE_SECONDS", 300, 300, 86400),
        requestTimeoutMs: seconds(env, "MONITOR_REQUEST_TIMEOUT_SECONDS", 10, 1, 60)
    };
}

function createStagingMonitor({ healthUrl, webhookUrl, webhookToken = "", environment = "staging",
    unavailableAfterMs = 300000, requestTimeoutMs = 10000, fetchImpl = fetch, now = Date.now }) {
    let outageStartedAt = null, outageAlertSent = false, pendingRecovery = null, running = false;
    // Avoid copying a query token from a configured probe URL into notifications.
    const target = new URL(healthUrl);
    const publicTarget = `${target.origin}${target.pathname}`;
    const elapsed = startedAt => Math.max(0, now() - startedAt);
    const deliver = async text => {
        try {
            const response = await fetchImpl(webhookUrl, {
                method: "POST", redirect: "error", signal: AbortSignal.timeout(requestTimeoutMs),
                headers: { "Content-Type": "application/json", ...(webhookToken ? { Authorization: `Bearer ${webhookToken}` } : {}) },
                body: JSON.stringify({ text })
            });
            // Drain the response so repeated alerts do not retain connections.
            if (response.body?.cancel) await response.body.cancel();
            return response.ok;
        } catch { return false; }
    };

    return {
        async tick() {
            if (running) return { status: "skipped" };
            running = true;
            try {
                let healthy = false;
                try {
                    const response = await fetchImpl(healthUrl, {
                        method: "GET", redirect: "error", cache: "no-store",
                        headers: { Accept: "application/json" }, signal: AbortSignal.timeout(requestTimeoutMs)
                    });
                    if (response.ok) {
                        const health = await response.json();
                        healthy = health.status === "ok" && health.application?.status === "ok" && health.database?.status === "ok";
                    } else if (response.body?.cancel) await response.body.cancel();
                } catch { /* Network errors and malformed probe bodies are unavailable. */ }

                if (healthy) {
                    if (outageStartedAt !== null && outageAlertSent) {
                        pendingRecovery = { duration: Math.floor(elapsed(outageStartedAt) / 1000) };
                    }
                    outageStartedAt = null;
                    outageAlertSent = false;
                    if (pendingRecovery) {
                        const delivered = await deliver(`[${environment}] RECOVERED: application and database are healthy at ${publicTarget}. Outage lasted ${pendingRecovery.duration} seconds.`);
                        if (delivered) pendingRecovery = null;
                        return { status: "ok", notification: delivered ? "recovery_delivered" : "delivery_failed" };
                    }
                    return { status: "ok" };
                }

                pendingRecovery = null;
                outageStartedAt ??= now();
                const unavailableMs = elapsed(outageStartedAt);
                if (!outageAlertSent && unavailableMs > unavailableAfterMs) {
                    const delivered = await deliver(`[${environment}] UNAVAILABLE: application or database at ${publicTarget} has failed health checks for ${Math.floor(unavailableMs / 1000)} seconds. Started ${new Date(outageStartedAt).toISOString()}. Please investigate staging.`);
                    if (delivered) outageAlertSent = true;
                    return { status: "unavailable", unavailableSeconds: Math.floor(unavailableMs / 1000), notification: delivered ? "outage_delivered" : "delivery_failed" };
                }
                return { status: "unavailable", unavailableSeconds: Math.floor(unavailableMs / 1000) };
            } finally { running = false; }
        }
    };
}

async function main() {
    const config = monitorConfig();
    const monitor = createStagingMonitor(config);
    const check = async () => {
        const result = await monitor.tick();
        const entry = JSON.stringify({ checkedAt: new Date().toISOString(), environment: config.environment, ...result });
        if (result.notification === "delivery_failed") console.error(entry);
        else console.log(entry);
    };
    await check();
    const timer = setInterval(() => {
        check().catch(() => console.error(JSON.stringify({ status: "monitor_error" })));
    }, config.intervalMs);
    const stop = () => clearInterval(timer);
    process.once("SIGTERM", stop);
    process.once("SIGINT", stop);
}

if (require.main === module) main().catch(error => {
    console.error(error.message);
    process.exitCode = 1;
});

module.exports = { monitorConfig, createStagingMonitor };

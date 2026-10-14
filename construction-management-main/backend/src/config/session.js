const session = require("express-session");
const { randomBytes } = require("crypto");

const COOKIE_NAME = "construction.sid";
const SESSION_MAX_AGE = 8 * 60 * 60 * 1000;

function createSession({ store, secret, secureCookies }) {
    const configuredSecret = secret || process.env.SESSION_SECRET;
    if (!configuredSecret && process.env.NODE_ENV === "production") {
        throw new Error("SESSION_SECRET is required in production (at least 32 bytes).");
    }
    if (configuredSecret && Buffer.byteLength(configuredSecret) < 32) {
        throw new Error("SESSION_SECRET must contain at least 32 bytes.");
    }

    if (secureCookies === undefined) {
        const setting = process.env.SESSION_COOKIE_SECURE;
        if (setting && !["true", "false"].includes(setting)) {
            throw new Error("SESSION_COOKIE_SECURE must be true or false.");
        }
        secureCookies = setting ? setting === "true" : process.env.NODE_ENV === "production";
    }

    const cookieOptions = {
        httpOnly: true,
        sameSite: "lax",
        secure: secureCookies,
        path: "/"
    };

    return {
        cookieName: COOKIE_NAME,
        cookieOptions,
        middleware: session({
            name: COOKIE_NAME,
            secret: configuredSecret || randomBytes(32).toString("hex"),
            store,
            resave: false,
            saveUninitialized: false,
            cookie: { ...cookieOptions, maxAge: SESSION_MAX_AGE }
        })
    };
}

function createSessionStore(pool) {
    const PgStore = require("connect-pg-simple")(session);
    return new PgStore({
        pool,
        tableName: "user_sessions",
        createTableIfMissing: false
    });
}

module.exports = { createSession, createSessionStore };

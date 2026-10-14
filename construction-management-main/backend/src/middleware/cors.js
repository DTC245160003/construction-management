const ALLOWED_ORIGIN = "http://localhost:5173";

function corsMiddleware(req, res, next) {
    const origin = req.headers.origin;
    if (origin === ALLOWED_ORIGIN) {
        res.setHeader("Access-Control-Allow-Origin", ALLOWED_ORIGIN);
        res.setHeader("Access-Control-Allow-Credentials", "true");
        res.setHeader("Access-Control-Allow-Headers", "Content-Type");
        res.setHeader("Access-Control-Allow-Methods", "GET,POST,PATCH,DELETE,OPTIONS");
        res.setHeader("Vary", "Origin");
    }

    if (req.method === "OPTIONS") {
        return origin === ALLOWED_ORIGIN ? res.sendStatus(204) : res.sendStatus(403);
    }

    return next();
}

module.exports = corsMiddleware;

function errorHandler(error, req, res, next) {
    if (res.headersSent) return next(error);

    if (error.expose && [400, 403, 404, 409, 422].includes(error.status)) {
        return res.status(error.status).json({
            message: error.message,
            ...(error.status === 422 && Array.isArray(error.cycle) ? { cycle: error.cycle } : {})
        });
    }

    if (error.type === "entity.parse.failed") {
        return res.status(400).json({ message: "JSON không hợp lệ" });
    }
    if (error.type === "entity.too.large") {
        return res.status(413).json({ message: "Dữ liệu gửi lên quá lớn" });
    }

    if (req.app.get("env") === "development") {
        // PostgreSQL detail may contain the rejected row, including password_hash.
        // Log only diagnostic fields; never dump the error object or request data.
        console.error("[backend:error]", {
            method: req.method,
            path: req.path,
            operation: error.operation,
            code: error.code,
            message: error.message,
            schema: error.schema,
            table: error.table,
            column: error.column,
            constraint: error.constraint,
            stack: error.stack,
            ...(["42P01", "42703"].includes(error.code) ? {
                hint: "Check npm run migrate:status, apply pending migrations, then run npm run seed:roles."
            } : {})
        });
    }
    return res.status(500).json({ message: "Đã xảy ra lỗi, vui lòng thử lại" });
}

module.exports = errorHandler;

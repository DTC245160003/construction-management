function problem(status, message) {
    return Object.assign(new Error(message), { status, expose: true });
}
function text(value, label, max = 255, optional = false) {
    if (optional && (value == null || (typeof value === "string" && !value.trim()))) return "";
    if (typeof value !== "string" || !value.trim() || value.trim().length > max) {
        throw problem(400, `${label} phải có từ 1 đến ${max} ký tự`);
    }
    return value.trim();
}
function id(value) {
    if (!Number.isInteger(value) || value < 1 || value > 2147483647) throw problem(400, "Mã đối tượng không hợp lệ");
    return value;
}
function date(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)
        || value < "1900-01-01" || value > "9999-12-31"
        || !Number.isFinite(Date.parse(`${value}T00:00:00Z`))
        || new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value) {
        throw problem(400, "Ngày không hợp lệ (YYYY-MM-DD)");
    }
    return value;
}
function quantity(value) {
    if (typeof value !== "number" || !Number.isFinite(value) || value <= 0 || value > 99999999999999
        || Math.abs(value * 10000 - Math.round(value * 10000)) > 0.0001) {
        throw problem(400, "Khối lượng phải lớn hơn 0 và có tối đa 4 chữ số thập phân");
    }
    return value;
}
module.exports = { problem, text, id, date, quantity };

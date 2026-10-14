const v = require("./operationValidation");
const { createHash } = require("node:crypto");
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
function decimal(value, scale = 2, allowZero = false) {
    const result = typeof value === "number" && Number.isFinite(value) ? String(value) : value;
    if (typeof result !== "string" || !new RegExp(`^\\d{1,14}(\\.\\d{1,${scale}})?$`).test(result) || (!allowZero && /^0+(\.0+)?$/.test(result))) {
        throw v.problem(400, `Số phải ${allowZero ? "không âm" : "lớn hơn 0"}, tối đa 14 chữ số nguyên và ${scale} chữ số thập phân`);
    }
    return result;
}
function scaled(value, scale = 4) {
    const [whole, fraction = ""] = String(value).split(".");
    return BigInt(whole) * (10n ** BigInt(scale)) + BigInt(fraction.padEnd(scale,"0").slice(0,scale));
}
function formatted(value, scale = 2) {
    const negative = value < 0n;
    const digits = (negative ? -value : value).toString().padStart(scale+1,"0");
    return `${negative ? "-" : ""}${digits.slice(0,-scale)}.${digits.slice(-scale)}`;
}
function uuid(value) { if (typeof value !== "string" || !uuidPattern.test(value)) throw v.problem(400,"Mã đồng bộ không hợp lệ"); return value.toLowerCase(); }
function ids(value = [], max = 20) { if (!Array.isArray(value) || value.length > max) throw v.problem(400,`Chọn tối đa ${max} đối tượng`); value.forEach(v.id); return [...new Set(value)].sort((a,b) => a-b); }
function revision(actual, expected) { if (!Number.isInteger(expected) || actual !== expected) throw v.problem(409,"Dữ liệu đã thay đổi. Tải lại trước khi lưu để tránh ghi đè."); }
const hash = (data) => createHash("sha256").update(typeof data === "string" || Buffer.isBuffer(data) ? data : JSON.stringify(data)).digest("hex");
module.exports = { ...v, decimal, scaled, formatted, uuid, ids, revision, hash };

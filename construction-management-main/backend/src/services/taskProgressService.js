const failure = (message, status = 400) => Object.assign(new Error(message), { status, expose: true });

function nullableDate(value, label) {
    if (value == null || value === "") return null;
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) throw failure(`${label} phải có định dạng YYYY-MM-DD`);
    const parsed = new Date(`${value}T00:00:00Z`);
    if (!Number.isFinite(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value || value.startsWith("0000")) throw failure(`${label} không hợp lệ`);
    return value;
}

function createTaskProgressService({ model }) {
    return {
        async updateProgress(projectId, taskId, body) {
            if (!Number.isInteger(taskId) || taskId < 1 || taskId > 2147483647) throw failure("Mã công việc hoặc hạng mục không hợp lệ");
            if (!body || typeof body !== "object" || Array.isArray(body)) throw failure("Dữ liệu không hợp lệ");
            const update = async transaction => {
                const current = await transaction.findById(projectId, taskId);
                if (!current) throw failure("Không tìm thấy công việc", 404);
                const supplied = (canonical, camel, legacy) => Object.hasOwn(body, canonical) ? body[canonical]
                    : Object.hasOwn(body, camel) ? body[camel] : Object.hasOwn(body, legacy) ? body[legacy] : current[canonical];
                const values = {
                    actual_start: nullableDate(supplied("actual_start", "actualStart", "actual_start_date"), "Ngày bắt đầu thực tế"),
                    actual_finish: nullableDate(supplied("actual_finish", "actualEnd", "actual_end_date"), "Ngày kết thúc thực tế"),
                    progress_percent: supplied("progress_percent", "percentComplete", "percent_complete") ?? 0
                };
                if (values.actual_start && values.actual_finish && values.actual_finish < values.actual_start) throw failure("Ngày kết thúc thực tế không được sớm hơn ngày bắt đầu thực tế");
                if (!Number.isInteger(values.progress_percent) || values.progress_percent < 0 || values.progress_percent > 100) throw failure("Phần trăm hoàn thành phải nằm trong khoảng 0 đến 100");
                const saved = await transaction.updateProgress(projectId, taskId, values);
                if (!saved) throw failure("Không tìm thấy công việc", 404);
                return saved;
            };
            return model.withProjectTransaction ? model.withProjectTransaction(projectId, update) : update(model);
        }
    };
}
module.exports = { createTaskProgressService };

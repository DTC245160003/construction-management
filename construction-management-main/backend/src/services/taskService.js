const { buildGraph, topologicalSort, createCycleError } = require("./scheduleService");

const MAX_INTEGER = 2147483647;
const TYPES = ["FS", "SS", "FF", "SF"];

function inputError(message, status = 400) {
    return Object.assign(new Error(message), { status, expose: true });
}

function positiveInteger(value) {
    return Number.isInteger(value) && value > 0 && value <= MAX_INTEGER;
}

function validateId(value) {
    if (!positiveInteger(value)) throw inputError("Mã công việc hoặc hạng mục không hợp lệ");
}

async function translateErrors(operation) {
    try {
        return await operation();
    } catch (error) {
        if (error.code === "ITEM_NOT_FOUND") throw inputError("Không tìm thấy hạng mục trong dự án", 404);
        if (error.code === "ITEM_NOT_LEAF") throw inputError("Chỉ được gắn công việc vào hạng mục lá");
        if (error.code === "23505" && error.constraint === "dependencies_pair_key") {
            throw inputError("Cặp công việc trước và sau đã có quan hệ phụ thuộc", 409);
        }
        if (error.code === "23503") throw inputError("Công việc hoặc hạng mục không còn tồn tại", 409);
        if (error.code === "23514" && (error.constraint === "tasks_actual_dates_check" || String(error.message).includes("tasks_actual_dates_check"))) {
            throw inputError("Ngày kết thúc thực tế không được sớm hơn ngày bắt đầu");
        }
        if (error.code === "23514" && (error.constraint === "tasks_progress_percent_check" || String(error.message).includes("tasks_progress_percent_check"))) {
            throw inputError("Tiến độ phải là số nguyên từ 0 đến 100");
        }
        if (error.code === "23514") throw inputError("Thời lượng hoặc quan hệ phụ thuộc không hợp lệ");
        throw error;
    }
}

function createTaskService({ model }) {
    return {
        list: (projectId) => model.list(projectId),
        listDependencies: (projectId) => model.listDependencies(projectId),

        async save(projectId, taskId, body) {
            if (!body || typeof body !== "object" || Array.isArray(body)) throw inputError("Dữ liệu không hợp lệ");
            let current = {};
            if (taskId != null) {
                validateId(taskId);
                current = await model.findById(projectId, taskId);
                if (!current) throw inputError("Không tìm thấy công việc", 404);
            }
            const values = {
                work_item_id: body.work_item_id === undefined ? current.work_item_id : body.work_item_id,
                name: body.name === undefined ? current.name : body.name,
                duration_days: body.duration_days === undefined ? current.duration_days : body.duration_days,
                actual_start: body.actual_start === undefined ? (current.actual_start || null) : (body.actual_start || null),
                actual_finish: body.actual_finish === undefined ? (current.actual_finish || null) : (body.actual_finish || null),
                progress_percent: body.progress_percent === undefined ? (current.progress_percent ?? 0) : Number(body.progress_percent)
            };
            validateId(values.work_item_id);
            if (typeof values.name !== "string" || !values.name.trim() || values.name.trim().length > 255) {
                throw inputError("Tên công việc phải có từ 1 đến 255 ký tự");
            }
            if (!positiveInteger(values.duration_days)) {
                throw inputError("Thời lượng phải là số nguyên ngày lớn hơn 0");
            }
            if (!Number.isInteger(values.progress_percent) || values.progress_percent < 0 || values.progress_percent > 100) {
                throw inputError("Tiến độ phải là số nguyên từ 0 đến 100");
            }
            if (values.actual_start && values.actual_finish && values.actual_finish < values.actual_start) {
                throw inputError("Ngày kết thúc thực tế không được sớm hơn ngày bắt đầu");
            }
            values.name = values.name.trim();
            const task = await translateErrors(() => model.save(projectId, taskId, values));
            if (!task) throw inputError("Không tìm thấy công việc", 404);
            return task;
        },

        async addDependency(projectId, successorId, body) {
            validateId(successorId);
            if (!body || typeof body !== "object") throw inputError("Dữ liệu không hợp lệ");
            const { predecessor_task_id, dependency_type, lag_days = 0 } = body;
            validateId(predecessor_task_id);
            if (predecessor_task_id === successorId) throw inputError("Công việc không thể phụ thuộc chính nó");
            if (!TYPES.includes(dependency_type)) throw inputError("Loại quan hệ phải là FS, SS, FF hoặc SF");
            if (!Number.isInteger(lag_days) || lag_days < -2147483648 || lag_days > MAX_INTEGER) {
                throw inputError("Độ trễ phải là số nguyên ngày (có thể âm)");
            }
            return translateErrors(() => model.withProjectTransaction(projectId, async (transaction) => {
                const tasks = await transaction.list(projectId);
                const dependencies = await transaction.listDependencies(projectId);
                if (!tasks.some((task) => task.id === predecessor_task_id)
                    || !tasks.some((task) => task.id === successorId)) {
                    throw inputError("Hai công việc phải tồn tại trong cùng dự án", 404);
                }
                if (dependencies.some((edge) => edge.predecessor_task_id === predecessor_task_id
                    && edge.successor_task_id === successorId)) {
                    throw inputError("Cặp công việc trước và sau đã có quan hệ phụ thuộc", 409);
                }
                const candidate = { predecessor_task_id, successor_task_id: successorId, dependency_type, lag_days };
                const graph = buildGraph(tasks, [...dependencies, candidate]);
                const sorted = topologicalSort(graph);
                if (sorted.hasCycle) throw createCycleError(graph, sorted.cycleTasks, successorId);
                const dependency = await transaction.createDependency(projectId, successorId, candidate);
                if (!dependency) throw inputError("Hai công việc phải tồn tại trong cùng dự án", 404);
                return dependency;
            }));
        },

        async removeDependency(projectId, taskId, dependencyId) {
            validateId(taskId);
            validateId(dependencyId);
            await model.withProjectTransaction(projectId, async (transaction) => {
                if (!await transaction.removeDependency(projectId, taskId, dependencyId)) {
                    throw inputError("Không tìm thấy quan hệ phụ thuộc", 404);
                }
            });
        }
    };
}

module.exports = { createTaskService };

const { createTaskModel } = require("../models/taskModel");
const { calculateScheduleCPM } = require("./cpmService");

// Normalize database rows into the existing CPM task/dependency interface.
// All structures and records are new: callers retain ownership of their input.
function buildGraph(taskRows, dependencyRows) {
    const tasks = new Map();
    const adjacency = new Map();
    const reverseAdjacency = new Map();
    const indegree = new Map();
    for (const row of taskRows) {
        if (tasks.has(row.id)) throw new Error(`Duplicate task: ${row.id}`);
        tasks.set(row.id, { ...row, duration: row.duration_days, dependencies: [] });
        adjacency.set(row.id, []);
        reverseAdjacency.set(row.id, []);
        indegree.set(row.id, 0);
    }
    for (const row of dependencyRows) {
        const predecessorId = row.predecessor_task_id;
        const successorId = row.successor_task_id;
        if (!tasks.has(predecessorId) || !tasks.has(successorId)) {
            throw new Error("Dependency references a task outside the graph");
        }
        adjacency.get(predecessorId).push(successorId);
        reverseAdjacency.get(successorId).push(predecessorId);
        indegree.set(successorId, indegree.get(successorId) + 1);
        tasks.get(successorId).dependencies.push({
            predecessorId, type: row.dependency_type, lag: row.lag_days
        });
    }
    return { tasks, adjacency, reverseAdjacency, indegree };
}

// Only inspect Kahn's residual subgraph. Iterative strongly connected components
// distinguish cycles from downstream tails AND bridges between separate cycles.
function cycleTasksInResidual(graph, residual) {
    const visited = new Set();
    const finishOrder = [];
    for (const start of residual) {
        if (visited.has(start)) continue;
        visited.add(start);
        const stack = [{ id: start, next: 0 }];
        while (stack.length) {
            const frame = stack[stack.length - 1];
            const successors = graph.adjacency.get(frame.id);
            if (frame.next === successors.length) {
                finishOrder.push(frame.id);
                stack.pop();
                continue;
            }
            const next = successors[frame.next++];
            if (residual.has(next) && !visited.has(next)) {
                visited.add(next);
                stack.push({ id: next, next: 0 });
            }
        }
    }

    const assigned = new Set();
    const cycleTasks = [];
    for (let index = finishOrder.length - 1; index >= 0; index--) {
        const start = finishOrder[index];
        if (assigned.has(start)) continue;
        const component = [];
        const stack = [start];
        assigned.add(start);
        while (stack.length) {
            const id = stack.pop();
            component.push(id);
            for (const predecessor of graph.reverseAdjacency.get(id)) {
                if (residual.has(predecessor) && !assigned.has(predecessor)) {
                    assigned.add(predecessor);
                    stack.push(predecessor);
                }
            }
        }
        if (component.length > 1 || graph.adjacency.get(start).includes(start)) {
            for (const id of component) cycleTasks.push(id);
        }
    }
    return cycleTasks;
}

function topologicalSort(graph) {
    const indegree = new Map(graph.indegree);
    const queue = [];
    const order = [];
    for (const [id, degree] of indegree) {
        if (degree === 0) queue.push(id);
    }
    // A queue head avoids Array.shift's repeated copying. No recursion.
    for (let head = 0; head < queue.length; head++) {
        const id = queue[head];
        order.push(id);
        for (const successor of graph.adjacency.get(id)) {
            const degree = indegree.get(successor) - 1;
            indegree.set(successor, degree);
            if (degree === 0) queue.push(successor);
        }
    }
    const hasCycle = order.length < graph.tasks.size;
    const residual = new Set();
    if (hasCycle) {
        for (const [id, degree] of indegree) {
            if (degree > 0) residual.add(id);
        }
    }
    return {
        order,
        sortedTasks: order.map((id) => graph.tasks.get(id)),
        hasCycle,
        cycleTasks: hasCycle ? cycleTasksInResidual(graph, residual) : []
    };
}

async function loadProjectGraph(source, projectId) {
    const model = typeof source.query === "function" ? createTaskModel(source) : source;
    // Exactly two SELECTs, independent of task count; no per-task queries.
    const tasks = await model.list(projectId);
    const dependencies = await model.listDependencies(projectId);
    return buildGraph(tasks, dependencies);
}

// Find an actual closed walk in reverse ("waits for") order. An SCC's array
// order alone is not a valid path, especially with multiple separate cycles.
function createCycleError(graph, cycleTasks, preferredStart) {
    const allowed = new Set(cycleTasks);
    const visited = new Set();
    const starts = allowed.has(preferredStart)
        ? [preferredStart, ...cycleTasks.filter((id) => id !== preferredStart)] : cycleTasks;
    let cycleIds = [];
    for (const start of starts) {
        if (visited.has(start)) continue;
        const positions = new Map([[start, 0]]);
        const stack = [{ id: start, next: 0 }];
        visited.add(start);
        while (stack.length && cycleIds.length === 0) {
            const frame = stack[stack.length - 1];
            const predecessors = graph.reverseAdjacency.get(frame.id);
            if (frame.next === predecessors.length) {
                positions.delete(frame.id);
                stack.pop();
                continue;
            }
            const next = predecessors[frame.next++];
            if (!allowed.has(next)) continue;
            if (positions.has(next)) {
                cycleIds = stack.slice(positions.get(next)).map((entry) => entry.id);
            } else if (!visited.has(next)) {
                visited.add(next);
                positions.set(next, stack.length);
                stack.push({ id: next, next: 0 });
            }
        }
        if (cycleIds.length) break;
    }
    const cycle = cycleIds.map((id) => ({ id, name: graph.tasks.get(id).name }));
    const message = "Phát hiện vòng phụ thuộc: " + cycle.map((task, index) => {
        const next = cycle[(index + 1) % cycle.length];
        return `Công việc "${task.name}" ${index === cycle.length - 1 ? "lại chờ" : "chờ"} "${next.name}"`;
    }).join(", ") + ".";
    return Object.assign(new Error(message), { status: 422, expose: true, cycle });
}

const { workingDate, countWorkingDays, countWorkingDaysInclusive } = require("./workingCalendar");

const vietnamDay = (value = new Date()) => new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit"
}).format(value instanceof Date ? value : new Date(value));

function actualOffset(value, info, finish = false) {
    if (value == null) return null;
    if (typeof value === "number") return value;
    const origin = info?.project?.start_date;
    const workingDays = info?.calendar?.working_days;
    if (!origin || !workingDays?.length) return null;
    const date = /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : vietnamDay(value);
    // Start offsets count [project start, actual start); finish offsets include
    // the actual finish day. An actual start on the project start is exactly 0.
    const boundaryDate = new Date(`${date}T00:00:00Z`);
    if (finish) boundaryDate.setUTCDate(boundaryDate.getUTCDate() + 1);
    const boundary = boundaryDate.toISOString().slice(0, 10);
    if (boundary === origin) return 0;
    const end = new Date(`${boundary > origin ? boundary : origin}T00:00:00Z`);
    end.setUTCDate(end.getUTCDate() - 1);
    const count = countWorkingDaysInclusive(boundary > origin ? origin : boundary,
        end.toISOString().slice(0, 10), workingDays, info.holidays);
    return boundary > origin ? count : -count;
}

function traceCriticalPath(endTaskId, allTasks, dependencies) {
    const taskMap = new Map(allTasks.map(t => [t.id, t]));
    const predMap = new Map();
    for (const d of dependencies) {
        if (!predMap.has(d.successor_task_id)) predMap.set(d.successor_task_id, []);
        predMap.get(d.successor_task_id).push(d.predecessor_task_id);
    }

    const path = [];
    let currentId = endTaskId;
    const visited = new Set();

    while (currentId && !visited.has(currentId)) {
        visited.add(currentId);
        const task = taskMap.get(currentId);
        if (task) path.unshift(task.name);

        const preds = predMap.get(currentId) || [];
        // Look for predecessor that is critical or has matching finish time
        let nextPredId = null;
        for (const pid of preds) {
            const pTask = taskMap.get(pid);
            if (pTask && (pTask.isCritical || pTask.ef === task?.es)) {
                nextPredId = pid;
                break;
            }
        }
        if (!nextPredId && preds.length > 0) {
            nextPredId = preds[0];
        }
        currentId = nextPredId;
    }
    return path;
}

async function checkMilestonesAndAlerts(transaction, projectId) {
    if (!transaction.listMilestones) return;
    const milestones = await transaction.listMilestones(projectId);
    if (!milestones.length) return;

    const { project, calendar, holidays } = await transaction.getProjectCalendarInfo(projectId);
    if (!project || !project.start_date || !calendar) return;

    const workingDays = calendar.working_days || [1, 2, 3, 4, 5, 6];
    const holidayList = holidays || [];

    const allTasks = await transaction.listResults(projectId, false);
    const dependencies = await transaction.tasks.listDependencies(projectId);

    // Get all work items to build subtree map
    const workItemsRes = await transaction.pool.query(
        "SELECT id, parent_id FROM work_items WHERE project_id = $1",
        [projectId]
    );
    const workItems = workItemsRes.rows;

    function getSubtreeWorkItemIds(rootId) {
        const result = new Set([rootId]);
        let added = true;
        while (added) {
            added = false;
            for (const item of workItems) {
                if (item.parent_id && result.has(item.parent_id) && !result.has(item.id)) {
                    result.add(item.id);
                    added = true;
                }
            }
        }
        return result;
    }

    for (const milestone of milestones) {
        const subtreeItemIds = getSubtreeWorkItemIds(milestone.work_item_id);
        const subtreeTasks = allTasks.filter(t => subtreeItemIds.has(t.work_item_id));

        if (!subtreeTasks.length) {
            await transaction.syncMilestoneAlert(projectId, milestone.id, milestone.work_item_id, 0, []);
            continue;
        }

        // Find task with maximum early finish (EF)
        let maxEfTask = subtreeTasks[0];
        for (const task of subtreeTasks) {
            if (task.ef > maxEfTask.ef) {
                maxEfTask = task;
            }
        }

        // Calculate early finish date using workingCalendar
        // Note: CPM ef is length from day 0, workingDate converts offset (ef - 1) to date
        const earlyFinishDate = workingDate(project.start_date, maxEfTask.ef - 1, workingDays, holidayList);

        if (!earlyFinishDate || earlyFinishDate <= milestone.target_date) {
            // Not late -> resolve alert if any
            await transaction.syncMilestoneAlert(projectId, milestone.id, milestone.work_item_id, 0, []);
        } else {
            // Overdue! Count working days exceeded
            const overdueDays = countWorkingDays(milestone.target_date, earlyFinishDate, workingDays, holidayList);
            const criticalPath = traceCriticalPath(maxEfTask.id, allTasks, dependencies);

            await transaction.syncMilestoneAlert(
                projectId,
                milestone.id,
                milestone.work_item_id,
                overdueDays > 0 ? overdueDays : 1,
                criticalPath
            );
        }
    }
}

async function ensureProjectSchedule(transaction, project, projectId) {
    // In-progress forecasts depend on today's working-day offset, even when no
    // task was edited since the previous read.
    const hasOngoing = !project.schedule_needs_recalc && transaction.hasOngoingActuals
        ? await transaction.hasOngoingActuals(projectId) : false;
    if (project.schedule_needs_recalc || hasOngoing) {
        const graph = await loadProjectGraph(transaction.tasks, projectId);
        const sorted = topologicalSort(graph);
        if (sorted.hasCycle) throw createCycleError(graph, sorted.cycleTasks);
        const info = transaction.getProjectCalendarInfo ? await transaction.getProjectCalendarInfo(projectId) : null;
        const tasks = sorted.sortedTasks.map(task => ({ ...task,
            actual_start: actualOffset(task.actual_start, info),
            actual_finish: actualOffset(task.actual_finish, info, true)
        }));
        const options = { today: actualOffset(vietnamDay(), info) ?? 0 };
        const results = tasks.length > 200
            ? await require("./cpmService").calculateScheduleCPMAsync(tasks, options)
            : tasks.length ? calculateScheduleCPM(tasks, options) : new Map();
        await transaction.replaceResults(projectId, [...results.values()]);
    }
    // After schedule is calculated or confirmed clean, evaluate milestones and alerts (T-44)
    await checkMilestonesAndAlerts(transaction, projectId);
}

function createScheduleService({ model }) {
    return {
        async getSchedule(projectId, { criticalOnly = false } = {}) {
            return model.withProjectTransaction(projectId, async (transaction, project) => {
                await ensureProjectSchedule(transaction, project, projectId);
                const schedule = await transaction.listResults(projectId, criticalOnly);
                const allResults = criticalOnly ? await transaction.listResults(projectId, false) : schedule;
                const plannedFinish = Math.max(0, ...allResults.map(task => task.plannedEf ?? task.ef));
                const currentFinish = Math.max(0, ...allResults.map(task => task.ef));
                schedule.summary = { plannedFinish, currentFinish, delayDays: currentFinish - plannedFinish };
                return schedule;
            });
        },

        async saveBaseline(projectId, userId) {
            return model.withProjectTransaction(projectId, async (transaction, project) => {
                await ensureProjectSchedule(transaction, project, projectId);
                return transaction.saveBaseline(projectId, userId);
            });
        },

        async getBaselineHistory(projectId) {
            return model.withProjectTransaction(projectId, async (transaction) => {
                return transaction.baselineHistory(projectId);
            });
        },

        async listMilestones(projectId) {
            return model.withProjectTransaction(projectId, async (transaction) => {
                return transaction.listMilestones(projectId);
            });
        },

        async createMilestone(projectId, userId, data) {
            return model.withProjectTransaction(projectId, async (transaction) => {
                const milestone = await transaction.createMilestone(projectId, userId, data);
                await checkMilestonesAndAlerts(transaction, projectId);
                return milestone;
            });
        },

        async deleteMilestone(projectId, milestoneId) {
            return model.withProjectTransaction(projectId, async (transaction) => {
                const res = await transaction.deleteMilestone(projectId, milestoneId);
                return res;
            });
        },

        async listMilestoneAlerts(projectId, status = null) {
            return model.withProjectTransaction(projectId, async (transaction) => {
                return transaction.listMilestoneAlerts(projectId, status);
            });
        }
    };
}

module.exports = {
    buildGraph,
    topologicalSort,
    loadProjectGraph,
    createCycleError,
    createScheduleService,
    ensureProjectSchedule,
    traceCriticalPath,
    checkMilestonesAndAlerts
};

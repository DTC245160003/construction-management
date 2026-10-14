const v = require("./operationValidation");
const { randomBytes,createHash } = require("node:crypto");
const inviteToken = () => randomBytes(32).toString("hex");
const tokenHash = (token) => createHash("sha256").update(token).digest("hex");
const { workingDate } = require("./workingCalendar");
const MANAGERS = ["admin", "project_manager", "manager"];
const workerId = (actor) => actor.role === "worker" ? actor.id : null;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const MEMBER_ROLES = ["admin", "manager", "project_manager", "engineer", "worker", "accountant", "viewer"];

function peakAssignments(tasks, task) {
    const events = [];
    for (const entry of tasks) {
        if (entry.team_id !== task.team_id || entry.ef <= task.es || entry.es >= task.ef) continue;
        events.push([Math.max(entry.es, task.es), 1], [Math.min(entry.ef, task.ef), -1]);
    }
    events.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    let count = 0;
    let peak = 0;
    for (const [, delta] of events) { count += delta; peak = Math.max(peak, count); }
    return peak;
}
function projectValues(body) {
    return { name: v.text(body.name, "Tên dự án"), location: v.text(body.location, "Địa điểm", 1000), start_date: v.date(body.start_date) };
}
function createProjectOperationsService({ model }) {
    async function transaction(projectId, operation) {
        try { return await model.transaction(projectId, operation); }
        catch (error) {
            if (error.code === "23505") throw v.problem(409, "Dữ liệu đã tồn tại. Vui lòng kiểm tra ngày nghỉ, tên đội hoặc mã gửi báo cáo.");
            if (error.code === "23503") throw v.problem(409, "Đối tượng liên quan không còn tồn tại trong dự án");
            throw error;
        }
    }
    async function requireTask(tx, projectId, taskId, actor) {
        const task = await tx.task(projectId, v.id(taskId));
        if (!task) throw v.problem(404, "Không tìm thấy công việc trong dự án");
        if (actor.role === "worker") {
            const teams = await tx.teams(projectId, actor.id);
            if (!teams.some((team) => team.id === task.team_id)) throw v.problem(403, "Bạn chỉ được truy cập công việc của đội mình");
        }
        return task;
    }
    return {
        listProjects: (userId,allProjects=false) => model.listProjects(userId,allProjects),
        async createProject(actor, body) {
            if (actor.system_role !== "super_admin") throw v.problem(403, "Chỉ Super Admin được tạo dự án");
            return model.createProject(actor.id, projectValues(body));
        },
        async project(projectId, actor) {
            const project = await model.project(projectId);
            if (!project) throw v.problem(404, "Không tìm thấy dự án");
            return { ...project, member_role: actor.role };
        },
        async updateProject(projectId, actor, body) {
            const values = projectValues(body);
            if (!["planned", "active", "on_hold", "completed"].includes(body.status)) throw v.problem(400, "Trạng thái dự án không hợp lệ");
            values.status = body.status;
            return transaction(projectId, async (tx) => {
                const previous = await tx.project(projectId);
                const project = await tx.updateProject(projectId, values);
                await tx.audit(projectId, actor.id, "projects", "update", projectId, previous, values);
                return project;
            });
        },
        async calendar(projectId) {
            return transaction(projectId, async (tx) => ({ calendar: await tx.calendar(projectId), holidays: await tx.holidays(projectId) }));
        },
        async saveCalendar(projectId, actor, body) {
            const days = body.working_days;
            if (!Array.isArray(days) || days.length < 1 || days.length > 7 || new Set(days).size !== days.length
                || days.some((day) => !Number.isInteger(day) || day < 0 || day > 6)) {
                throw v.problem(400, "Chọn ít nhất một ngày làm việc và không lặp ngày");
            }
            v.id(body.revision);
            return transaction(projectId, async (tx) => {
                const previous = await tx.calendar(projectId);
                const calendar = await tx.updateCalendar(projectId, [...days].sort(), body.revision);
                if (!calendar) throw v.problem(409, "Lịch đã được người khác cập nhật. Hãy tải lại trước khi lưu.");
                await tx.audit(projectId, actor.id, "calendar", "update", projectId, previous, calendar);
                return calendar;
            });
        },
        async saveHoliday(projectId, actor, holidayId, body) {
            if (holidayId !== null) v.id(holidayId);
            const values = { day: v.date(body.day), name: v.text(body.name, "Tên ngày nghỉ"), notes: v.text(body.notes, "Ghi chú", 2000, true) };
            return transaction(projectId, async (tx) => {
                const previous = holidayId ? await tx.holiday(projectId, holidayId) : null;
                if (holidayId && !previous) throw v.problem(404, "Không tìm thấy ngày nghỉ");
                const holiday = await tx.saveHoliday(projectId, holidayId, values);
                await tx.audit(projectId, actor.id, "calendar", holidayId ? "update_holiday" : "create_holiday", holiday.id, previous, holiday);
                return holiday;
            });
        },
        async deleteHoliday(projectId, actor, holidayId) {
            v.id(holidayId);
            return transaction(projectId, async (tx) => {
                const previous = await tx.holiday(projectId, holidayId);
                if (!previous) throw v.problem(404, "Không tìm thấy ngày nghỉ");
                await tx.deleteHoliday(projectId, holidayId);
                await tx.audit(projectId, actor.id, "calendar", "delete_holiday", holidayId, previous, null);
            });
        },
        participants: (projectId) => model.participants(projectId),
        async members(projectId, actor) {
            const data = await model.memberOverview(projectId);
            return { ...data, can_manage: MANAGERS.includes(actor.role), current_user_id: actor.id };
        },
        async inviteMember(projectId, actor, body) {
            const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
            if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || email.length > 255) throw v.problem(400, "Email không hợp lệ");
            if (!MEMBER_ROLES.includes(body.role)) throw v.problem(400, "Vai trò dự án không hợp lệ");
            return transaction(projectId, async (tx) => {
                const role = await tx.roleByName(body.role);
                if (!role) throw v.problem(409, "Vai trò chưa được cấu hình trong cơ sở dữ liệu");
                const user = await tx.userByEmail(email);
                if (user) {
                    if (await tx.member(projectId,user.id)) throw v.problem(409, "Người dùng đã là thành viên dự án");
                    await tx.addMember(projectId,user.id,role.id);
                    await tx.audit(projectId,actor.id,"members","add",user.id,null,{ email,role:role.name });
                    return { kind:"member",member:{ ...user,role:role.name,status:"active",team:"",last_login_at:null } };
                }
                const token=inviteToken();
                const invitation = await tx.createInvitation(projectId,email,role.id,actor.id,tokenHash(token));
                await tx.audit(projectId,actor.id,"members","invite",invitation.id,null,{ email,role:role.name });
                return { kind:"invitation",invitation:{ ...invitation,role:role.name },acceptance_path:`/accept-invitation?token=${token}&email=${encodeURIComponent(email)}` };
            });
        },
        async changeMemberRole(projectId,actor,userId,body) {
            v.id(userId);
            if (!MEMBER_ROLES.includes(body.role)) throw v.problem(400,"Vai trò dự án không hợp lệ");
            return transaction(projectId,async (tx) => {
                const previous=await tx.member(projectId,userId);
                if (!previous) throw v.problem(404,"Không tìm thấy thành viên trong dự án");
                const role=await tx.roleByName(body.role);
                if (!role) throw v.problem(409,"Vai trò chưa được cấu hình trong cơ sở dữ liệu");
                if (MANAGERS.includes(previous.role) && !MANAGERS.includes(role.name) && await tx.managerCount(projectId)<=1)
                    throw v.problem(409,"Không thể đổi vai trò của người quản lý cuối cùng trong dự án");
                await tx.updateMemberRole(projectId,userId,role.id);
                const member={ ...previous,role:role.name };
                await tx.audit(projectId,actor.id,"members","change_role",userId,previous,member);
                return member;
            });
        },
        async removeMember(projectId,actor,userId) {
            v.id(userId);
            return transaction(projectId,async (tx) => {
                const previous=await tx.member(projectId,userId);
                if (!previous) throw v.problem(404,"Không tìm thấy thành viên trong dự án");
                if (MANAGERS.includes(previous.role) && await tx.managerCount(projectId)<=1)
                    throw v.problem(409,"Không thể gỡ người quản lý cuối cùng khỏi dự án");
                await tx.removeMember(projectId,userId);
                await tx.audit(projectId,actor.id,"members","remove",userId,previous,null);
            });
        },
        async cancelInvitation(projectId,actor,invitationId) {
            v.id(invitationId);
            return transaction(projectId,async (tx) => {
                const previous=await tx.invitation(projectId,invitationId);
                if (!previous) throw v.problem(404,"Không tìm thấy lời mời đang chờ");
                await tx.cancelInvitation(projectId,invitationId);
                await tx.audit(projectId,actor.id,"members","cancel_invitation",invitationId,previous,null);
            });
        },
        async renewInvitation(projectId,actor,invitationId) {
            v.id(invitationId);
            return transaction(projectId,async (tx) => {
                const token=inviteToken();
                const invitation=await tx.renewInvitation(projectId,invitationId,tokenHash(token));
                if (!invitation) throw v.problem(404,"Không tìm thấy lời mời đang chờ");
                await tx.audit(projectId,actor.id,"members","renew_invitation",invitationId,null,{ expires_at:invitation.expires_at });
                return { invitation,acceptance_path:`/accept-invitation?token=${token}&email=${encodeURIComponent(invitation.email)}` };
            });
        },
        teams: (projectId, actor) => model.teams(projectId, workerId(actor)),
        async createTeam(projectId, actor, body) {
            const name = v.text(body.name, "Tên đội");
            if (!Array.isArray(body.member_ids) || body.member_ids.length === 0 || body.member_ids.length > 200) throw v.problem(400, "Chọn từ 1 đến 200 thành viên cho đội");
            body.member_ids.forEach(v.id);
            const ids = [...new Set(body.member_ids)];
            return transaction(projectId, async (tx) => {
                const members = await tx.participants(projectId);
                if (ids.some((id) => !members.some((member) => member.id === id))) throw v.problem(422, "Mọi thành viên đội phải thuộc dự án");
                const team = await tx.createTeam(projectId, name, ids);
                await tx.audit(projectId, actor.id, "assignments", "create_team", team.id, null, { name, member_ids: ids });
                return team;
            });
        },
        async assignments(projectId, actor) {
            return transaction(projectId, async (tx, lock) => {
                const project = await tx.project(projectId);
                const calendar = await tx.calendar(projectId);
                const holidays = await tx.holidays(projectId);
                const teams = await tx.teams(projectId, workerId(actor));
                let tasks = await tx.fieldTasks(projectId, lock, workerId(actor));
                if (actor.role === "worker") tasks = tasks.filter((task) => teams.some((team) => team.id === task.team_id));
                const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh" }).format(new Date());
                tasks = tasks.map((task) => {
                    const start_date = workingDate(project.start_date, task.es, calendar.working_days, holidays.map((day) => day.day));
                    const finish_date = workingDate(project.start_date, task.ef - 1, calendar.working_days, holidays.map((day) => day.day));
                    const status = task.planned_quantity && task.reported_quantity >= task.planned_quantity ? "completed" : task.reported_quantity > 0 ? "active" : "planned";
                    return { ...task, start_date, finish_date, status, is_late: Boolean(finish_date && finish_date < today && status !== "completed") };
                });
                tasks.sort((a,b) => (a.start_date || "").localeCompare(b.start_date || "") || a.id-b.id);
                return { tasks, teams, member_role: actor.role, can_manage: MANAGERS.includes(actor.role), project };
            });
        },
        async assign(projectId, actor, taskId, body) {
            v.id(body.team_id);
            return transaction(projectId, async (tx, lock) => {
                const task = await requireTask(tx, projectId, taskId, actor);
                const teams = await tx.teams(projectId);
                if (!teams.some((team) => team.id === body.team_id)) throw v.problem(404, "Đội không thuộc dự án");
                if (task.team_id === body.team_id) return { changed: false, warning: null };
                const result = await tx.assign(projectId, taskId, body.team_id, actor.id, task.team_id);
                await tx.audit(projectId, actor.id, "assignments", "assign_team", taskId, { team_id: task.team_id }, { team_id: body.team_id });
                const tasks = await tx.fieldTasks(projectId, lock);
                const assigned = tasks.find((entry) => entry.id === taskId);
                const peak = peakAssignments(tasks, assigned);
                return { assignment: result, changed: true, warning: peak > 3 ? `Đội có ${peak} công việc chồng thời gian. Phân công đã được lưu; vui lòng kiểm tra tải của đội.` : null };
            });
        },
        async details(projectId, actor, taskId) {
            return transaction(projectId, async (tx) => {
                const task = await requireTask(tx, projectId, taskId, actor);
                return { task, history: actor.role === "worker" ? [] : await tx.assignmentHistory(projectId, taskId),
                    progress: await tx.progress(projectId, taskId, workerId(actor)), issues: await tx.issues(projectId, taskId, workerId(actor)) };
            });
        },
        async saveQuantity(projectId, actor, taskId, body) {
            const values = { planned_quantity: v.quantity(body.planned_quantity), unit: v.text(body.unit, "Đơn vị", 30) };
            return transaction(projectId, async (tx) => {
                const task = await requireTask(tx, projectId, taskId, actor);
                if (task.unit && task.unit !== values.unit && (await tx.progress(projectId, taskId)).length) throw v.problem(409, "Không thể đổi đơn vị sau khi đã báo khối lượng");
                const quantity = await tx.saveQuantity(taskId, values);
                await tx.audit(projectId, actor.id, "assignments", "set_quantity", taskId, { planned_quantity: task.planned_quantity, unit: task.unit }, values);
                return quantity;
            });
        },
        async reportProgress(projectId, actor, taskId, body) {
            const values = { day: v.date(body.day), quantity: v.quantity(body.quantity), notes: v.text(body.notes, "Ghi chú", 2000, true), client_uuid: body.client_uuid };
            if (!uuidPattern.test(values.client_uuid || "")) throw v.problem(400, "Mã gửi báo cáo không hợp lệ");
            return transaction(projectId, async (tx) => {
                const task = await requireTask(tx, projectId, taskId, actor);
                if (!task.planned_quantity) throw v.problem(422, "Công việc chưa khai báo khối lượng kế hoạch và đơn vị");
                const existing = await tx.progressByUuid(values.client_uuid);
                if (existing) {
                    if (existing.project_id !== projectId || existing.task_id !== taskId || existing.reported_by !== actor.id
                        || existing.day !== values.day || existing.quantity !== values.quantity || existing.notes !== values.notes) throw v.problem(409, "Mã gửi báo cáo đã được dùng cho nội dung khác");
                    return { progress: existing, replayed: true };
                }
                const progress = await tx.createProgress(projectId, task, actor.id, values);
                const reports = await tx.progress(projectId, taskId);
                const total = reports.reduce((sum, item) => sum + item.quantity, 0);
                await tx.audit(projectId, actor.id, "assignments", "report_progress", progress.id, null, values);
                return { progress, total, warning: total > task.planned_quantity ? "Lũy kế đã vượt khối lượng kế hoạch. Báo cáo vẫn được lưu." : null };
            });
        },
        async reportIssue(projectId, actor, taskId, body) {
            const description = v.text(body.description, "Mô tả vướng mắc", 5000);
            const photoIds = require("./siteValidation").ids(body.photo_ids);
            return transaction(projectId, async (tx) => {
                const task = await requireTask(tx, projectId, taskId, actor);
                if ((await tx.issuePhotoCandidates(projectId,actor.id,task.work_item_id,photoIds)).length!==photoIds.length) throw v.problem(422,"Ảnh phải thuộc hạng mục và do bạn tải lên");
                const issue = await tx.createIssue(projectId, task, actor.id, description);
                await tx.attachIssuePhotos(issue.id,photoIds);
                await tx.notifyManagers(projectId, `Vướng mắc mới: ${task.name}`, `/field-assignments?projectId=${projectId}&taskId=${taskId}`);
                await tx.audit(projectId, actor.id, "assignments", "report_issue", issue.id, null, { task_id: taskId, description });
                return issue;
            });
        },
        async closeIssue(projectId, actor, issueId, body) {
            v.id(issueId);
            const resolution = v.text(body.resolution, "Ghi chú xử lý", 5000);
            return transaction(projectId, async (tx) => {
                const previous = await tx.issue(projectId, issueId);
                if (!previous) throw v.problem(404, "Không tìm thấy vướng mắc");
                const issue = await tx.closeIssue(projectId, issueId, actor.id, resolution);
                if (!issue) throw v.problem(409, "Vướng mắc đã được đóng");
                await tx.audit(projectId, actor.id, "assignments", "close_issue", issueId, previous, issue);
                return issue;
            });
        },
        async notifications(projectId, userId) {
            const notifications = await model.notifications(projectId, userId);
            return { notifications, unread_count: notifications.filter((entry) => !entry.read_at).length };
        },
        async readNotifications(projectId, userId, notificationId) {
            if (notificationId !== null) v.id(notificationId);
            const updated = await model.readNotifications(projectId, userId, notificationId);
            if (notificationId && !updated.length) throw v.problem(404, "Không tìm thấy thông báo");
            return updated;
        },
        auditLogs: (projectId) => model.auditLogs(projectId)
    };
}
module.exports = { createProjectOperationsService, peakAssignments };

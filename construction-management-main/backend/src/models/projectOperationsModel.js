const { withProjectTransaction } = require("./projectTransaction");
const { createScheduleModel } = require("./scheduleModel");
const { ensureProjectSchedule } = require("../services/scheduleService");
const { problem } = require("../services/operationValidation");

function createProjectOperationsModel(pool) {
    const query = (sql, values = []) => pool.query(sql, values);
    const one = async (sql, values) => (await query(sql, values)).rows[0] || null;
    return {
        async transaction(projectId, operation) {
            return withProjectTransaction(pool, projectId, (client, project) => operation(createProjectOperationsModel(client), project));
        },
        async audit(projectId, actorId, module, action, objectId, before, after) {
            await query(`INSERT INTO audit_logs (project_id, actor_id, module, action, object_id, before_value, after_value)
                VALUES ($1,$2,$3,$4,$5,$6,$7)`, [projectId, actorId, module, action, String(objectId), before, after]);
        },
        async listProjects(userId,allProjects=false) {
            return (await query(`SELECT p.*, p.start_date::text AS start_date, CASE WHEN $2 THEN 'admin' ELSE r.name END AS member_role,
                (SELECT count(*)::int FROM project_members WHERE project_id = p.id) AS member_count,
                (SELECT CASE WHEN count(t.id) > 0 AND count(t.id) = count(q.task_id)
                    THEN round(sum(least(coalesce(d.quantity,0) / q.planned_quantity,1) * t.duration_days)
                        / nullif(sum(t.duration_days),0) * 100,1) ELSE NULL END
                 FROM tasks t JOIN work_items w ON w.id=t.work_item_id
                 LEFT JOIN task_field_quantities q ON q.task_id=t.id
                 LEFT JOIN (SELECT task_id,sum(quantity) quantity FROM daily_progress GROUP BY task_id) d ON d.task_id=t.id
                 WHERE w.project_id=p.id)::float AS progress
                FROM projects p LEFT JOIN project_members m ON m.project_id=p.id AND m.user_id=$1
                LEFT JOIN roles r ON r.id=m.role_id WHERE $2 OR m.user_id=$1 ORDER BY p.created_at DESC,p.id DESC`, [userId,allProjects])).rows;
        },
        project: (projectId) => one("SELECT *,start_date::text AS start_date FROM projects WHERE id=$1", [projectId]),
        async createProject(userId, values) {
            const client = await pool.connect();
            try {
                await client.query("BEGIN");
                const role = (await client.query("SELECT id FROM roles WHERE name='admin'")).rows[0];
                if (!role) throw problem(409, "Vai trò ban quản lý chưa được cấu hình");
                const project = (await client.query(`INSERT INTO projects(name,location,start_date)
                    VALUES($1,$2,$3) RETURNING *,start_date::text AS start_date`, [values.name, values.location, values.start_date])).rows[0];
                await client.query("INSERT INTO project_members(user_id,project_id,role_id) VALUES($1,$2,$3)", [userId, project.id, role.id]);
                await createProjectOperationsModel(client).audit(project.id, userId, "projects", "create", project.id, null, values);
                await client.query("COMMIT");
                return project;
            } catch (error) { await client.query("ROLLBACK"); throw error; }
            finally { client.release(); }
        },
        updateProject: (projectId, values) => one(`UPDATE projects SET name=$2,location=$3,start_date=$4,status=$5,
            schedule_needs_recalc=TRUE,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING *,start_date::text AS start_date`,
        [projectId, values.name, values.location, values.start_date, values.status]),
        calendar: (projectId) => one("SELECT * FROM project_calendars WHERE project_id=$1", [projectId]),
        async holidays(projectId) {
            return (await query("SELECT *,day::text AS day FROM project_holidays WHERE project_id=$1 ORDER BY project_holidays.day,id", [projectId])).rows;
        },
        updateCalendar: (projectId, days, revision) => one(`UPDATE project_calendars SET working_days=$2,
            revision=revision+1,updated_at=CURRENT_TIMESTAMP WHERE project_id=$1 AND revision=$3 RETURNING *`, [projectId, days, revision]),
        holiday: (projectId, holidayId) => one("SELECT *,day::text AS day FROM project_holidays WHERE project_id=$1 AND id=$2", [projectId, holidayId]),
        saveHoliday: (projectId, holidayId, values) => holidayId
            ? one("UPDATE project_holidays SET day=$3,name=$4,notes=$5 WHERE project_id=$1 AND id=$2 RETURNING *,day::text AS day", [projectId, holidayId, values.day, values.name, values.notes])
            : one("INSERT INTO project_holidays(project_id,day,name,notes) VALUES($1,$2,$3,$4) RETURNING *,day::text AS day", [projectId, values.day, values.name, values.notes]),
        deleteHoliday: (projectId, holidayId) => one("DELETE FROM project_holidays WHERE project_id=$1 AND id=$2 RETURNING id", [projectId, holidayId]),
        async participants(projectId) {
            return (await query(`SELECT u.id,u.fullname,r.name AS role FROM project_members m
                JOIN users u ON u.id=m.user_id JOIN roles r ON r.id=m.role_id WHERE m.project_id=$1 ORDER BY u.fullname,u.id`, [projectId])).rows;
        },
        async memberOverview(projectId) {
            const project = await one("SELECT id,name FROM projects WHERE id=$1", [projectId]);
            const members = (await query(`SELECT u.id,u.fullname,u.email,r.name AS role,m.created_at,u.last_login_at,
                CASE WHEN u.locked_until>CURRENT_TIMESTAMP THEN 'locked' ELSE 'active' END AS status,
                coalesce(string_agg(DISTINCT t.name, ', ' ORDER BY t.name),'') AS team
                FROM project_members m JOIN users u ON u.id=m.user_id JOIN roles r ON r.id=m.role_id
                LEFT JOIN team_members tm ON tm.project_id=m.project_id AND tm.user_id=m.user_id
                LEFT JOIN teams t ON t.id=tm.team_id
                WHERE m.project_id=$1 GROUP BY u.id,r.name,m.created_at ORDER BY u.fullname,u.id`, [projectId])).rows;
            const invitations = (await query(`SELECT i.id,i.email,r.name AS role,i.created_at,u.fullname AS invited_by_name
                FROM project_invitations i JOIN roles r ON r.id=i.role_id JOIN users u ON u.id=i.invited_by
                WHERE i.project_id=$1 AND i.status='pending' ORDER BY i.created_at DESC,i.id DESC`, [projectId])).rows;
            const roles = (await query("SELECT name FROM roles WHERE name=ANY($1::text[]) ORDER BY id", [["admin","manager","project_manager","engineer","worker","accountant","viewer"]])).rows.map((row) => row.name);
            return { project, members, invitations, roles };
        },
        member: (projectId, userId) => one(`SELECT u.id,u.fullname,u.email,r.name AS role FROM project_members m
            JOIN users u ON u.id=m.user_id JOIN roles r ON r.id=m.role_id WHERE m.project_id=$1 AND m.user_id=$2`, [projectId,userId]),
        userByEmail: (email) => one("SELECT id,fullname,email FROM users WHERE lower(email)=lower($1)", [email]),
        roleByName: (role) => one("SELECT id,name FROM roles WHERE name=$1", [role]),
        addMember: (projectId,userId,roleId) => one(`INSERT INTO project_members(project_id,user_id,role_id) VALUES($1,$2,$3)
            RETURNING user_id AS id`, [projectId,userId,roleId]),
        createInvitation: (projectId,email,roleId,actorId,tokenHash) => one(`INSERT INTO project_invitations(project_id,email,role_id,invited_by,token_hash,expires_at)
            VALUES($1,$2,$3,$4,$5,CURRENT_TIMESTAMP+INTERVAL '7 days') RETURNING id,email,created_at,expires_at`, [projectId,email,roleId,actorId,tokenHash]),
        renewInvitation: (projectId,id,tokenHash) => one(`UPDATE project_invitations SET token_hash=$3,expires_at=CURRENT_TIMESTAMP+INTERVAL '7 days',updated_at=CURRENT_TIMESTAMP
            WHERE project_id=$1 AND id=$2 AND status='pending' RETURNING id,email,expires_at`, [projectId,id,tokenHash]),
        updateMemberRole: (projectId,userId,roleId) => one(`UPDATE project_members SET role_id=$3,updated_at=CURRENT_TIMESTAMP
            WHERE project_id=$1 AND user_id=$2 RETURNING user_id AS id`, [projectId,userId,roleId]),
        removeMember: (projectId,userId) => one("DELETE FROM project_members WHERE project_id=$1 AND user_id=$2 RETURNING user_id AS id", [projectId,userId]),
        async managerCount(projectId) {
            return Number((await one(`SELECT count(*) AS count FROM project_members m JOIN roles r ON r.id=m.role_id
                WHERE m.project_id=$1 AND r.name=ANY($2::text[])`, [projectId,["admin","project_manager","manager"]])).count);
        },
        invitation: (projectId,id) => one(`SELECT i.*,r.name AS role FROM project_invitations i JOIN roles r ON r.id=i.role_id
            WHERE i.project_id=$1 AND i.id=$2 AND i.status='pending'`, [projectId,id]),
        cancelInvitation: (projectId,id) => one(`UPDATE project_invitations SET status='cancelled',updated_at=CURRENT_TIMESTAMP
            WHERE project_id=$1 AND id=$2 AND status='pending' RETURNING id`, [projectId,id]),
        async teams(projectId, workerId = null) {
            return (await query(`SELECT t.*,
                coalesce((SELECT json_agg(json_build_object('id',u.id,'fullname',u.fullname) ORDER BY u.id)
                FROM team_members tm JOIN users u ON u.id=tm.user_id WHERE tm.team_id=t.id),'[]'::json) AS members
                FROM teams t WHERE t.project_id=$1 AND ($2::integer IS NULL OR EXISTS
                (SELECT 1 FROM team_members m WHERE m.team_id=t.id AND m.user_id=$2)) ORDER BY t.name,t.id`, [projectId, workerId])).rows;
        },
        async createTeam(projectId, name, memberIds) {
            const team = await one("INSERT INTO teams(project_id,name) VALUES($1,$2) RETURNING *", [projectId, name]);
            await query(`INSERT INTO team_members(project_id,team_id,user_id)
                SELECT $1,$2,unnest($3::integer[])`, [projectId, team.id, memberIds]);
            return team;
        },
        async fieldTasks(projectId, project, workerId = null) {
            await ensureProjectSchedule(createScheduleModel(pool), project, projectId);
            return (await query(`SELECT t.id,t.name,t.work_item_id,t.duration_days,w.title AS work_item_name,
                r.early_start::float AS es,r.early_finish::float AS ef,r.is_critical AS "isCritical",
                a.team_id,tm.name AS team_name,q.planned_quantity::float,q.unit,
                coalesce(d.quantity,0)::float AS reported_quantity,
                coalesce(i.open_count,0)::int AS open_issues
                FROM tasks t JOIN work_items w ON w.id=t.work_item_id
                JOIN schedule_results r ON r.task_id=t.id
                LEFT JOIN task_assignments a ON a.task_id=t.id
                LEFT JOIN teams tm ON tm.id=a.team_id
                LEFT JOIN task_field_quantities q ON q.task_id=t.id
                LEFT JOIN (SELECT task_id,sum(quantity) quantity FROM daily_progress dp
                    WHERE $2::integer IS NULL OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id=dp.team_id AND tm.user_id=$2)
                    GROUP BY task_id) d ON d.task_id=t.id
                LEFT JOIN (SELECT task_id,count(*) open_count FROM task_issues ti WHERE status='open'
                    AND ($2::integer IS NULL OR EXISTS (SELECT 1 FROM team_members tm WHERE tm.team_id=ti.team_id AND tm.user_id=$2))
                    GROUP BY task_id) i ON i.task_id=t.id
                WHERE w.project_id=$1 ORDER BY r.early_start,t.id`, [projectId, workerId])).rows;
        },
        task: (projectId, taskId) => one(`SELECT t.*,a.team_id,q.planned_quantity::float,q.unit FROM tasks t
            JOIN work_items w ON w.id=t.work_item_id LEFT JOIN task_assignments a ON a.task_id=t.id
            LEFT JOIN task_field_quantities q ON q.task_id=t.id WHERE w.project_id=$1 AND t.id=$2`, [projectId, taskId]),
        async assign(projectId, taskId, teamId, actorId, previous) {
            const result = await one(`INSERT INTO task_assignments(project_id,task_id,team_id,assigned_by)
                VALUES($1,$2,$3,$4) ON CONFLICT(task_id) DO UPDATE
                SET team_id=EXCLUDED.team_id,assigned_by=EXCLUDED.assigned_by,assigned_at=CURRENT_TIMESTAMP RETURNING *`, [projectId, taskId, teamId, actorId]);
            await query(`INSERT INTO task_assignment_history(project_id,task_id,previous_team_id,team_id,changed_by)
                VALUES($1,$2,$3,$4,$5)`, [projectId, taskId, previous, teamId, actorId]);
            return result;
        },
        async assignmentHistory(projectId, taskId) {
            return (await query(`SELECT h.*,u.fullname AS changed_by_name,t.name AS team_name,p.name AS previous_team_name
                FROM task_assignment_history h JOIN users u ON u.id=h.changed_by JOIN teams t ON t.id=h.team_id
                LEFT JOIN teams p ON p.id=h.previous_team_id WHERE h.project_id=$1 AND h.task_id=$2 ORDER BY h.changed_at DESC,h.id DESC`, [projectId, taskId])).rows;
        },
        saveQuantity: (taskId, values) => one(`INSERT INTO task_field_quantities(task_id,planned_quantity,unit) VALUES($1,$2,$3)
            ON CONFLICT(task_id) DO UPDATE SET planned_quantity=EXCLUDED.planned_quantity,unit=EXCLUDED.unit RETURNING *`, [taskId, values.planned_quantity, values.unit]),
        async progress(projectId, taskId, workerId = null) {
            return (await query(`SELECT d.*,d.day::text AS day,d.quantity::float,u.fullname AS reported_by_name,t.name AS team_name
                FROM daily_progress d JOIN users u ON u.id=d.reported_by JOIN teams t ON t.id=d.team_id
                WHERE d.project_id=$1 AND d.task_id=$2 AND ($3::integer IS NULL OR EXISTS
                (SELECT 1 FROM team_members m WHERE m.team_id=d.team_id AND m.user_id=$3)) ORDER BY d.day DESC,d.id DESC`, [projectId, taskId, workerId])).rows;
        },
        progressByUuid: (uuid) => one("SELECT *,day::text AS day,quantity::float FROM daily_progress WHERE client_uuid=$1", [uuid]),
        createProgress: (projectId, task, userId, values) => one(`INSERT INTO daily_progress
            (project_id,task_id,team_id,reported_by,day,quantity,notes,client_uuid) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
            RETURNING *,day::text AS day,quantity::float`, [projectId, task.id, task.team_id, userId, values.day, values.quantity, values.notes, values.client_uuid]),
        async issues(projectId, taskId, workerId = null) {
            return (await query(`SELECT i.*,u.fullname AS reported_by_name,
                coalesce((SELECT json_agg(photo_id) FROM issue_photos WHERE issue_id=i.id),'[]'::json) AS photo_ids
                FROM task_issues i JOIN users u ON u.id=i.reported_by
                WHERE i.project_id=$1 AND i.task_id=$2 AND ($3::integer IS NULL OR EXISTS
                (SELECT 1 FROM team_members m WHERE m.team_id=i.team_id AND m.user_id=$3)) ORDER BY i.id DESC`, [projectId, taskId, workerId])).rows;
        },
        issue: (projectId, issueId) => one("SELECT * FROM task_issues WHERE project_id=$1 AND id=$2", [projectId, issueId]),
        async issuePhotoCandidates(projectId, userId, itemId, ids) { return (await query("SELECT id FROM site_photos WHERE project_id=$1 AND uploaded_by=$2 AND work_item_id=$3 AND id=ANY($4::integer[])",[projectId,userId,itemId,ids])).rows; },
        async attachIssuePhotos(issueId, ids) { await query("INSERT INTO issue_photos(issue_id,photo_id) SELECT $1,unnest($2::integer[])",[issueId,ids]); },
        createIssue: (projectId, task, userId, description) => one(`INSERT INTO task_issues(project_id,task_id,team_id,reported_by,description)
            VALUES($1,$2,$3,$4,$5) RETURNING *`, [projectId, task.id, task.team_id, userId, description]),
        closeIssue: (projectId, issueId, userId, resolution) => one(`UPDATE task_issues SET status='closed',resolution=$4,
            closed_by=$3,closed_at=CURRENT_TIMESTAMP WHERE project_id=$1 AND id=$2 AND status='open' RETURNING *`, [projectId, issueId, userId, resolution]),
        async notifyManagers(projectId, message, path) {
            await query(`INSERT INTO notifications(project_id,user_id,type,message,target_path)
                SELECT m.project_id,m.user_id,'task_issue',$2,$3 FROM project_members m JOIN roles r ON r.id=m.role_id
                WHERE m.project_id=$1 AND r.name IN ('admin','project_manager')`, [projectId, message, path]);
        },
        async notifications(projectId, userId) {
            return (await query("SELECT * FROM notifications WHERE project_id=$1 AND user_id=$2 ORDER BY created_at DESC,id DESC", [projectId, userId])).rows;
        },
        async readNotifications(projectId, userId, notificationId) {
            return (await query(`UPDATE notifications SET read_at=coalesce(read_at,CURRENT_TIMESTAMP)
                WHERE project_id=$1 AND user_id=$2 AND ($3::integer IS NULL OR id=$3) RETURNING id`, [projectId, userId, notificationId])).rows;
        },
        async auditLogs(projectId) {
            return (await query(`SELECT a.*,u.fullname AS actor_name FROM audit_logs a JOIN users u ON u.id=a.actor_id
                WHERE a.project_id=$1 ORDER BY a.created_at DESC,a.id DESC LIMIT 500`, [projectId])).rows;
        }
    };
}
module.exports = { createProjectOperationsModel };

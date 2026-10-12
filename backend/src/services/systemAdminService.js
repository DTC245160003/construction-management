const v = require("./operationValidation");
const { createProjectOperationsService } = require("./projectOperationsService");
const { createProjectOperationsModel } = require("../models/projectOperationsModel");

function createSystemAdminService({ pool }) {
    const projects = createProjectOperationsService({ model:createProjectOperationsModel(pool) });
    return {
        async users(search = "") {
            const q = typeof search === "string" ? search.trim().slice(0,255) : "";
            return (await pool.query(`SELECT u.id,u.fullname,u.email,u.system_role,u.is_active,u.created_at,u.last_login_at,
                CASE WHEN NOT u.is_active THEN 'disabled' WHEN u.locked_until>CURRENT_TIMESTAMP THEN 'temporarily_locked' ELSE 'active' END AS status,
                coalesce((SELECT json_agg(json_build_object('id',p.id,'name',p.name,'role',r.name) ORDER BY p.name)
                    FROM project_members m JOIN projects p ON p.id=m.project_id JOIN roles r ON r.id=m.role_id WHERE m.user_id=u.id),'[]'::json) AS projects
                FROM users u WHERE $1='' OR u.fullname ILIKE '%'||$1||'%' OR u.email ILIKE '%'||$1||'%'
                ORDER BY u.created_at DESC,u.id DESC`,[q])).rows;
        },
        async audit() {
            return (await pool.query(`SELECT a.*,u.fullname AS actor_name,p.name AS project_name FROM audit_logs a
                LEFT JOIN users u ON u.id=a.actor_id LEFT JOIN projects p ON p.id=a.project_id
                WHERE a.module IN ('system_admin','members') ORDER BY a.created_at DESC,a.id DESC LIMIT 500`)).rows;
        },
        async accountStatus(actor,id,body) {
            if (Object.keys(body).some(k => k!=="is_active") || typeof body.is_active!=="boolean") throw v.problem(403,"Chỉ được thay đổi trạng thái; quyền hệ thống được cấp bằng CLI quản trị");
            const client = await pool.connect();
            try {
                await client.query("BEGIN");
                const before=(await client.query("SELECT id,system_role,is_active FROM users WHERE id=$1 FOR UPDATE",[v.id(id)])).rows[0];
                if (!before) throw v.problem(404,"Không tìm thấy tài khoản");
                const after=(await client.query("UPDATE users SET is_active=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id,system_role,is_active",[id,body.is_active])).rows[0];
                await client.query("INSERT INTO audit_logs(actor_id,module,action,object_id,before_value,after_value) VALUES($1,'system_admin','account_status',$2,$3,$4)",[actor.id,String(id),before,after]);
                await client.query("COMMIT"); return after;
            } catch(e) {
                await client.query("ROLLBACK");
                if (e.code==="23514") throw v.problem(409,"Không được khóa hoặc hạ quyền Super Admin cuối cùng");
                throw e;
            } finally { client.release(); }
        },
        grantMember: (actor,pid,body) => projects.inviteMember(v.id(pid),{ id:actor.id,role:"admin" },body),
        changeMember: (actor,pid,uid,body) => projects.changeMemberRole(v.id(pid),{ id:actor.id,role:"admin" },v.id(uid),body),
        removeMember: (actor,pid,uid) => projects.removeMember(v.id(pid),{ id:actor.id,role:"admin" },v.id(uid))
    };
}
module.exports = { createSystemAdminService };

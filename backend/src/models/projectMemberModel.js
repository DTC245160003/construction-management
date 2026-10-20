function createProjectMemberModel(pool) {
    return {
        async recordDeniedAccess({projectId,userId,route,method,reason}) {
            const target=Number.isInteger(projectId)&&projectId>0&&projectId<=2147483647?projectId:null;
            await pool.query(`INSERT INTO audit_logs(project_id,actor_id,module,action,object_id,after_value)
                VALUES((SELECT id FROM projects WHERE id=$1),$2,'authorization','deny_project_access',$3,$4)`,
                [target,userId,String(target??'invalid'),{project_id:target,route,method,reason}]);
        },
        async findByProjectAndUser({ projectId, userId }) {
            const { rows } = await pool.query(`
                SELECT
                    project_members.user_id,
                    project_members.project_id,
                    project_members.role_id,
                    roles.name AS role
                FROM project_members
                JOIN roles ON roles.id = project_members.role_id
                WHERE project_members.project_id = $1
                  AND project_members.user_id = $2
            `, [projectId, userId]);
            return rows[0] || null;
        }
    };
}

module.exports = { createProjectMemberModel };

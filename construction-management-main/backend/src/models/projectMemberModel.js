function createProjectMemberModel(pool) {
    return {
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

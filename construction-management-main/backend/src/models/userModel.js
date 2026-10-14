function createUserModel(pool) {
    async function query(operation, sql, values) {
        try {
            return await pool.query(sql, values);
        } catch (error) {
            error.operation = `userModel.${operation}`;
            throw error;
        }
    }

    return {
        async findByEmail(email) {
            const { rows } = await query(
                "findByEmail",
                "SELECT id, email FROM users WHERE lower(email) = $1",
                [email]
            );
            return rows[0] || null;
        },

        async findRoleByName(name) {
            const { rows } = await query(
                "findRoleByName",
                "SELECT id, name FROM roles WHERE name = $1",
                [name]
            );
            return rows[0] || null;
        },

        async createUser({ fullname, email, passwordHash, roleId, invitationToken }) {
            // Lightweight injected models used by unit tests expose query only.
            if (typeof pool.connect !== "function") {
                const { rows } = await query("createUser", `
                    INSERT INTO users (fullname, email, password_hash, role_id)
                    VALUES ($1, $2, $3, $4)
                    RETURNING id, fullname, email, role_id, created_at
                `, [fullname, email, passwordHash, roleId]);
                return rows[0];
            }
            const client = await pool.connect();
            try {
                await client.query("BEGIN");
                let invitation;
                if (invitationToken !== undefined) {
                    if (typeof invitationToken!=="string" || !/^[a-f0-9]{64}$/.test(invitationToken)) throw Object.assign(new Error("Lời mời không hợp lệ"),{ status:400,expose:true });
                    const hash=require("node:crypto").createHash("sha256").update(invitationToken).digest("hex");
                    invitation=(await client.query("SELECT * FROM project_invitations WHERE token_hash=$1 AND lower(email)=lower($2) AND status='pending' AND expires_at>CURRENT_TIMESTAMP FOR UPDATE",[hash,email])).rows[0];
                    if (!invitation) throw Object.assign(new Error("Lời mời đã hết hạn hoặc đã bị hủy"),{ status:409,expose:true });
                }
                const { rows } = await client.query(`
                    INSERT INTO users (fullname, email, password_hash, role_id)
                    VALUES ($1, $2, $3, $4)
                    RETURNING id, fullname, email, role_id, created_at
                `, [fullname, email, passwordHash, roleId]);
                const user = rows[0];
                if (invitation) await client.query(`
                    INSERT INTO project_members(user_id,project_id,role_id)
                    SELECT $1,project_id,role_id FROM project_invitations WHERE id=$2
                    ON CONFLICT(user_id,project_id) DO NOTHING
                `, [user.id, invitation.id]);
                if (invitation) await client.query(`
                    UPDATE project_invitations SET status='accepted',accepted_by=$1,accepted_at=CURRENT_TIMESTAMP,updated_at=CURRENT_TIMESTAMP
                    WHERE id=$2
                `, [user.id, invitation.id]);
                if (invitation) await client.query(`INSERT INTO audit_logs(project_id,actor_id,module,action,object_id,after_value) VALUES($1,$2,'members','accept_invitation',$3,$4)`,[invitation.project_id,user.id,String(invitation.id),{ email }]);
                await client.query("COMMIT");
                return user;
            } catch (error) {
                error.operation = "userModel.createUser";
                await client.query("ROLLBACK");
                throw error;
            } finally { client.release(); }
        },

        async findByIdWithRole(id) {
            const { rows } = await query("findByIdWithRole", `
                SELECT
                    users.id,
                    users.fullname,
                    users.email,
                    users.role_id,
                    users.system_role,
                    users.is_active,
                    roles.name AS role
                FROM users
                LEFT JOIN roles ON roles.id = users.role_id
                WHERE users.id = $1
            `, [id]);
            return rows[0] || null;
        },

        async withLockedUser(email, operation) {
            const client = await pool.connect();

            try {
                await client.query("BEGIN");

                const { rows } = await client.query(`
                    SELECT
                        users.id,
                        users.fullname,
                        users.email,
                        users.password_hash,
                        users.role_id,
                        users.system_role,
                        users.is_active,
                        roles.name AS role,
                        users.failed_login_attempts,
                        users.locked_until,
                        users.locked_until > clock_timestamp()::timestamp AS is_locked,
                        users.locked_until IS NOT NULL
                            AND users.locked_until <= clock_timestamp()::timestamp AS lock_expired
                    FROM users
                    LEFT JOIN roles ON roles.id = users.role_id
                    WHERE lower(users.email) = $1
                    FOR UPDATE OF users
                `, [email]);

                const user = rows[0] || null;
                const changes = {
                    async recordFailure(attempts) {
                        await client.query(`
                            UPDATE users
                            SET failed_login_attempts = $2,
                                locked_until = CASE
                                    WHEN $2 >= 5
                                    THEN clock_timestamp() + INTERVAL '15 minutes'
                                    ELSE NULL
                                END,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = $1
                        `, [user.id, attempts]);
                    },

                    async resetFailures() {
                        await client.query(`
                            UPDATE users
                            SET failed_login_attempts = 0,
                                locked_until = NULL,
                                last_login_at = CURRENT_TIMESTAMP,
                                updated_at = CURRENT_TIMESTAMP
                            WHERE id = $1
                        `, [user.id]);
                    }
                };

                const result = await operation(user, changes);
                await client.query("COMMIT");
                return result;
            } catch (error) {
                error.operation ||= "userModel.withLockedUser";

                try {
                    await client.query("ROLLBACK");
                } catch (rollbackError) {
                    throw new AggregateError(
                        [error, rollbackError],
                        "Login transaction rollback failed.",
                        { cause: rollbackError }
                    );
                }

                throw error;
            } finally {
                client.release();
            }
        }
    };
}

module.exports = { createUserModel };

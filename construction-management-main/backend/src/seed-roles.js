const SYSTEM_ROLES = ["admin", "project_manager", "engineer", "worker", "accountant", "viewer"];

async function seedRoles(client) {
    const result = await client.query(`
        INSERT INTO roles (name)
        SELECT unnest($1::text[])
        ON CONFLICT (name) DO NOTHING
        RETURNING name
    `, [SYSTEM_ROLES]);
    return result.rows;
}

async function main() {
    const pool = require("./config/database");
    try {
        const inserted = await seedRoles(pool);
        console.log(`Đã thêm ${inserted.length} vai trò; giữ nguyên các vai trò đã tồn tại.`);
    } finally {
        await pool.end();
    }
}

if (require.main === module) {
    main().catch(error => {
        console.error(error.message);
        process.exitCode = 1;
    });
}

module.exports = { seedRoles, SYSTEM_ROLES };

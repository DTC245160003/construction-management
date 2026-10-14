const pool = require("./config/database");

async function testConnection() {
    try {
        const result = await pool.query("SELECT NOW()");
        console.log("Kết nối PostgreSQL thành công:");
        console.log(result.rows);

    } catch (error) {
        console.error("Lỗi kết nối:", error.message);

    } finally {
        await pool.end();
    }
}

testConnection();
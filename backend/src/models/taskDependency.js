const pool = require('../config/database');

class TaskDependency {
  // Lấy danh sách các phụ thuộc của một công việc
  static async getByTaskId(taskId) {
    const query = `
      SELECT * FROM task_dependencies 
      WHERE predecessor_id = $1 OR successor_id = $1;
    `;
    const { rows } = await pool.query(query, [taskId]);
    return rows;
  }

  // Tạo mối quan hệ phụ thuộc mới giữa 2 công việc
  static async create({ predecessor_id, successor_id, dependency_type = 'FS', lag_days = 0 }) {
    const query = `
      INSERT INTO task_dependencies (predecessor_id, successor_id, dependency_type, lag_days)
      VALUES ($1, $2, $3, $4)
      RETURNING *;
    `;
    const values = [predecessor_id, successor_id, dependency_type, lag_days];
    const { rows } = await pool.query(query, values);
    return rows[0];
  }

  // Xóa mối quan hệ phụ thuộc
  static async delete(id) {
    const query = 'DELETE FROM task_dependencies WHERE id = $1 RETURNING *;';
    const { rows } = await pool.query(query, [id]);
    return rows[0];
  }
}

module.exports = TaskDependency;

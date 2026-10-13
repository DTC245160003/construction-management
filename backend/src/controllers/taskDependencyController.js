const TaskDependency = require('../models/taskDependency');

// Lấy danh sách phụ thuộc của task
exports.getDependencies = async (req, res) => {
  try {
    const { taskId } = req.params;
    const dependencies = await TaskDependency.getByTaskId(taskId);
    res.status(200).json({ success: true, data: dependencies });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Tạo phụ thuộc mới
exports.createDependency = async (req, res) => {
  try {
    const { predecessor_id, successor_id, dependency_type, lag_days } = req.body;

    // Validation cơ bản
    if (!predecessor_id || !successor_id) {
      return res.status(400).json({ success: false, message: 'Thiếu predecessor_id hoặc successor_id' });
    }
    if (predecessor_id === successor_id) {
      return res.status(400).json({ success: false, message: 'Công việc không thể phụ thuộc vào chính nó' });
    }

    const newDependency = await TaskDependency.create({
      predecessor_id,
      successor_id,
      dependency_type: dependency_type || 'FS',
      lag_days: lag_days || 0
    });

    res.status(201).json({ success: true, data: newDependency });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Xóa phụ thuộc
exports.deleteDependency = async (req, res) => {
  try {
    const { id } = req.params;
    const deleted = await TaskDependency.delete(id);
    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Không tìm thấy bản ghi phụ thuộc' });
    }
    res.status(200).json({ success: true, message: 'Xóa phụ thuộc thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

import axios from "axios";

export async function updateTaskProgress(projectId, taskId, values) {
    const { data } = await axios.patch(`/projects/${projectId}/tasks/${taskId}/progress`, values, {
        withCredentials: true
    });
    if (!data?.task) throw new Error("API không trả về công việc đã cập nhật");
    return data.task;
}

import axios from "axios";

const config = { withCredentials: true };
const base = (projectId) => `/projects/${projectId}`;

export async function listTasks(projectId, { signal } = {}) {
    const { data } = await axios.get(`${base(projectId)}/tasks`, { ...config, signal });
    return data.tasks;
}

export async function saveTask(projectId, taskId, values) {
    const { data } = taskId
        ? await axios.patch(`${base(projectId)}/tasks/${taskId}`, values, config)
        : await axios.post(`${base(projectId)}/tasks`, values, config);
    return data.task;
}

export async function listDependencies(projectId, { signal } = {}) {
    const { data } = await axios.get(`${base(projectId)}/dependencies`, { ...config, signal });
    return data.dependencies;
}

export async function addDependency(projectId, taskId, values) {
    const { data } = await axios.post(`${base(projectId)}/tasks/${taskId}/dependencies`, values, config);
    return data.dependency;
}

export async function removeDependency(projectId, taskId, dependencyId) {
    await axios.delete(`${base(projectId)}/tasks/${taskId}/dependencies/${dependencyId}`, config);
}

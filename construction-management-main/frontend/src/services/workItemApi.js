import axios from "axios";

const projectItems = (projectId) => `/projects/${projectId}/items`;
const requestConfig = { withCredentials: true };

export async function listWorkItems(projectId, { signal } = {}) {
    const { data } = await axios.get(projectItems(projectId), { ...requestConfig, signal });
    if (!Array.isArray(data?.items)) {
        throw new Error("API trả về danh sách hạng mục không hợp lệ");
    }
    return data.items;
}

export async function createWorkItem(projectId, values) {
    const { data } = await axios.post(projectItems(projectId), values, requestConfig);
    return data.item;
}

export async function updateWorkItem(projectId, itemId, values) {
    const { data } = await axios.patch(`${projectItems(projectId)}/${itemId}`, values, {
        ...requestConfig
    });
    return data.item;
}

export async function deleteWorkItem(projectId, itemId) {
    await axios.delete(`${projectItems(projectId)}/${itemId}`, requestConfig);
}

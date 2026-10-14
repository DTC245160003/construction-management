import axios from "axios";

export async function getSchedule(projectId, { criticalOnly = false, signal } = {}) {
    const { data } = await axios.get(`/projects/${projectId}/schedule`, {
        withCredentials: true,
        params: criticalOnly ? { critical: true } : {},
        signal
    });
    if (!Array.isArray(data?.schedule)) throw new Error("API trả về tiến độ không hợp lệ");
    if (data.summary) data.schedule.summary = data.summary;
    return data.schedule;
}

export async function saveBaseline(projectId) {
    const { data } = await axios.post(`/projects/${projectId}/baselines`, {}, {
        withCredentials: true
    });
    return data;
}

export async function getBaselineHistory(projectId) {
    const { data } = await axios.get(`/projects/${projectId}/baselines/history`, {
        withCredentials: true
    });
    return data?.history || [];
}

export async function listWorkItemMilestones(projectId) {
    const { data } = await axios.get(`/projects/${projectId}/work-item-milestones`, {
        withCredentials: true
    });
    return data?.milestones || [];
}

export async function createWorkItemMilestone(projectId, payload) {
    const { data } = await axios.post(`/projects/${projectId}/work-item-milestones`, payload, {
        withCredentials: true
    });
    return data?.milestone;
}

export async function deleteWorkItemMilestone(projectId, milestoneId) {
    const { data } = await axios.delete(`/projects/${projectId}/work-item-milestones/${milestoneId}`, {
        withCredentials: true
    });
    return data;
}

export async function listMilestoneAlerts(projectId, status = null) {
    const { data } = await axios.get(`/projects/${projectId}/milestone-alerts`, {
        withCredentials: true,
        params: status ? { status } : {}
    });
    return data?.alerts || [];
}

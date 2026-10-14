import { api } from "./operationsApi";

const path = (projectId,suffix="") => `/projects/${encodeURIComponent(projectId)}${suffix}`;
export const getProjectMembers = (projectId,{ signal }={}) => api(path(projectId,"/members"),{ signal });
export const inviteProjectMember = (projectId,values) => api(path(projectId,"/members"),{ method:"POST",body:values });
export const changeProjectMemberRole = (projectId,userId,role) => api(path(projectId,`/members/${userId}`),{ method:"PATCH",body:{ role } });
export const removeProjectMember = (projectId,userId) => api(path(projectId,`/members/${userId}`),{ method:"DELETE" });
export const cancelProjectInvitation = (projectId,invitationId) => api(path(projectId,`/invitations/${invitationId}`),{ method:"DELETE" });

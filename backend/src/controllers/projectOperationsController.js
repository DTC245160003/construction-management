function createProjectOperationsController({ service }) {
    const project = (req) => Number(req.params.projectId);
    const actor = (req) => ({ id: req.user.id, role: req.projectMember?.role,system_role:req.user.system_role });
    const task = (req) => Number(req.params.taskId);
    return {
        listProjects: async (req, res) => res.json({ projects: await service.listProjects(req.user.id,req.user.system_role==="super_admin"), can_create: req.user.system_role === "super_admin" }),
        createProject: async (req, res) => res.status(201).json({ project: await service.createProject(actor(req), req.body || {}) }),
        project: async (req, res) => res.json({ project: await service.project(project(req), actor(req)) }),
        updateProject: async (req, res) => res.json({ project: await service.updateProject(project(req), actor(req), req.body || {}) }),
        calendar: async (req, res) => res.json(await service.calendar(project(req))),
        saveCalendar: async (req, res) => res.json({ calendar: await service.saveCalendar(project(req), actor(req), req.body || {}) }),
        saveHoliday: async (req, res) => res.status(req.params.holidayId ? 200 : 201).json({ holiday: await service.saveHoliday(project(req), actor(req), req.params.holidayId ? Number(req.params.holidayId) : null, req.body || {}) }),
        deleteHoliday: async (req, res) => { await service.deleteHoliday(project(req), actor(req), Number(req.params.holidayId)); res.sendStatus(204); },
        participants: async (req, res) => res.json({ participants: await service.participants(project(req)) }),
        members: async (req,res) => res.json(await service.members(project(req),actor(req))),
        inviteMember: async (req,res) => res.status(201).json(await service.inviteMember(project(req),actor(req),req.body || {})),
        changeMemberRole: async (req,res) => res.json({ member:await service.changeMemberRole(project(req),actor(req),Number(req.params.userId),req.body || {}) }),
        removeMember: async (req,res) => { await service.removeMember(project(req),actor(req),Number(req.params.userId)); res.sendStatus(204); },
        cancelInvitation: async (req,res) => { await service.cancelInvitation(project(req),actor(req),Number(req.params.invitationId)); res.sendStatus(204); },
        renewInvitation: async (req,res) => res.json(await service.renewInvitation(project(req),actor(req),Number(req.params.invitationId))),
        teams: async (req, res) => res.json({ teams: await service.teams(project(req), actor(req)) }),
        createTeam: async (req, res) => res.status(201).json({ team: await service.createTeam(project(req), actor(req), req.body || {}) }),
        assignments: async (req, res) => res.json(await service.assignments(project(req), actor(req))),
        assign: async (req, res) => res.json(await service.assign(project(req), actor(req), task(req), req.body || {})),
        details: async (req, res) => res.json(await service.details(project(req), actor(req), task(req))),
        saveQuantity: async (req, res) => res.json({ quantity: await service.saveQuantity(project(req), actor(req), task(req), req.body || {}) }),
        reportProgress: async (req, res) => res.status(201).json(await service.reportProgress(project(req), actor(req), task(req), req.body || {})),
        reportIssue: async (req, res) => res.status(201).json({ issue: await service.reportIssue(project(req), actor(req), task(req), req.body || {}) }),
        closeIssue: async (req, res) => res.json({ issue: await service.closeIssue(project(req), actor(req), Number(req.params.issueId), req.body || {}) }),
        notifications: async (req, res) => res.json(await service.notifications(project(req), req.user.id)),
        readNotifications: async (req, res) => res.json({ updated: await service.readNotifications(project(req), req.user.id, req.params.notificationId ? Number(req.params.notificationId) : null) }),
        auditLogs: async (req, res) => res.json({ entries: await service.auditLogs(project(req)) })
    };
}
module.exports = { createProjectOperationsController };

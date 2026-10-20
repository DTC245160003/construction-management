function createSiteManagementController({ service, pdfService }) {
    const project=(req) => Number(req.params.projectId);
    const actor=(req) => ({ id:req.user.id,role:req.projectMember.role });
    const body=(req) => req.body || {};
    const record=(req) => req.params.recordId ? Number(req.params.recordId) : null;
    return {
        lookup:async (req,res) => res.json(await service.lookup(project(req),actor(req))),
        settings:async (req,res) => res.json(await service.settings(project(req),actor(req))),
        saveSettings:async (req,res) => res.json({ site:await service.saveSettings(project(req),actor(req),body(req)) }),
        preferences:async (req,res) => res.json(await service.savePreferences(req.user.id,body(req))),
        profile:async (req,res) => res.json({ user:await service.profile(req.user.id,body(req)) }),
        photos:async (req,res) => res.set('Cache-Control','private, no-store').json(await service.photoList(project(req),actor(req))),
        uploadPhoto:async (req,res) => res.status(201).json({ photo:await service.uploadPhoto(project(req),actor(req),body(req)) }),
        photoFile:async (req,res) => {
            const photo=await service.photo(project(req),actor(req),record(req));
            if (!["original","thumbnail"].includes(req.params.variant)) return res.status(404).json({ message:"Không tìm thấy phiên bản ảnh" });
            res.set("Cache-Control","private, no-store"); res.set("X-Content-Type-Options","nosniff");
            const thumb=req.params.variant==="thumbnail";
            res.type(thumb ? "image/jpeg" : photo.mime_type).send(thumb ? photo.thumbnail : photo.original);
        },
        issuePhotos:async (req,res) => res.json(await service.attachIssuePhotos(project(req),actor(req),record(req),body(req))),
        journals:async (req,res) => res.json(await service.journals(project(req),actor(req))),
        journalDaily:async (req,res) => res.json(await service.daily(project(req),req.query.day)),
        journalDailyRange:async (req,res) => res.json(await service.dailyRange(project(req),actor(req),req.query.from,req.query.to)),
        saveJournalDaily:async (req,res) => res.json({ daily:await service.saveDaily(project(req),actor(req),body(req)) }),
        saveJournalCatalog:async (req,res) => res.json({ option:await service.saveCatalog(project(req),actor(req),body(req)) }),
        journalHistory:async (req,res) => res.json(await service.history(project(req),actor(req),record(req))),
        resolveJournalConflict:async (req,res) => res.json(await service.resolve(project(req),actor(req),record(req),body(req))),
        saveJournal:async (req,res) => { const result=await service.saveJournal(project(req),actor(req),record(req),body(req)); return res.status(result.conflicted ? 409 : record(req) ? 200 : 201).json({ ...(result.conflicted ? { message:"Xung đột phiên bản. Cả hai bản đã được giữ lại." } : {}),...result }); },
        deleteJournal:async (req,res) => res.json(await service.deleteJournal(project(req),actor(req),record(req),body(req))),
        syncJournals:async (req,res) => res.json(await service.syncJournals(project(req),actor(req),body(req))),
        lockJournal:async (req,res) => res.json({ lock:await service.lockJournal(project(req),actor(req),{ ...body(req),...(req.params.recordId ? { recordId:record(req) } : {}) }) }),
        acceptance:async (req,res) => res.json(await service.acceptanceData(project(req),actor(req))),
        contract:async (req,res) => res.json({ contract:await service.saveContract(project(req),actor(req),record(req),body(req)) }),
        saveAcceptance:async (req,res) => res.status(record(req) ? 200 : 201).json({ form:await service.saveAcceptance(project(req),actor(req),record(req),body(req)) }),
        createAdjustment:async (req,res) => res.status(201).json({form:await service.createAdjustment(project(req),actor(req),record(req),body(req))}),
        savePaymentTerms:async (req,res) => res.json({terms:await service.savePaymentTerms(project(req),actor(req),body(req))}),
        transitionAcceptance:async (req,res) => res.json({ form:await service.transitionAcceptance(project(req),actor(req),record(req),body(req)) }),
        payments:async (req,res) => res.json(await service.paymentData(project(req),actor(req))),
        savePayment:async (req,res) => res.status(record(req) ? 200 : 201).json({ request:await service.savePayment(project(req),actor(req),record(req),body(req)) }),
        transitionPayment:async (req,res) => res.json({ request:await service.transitionPayment(project(req),actor(req),record(req),body(req)) }),
        costs:async (req,res) => res.json(await service.costsData(project(req),actor(req))),
        budget:async (req,res) => res.status(201).json({ budget:await service.saveBudget(project(req),actor(req),body(req)) }),
        createCost:async (req,res) => res.status(201).json({ cost:await service.saveCost(project(req),actor(req),body(req)) }),
        importCosts:async (req,res) => res.json(await service.importCosts(project(req),actor(req),body(req))),
        allocateCost:async (req,res) => res.json({ cost:await service.allocateCost(project(req),actor(req),record(req),body(req)) }),
        material:async (req,res) => res.status(201).json({ material:await service.createMaterial(project(req),actor(req),body(req)) }),
        inventory:async (req,res) => res.status(201).json({ transaction:await service.inventory(project(req),actor(req),body(req)) }),
        norm:async (req,res) => res.json({ norm:await service.norm(project(req),actor(req),body(req)) }),
        report:async (req,res) => res.json(await service.report(project(req),actor(req))),
        milestone:async (req,res) => res.status(201).json({ milestone:await service.milestone(project(req),actor(req),body(req)) }),
        reportPdf:async (req,res) => { const buffer=await pdfService(project(req),actor(req),Number(req.query.workItemId)); res.set("Cache-Control","private, no-store").set("Content-Disposition",`attachment; filename="acceptance-project-${project(req)}.pdf"`).type("application/pdf").send(buffer); }
    };
}
module.exports = { createSiteManagementController };

const { parse } = require("csv-parse/sync");
const v = require("./siteValidation");
const { preparePhoto, distance } = require("./photoService");
const { workingDate } = require("./workingCalendar");
const MANAGE = ["admin","project_manager","manager"];
const ACCEPT_APPROVE = [...MANAGE,"viewer"];
const PAYMENT_EDIT = ["admin","accountant"];
const PAYMENT_APPROVE = ["admin","viewer"];
const EMAIL_TYPES = ["acceptance_returned","payment_returned","milestone_overdue"];
const dayNow = () => new Intl.DateTimeFormat("en-CA",{ timeZone:"Asia/Ho_Chi_Minh" }).format(new Date());
function requireRole(actor, roles) { if (!roles.includes(actor.role)) throw v.problem(403,"Bạn không có quyền thực hiện thao tác này"); }
function costComparison(items,budgets,costs,contracts) {
    const current = new Map();
    for (const budget of budgets) if (!current.has(budget.work_item_id)) current.set(budget.work_item_id,budget);
    function row(item,trail = new Set()) {
        if (trail.has(item.id)) throw v.problem(422,"Cây hạng mục có vòng lặp");
        const next = new Set([...trail,item.id]);
        const children = items.filter((entry) => entry.parent_id===item.id).map((child) => row(child,next));
        const budget = children.length ? children.reduce((sum,child) => sum+v.scaled(child.budget,2),0n) : v.scaled(current.get(item.id)?.amount || "0",2);
        const actual = costs.filter((cost) => cost.work_item_id===item.id).reduce((sum,cost) => sum+v.scaled(cost.amount,2),0n)+children.reduce((sum,child) => sum+v.scaled(child.actual,2),0n);
        const contract = contracts.find((entry) => entry.work_item_id===item.id);
        const accepted = contract ? Number(contract.approved_quantity)/Number(contract.quantity)*100 : null;
        return { ...item,budget:v.formatted(budget),actual:v.formatted(actual),variance:v.formatted(budget-actual),usage_percent:budget ? Number(actual)/Number(budget)*100 : null,
            accepted_percent:accepted,warning:budget>0n && actual*100n>budget*80n && accepted!==null && accepted<80,version:current.get(item.id)?.version || 0 };
    }
    return items.map((item) => row(item));
}
function createSiteManagementService({ model }) {
    async function tx(projectId,operation) {
        try { return await model.transaction(projectId,operation); }
        catch (error) {
            if (error.code==="23505") throw v.problem(409,"Dữ liệu đã tồn tại hoặc phiếu nghiệm thu đã thuộc đề nghị thanh toán khác.");
            if (error.code==="23503") throw v.problem(409,"Đối tượng liên quan không còn tồn tại.");
            if (error.code==="23514") {
                if (error.message && (error.message.includes("Journal day is locked") || error.message.includes("locked"))) {
                    throw v.problem(403,"Nhật ký ngày đã bị khóa sổ, không thể chỉnh sửa hoặc xóa.");
                }
                throw v.problem(422,"Thao tác không hợp lệ: kiểm tra giới hạn hợp đồng, tồn kho hoặc trạng thái đã khóa.");
            }
            throw error;
        }
    }
    async function item(transaction,projectId,itemId,leaf = false) {
        const entry = await transaction.item(projectId,v.id(itemId));
        if (!entry) throw v.problem(404,"Không tìm thấy hạng mục trong dự án");
        if (leaf && !entry.is_leaf) throw v.problem(422,"Chỉ được khai báo tại hạng mục lá");
        return entry;
    }
    async function photos(transaction,projectId,ids,actor,itemId = null) {
        const entries = await transaction.photoIds(projectId,ids);
        if (entries.length!==ids.length || entries.some((entry) => (actor.role==="worker" && entry.uploaded_by!==actor.id) || (itemId && entry.work_item_id!==itemId))) throw v.problem(422,"Ảnh phải thuộc đúng dự án và hạng mục");
    }
    async function unlocked(transaction,projectId,day,recordId = null) {
        const dayLock = day ? await transaction.dayLock(projectId,day) : null;
        const record = recordId ? await transaction.journal(projectId,recordId) : null;
        if ((dayLock && (dayLock.locked || dayLock.is_locked)) || (record && (record.is_locked || record.locked))) {
            throw v.problem(403,"Nhật ký ngày đã bị khóa sổ, không thể chỉnh sửa hoặc xóa.");
        }
    }
    function canEditRecord(actor,record) { if (record.created_by!==actor.id && !MANAGE.includes(actor.role)) throw v.problem(403,"Bạn chỉ được chỉnh sửa phiếu do mình lập"); }
    async function notifyReturn(transaction,projectId,record,type,route) {
        await transaction.notify(projectId,record.created_by,type,"Phiếu của bạn đã được trả lại. Xem lý do và cập nhật hồ sơ.",`/${route}?projectId=${projectId}`,`${type}:${record.id}:${record.revision}`);
    }
    async function saveCost(transaction,projectId,actor,body) {
        const c = { work_item_id:body.work_item_id==null || body.work_item_id==="" ? null : v.id(body.work_item_id), day:v.date(body.day),amount:v.decimal(body.amount),type:v.text(body.type,"Loại chi",100),notes:v.text(body.notes,"Ghi chú",2000,true),client_uuid:v.uuid(body.client_uuid) };
        if (c.work_item_id) await item(transaction,projectId,c.work_item_id,true);
        const previous = await transaction.costByUuid(c.client_uuid);
        if (previous) {
            if (previous.project_id!==projectId || previous.created_by!==actor.id || previous.work_item_id!==c.work_item_id || previous.day!==c.day || v.scaled(previous.amount,2)!==v.scaled(c.amount,2) || previous.type!==c.type || previous.notes!==c.notes) throw v.problem(409,"Mã khoản chi đã dùng cho nội dung khác");
            return previous;
        }
        const result = await transaction.createCost(projectId,actor.id,c);
        await transaction.audit(projectId,actor.id,"costs","create_cost",result.id,null,c);
        return result;
    }
    return {
        async lookup(projectId,actor) {
            let items = await model.items(projectId);
            if (actor.role==="worker") {
                const visible = [];
                for (const entry of items) if (await model.workerCanUseItem(projectId,entry.id,actor.id)) visible.push(entry);
                items = visible;
            }
            return { items,member_role:actor.role };
        },
        async settings(projectId,actor) { return { project:await model.project(projectId),site:await model.settings(projectId),...(await this.preferences(actor.id)),can_manage:MANAGE.includes(actor.role),email_configured:Boolean(process.env.SMTP_HOST && process.env.SMTP_FROM) }; },
        async preferences(userId) { const saved=await model.preferences(userId); return { preferences:EMAIL_TYPES.map((type) => saved.find((entry) => entry.type===type) || { type,email_enabled:true }) }; },
        async savePreferences(userId,body) { if (!EMAIL_TYPES.includes(body.type) || typeof body.email_enabled!=="boolean") throw v.problem(400,"Cấu hình email không hợp lệ"); return model.savePreference(userId,body.type,body.email_enabled); },
        async profile(userId,body) { return model.updateProfile(userId,v.text(body.fullname,"Họ tên")); },
        async saveSettings(projectId,actor,body) {
            requireRole(actor,MANAGE);
            const values = body.latitude==null && body.longitude==null && body.radius_m==null ? { latitude:null,longitude:null,radius_m:null } : { latitude:body.latitude,longitude:body.longitude,radius_m:body.radius_m };
            if (values.latitude!==null && (!Number.isFinite(values.latitude) || Math.abs(values.latitude)>90 || !Number.isFinite(values.longitude) || Math.abs(values.longitude)>180 || !Number.isInteger(values.radius_m) || values.radius_m<1 || values.radius_m>2147483647)) throw v.problem(400,"Tọa độ hoặc bán kính công trường không hợp lệ");
            return tx(projectId,async (t) => { const previous=await t.settings(projectId); v.revision(previous?.revision || 0,body.revision); const result=await t.saveSettings(projectId,values); await t.audit(projectId,actor.id,"settings","update_site",projectId,previous,result); return result; });
        },
        async photoList(projectId,actor) { return { photos:await model.photos(projectId,actor.role==="worker" ? actor.id : null),member_role:actor.role }; },
        async uploadPhoto(projectId,actor,body) {
            const prepared = await preparePhoto(body);
            return tx(projectId,async (t) => {
                await item(t,projectId,prepared.work_item_id);
                const upload=await t.photoUpload(prepared.client_uuid);
                const journalId=body.journal_id ? v.id(body.journal_id) : upload?.journal_id;
                let journal;
                if (journalId) {
                    journal=await t.journal(projectId,journalId);
                    if (!journal || journal.work_item_id!==prepared.work_item_id || !upload || upload.journal_id!==journalId || upload.uploaded_by!==actor.id) throw v.problem(403,"Ảnh không thuộc nhật ký hoặc tài khoản này");
                }
                if (actor.role==="worker" && !await t.workerCanUseItem(projectId,prepared.work_item_id,actor.id)) throw v.problem(403,"Chỉ được tải ảnh cho hạng mục của đội mình");
                const existing=await t.photoByUuid(prepared.client_uuid);
                if (existing) { if (existing.project_id!==projectId || existing.uploaded_by!==actor.id || existing.content_hash!==prepared.content_hash || existing.work_item_id!==prepared.work_item_id || (upload && upload.photo_id!==existing.id)) throw v.problem(409,"Mã tải ảnh đã được sử dụng"); return existing; }
                if (journal) await unlocked(t,projectId,journal.day,journal.id);
                const site=await t.settings(projectId);
                prepared.distance_m=site?.latitude!=null && prepared.latitude!=null ? Math.round(distance(site.latitude,site.longitude,prepared.latitude,prepared.longitude)) : null;
                prepared.suspicious=prepared.distance_m!==null && prepared.distance_m>site.radius_m;
                const photo=await t.createPhoto(projectId,actor.id,prepared);
                if (upload) {
                    await t.completePhotoUpload(upload.client_uuid,photo.id); await t.attachJournalPhoto(upload.journal_id,photo.id);
                    const previous=await t.journal(projectId,upload.journal_id);
                    const journal=await t.updateJournal(projectId,previous.id,previous);
                    await t.saveVersion({ ...journal,time:journal.time.slice(0,5),photo_ids:await t.journalPhotoIds(journal.id) },actor.id);
                }
                await t.audit(projectId,actor.id,"photos","upload",photo.id,null,{ filename:prepared.filename,work_item_id:prepared.work_item_id,suspicious:prepared.suspicious });
                return photo;
            });
        },
        async photo(projectId,actor,photoId) { const photo=await model.photo(projectId,v.id(photoId)); if (!photo) throw v.problem(404,"Không tìm thấy ảnh"); if (actor.role==="worker" && photo.uploaded_by!==actor.id) throw v.problem(403,"Bạn chỉ được xem ảnh của mình"); return photo; },
        async attachIssuePhotos(projectId,actor,issueId,body) {
            return tx(projectId,async (t) => {
                const operationModel = t;
                const issue=await operationModel.issue(projectId,v.id(issueId));
                if (!issue || issue.reported_by!==actor.id) throw v.problem(403,"Bạn chỉ được đính ảnh vào vướng mắc mình đã báo");
                const task=await t.task(projectId,issue.task_id);
                const ids=v.ids(body.photo_ids);
                await photos(t,projectId,ids,actor,task.work_item_id); await t.linkIssuePhotos(issue.id,ids); return { photo_ids:ids };
            });
        },
        ...require("./journalService").createJournalService({ model }),

        async acceptanceData(projectId,actor) { return { forms:await model.acceptances(projectId),contracts:await model.contracts(projectId),items:await model.items(projectId),member_role:actor.role,can_edit:[...MANAGE,"engineer"].includes(actor.role),can_approve:ACCEPT_APPROVE.includes(actor.role) }; },
        async saveContract(projectId,actor,itemId,body) {
            const values={ quantity:v.decimal(body.quantity,4),unit:v.text(body.unit,"Đơn vị",30),unit_price:v.decimal(body.unit_price,2,true) };
            return tx(projectId,async (t) => { await item(t,projectId,itemId,true); const previous=await t.contract(projectId,itemId); v.revision(previous?.revision || 0,body.revision); if (previous && previous.unit!==values.unit && v.scaled(previous.approved_quantity)>0n) throw v.problem(409,"Không thể đổi đơn vị khi đã có nghiệm thu duyệt"); const result=await t.saveContract(projectId,itemId,values); await t.audit(projectId,actor.id,"acceptance","update_contract",itemId,previous,result); return result; });
        },
        async saveAcceptance(projectId,actor,id,body) {
            const values={ work_item_id:v.id(body.work_item_id),period:v.text(body.period,"Kỳ/đợt"),day:v.date(body.day),cumulative:v.decimal(body.cumulative,4),notes:v.text(body.notes,"Ghi chú",5000,true),photo_ids:v.ids(body.photo_ids) };
            return tx(projectId,async (t) => {
                await item(t,projectId,values.work_item_id,true); const contract=await t.contract(projectId,values.work_item_id);
                if (!contract) throw v.problem(422,"Hạng mục chưa có khối lượng hợp đồng và đơn giá");
                if (v.scaled(values.cumulative)>v.scaled(contract.quantity) || v.scaled(values.cumulative)<=v.scaled(contract.approved_quantity)) throw v.problem(422,"Lũy kế phải lớn hơn phần đã duyệt và không vượt khối lượng hợp đồng");
                const previous=id ? await t.acceptance(projectId,v.id(id)) : null;
                if (id && !previous) throw v.problem(404,"Không tìm thấy phiếu");
                if (previous) { canEditRecord(actor,previous); v.revision(previous.revision,body.revision); if (!["draft","returned"].includes(previous.status)) throw v.problem(409,"Chỉ sửa phiếu nháp hoặc đã trả lại"); if (previous.work_item_id!==values.work_item_id) throw v.problem(409,"Không được đổi hạng mục của phiếu đã lập"); }
                await photos(t,projectId,values.photo_ids,actor,values.work_item_id);
                const result=await t.saveAcceptance(projectId,actor.id,id,{ ...values,previous_cumulative:contract.approved_quantity,unit:contract.unit,unit_price:contract.unit_price });
                await t.linkAcceptancePhotos(result.id,values.photo_ids); await t.audit(projectId,actor.id,"acceptance",id ? "update" : "create",result.id,previous,result); return result;
            });
        },
        async transitionAcceptance(projectId,actor,id,body) {
            const status=body.action==="submit" ? "submitted" : body.action==="approve" ? "approved" : body.action==="return" ? "returned" : null;
            if (!status) throw v.problem(400,"Thao tác không hợp lệ");
            if (status!=="submitted") requireRole(actor,ACCEPT_APPROVE); else requireRole(actor,[...MANAGE,"engineer"]);
            const reason=v.text(body.reason,"Lý do trả lại",2000,status!=="returned");
            return tx(projectId,async (t) => {
                const previous=await t.acceptance(projectId,v.id(id)); if (!previous) throw v.problem(404,"Không tìm thấy phiếu"); v.revision(previous.revision,body.revision);
                if (status==="submitted") { canEditRecord(actor,previous); if (previous.status!=="draft") throw v.problem(409,"Chỉ trình duyệt phiếu nháp"); }
                else if (previous.status!=="submitted") throw v.problem(409,"Phiếu chưa chờ duyệt");
                if (status!=="returned") { const contract=await t.contract(projectId,previous.work_item_id); if (v.scaled(contract.approved_quantity)!==v.scaled(previous.previous_cumulative)) throw v.problem(409,"Lũy kế đã thay đổi. Trả lại phiếu để cập nhật trước khi duyệt."); }
                const result=await t.transitionAcceptance(projectId,id,actor.id,status,reason); await t.audit(projectId,actor.id,"acceptance",body.action,id,previous,result);
                if (status==="returned") await notifyReturn(t,projectId,result,"acceptance_returned","acceptance"); return result;
            });
        },
        async paymentData(projectId,actor) { return { requests:await model.payments(projectId),acceptances:await model.acceptances(projectId),can_edit:PAYMENT_EDIT.includes(actor.role),can_approve:PAYMENT_APPROVE.includes(actor.role),member_role:actor.role }; },
        async savePayment(projectId,actor,id,body) {
            requireRole(actor,PAYMENT_EDIT); const values={ period:v.text(body.period,"Kỳ thanh toán"),day:v.date(body.day),retention_rate:v.decimal(body.retention_rate,2,true),acceptance_ids:v.ids(body.acceptance_ids,100) };
            if (v.scaled(values.retention_rate,2)>10000n || !values.acceptance_ids.length) throw v.problem(400,"Chọn phiếu nghiệm thu và tỷ lệ tạm giữ từ 0 đến 100%");
            return tx(projectId,async (t) => { const previous=id ? await t.payment(projectId,v.id(id)) : null; if (id && !previous) throw v.problem(404,"Không tìm thấy đề nghị"); if (previous) { v.revision(previous.revision,body.revision); if (!["draft","returned"].includes(previous.status)) throw v.problem(409,"Đề nghị đã trình/duyệt không thể sửa"); }
                if ((await t.paymentSource(projectId,values.acceptance_ids,id)).length!==values.acceptance_ids.length) throw v.problem(409,"Chỉ được dùng phiếu nghiệm thu đã duyệt và chưa thuộc đề nghị khác");
                const result=await t.savePayment(projectId,actor.id,id,values); await t.audit(projectId,actor.id,"payments",id ? "update" : "create",result.id,previous,{ ...result,acceptance_ids:values.acceptance_ids }); return result; });
        },
        async transitionPayment(projectId,actor,id,body) {
            const status=body.action==="submit" ? "submitted" : body.action==="approve" ? "approved" : body.action==="return" ? "returned" : null;
            if (!status) throw v.problem(400,"Thao tác không hợp lệ"); requireRole(actor,status==="submitted" ? PAYMENT_EDIT : PAYMENT_APPROVE);
            const reason=v.text(body.reason,"Lý do trả lại",2000,status!=="returned");
            return tx(projectId,async (t) => { const previous=await t.payment(projectId,v.id(id)); if (!previous) throw v.problem(404,"Không tìm thấy đề nghị"); v.revision(previous.revision,body.revision); if ((status==="submitted" && previous.status!=="draft") || (status!=="submitted" && previous.status!=="submitted")) throw v.problem(409,"Trạng thái đề nghị không phù hợp"); const result=await t.transitionPayment(projectId,id,actor.id,status,reason); await t.audit(projectId,actor.id,"payments",body.action,id,previous,result); if (status==="returned") await notifyReturn(t,projectId,result,"payment_returned","payments"); return result; });
        },
        async costsData(projectId,actor) { return tx(projectId,async (t) => { const items=await t.items(projectId),budgets=await t.budgets(projectId),costs=await t.costs(projectId),contracts=await t.contracts(projectId); return { items,budgets,costs,comparison:costComparison(items,budgets,costs,contracts),materials:await t.materials(projectId),inventory:await t.inventory(projectId),norms:await t.norms(projectId),reconciliation:await t.reconciliation(projectId),can_edit:[...MANAGE,"accountant"].includes(actor.role) }; }); },
        async saveBudget(projectId,actor,body) { const values={ work_item_id:v.id(body.work_item_id),amount:v.decimal(body.amount,2,true),notes:v.text(body.notes,"Ghi chú",2000,true) }; return tx(projectId,async (t) => { await item(t,projectId,values.work_item_id,true); const previous=(await t.budgets(projectId)).find((entry) => entry.work_item_id===values.work_item_id); v.revision(previous?.version || 0,body.version); const result=await t.saveBudget(projectId,actor.id,values); await t.audit(projectId,actor.id,"costs","budget_version",result.id,previous,result); return result; }); },
        async saveCost(projectId,actor,body) { return tx(projectId,(t) => saveCost(t,projectId,actor,body)); },
        async importCosts(projectId,actor,body) {
            const batch=v.uuid(body.client_uuid); if (typeof body.csv!=="string" || Buffer.byteLength(body.csv)>1024*1024) throw v.problem(400,"CSV tối đa 1 MB"); let rows;
            try { rows=parse(body.csv,{ columns:true,bom:true,skip_empty_lines:true,trim:true }); } catch { throw v.problem(400,"CSV không hợp lệ"); }
            if (!rows.length || rows.length>1000) throw v.problem(400,"CSV phải có từ 1 đến 1000 dòng");
            return tx(projectId,async (t) => { const results=[]; for (let index=0;index<rows.length;index++) { const row=rows[index]; const hex=v.hash(`${batch}:${index}`); const uuid=`${hex.slice(0,8)}-${hex.slice(8,12)}-4${hex.slice(13,16)}-8${hex.slice(17,20)}-${hex.slice(20,32)}`; try { results.push(await saveCost(t,projectId,actor,{ ...row,work_item_id:row.work_item_id ? Number(row.work_item_id) : null,client_uuid:uuid })); } catch (error) { if (error.expose) error.message=`Dòng ${index+2}: ${error.message}`; throw error; } } return { count:results.length }; });
        },
        async allocateCost(projectId,actor,id,body) { return tx(projectId,async (t) => { await item(t,projectId,v.id(body.work_item_id),true); const previous=(await t.costs(projectId)).find((entry) => entry.id===v.id(id)); if (!previous) throw v.problem(404,"Không tìm thấy khoản chi"); v.revision(previous.revision,body.revision); const result=await t.allocateCost(projectId,id,body.work_item_id,body.revision); await t.audit(projectId,actor.id,"costs","allocate_cost",id,previous,result); return result; }); },
        async createMaterial(projectId,actor,body) { const values={ name:v.text(body.name,"Tên vật tư"),unit:v.text(body.unit,"Đơn vị",30) }; return tx(projectId,async (t) => { const result=await t.createMaterial(projectId,values); await t.audit(projectId,actor.id,"materials","create",result.id,null,result); return result; }); },
        async inventory(projectId,actor,body) {
            const values={ material_id:v.id(body.material_id),work_item_id:body.work_item_id ? v.id(body.work_item_id) : null,direction:body.direction,quantity:v.decimal(body.quantity,4),day:v.date(body.day),notes:v.text(body.notes,"Ghi chú",2000,true),client_uuid:v.uuid(body.client_uuid) };
            if (!["in","out"].includes(values.direction) || (values.direction==="out" && !values.work_item_id)) throw v.problem(400,"Phiếu xuất phải có hạng mục nhận");
            return tx(projectId,async (t) => {
                const previous=await t.inventoryByUuid(values.client_uuid);
                if (previous) { if (previous.project_id!==projectId || previous.created_by!==actor.id || previous.material_id!==values.material_id || previous.work_item_id!==values.work_item_id || previous.direction!==values.direction || v.scaled(previous.quantity)!==v.scaled(values.quantity) || previous.day!==values.day || previous.notes!==values.notes) throw v.problem(409,"Mã phiếu kho đã dùng cho nội dung khác"); return previous; }
                if (values.work_item_id) await item(t,projectId,values.work_item_id,true); const material=await t.material(projectId,values.material_id); if (!material) throw v.problem(404,"Vật tư không thuộc dự án"); if (values.direction==="out" && v.scaled(values.quantity)>v.scaled(material.stock)) throw v.problem(422,"Không đủ tồn kho để xuất"); const result=await t.createInventory(projectId,actor.id,values); await t.audit(projectId,actor.id,"materials",values.direction,result.id,null,result); return result;
            });
        },
        async norm(projectId,actor,body) { const values={ work_item_id:v.id(body.work_item_id),material_id:v.id(body.material_id),quantity_per_unit:v.decimal(body.quantity_per_unit,4) }; return tx(projectId,async (t) => { await item(t,projectId,values.work_item_id,true); if (!await t.material(projectId,values.material_id)) throw v.problem(404,"Không tìm thấy vật tư"); const previous=(await t.norms(projectId)).find((entry) => entry.work_item_id===values.work_item_id && entry.material_id===values.material_id); const result=await t.saveNorm(projectId,values); await t.audit(projectId,actor.id,"materials","set_norm",`${values.work_item_id}:${values.material_id}`,previous,result); return result; }); },
        async milestone(projectId,actor,body) { const values={ title:v.text(body.title,"Tên mốc"),task_id:v.id(body.task_id),due_date:v.date(body.due_date) }; return tx(projectId,async (t) => { if (!await t.task(projectId,values.task_id)) throw v.problem(404,"Công việc không thuộc dự án"); const result=await t.createMilestone(projectId,actor.id,values); await t.audit(projectId,actor.id,"reports","create_milestone",result.id,null,result); return result; }); },
        async report(projectId,actor) {
            return tx(projectId,async (t,lock) => {
                const project=await t.project(projectId),calendar=await t.calendar(projectId),holidays=(await t.holidays(projectId)).map((entry) => entry.day),today=dayNow();
                const tasks=(await t.tasks(projectId,lock)).map((task) => { const finish_date=workingDate(project.start_date,task.ef-1,calendar.working_days,holidays); const complete=task.planned_quantity && task.reported_quantity>=task.planned_quantity; return { ...task,finish_date,complete,is_late:Boolean(finish_date && finish_date<today && !complete) }; });
                const milestones=(await t.milestones(projectId)).map((m) => { const task=tasks.find((entry) => entry.id===m.task_id); return { ...m,complete:Boolean(task?.complete),overdue:!task?.complete && m.due_date<today }; });
                const members=await t.participants(projectId);
                for (const m of milestones.filter((entry) => entry.overdue)) for (const user of members.filter((user) => [...MANAGE,"viewer"].includes(user.role))) await t.notify(projectId,user.id,"milestone_overdue",`Mốc đã quá hạn: ${m.title}`,`/reports?projectId=${projectId}`,`milestone:${m.id}`);
                for (const task of tasks.filter((entry) => entry.isCritical && entry.is_late)) for (const user of members.filter((user) => [...MANAGE,"viewer"].includes(user.role))) await t.notify(projectId,user.id,"critical_overdue",`Công việc găng đang trễ: ${task.name}`,`/field-assignments?projectId=${projectId}&taskId=${task.id}`,`critical:${task.id}:${task.finish_date}`);
                const dates=tasks.map((task) => task.finish_date).filter(Boolean).sort();
                const known=tasks.length && tasks.every((task) => task.planned_quantity);
                const duration=tasks.reduce((sum,task) => sum+task.duration_days,0);
                const progress=known ? tasks.reduce((sum,task) => sum+Math.min(task.reported_quantity/task.planned_quantity,1)*task.duration_days,0)/duration*100 : null;
                return { project,tasks,milestones,progress,planned_finish:dates.at(-1) || null,forecast_finish:null,items:await t.items(projectId),contracts:await t.contracts(projectId),acceptances:await t.acceptances(projectId),payments:await t.payments(projectId),costs:await t.costs(projectId),budgets:await t.budgets(projectId),can_manage:MANAGE.includes(actor.role) };
            });
        }
    };
}
module.exports = { createSiteManagementService,costComparison };

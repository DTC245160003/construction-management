const { randomUUID } = require("node:crypto");
const v=require("./siteValidation");
const WRITE=["admin","manager","project_manager","engineer"];
const MANAGE=WRITE.filter((r) => r!=="engineer");
const LOCKED_MESSAGE="Nhật ký ngày đã bị khóa sổ, không thể chỉnh sửa hoặc xóa.";
const fields=["work_item_id","day","time","content","photo_ids"];
const equal=(a,b) => JSON.stringify(a)===JSON.stringify(b);
const snapshot=(j,photos=[]) => ({ ...j,time:j.time.slice(0,5),photo_ids:photos });
function createJournalService({ model }) {
    const role=(actor,roles=WRITE) => { if (!roles.includes(actor.role)) throw v.problem(403,"Bạn không có quyền thực hiện thao tác này"); };
    const tx=async (pid,fn) => {
        try { return await model.transaction(pid,fn); }
        catch (e) { if (e.code==="23514") { if (e.message?.includes("locked")) throw v.problem(403,LOCKED_MESSAGE); throw v.problem(422,"Ảnh không thuộc đúng dự án hoặc hạng mục"); } if (e.code==="23505") throw v.problem(409,"Mã đồng bộ đã được sử dụng"); throw e; }
    };
    const unlocked=async (t,pid,day,record=null) => {
        const lock=await t.dayLock(pid,day);
        if (lock?.locked || lock?.is_locked || record?.is_locked || record?.locked) throw v.problem(403,LOCKED_MESSAGE);
    };
    async function validate(t,pid,j) {
        if (!await t.item(pid,j.work_item_id)) throw v.problem(404,"Không tìm thấy hạng mục trong dự án");
        const photos=await t.photoIds(pid,j.photo_ids);
        if (photos.length!==j.photo_ids.length || photos.some((p) => p.work_item_id!==j.work_item_id)) throw v.problem(422,"Ảnh phải thuộc đúng dự án và hạng mục");
    }
    async function dailyValues(t,pid,body) {
        const catalog=await t.catalog(pid);
        const weather=catalog.find((c) => c.kind==="weather" && c.active && (body.weather_code ? c.code===body.weather_code : c.label===body.weather));
        if (!weather) throw v.problem(400,"Chọn thời tiết đã được cấu hình cho dự án");
        let equipment;
        if (body.equipment_codes!==undefined) {
            if (!Array.isArray(body.equipment_codes) || body.equipment_codes.length>100 || body.equipment_codes.some((c) => typeof c!=="string")) throw v.problem(400,"Thiết bị không hợp lệ");
            equipment=[...new Set(body.equipment_codes)].map((code) => catalog.find((c) => c.kind==="equipment" && c.active && c.code===code));
        } else {
            const text=v.text(body.equipment,"Thiết bị",5000,true);
            equipment=text ? text.split(", ").map((label) => catalog.find((c) => c.kind==="equipment" && c.active && c.label===label)) : [];
        }
        if (equipment.some((c) => !c)) throw v.problem(400,"Chọn thiết bị đã được cấu hình cho dự án");
        if (!Number.isInteger(body.manpower) || body.manpower<0 || body.manpower>1000000) throw v.problem(400,"Nhân lực phải là số nguyên không âm");
        return { manpower:body.manpower,equipment:equipment.map((c) => c.label).join(", "),equipment_codes:equipment.map((c) => c.code),weather:weather.label,weather_code:weather.code,all_day_rain:weather.all_day_rain };
    }
    return {
        async journals(pid,actor) { return { journals:await model.journals(pid),items:await model.items(pid),catalog:await model.catalog(pid),member_role:actor.role }; },
        async daily(pid,day) { v.date(day); return { daily:await model.daily(pid,day),lock:await model.dayLock(pid,day) }; },
        async dailyRange(pid,actor,from,to) {
            v.date(from); v.date(to); if (from>to || (Date.parse(to)-Date.parse(from))/86400000>366) throw v.problem(400,"Khoảng ngày không hợp lệ (tối đa 366 ngày)");
            const { workingDate }=require("./workingCalendar");
            const tasks=await model.transaction(pid,async (t,project) => {
                const p=await t.project(pid),calendar=await t.calendar(pid),holidays=(await t.holidays(pid)).map((h) => h.day);
                const today=new Intl.DateTimeFormat("en-CA",{ timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date());
                return (await t.tasks(pid,project)).map((task) => { const finish_date=workingDate(p.start_date,task.ef-1,calendar.working_days,holidays); return { ...task,finish_date,delayed:Boolean(finish_date && finish_date<today && task.planned_quantity && task.reported_quantity<task.planned_quantity) }; });
            });
            return { days:await model.dailyRange(pid,from,to),tasks,member_role:actor.role };
        },
        async saveDaily(pid,actor,body) {
            role(actor); const day=v.date(body.day);
            return tx(pid,async (t) => { const before=await t.daily(pid,day); await unlocked(t,pid,day,before); const values=await dailyValues(t,pid,body); v.revision(before?.revision || 0,body.revision); const result=await t.saveDaily(pid,day,values); await t.audit(pid,actor.id,"journal","daily_info",day,before,result); return result; });
        },
        async saveCatalog(pid,actor,body) {
            role(actor,MANAGE);
            if (!["weather","equipment"].includes(body.kind) || typeof body.code!=="string" || !/^[a-z0-9_-]{1,80}$/.test(body.code) || typeof body.active!=="boolean" || typeof body.all_day_rain!=="boolean" || (body.kind==="equipment" && body.all_day_rain)) throw v.problem(400,"Cấu hình không hợp lệ");
            const values={ ...body,label:v.text(body.label,"Tên cấu hình",255) };
            return tx(pid,async (t) => { const result=await t.saveCatalog(pid,values); await t.audit(pid,actor.id,"journal","configure_catalog",body.code,null,values); return result; });
        },
        async saveJournal(pid,actor,id,body) {
            role(actor);
            let j={ work_item_id:v.id(body.work_item_id),day:v.date(body.day),time:body.time,content:v.text(body.content,"Nội dung nhật ký",20000),photo_ids:v.ids(body.photo_ids) };
            if (typeof j.time!=="string" || !/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(j.time)) throw v.problem(400,"Giờ nhật ký không hợp lệ");
            j.time=j.time.slice(0,5);
            const uuid=body.operation_uuid ? v.uuid(body.operation_uuid) : (id ? randomUUID() : v.uuid(body.client_uuid));
            const inputHash=v.hash({ id,j,revision:body.revision,pending_photos:body.pending_photos || [],manpower:body.manpower,equipment:body.equipment,weather:body.weather,weather_code:body.weather_code,equipment_codes:body.equipment_codes,daily_revision:body.daily_revision });
            return tx(pid,async (t) => {
                const write=await t.journalWrite(uuid);
                if (write) { if (write.project_id!==pid || write.actor_id!==actor.id || write.input_hash!==inputHash) throw v.problem(409,"Mã đồng bộ đã được dùng cho nội dung khác"); return { ...write.result,replayed:true }; }
                let previous=id ? await t.journal(pid,v.id(id)) : null;
                if (id && !previous) throw v.problem(404,"Không tìm thấy nhật ký");
                if (!id) {
                    j.client_uuid=v.uuid(body.client_uuid); j.input_hash=inputHash;
                    const old=await t.journalByUuid(j.client_uuid);
                    if (old) { if (old.project_id!==pid || old.author_id!==actor.id || old.input_hash!==inputHash) throw v.problem(409,"Mã nhật ký đã được sử dụng"); return { journal:old,replayed:true }; }
                }
                await unlocked(t,pid,j.day,previous); if (previous) await unlocked(t,pid,previous.day,previous);
                await validate(t,pid,j);
                let merged=false;
                if (previous) {
                    if (!Number.isInteger(body.revision) || body.revision<1 || body.revision>previous.revision) throw v.problem(409,"Phiên bản nhật ký không hợp lệ");
                    const currentVersion=await t.version(id,previous.revision);
                    previous=snapshot(previous,currentVersion?.snapshot.photo_ids || []);
                    if (body.revision!==previous.revision) {
                        const base=(await t.version(id,body.revision))?.snapshot;
                        if (!base) throw v.problem(409,"Không tìm thấy phiên bản gốc để so sánh");
                        const changed=fields.filter((f) => !equal(j[f],base[f]));
                        const collisions=changed.filter((f) => !equal(previous[f],base[f]) && !equal(j[f],previous[f]));
                        if (collisions.length) {
                            const conflict=await t.createConflict(previous,actor.id,base,previous,{ ...j,pending_photos:body.pending_photos || [] },uuid);
                            const result={ conflict,conflicted:true,journal:previous };
                            await t.saveJournalWrite(uuid,pid,actor.id,inputHash,result);
                            await t.audit(pid,actor.id,"journal","conflict",id,previous,j);
                            return result;
                        }
                        j={ ...previous,...Object.fromEntries(changed.map((f) => [f,j[f]])) }; merged=true;
                        await unlocked(t,pid,j.day); await validate(t,pid,j);
                    }
                }
                const previousDaily=await t.daily(pid,j.day);
                // A stale edit can merge onto the server's newer day. Its header
                // still describes the submitted day and must not overwrite it.
                if (!previousDaily && j.day!==body.day) throw v.problem(409,"Thông tin ngày nhật ký đã thay đổi. Tải lại trước khi lưu.");
                if (j.day===body.day && (!previousDaily || body.daily_revision!==undefined)) {
                    const d=await dailyValues(t,pid,body);
                    const changed=!previousDaily || Object.keys(d).some((k) => !equal(previousDaily[k],d[k]));
                    if (changed) { await unlocked(t,pid,j.day,previousDaily); v.revision(previousDaily?.revision || 0,body.daily_revision ?? 0); await t.saveDaily(pid,j.day,d); }
                }
                const journal=id ? await t.updateJournal(pid,id,{ ...j,revision:previous.revision }) : await t.createJournal(pid,actor.id,j);
                await t.linkJournalPhotos(journal.id,j.photo_ids);
                const pending=body.pending_photos || [];
                if (!Array.isArray(pending) || pending.length+j.photo_ids.length>20) throw v.problem(400,"Tối đa 20 ảnh cho mỗi nhật ký");
                for (const p of pending) {
                    const photo={ client_uuid:v.uuid(p.client_uuid),filename:v.text(p.filename,"Tên ảnh",255) };
                    const old=await t.photoUpload(photo.client_uuid);
                    if (old && (old.journal_id!==journal.id || old.uploaded_by!==actor.id || old.filename!==photo.filename)) throw v.problem(409,"Mã ảnh chờ đã được sử dụng");
                    if (!old) await t.createPhotoUpload(journal.id,actor.id,photo);
                }
                await t.saveVersion(snapshot(journal,j.photo_ids),actor.id);
                await t.audit(pid,actor.id,"journal",id ? "update" : "create",journal.id,previous,{ ...journal,photo_ids:j.photo_ids,merged });
                const result={ journal,merged,replayed:false };
                await t.saveJournalWrite(uuid,pid,actor.id,inputHash,result);
                return result;
            });
        },
        async syncJournals(pid,actor,body) {
            role(actor);
            if (!Array.isArray(body.entries) || body.entries.length>20) throw v.problem(400,"Mỗi lần đồng bộ tối đa 20 nhật ký");
            const results=[];
            for (const entry of body.entries) {
                try { if (!entry || typeof entry!=="object" || Array.isArray(entry)) throw v.problem(400,"Mục đồng bộ không hợp lệ"); const result=await this.saveJournal(pid,actor,entry.id || null,entry); results.push({ client_uuid:entry.client_uuid,ok:!result.conflicted,status:result.conflicted ? 409 : 200,...result }); }
                catch (e) { if (!e.expose) throw e; results.push({ client_uuid:entry?.client_uuid,ok:false,status:e.status,message:e.message }); }
            }
            return { results };
        },
        async history(pid,actor,id) {
            const journal=await model.journal(pid,v.id(id)); if (!journal) throw v.problem(404,"Không tìm thấy nhật ký");
            return { journal,versions:await model.versions(id),conflicts:await model.conflicts(id),photo_uploads:await model.photoUploads(id) };
        },
        async resolve(pid,actor,conflictId,body) {
            role(actor); if (!["server","incoming"].includes(body.chosen)) throw v.problem(400,"Chọn phiên bản giữ lại");
            return tx(pid,async (t) => {
                const c=await t.conflict(pid,v.id(conflictId)); if (!c || c.resolved_at) throw v.problem(409,"Xung đột không còn chờ xử lý");
                const current=await t.journal(pid,c.journal_id); if (!current) throw v.problem(404,"Nhật ký đã xóa");
                await unlocked(t,pid,current.day,current); v.revision(current.revision,body.revision);
                const chosen=body.chosen==="server" ? snapshot(current,(await t.version(current.id,current.revision)).snapshot.photo_ids) : c.incoming_snapshot;
                await unlocked(t,pid,chosen.day); await validate(t,pid,chosen);
                const journal=await t.updateJournal(pid,current.id,{ ...chosen,revision:current.revision });
                await t.linkJournalPhotos(current.id,chosen.photo_ids);
                for (const p of chosen.pending_photos || []) if (!await t.photoUpload(v.uuid(p.client_uuid))) await t.createPhotoUpload(current.id,c.actor_id,{ client_uuid:v.uuid(p.client_uuid),filename:v.text(p.filename,"Tên ảnh",255) });
                await t.saveVersion(snapshot(journal,chosen.photo_ids),actor.id);
                await t.resolveConflict(c.id,actor.id,body.chosen);
                await t.audit(pid,actor.id,"journal","resolve_conflict",c.id,c,{ chosen:body.chosen,revision:journal.revision });
                return { journal };
            });
        },
        async deleteJournal(pid,actor,id,body) {
            role(actor); return tx(pid,async (t) => { const j=await t.journal(pid,v.id(id)); if (!j) throw v.problem(404,"Không tìm thấy nhật ký"); if (j.author_id!==actor.id && !MANAGE.includes(actor.role)) throw v.problem(403,"Chỉ được xóa nhật ký do mình ghi"); await unlocked(t,pid,j.day,j); v.revision(j.revision,body.revision); await t.deleteJournal(pid,id,body.revision); await t.saveVersion({ ...j,revision:j.revision+1,deleted:true },actor.id); await t.audit(pid,actor.id,"journal","delete",id,j,null); return { id }; });
        },
        async lockJournal(pid,actor,body) {
            role(actor);
            const locked=body.is_locked!==undefined ? body.is_locked : body.locked!==undefined ? body.locked : true;
            if (typeof locked!=="boolean" || (body.is_locked!==undefined && body.locked!==undefined && body.is_locked!==body.locked)) throw v.problem(400,"Trạng thái khóa không hợp lệ");
            if (!locked) role(actor,["admin"]);
            const day=body.day ? v.date(body.day) : null;
            const recordId=body.recordId || body.id ? v.id(body.recordId || body.id) : null;
            if (!day && !recordId) throw v.problem(400,"Cần ngày hoặc id nhật ký để khóa sổ");
            const now=new Intl.DateTimeFormat("en-CA",{ timeZone:"Asia/Ho_Chi_Minh",year:"numeric",month:"2-digit",day:"2-digit" }).format(new Date());
            const reason=v.text(body.reason,"Lý do mở khóa",2000,locked);
            return tx(pid,async (t) => {
                const record=recordId ? await t.journal(pid,recordId) : null;
                if (recordId && !record) throw v.problem(404,"Không tìm thấy nhật ký");
                if (record && day && record.day!==day) throw v.problem(400,"Ngày khóa phải trùng ngày của nhật ký");
                if (locked && (day || record.day)>=now) throw v.problem(400,"Chỉ khóa sổ ngày đã qua");
                let result;
                if (day) {
                    const before=await t.dayLock(pid,day);
                    result=await t.setDayLock(pid,day,actor.id,locked,reason);
                    await t.audit(pid,actor.id,"journal",locked ? "lock_day" : "unlock_day",day,before,result);
                } else {
                    await unlocked(t,pid,record.day);
                    result=await t.lockJournalRecord(pid,recordId,actor.id,locked);
                    await t.audit(pid,actor.id,"journal",locked ? "lock_record" : "unlock_record",recordId,record,{ ...result,reason });
                }
                return { ...result,is_locked:locked,locked,locked_at:locked ? result.locked_at || result.updated_at : null,locked_by:locked ? result.locked_by || result.changed_by || actor.id : null };
            });
        }
    };
}
module.exports={ createJournalService };

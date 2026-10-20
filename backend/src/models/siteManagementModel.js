const { withProjectTransaction } = require("./projectTransaction");
const { createProjectOperationsModel } = require("./projectOperationsModel");

const photoColumns = "p.id,p.project_id,p.work_item_id,p.uploaded_by,p.filename,p.taken_at,p.latitude,p.longitude,p.metadata,p.distance_m,p.suspicious,p.created_at";
function createSiteManagementModel(pool) {
    const query = async (sql, values = []) => (await pool.query(sql, values)).rows;
    const one = async (sql, values) => (await query(sql, values))[0] || null;
    const operations = createProjectOperationsModel(pool);
    return {
        transaction: (projectId, callback) => withProjectTransaction(pool, projectId, (client, project) => callback(createSiteManagementModel(client), project)),
        audit: operations.audit,
        project: operations.project,
        teams: operations.teams,
        task: operations.task,
        issue: operations.issue,
        tasks: operations.fieldTasks,
        calendar: operations.calendar,
        holidays: operations.holidays,
        participants: operations.participants,
        catalog: (projectId) => query("SELECT * FROM journal_catalog WHERE project_id=$1 ORDER BY kind,code",[projectId]),
        saveCatalog: (projectId,c) => one(`INSERT INTO journal_catalog(project_id,kind,code,label,all_day_rain,active) VALUES($1,$2,$3,$4,$5,$6)
            ON CONFLICT(project_id,kind,code) DO UPDATE SET label=$4,all_day_rain=$5,active=$6 RETURNING *`,[projectId,c.kind,c.code,c.label,c.all_day_rain,c.active]),
        dailyRange: (projectId,from,to) => query(`SELECT d.*,d.day::text AS day,(d.is_locked OR EXISTS(SELECT 1 FROM journal_day_locks l WHERE l.project_id=d.project_id AND l.day=d.day AND l.locked)
            OR EXISTS(SELECT 1 FROM site_journals j WHERE j.project_id=d.project_id AND j.day=d.day AND j.is_locked AND j.deleted_at IS NULL)) AS is_locked
            FROM journal_daily_info d WHERE d.project_id=$1 AND d.day BETWEEN $2 AND $3 ORDER BY d.day`,[projectId,from,to]),
        journalPhotoIds: async (id) => (await query("SELECT photo_id FROM journal_photos WHERE journal_id=$1 ORDER BY photo_id",[id])).map((p) => p.photo_id),
        version: (id,revision) => one("SELECT * FROM journal_versions WHERE journal_id=$1 AND revision=$2",[id,revision]),
        versions: (id) => query("SELECT * FROM journal_versions WHERE journal_id=$1 ORDER BY revision DESC",[id]),
        saveVersion: (j,actorId) => query("INSERT INTO journal_versions(journal_id,revision,snapshot,actor_id) VALUES($1,$2,$3,$4) ON CONFLICT DO NOTHING",[j.id,j.revision,j,actorId]),
        journalWrite: (uuid) => one("SELECT * FROM journal_writes WHERE operation_uuid=$1",[uuid]),
        saveJournalWrite: (uuid,projectId,actorId,hash,result) => query("INSERT INTO journal_writes(operation_uuid,project_id,actor_id,input_hash,result) VALUES($1,$2,$3,$4,$5)",[uuid,projectId,actorId,hash,result]),
        conflicts: (journalId) => query("SELECT * FROM journal_conflicts WHERE journal_id=$1 ORDER BY id DESC",[journalId]),
        conflict: (projectId,id) => one("SELECT c.* FROM journal_conflicts c JOIN site_journals j ON j.id=c.journal_id WHERE j.project_id=$1 AND c.id=$2",[projectId,id]),
        createConflict: (j,actorId,base,server,incoming,uuid) => one(`INSERT INTO journal_conflicts(journal_id,operation_uuid,actor_id,base_revision,base_snapshot,server_snapshot,incoming_snapshot)
            VALUES($1,$2,$3,$4,$5,$6,$7) RETURNING *`,[j.id,uuid,actorId,base.revision,base,server,incoming]),
        resolveConflict: (id,actorId,chosen) => query("UPDATE journal_conflicts SET resolved_by=$2,resolved_at=CURRENT_TIMESTAMP,chosen=$3 WHERE id=$1 AND resolved_at IS NULL",[id,actorId,chosen]),
        photoUpload: (uuid) => one(`SELECT p.*,j.project_id,j.work_item_id,j.day::text AS day FROM journal_photo_uploads p JOIN site_journals j ON j.id=p.journal_id WHERE p.client_uuid=$1`,[uuid]),
        photoUploads: (id) => query("SELECT client_uuid,filename,photo_id FROM journal_photo_uploads WHERE journal_id=$1 ORDER BY created_at,client_uuid",[id]),
        createPhotoUpload: (id,actorId,p) => query("INSERT INTO journal_photo_uploads(client_uuid,journal_id,uploaded_by,filename) VALUES($1,$2,$3,$4)",[p.client_uuid,id,actorId,p.filename]),
        completePhotoUpload: (uuid,photoId) => query("UPDATE journal_photo_uploads SET photo_id=$2 WHERE client_uuid=$1 AND photo_id IS NULL",[uuid,photoId]),
        attachJournalPhoto: (id,photoId) => query("INSERT INTO journal_photos(journal_id,photo_id) VALUES($1,$2) ON CONFLICT DO NOTHING",[id,photoId]),
        items: (projectId) => query(`SELECT w.id,w.title,w.parent_id,NOT EXISTS(SELECT 1 FROM work_items c WHERE c.parent_id=w.id) AS is_leaf
            FROM work_items w WHERE project_id=$1 ORDER BY w.id`, [projectId]),
        item: (projectId, itemId) => one(`SELECT w.*,NOT EXISTS(SELECT 1 FROM work_items c WHERE c.parent_id=w.id) AS is_leaf
            FROM work_items w WHERE project_id=$1 AND id=$2`, [projectId, itemId]),
        settings: (projectId) => one("SELECT * FROM project_site_settings WHERE project_id=$1", [projectId]),
        saveSettings: (projectId, values) => one(`INSERT INTO project_site_settings(project_id,latitude,longitude,radius_m) VALUES($1,$2,$3,$4)
            ON CONFLICT(project_id) DO UPDATE SET latitude=$2,longitude=$3,radius_m=$4,revision=project_site_settings.revision+1 RETURNING *`, [projectId, values.latitude, values.longitude, values.radius_m]),
        preferences: (userId) => query("SELECT type,email_enabled FROM notification_preferences WHERE user_id=$1 ORDER BY type", [userId]),
        savePreference: (userId, type, enabled) => one(`INSERT INTO notification_preferences(user_id,type,email_enabled) VALUES($1,$2,$3)
            ON CONFLICT(user_id,type) DO UPDATE SET email_enabled=$3 RETURNING type,email_enabled`, [userId, type, enabled]),
        updateProfile: (userId, fullname) => one("UPDATE users SET fullname=$2,updated_at=CURRENT_TIMESTAMP WHERE id=$1 RETURNING id,fullname,email", [userId, fullname]),
        photoByUuid: (uuid) => one("SELECT id,project_id,uploaded_by,content_hash,work_item_id,filename,suspicious,distance_m,metadata,taken_at,latitude,longitude FROM site_photos WHERE client_uuid=$1", [uuid]),
        photos: (projectId, userId = null) => query(`SELECT ${photoColumns},w.title AS item_name,u.fullname AS uploader,
            coalesce((SELECT json_agg(journal_id) FROM journal_photos WHERE photo_id=p.id),'[]'::json) AS journal_ids,
            coalesce((SELECT json_agg(acceptance_id) FROM acceptance_photos WHERE photo_id=p.id),'[]'::json) AS acceptance_ids
            FROM site_photos p JOIN work_items w ON w.id=p.work_item_id JOIN users u ON u.id=p.uploaded_by
            WHERE p.project_id=$1 AND ($2::integer IS NULL OR p.uploaded_by=$2) ORDER BY p.created_at DESC,p.id DESC`, [projectId, userId]),
        photo: (projectId, photoId) => one(`SELECT * FROM site_photos WHERE project_id=$1 AND id=$2`, [projectId, photoId]),
        photoIds: (projectId, ids) => query("SELECT id,uploaded_by,work_item_id FROM site_photos WHERE project_id=$1 AND id=ANY($2::integer[])", [projectId, ids]),
        createPhoto: (projectId, userId, p) => one(`INSERT INTO site_photos(project_id,work_item_id,uploaded_by,client_uuid,content_hash,filename,mime_type,original,thumbnail,taken_at,latitude,longitude,metadata,distance_m,suspicious)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15) RETURNING id,project_id,work_item_id,filename,suspicious,distance_m,metadata,taken_at,latitude,longitude`,
        [projectId,p.work_item_id,userId,p.client_uuid,p.content_hash,p.filename,p.mime_type,p.original,p.thumbnail,p.taken_at,p.latitude,p.longitude,p.metadata,p.distance_m,p.suspicious]),
        workerCanUseItem: (projectId, itemId, userId) => one(`SELECT t.id FROM tasks t JOIN task_assignments a ON a.task_id=t.id
            JOIN team_members m ON m.team_id=a.team_id WHERE a.project_id=$1 AND t.work_item_id=$2 AND m.user_id=$3 LIMIT 1`, [projectId,itemId,userId]),
        linkIssuePhotos: async (issueId, ids) => { await query("INSERT INTO issue_photos(issue_id,photo_id) SELECT $1,unnest($2::integer[]) ON CONFLICT DO NOTHING", [issueId,ids]); },
        daily: (projectId, day) => one(`SELECT d.*,d.day::text AS day,(d.is_locked OR EXISTS(SELECT 1 FROM journal_day_locks l WHERE l.project_id=d.project_id AND l.day=d.day AND l.locked)
            OR EXISTS(SELECT 1 FROM site_journals j WHERE j.project_id=d.project_id AND j.day=d.day AND j.is_locked AND j.deleted_at IS NULL)) AS is_locked
            FROM journal_daily_info d WHERE d.project_id=$1 AND d.day=$2`, [projectId,day]),
        dayLock: (projectId, day) => one("SELECT *,day::text AS day FROM journal_day_locks WHERE project_id=$1 AND day=$2", [projectId,day]),
        saveDaily: (projectId, day, values) => one(`INSERT INTO journal_daily_info(project_id,day,manpower,equipment,weather,weather_code,equipment_codes,all_day_rain) VALUES($1,$2,$3,$4,$5,$6,$7,$8)
            ON CONFLICT(project_id,day) DO UPDATE SET manpower=$3,equipment=$4,weather=$5,weather_code=$6,equipment_codes=$7,all_day_rain=$8,revision=journal_daily_info.revision+1 RETURNING *`, [projectId,day,values.manpower,values.equipment,values.weather,values.weather_code || null,JSON.stringify(values.equipment_codes || []),values.all_day_rain || false]),
        setDayLock: async (projectId, day, userId, locked, reason) => {
            const previous = await one("SELECT *,day::text AS day,updated_at::text AS lock_timestamp FROM journal_day_locks WHERE project_id=$1 AND day=$2", [projectId, day]);
            // PostgreSQL timestamps have finer precision than JavaScript Date.
            const previousTimestamp=previous?.lock_timestamp;
            if (previous) delete previous.lock_timestamp;
            if (previous?.locked===locked) return { ...previous,is_locked:locked,locked_at:locked ? previous.updated_at : null,locked_by:locked ? previous.changed_by : null };
            if (locked) {
                // Preserve existing individual record locks when locking their day.
                await query(`UPDATE site_journals SET is_locked=TRUE,locked_at=CURRENT_TIMESTAMP,locked_by=$3 WHERE project_id=$1 AND day=$2 AND NOT is_locked`, [projectId,day,userId]);
                await query(`UPDATE journal_daily_info SET is_locked=TRUE,locked_at=CURRENT_TIMESTAMP,locked_by=$3 WHERE project_id=$1 AND day=$2 AND NOT is_locked`, [projectId,day,userId]);
            }
            const lock = await one(`INSERT INTO journal_day_locks(project_id,day,changed_by,locked,reason) VALUES($1,$2,$3,$4,$5)
                ON CONFLICT(project_id,day) DO UPDATE SET changed_by=$3,locked=$4,reason=$5,updated_at=CURRENT_TIMESTAMP RETURNING *,day::text AS day`, [projectId,day,userId,locked,reason]);
            if (!locked && previous?.locked) {
                // Only clear flags belonging to the preceding day lock event.
                await query(`UPDATE site_journals SET is_locked=FALSE,locked_at=NULL,locked_by=NULL WHERE project_id=$1 AND day=$2 AND locked_at=$3 AND locked_by=$4`, [projectId,day,previousTimestamp,previous.changed_by]);
                await query(`UPDATE journal_daily_info SET is_locked=FALSE,locked_at=NULL,locked_by=NULL WHERE project_id=$1 AND day=$2 AND locked_at=$3 AND locked_by=$4`, [projectId,day,previousTimestamp,previous.changed_by]);
            }
            return { ...lock, is_locked: lock.locked, locked_at: locked ? lock.updated_at : null, locked_by: locked ? lock.changed_by : null };
        },
        lockJournalRecord: (projectId, id, userId, locked) => one(`UPDATE site_journals SET is_locked=$3, locked_at=CASE WHEN $3 THEN CURRENT_TIMESTAMP ELSE NULL END, locked_by=CASE WHEN $3 THEN $4::integer ELSE NULL END WHERE project_id=$1 AND id=$2 AND deleted_at IS NULL RETURNING *,day::text AS day`, [projectId,id,locked,userId]),
        journals: (projectId) => query(`SELECT j.*,j.day::text AS day,j.time::text AS time,u.fullname AS author,w.title AS item_name,
            coalesce(l.locked,FALSE) AS day_locked,
            (coalesce(j.is_locked,FALSE) OR coalesce(l.locked,FALSE)) AS is_locked,
            (coalesce(j.is_locked,FALSE) OR coalesce(l.locked,FALSE)) AS locked,
            CASE WHEN j.is_locked THEN j.locked_at WHEN l.locked THEN l.updated_at ELSE NULL END AS locked_at,
            CASE WHEN j.is_locked THEN j.locked_by WHEN l.locked THEN l.changed_by ELSE NULL END AS locked_by,
            d.manpower,d.equipment,d.weather,d.weather_code,d.equipment_codes,d.all_day_rain,d.revision AS daily_revision,
            coalesce((SELECT json_agg(json_build_object('client_uuid',p.client_uuid,'filename',p.filename,'photo_id',p.photo_id) ORDER BY p.created_at) FROM journal_photo_uploads p WHERE p.journal_id=j.id),'[]'::json) AS photo_uploads,
            (SELECT count(*)::int FROM journal_conflicts c WHERE c.journal_id=j.id AND c.resolved_at IS NULL) AS conflict_count,
            coalesce((SELECT json_agg(photo_id ORDER BY photo_id) FROM journal_photos WHERE journal_id=j.id),'[]'::json) AS photo_ids
            FROM site_journals j JOIN users u ON u.id=j.author_id JOIN work_items w ON w.id=j.work_item_id
            LEFT JOIN journal_day_locks l ON l.project_id=j.project_id AND l.day=j.day LEFT JOIN journal_daily_info d ON d.project_id=j.project_id AND d.day=j.day
            WHERE j.project_id=$1 AND j.deleted_at IS NULL ORDER BY j.day DESC,j.time DESC,j.id DESC`, [projectId]),
        journalByUuid: (uuid) => one(`SELECT j.*,j.day::text AS day,j.time::text AS time, (coalesce(j.is_locked,FALSE) OR coalesce(l.locked,FALSE)) AS is_locked FROM site_journals j LEFT JOIN journal_day_locks l ON l.project_id=j.project_id AND l.day=j.day WHERE j.client_uuid=$1`, [uuid]),
        journal: (projectId, id) => one(`SELECT j.*,j.day::text AS day,j.time::text AS time, (coalesce(j.is_locked,FALSE) OR coalesce(l.locked,FALSE)) AS is_locked FROM site_journals j LEFT JOIN journal_day_locks l ON l.project_id=j.project_id AND l.day=j.day WHERE j.project_id=$1 AND j.id=$2 AND j.deleted_at IS NULL`, [projectId,id]),
        createJournal: (projectId, userId, j) => one(`INSERT INTO site_journals(project_id,work_item_id,author_id,client_uuid,input_hash,day,time,content) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *,day::text AS day`, [projectId,j.work_item_id,userId,j.client_uuid,j.input_hash,j.day,j.time,j.content]),
        updateJournal: (projectId, id, j) => one(`UPDATE site_journals SET work_item_id=$3,day=$4,time=$5,content=$6,revision=revision+1,updated_at=CURRENT_TIMESTAMP
            WHERE project_id=$1 AND id=$2 AND revision=$7 AND deleted_at IS NULL RETURNING *,day::text AS day`, [projectId,id,j.work_item_id,j.day,j.time,j.content,j.revision]),
        deleteJournal: (projectId, id, revision) => one("UPDATE site_journals SET deleted_at=CURRENT_TIMESTAMP,revision=revision+1 WHERE project_id=$1 AND id=$2 AND revision=$3 AND deleted_at IS NULL RETURNING id", [projectId,id,revision]),
        linkJournalPhotos: async (journalId, ids) => { await query("DELETE FROM journal_photos WHERE journal_id=$1", [journalId]); await query("INSERT INTO journal_photos(journal_id,photo_id) SELECT $1,unnest($2::integer[])", [journalId,ids]); },
        contracts: (projectId) => query(`SELECT c.*,w.title AS item_name,coalesce(a.approved,0)::text AS approved_quantity,coalesce(d.reported,0)::text AS reported_quantity
            FROM item_contracts c JOIN work_items w ON w.id=c.work_item_id
            LEFT JOIN (SELECT work_item_id,sum(quantity) approved FROM effective_acceptances GROUP BY work_item_id) a ON a.work_item_id=c.work_item_id
            LEFT JOIN (SELECT t.work_item_id,sum(d.quantity) reported FROM daily_progress d JOIN tasks t ON t.id=d.task_id GROUP BY t.work_item_id) d ON d.work_item_id=c.work_item_id
            WHERE c.project_id=$1 ORDER BY c.work_item_id`, [projectId]),
        contract: (projectId, itemId) => one(`SELECT c.*,coalesce((SELECT sum(quantity) FROM effective_acceptances WHERE work_item_id=$2),0)::text AS approved_quantity
            FROM item_contracts c WHERE c.project_id=$1 AND c.work_item_id=$2`, [projectId,itemId]),
        saveContract: (projectId, itemId, values) => one(`INSERT INTO item_contracts(project_id,work_item_id,quantity,unit,unit_price) VALUES($1,$2,$3,$4,$5)
            ON CONFLICT(work_item_id) DO UPDATE SET quantity=$3,unit=$4,unit_price=$5,revision=item_contracts.revision+1 RETURNING *`, [projectId,itemId,values.quantity,values.unit,values.unit_price]),
        acceptances: (projectId) => query(`SELECT a.*,a.day::text AS day,w.title AS item_name,u.fullname AS author,ap.fullname AS approver,
            coalesce((SELECT json_agg(photo_id ORDER BY photo_id) FROM acceptance_photos WHERE acceptance_id=a.id),'[]'::json) AS photo_ids,
            EXISTS(SELECT 1 FROM payment_items WHERE acceptance_id=a.id AND NOT released) AS in_payment,
            EXISTS(SELECT 1 FROM effective_acceptances WHERE id=a.id) AS effective,
            (SELECT id FROM acceptance_forms WHERE adjustment_of=a.id AND status='approved') AS superseded_by
            FROM acceptance_forms a JOIN work_items w ON w.id=a.work_item_id JOIN users u ON u.id=a.created_by LEFT JOIN users ap ON ap.id=a.approved_by
            WHERE a.project_id=$1 ORDER BY a.id DESC`, [projectId]),
        acceptance: (projectId, id) => one("SELECT *,day::text AS day FROM acceptance_forms WHERE project_id=$1 AND id=$2", [projectId,id]),
        saveAcceptance: (projectId, userId, id, a) => id ? one(`UPDATE acceptance_forms SET period=$3,day=$4,cumulative=$5,previous_cumulative=$6,quantity=$5::numeric-$6::numeric,
            notes=$7,unit=$8,unit_price=$9,status='draft',return_reason=NULL,revision=revision+1 WHERE project_id=$1 AND id=$2 RETURNING *`, [projectId,id,a.period,a.day,a.cumulative,a.previous_cumulative,a.notes,a.unit,a.unit_price])
            : one(`INSERT INTO acceptance_forms(project_id,work_item_id,created_by,period,day,cumulative,previous_cumulative,quantity,unit,unit_price,notes,adjustment_of,adjustment_reason)
                VALUES($1,$2,$3,$4,$5,$6,$7,$6::numeric-$7::numeric,$8,$9,$10,$11,$12) RETURNING *`, [projectId,a.work_item_id,userId,a.period,a.day,a.cumulative,a.previous_cumulative,a.unit,a.unit_price,a.notes,a.adjustment_of||null,a.adjustment_reason||null]),
        linkAcceptancePhotos: async (id, photos) => { await query("DELETE FROM acceptance_photos WHERE acceptance_id=$1", [id]); await query("INSERT INTO acceptance_photos(acceptance_id,photo_id) SELECT $1,unnest($2::integer[])", [id,photos]); },
        transitionAcceptance: (projectId,id,actorId,status,reason) => one(`UPDATE acceptance_forms SET status=$3::varchar,return_reason=$4,revision=revision+1,
            approved_by=CASE WHEN $3::varchar='approved' THEN $5::integer ELSE NULL END,approved_at=CASE WHEN $3::varchar='approved' THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE project_id=$1 AND id=$2 RETURNING *`, [projectId,id,status,reason,actorId]),
        payments: (projectId) => query(`SELECT p.*,p.day::text AS day,u.fullname AS author,ap.fullname AS approver,
            coalesce((SELECT json_agg(json_build_object('acceptance_id',i.acceptance_id,'item_name',w.title,'quantity',i.quantity::text,'unit',a.unit,'unit_price',i.unit_price::text,'amount',i.amount::text,'released',i.released) ORDER BY i.acceptance_id)
            FROM payment_items i JOIN acceptance_forms a ON a.id=i.acceptance_id JOIN work_items w ON w.id=a.work_item_id WHERE payment_id=p.id),'[]'::json) AS items
            FROM payment_requests p JOIN users u ON u.id=p.created_by LEFT JOIN users ap ON ap.id=p.approved_by WHERE p.project_id=$1 ORDER BY p.id DESC`, [projectId]),
        payment: (projectId,id) => one("SELECT * FROM payment_requests WHERE project_id=$1 AND id=$2", [projectId,id]),
        async savePayment(projectId,userId,id,p) {
            let result;
            if (id) { result = await one("UPDATE payment_requests SET period=$3,day=$4,retention_rate=$5,status='draft',return_reason=NULL,revision=revision+1 WHERE project_id=$1 AND id=$2 RETURNING *", [projectId,id,p.period,p.day,p.retention_rate]); await query("DELETE FROM payment_items WHERE payment_id=$1", [id]); }
            else result = await one("INSERT INTO payment_requests(project_id,created_by,period,day,retention_rate) VALUES($1,$2,$3,$4,$5) RETURNING *", [projectId,userId,p.period,p.day,p.retention_rate]);
            await query(`INSERT INTO payment_items(payment_id,acceptance_id,quantity,unit_price,amount)
                SELECT $1,id,quantity,unit_price,round(quantity*unit_price,2) FROM acceptance_forms WHERE project_id=$2 AND id=ANY($3::integer[]) AND status='approved'`, [result.id,projectId,p.acceptance_ids]);
            return one(`UPDATE payment_requests SET gross=t.gross,retained=round(t.gross*retention_rate/100,2),net=t.gross-round(t.gross*retention_rate/100,2)
                FROM (SELECT sum(amount) gross FROM payment_items WHERE payment_id=$1) t WHERE id=$1 RETURNING payment_requests.*`, [result.id]);
        },
        paymentSource: (projectId,ids,paymentId) => query(`SELECT a.id FROM acceptance_forms a LEFT JOIN payment_items p ON p.acceptance_id=a.id AND NOT p.released
            WHERE a.project_id=$1 AND a.id=ANY($2::integer[]) AND a.status='approved' AND EXISTS(SELECT 1 FROM effective_acceptances WHERE id=a.id) AND (p.payment_id IS NULL OR p.payment_id=$3)`, [projectId,ids,paymentId]),
        transitionPayment: (projectId,id,actorId,status,reason) => one(`UPDATE payment_requests SET status=$3::varchar,return_reason=$4,revision=revision+1,
            approved_by=CASE WHEN $3::varchar='approved' THEN $5::integer ELSE NULL END,approved_at=CASE WHEN $3::varchar='approved' THEN CURRENT_TIMESTAMP ELSE NULL END
            WHERE project_id=$1 AND id=$2 RETURNING *`, [projectId,id,status,reason,actorId]),
        budgets: (projectId) => query("SELECT b.*,w.title AS item_name FROM budget_versions b JOIN work_items w ON w.id=b.work_item_id WHERE b.project_id=$1 ORDER BY b.work_item_id,b.version DESC", [projectId]),
        saveBudget: (projectId,userId,b) => one(`INSERT INTO budget_versions(project_id,work_item_id,version,amount,notes,created_by)
            SELECT $1,$2,coalesce(max(version),0)+1,$3,$4,$5 FROM budget_versions WHERE work_item_id=$2 RETURNING *`, [projectId,b.work_item_id,b.amount,b.notes,userId]),
        costs: (projectId) => query("SELECT c.*,c.day::text AS day,w.title AS item_name FROM actual_costs c LEFT JOIN work_items w ON w.id=c.work_item_id WHERE c.project_id=$1 ORDER BY c.day DESC,c.id DESC", [projectId]),
        costByUuid: (uuid) => one("SELECT *,day::text AS day FROM actual_costs WHERE client_uuid=$1", [uuid]),
        createCost: (projectId,userId,c) => one("INSERT INTO actual_costs(project_id,created_by,work_item_id,day,amount,type,notes,client_uuid) VALUES($1,$2,$3,$4,$5,$6,$7,$8) RETURNING *", [projectId,userId,c.work_item_id,c.day,c.amount,c.type,c.notes,c.client_uuid]),
        allocateCost: (projectId,id,itemId,revision) => one("UPDATE actual_costs SET work_item_id=$3,revision=revision+1 WHERE project_id=$1 AND id=$2 AND revision=$4 RETURNING *", [projectId,id,itemId,revision]),
        materials: (projectId) => query("SELECT * FROM materials WHERE project_id=$1 ORDER BY name,id", [projectId]),
        material: (projectId,id) => one("SELECT * FROM materials WHERE project_id=$1 AND id=$2", [projectId,id]),
        createMaterial: (projectId,m) => one("INSERT INTO materials(project_id,name,unit) VALUES($1,$2,$3) RETURNING *", [projectId,m.name,m.unit]),
        inventory: (projectId) => query(`SELECT i.*,i.day::text AS day,m.name AS material_name,m.unit,w.title AS item_name,u.fullname AS author FROM inventory_transactions i
            JOIN materials m ON m.id=i.material_id LEFT JOIN work_items w ON w.id=i.work_item_id JOIN users u ON u.id=i.created_by WHERE i.project_id=$1 ORDER BY i.id DESC`, [projectId]),
        inventoryByUuid: (uuid) => one("SELECT *,day::text AS day FROM inventory_transactions WHERE client_uuid=$1", [uuid]),
        createInventory: (projectId,userId,i) => one(`INSERT INTO inventory_transactions(project_id,created_by,material_id,work_item_id,direction,quantity,day,notes,client_uuid)
            VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING *`, [projectId,userId,i.material_id,i.work_item_id,i.direction,i.quantity,i.day,i.notes,i.client_uuid]),
        norms: (projectId) => query("SELECT * FROM material_norms WHERE project_id=$1 ORDER BY work_item_id,material_id", [projectId]),
        saveNorm: (projectId,n) => one(`INSERT INTO material_norms(project_id,work_item_id,material_id,quantity_per_unit) VALUES($1,$2,$3,$4)
            ON CONFLICT(work_item_id,material_id) DO UPDATE SET quantity_per_unit=$4 RETURNING *`, [projectId,n.work_item_id,n.material_id,n.quantity_per_unit]),
        reconciliation: (projectId) => query(`WITH keys AS (SELECT work_item_id,material_id FROM material_norms WHERE project_id=$1 UNION SELECT work_item_id,material_id FROM inventory_transactions WHERE project_id=$1 AND direction='out')
            SELECT k.*,w.title AS item_name,m.name AS material_name,m.unit,n.quantity_per_unit,
            coalesce(a.approved,0)::text AS accepted_quantity,coalesce(i.issued,0)::text AS issued,
            (n.quantity_per_unit*coalesce(a.approved,0))::text AS allowed,
            (coalesce(i.issued,0)-n.quantity_per_unit*coalesce(a.approved,0))::text AS variance
            FROM keys k JOIN work_items w ON w.id=k.work_item_id JOIN materials m ON m.id=k.material_id
            LEFT JOIN material_norms n ON n.work_item_id=k.work_item_id AND n.material_id=k.material_id
            LEFT JOIN (SELECT work_item_id,sum(quantity) approved FROM effective_acceptances GROUP BY work_item_id) a ON a.work_item_id=k.work_item_id
            LEFT JOIN (SELECT work_item_id,material_id,sum(quantity) issued FROM inventory_transactions WHERE direction='out' GROUP BY work_item_id,material_id) i ON i.work_item_id=k.work_item_id AND i.material_id=k.material_id`, [projectId]),
        async notify(projectId,userId,type,message,path,eventKey = null) {
            const notification = await one(`INSERT INTO notifications(project_id,user_id,type,message,target_path,event_key) VALUES($1,$2,$3,$4,$5,$6)
                ON CONFLICT(project_id,user_id,event_key) WHERE event_key IS NOT NULL DO NOTHING RETURNING id`, [projectId,userId,type,message,path,eventKey]);
            if (notification && ["acceptance_returned","payment_returned","milestone_overdue"].includes(type)) {
                await query("INSERT INTO email_outbox(notification_id) VALUES($1)", [notification.id]);
            }
            return notification;
        },
        milestones: (projectId) => query("SELECT *,due_date::text AS due_date FROM project_milestones WHERE project_id=$1 ORDER BY project_milestones.due_date,id", [projectId]),
        createMilestone: (projectId,userId,m) => one("INSERT INTO project_milestones(project_id,created_by,task_id,title,due_date) VALUES($1,$2,$3,$4,$5) RETURNING *", [projectId,userId,m.task_id,m.title,m.due_date]),
        paymentTerms: (projectId) => one('SELECT * FROM project_payment_terms WHERE project_id=$1',[projectId]),
        savePaymentTerms: (projectId,actorId,rate) => one(`INSERT INTO project_payment_terms(project_id,updated_by,retention_rate) VALUES($1,$2,$3)
            ON CONFLICT(project_id) DO UPDATE SET retention_rate=$3,updated_by=$2,revision=project_payment_terms.revision+1,updated_at=CURRENT_TIMESTAMP RETURNING *`,[projectId,actorId,rate]),
        baselineContext: (projectId) => one('SELECT *,original_start_date::text AS original_start_date FROM original_baseline_context WHERE project_id=$1',[projectId]),
        originalBaseline: (projectId) => query(`SELECT DISTINCT ON(task_id) * FROM (
            SELECT task_id,early_finish,created_at FROM baselines WHERE project_id=$1
            UNION ALL SELECT task_id,early_finish,created_at FROM baseline_history WHERE project_id=$1
            ) b ORDER BY task_id,created_at`,[projectId]),
        taskActuals: (projectId) => query(`SELECT t.id,t.actual_finish::text AS actual_finish,t.progress_percent FROM tasks t JOIN work_items w ON w.id=t.work_item_id WHERE w.project_id=$1`,[projectId]),
        scheduleMilestoneAlerts: (projectId) => query(`SELECT a.id,m.name AS title,m.target_date::text AS due_date,w.title AS item_name,
            a.overdue_working_days AS delay_days,a.critical_path AS critical_chain,TRUE AS overdue
            FROM milestone_alerts a JOIN milestones m ON m.id=a.milestone_id JOIN work_items w ON w.id=m.work_item_id
            WHERE a.project_id=$1 AND a.status='open' ORDER BY m.target_date,a.id`,[projectId]),
        auditLogs: operations.auditLogs
    };
}
module.exports = { createSiteManagementModel };

const nodemailer = require("nodemailer");
const { createNotificationDeliveryModel } = require("../models/notificationDeliveryModel");
const { createSiteManagementModel } = require("../models/siteManagementModel");
const { createSiteManagementService } = require("./siteManagementService");

function createNotificationWorker({ pool,transport,from=process.env.SMTP_FROM,appUrl=process.env.APP_URL || "http://localhost:5173" }) {
    const delivery=createNotificationDeliveryModel(pool);
    const service=createSiteManagementService({ model:createSiteManagementModel(pool) });
    let running=false;
    return {
        async tick() {
            if (running) return; running=true;
            try {
                for (const project of await delivery.projects()) {
                    try { await service.report(project.id,{ role:"admin" }); }
                    catch (error) { console.error("[notifications] schedule alert check failed",{ projectId:project.id,code:error.code || error.status || "error" }); }
                }
                if (!transport || !from) return;
                for (let index=0;index<100;index++) {
                    const found=await delivery.deliverOne((row) => transport.sendMail({
                        from,to:row.email,subject:"Xây dựng số · Cập nhật hồ sơ công trường",
                        text:`${row.message}\n\nXem chi tiết: ${new URL(row.target_path,appUrl).href}\n\nBạn có thể thay đổi tùy chọn email trong Cài đặt.`,
                        messageId:`<notification-${row.notification_id}@xaydungso.local>`
                    }));
                    if (!found) break;
                }
            } finally { running=false; }
        }
    };
}
function startNotificationWorker(pool) {
    const configured=process.env.SMTP_HOST && process.env.SMTP_FROM;
    const transport=configured ? nodemailer.createTransport({ host:process.env.SMTP_HOST,port:Number(process.env.SMTP_PORT || 587),secure:process.env.SMTP_SECURE==="true",
        ...(process.env.SMTP_USER ? { auth:{ user:process.env.SMTP_USER,pass:process.env.SMTP_PASSWORD } } : {}),connectionTimeout:10000,socketTimeout:15000 }) : null;
    const worker=createNotificationWorker({ pool,transport });
    const run=() => worker.tick().catch((error) => console.error("[notifications] worker failed",{ code:error.code || "error" }));
    const timer=setInterval(run,60000); timer.unref(); run();
    return () => { clearInterval(timer); transport?.close(); };
}
module.exports = { createNotificationWorker,startNotificationWorker };

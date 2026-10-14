const PDFDocument = require("pdfkit");
const fs = require("node:fs");
const v = require("./siteValidation");

function createReportPdfService({ model }) {
    return async (projectId,actor,itemId) => {
        v.id(itemId);
        const data=await model.transaction(projectId,async (t) => {
            const item=await t.item(projectId,itemId); if (!item) throw v.problem(404,"Hạng mục không thuộc dự án");
            const forms=(await t.acceptances(projectId)).filter((entry) => entry.work_item_id===itemId && entry.status==="approved").reverse();
            const photos=[];
            for (const id of [...new Set(forms.flatMap((form) => form.photo_ids))]) photos.push(await t.photo(projectId,id));
            return { project:await t.project(projectId),item,forms,photos };
        });
        const font=[process.env.PDF_FONT_PATH,"C:/Windows/Fonts/arial.ttf","/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find((file) => file && fs.existsSync(file));
        if (!font) throw v.problem(422,"Chưa cấu hình phông chữ tiếng Việt cho xuất PDF (PDF_FONT_PATH).");
        const doc=new PDFDocument({ size:"A4",margin:48,bufferPages:true,info:{ Title:`Hồ sơ nghiệm thu – ${data.item.title}`,Author:"Xây dựng số" } });
        const chunks=[]; const finished=new Promise((resolve,reject) => { doc.on("data",(chunk) => chunks.push(chunk)); doc.on("end",() => resolve(Buffer.concat(chunks))); doc.on("error",reject); });
        doc.font(font);
        const text=(value,size=10) => doc.fontSize(size).fillColor("#183655").text(String(value),{ paragraphGap:7 });
        text("HỒ SƠ NGHIỆM THU KHỐI LƯỢNG",18); doc.moveDown();
        text(`Dự án: ${data.project.name}`,13); text(`Địa điểm: ${data.project.location || "Chưa cập nhật"}`); text(`Hạng mục: ${data.item.title}`,12);
        text(`Xuất lúc: ${new Date().toLocaleString("vi-VN",{ timeZone:"Asia/Ho_Chi_Minh" })}`); doc.moveDown();
        if (!data.forms.length) text("Hạng mục chưa có phiếu nghiệm thu được duyệt.");
        for (const form of data.forms) {
            if (doc.y>640) doc.addPage();
            text(`Phiếu #${form.id} · ${form.period}`,13); text(`Ngày nghiệm thu: ${form.day}`);
            text(`Khối lượng đợt: ${form.quantity} ${form.unit}  |  Lũy kế: ${form.cumulative} ${form.unit}`);
            text(`Người lập: ${form.author}  |  Người duyệt: ${form.approver}`); text(`Duyệt lúc: ${new Date(form.approved_at).toLocaleString("vi-VN",{ timeZone:"Asia/Ho_Chi_Minh" })}`);
            if (form.notes) text(`Ghi chú: ${form.notes}`);
            for (const id of form.photo_ids) {
                const photo=data.photos.find((entry) => entry.id===id); if (!photo) continue;
                if (doc.y>420) doc.addPage();
                const top=doc.y; doc.image(photo.thumbnail,48,top,{ fit:[490,250],align:"left" }); doc.y=top+260;
                text(`Ảnh: ${photo.filename}`); text(`Thời điểm chụp: ${photo.taken_at ? new Date(photo.taken_at).toISOString() : "Không có metadata thời gian"}`);
                text(`Tọa độ: ${photo.latitude==null ? "Không có metadata GPS" : `${photo.latitude}, ${photo.longitude}`}${photo.suspicious ? " · Nghi vấn: ngoài bán kính công trường" : ""}`);
            }
            doc.moveDown();
        }
        const range=doc.bufferedPageRange();
        for (let index=range.start;index<range.start+range.count;index++) { doc.switchToPage(index); doc.fontSize(8).fillColor("#6d7c90").text(`XÂY DỰNG SỐ · ${data.project.name} · ${index+1}/${range.count}`,48,780,{ lineBreak:false,width:490,align:"right" }); }
        doc.end(); return finished;
    };
}
module.exports = { createReportPdfService };

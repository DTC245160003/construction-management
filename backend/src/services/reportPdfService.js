const PDFDocument = require("pdfkit");
const fs = require("node:fs");
const v = require("./siteValidation");
const { reviewPhoto,captureTimeLabel } = require("./photoService");

const confidenceLabels={ none:"Chưa có dấu hiệu cảnh báo",low:"Thấp",medium:"Trung bình" };
const printedTime=(value) => {
    const date=value ? new Date(value) : null;
    return date && Number.isFinite(date.getTime()) ? date.toLocaleString("vi-VN",{ timeZone:"Asia/Ho_Chi_Minh" }) : "Chưa có dữ liệu";
};

async function dossierData(model,projectId,itemId) {
    return model.transaction(projectId,async (t) => {
        const item=await t.item(projectId,itemId);
        if (!item) throw v.problem(404,"Hạng mục không thuộc dự án");
        const items=await t.items(projectId),included=new Set([itemId]);
        // A parent dossier includes its leaves without adding their quantities
        // across incompatible units. Each approved period keeps its own row.
        let changed=true;
        while (changed) {
            changed=false;
            for (const child of items) if (included.has(child.parent_id) && !included.has(child.id)) { included.add(child.id); changed=true; }
        }
        const forms=(await t.acceptances(projectId)).filter((entry) => included.has(entry.work_item_id) && entry.status==="approved")
            .sort((a,b) => a.day.localeCompare(b.day) || a.id-b.id);
        const photos=[];
        for (const id of [...new Set(forms.flatMap((form) => form.photo_ids || []))]) {
            const photo=await t.photo(projectId,id);
            if (photo) photos.push(photo);
        }
        return { project:await t.project(projectId),site:await t.settings(projectId),item,forms,photos };
    });
}

function createReportPdfService({ model }) {
    return async (projectId,actor,itemId) => {
        v.id(itemId);
        const data=await dossierData(model,projectId,itemId);
        const font=[process.env.PDF_FONT_PATH,"C:/Windows/Fonts/arial.ttf","/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf"].find((file) => file && fs.existsSync(file));
        if (!font) throw v.problem(422,"Chưa cấu hình phông chữ tiếng Việt cho xuất PDF (PDF_FONT_PATH).");
        const doc=new PDFDocument({ size:"A4",margin:48,bufferPages:true,info:{ Title:`Hồ sơ nghiệm thu - ${data.item.title}`,Author:"Xây dựng số",Subject:"Mẫu báo cáo nội bộ - cần xác nhận biểu mẫu chính thức" } });
        const chunks=[];
        const finished=new Promise((resolve,reject) => { doc.on("data",(chunk) => chunks.push(chunk)); doc.on("end",() => resolve(Buffer.concat(chunks))); doc.on("error",reject); });
        const width=doc.page.width-96;
        const beginPage=() => {
            doc.font(font).fontSize(8).fillColor("#6d7c90").text("XÂY DỰNG SỐ / HỒ SƠ NGHIỆM THU NỘI BỘ",48,26,{ width,lineBreak:false });
            doc.moveTo(48,42).lineTo(48+width,42).lineWidth(0.5).strokeColor("#d9e3ee").stroke();
            doc.x=48; doc.y=58;
        };
        doc.on("pageAdded",beginPage); beginPage();
        const ensure=(height) => { if (doc.y+height>752) doc.addPage(); };
        const text=(value,size=10,color="#183655") => {
            doc.fontSize(size);
            // Wrap and paginate explicitly so long notes never overlap headers
            // or cause PDFKit's automatic continuation to consume the header.
            for (const paragraph of String(value).split("\n")) {
                const lines=[];
                let line="";
                for (const word of paragraph.split(/\s+/).filter(Boolean)) {
                    if (line && doc.widthOfString(`${line} ${word}`)>width) { lines.push(line); line=""; }
                    if (doc.widthOfString(word)>width) {
                        for (const char of word) {
                            if (line && doc.widthOfString(line+char)>width) { lines.push(line); line=""; }
                            line+=char;
                        }
                    } else line+=(line ? " " : "")+word;
                }
                if (line) lines.push(line);
                for (const entry of lines) {
                    doc.fontSize(size);
                    const height=doc.currentLineHeight(true);
                    ensure(height);
                    const top=doc.y;
                    doc.fontSize(size).fillColor(color).text(entry,48,top,{ width,lineBreak:false });
                    doc.y=top+height;
                }
                doc.y+=6;
            }
        };
        const heading=(value) => {
            doc.fontSize(12);
            const height=doc.heightOfString(String(value),{ width:width-20 })+14;
            ensure(height+9);
            const top=doc.y;
            doc.rect(48,top,width,height).fill("#edf3fa");
            doc.fontSize(12).fillColor("#183655").text(String(value),58,top+7,{ width:width-20 });
            doc.x=48; doc.y=Math.max(top+height+9,doc.y+9);
        };
        text("HỒ SƠ NGHIỆM THU KHỐI LƯỢNG",18);
        text("MẪU BÁO CÁO NỘI BỘ - CHỜ XÁC NHẬN BIỂU MẪU CHÍNH THỨC",9,"#9b5712");
        text("Cần xác nhận trước khi phát hành: mẫu biểu, thành phần ký và yêu cầu hồ sơ của hợp đồng. Báo cáo này không thay thế biên bản ký chính thức.",9,"#6d7c90");
        doc.moveDown(0.4);
        text(`Dự án: ${data.project.name}`,13);
        text(`Địa điểm: ${data.project.location || "Chưa cập nhật"}`);
        text(`Hạng mục: ${data.item.title}`,12);
        text(`Số phiếu đã duyệt: ${data.forms.length} | Xuất lúc: ${printedTime(new Date())}`);
        if (!data.forms.length) text("Hạng mục và các hạng mục con chưa có phiếu nghiệm thu được duyệt.");
        for (const form of data.forms) {
            ensure(180);
            heading(`Phiếu #${form.id} / ${form.period}`);
            if(form.superseded_by)text(`Phiếu lịch sử: được thay thế bởi phiếu #${form.superseded_by}; không tính trùng vào lũy kế hiệu lực.`,9,'#9b5712');
            if(form.adjustment_of)text(`Phiếu điều chỉnh thay thế #${form.adjustment_of}: ${form.adjustment_reason || ''}`,9);
            text(`Hạng mục: ${form.item_name || data.item.title} | Ngày nghiệm thu: ${form.day}`);
            text(`Khối lượng kỳ trước: ${form.previous_cumulative} ${form.unit}`);
            text(`Khối lượng đợt này: ${form.quantity} ${form.unit} | Lũy kế: ${form.cumulative} ${form.unit}`);
            text(`Đơn giá theo phiếu: ${form.unit_price} đồng / ${form.unit}`);
            text(`Người lập: ${form.author || "Chưa có dữ liệu"} | Người duyệt: ${form.approver || "Chưa có dữ liệu"}`);
            text(`Duyệt lúc: ${printedTime(form.approved_at)}`);
            if (form.adjustment_of_id) text(`Phiếu điều chỉnh cho phiếu #${form.adjustment_of_id}. Hồ sơ gốc được giữ nguyên.`);
            if (form.notes) text(`Ghi chú: ${form.notes}`);
            if (!form.photo_ids?.length) text("Ảnh đính kèm: chưa có.",9,"#6d7c90");
            for (const id of form.photo_ids || []) {
                const photo=data.photos.find((entry) => entry.id===id);
                if (!photo) continue;
                const review=reviewPhoto(photo,{ referenceDate:form.day,site:data.site });
                ensure(320);
                const top=doc.y;
                if (photo.thumbnail) {
                    doc.image(photo.thumbnail,48,top,{ fit:[width,220],align:"left" });
                    doc.y=top+230;
                }
                text(`Ảnh #${photo.id}: ${photo.filename}`,10);
                text(`Thời điểm chụp: ${captureTimeLabel(photo)}`);
                text(`GPS: ${photo.latitude==null || photo.longitude==null ? "Không có metadata GPS" : `${photo.latitude}, ${photo.longitude}`}${review.distance_m==null ? "" : ` | Cách tâm công trường: ${Math.round(review.distance_m)} m`}`,9);
                text(`Mức tin cậy của dấu hiệu cảnh báo: ${confidenceLabels[review.confidence_level]}. Dấu hiệu chỉ để đối chiếu, không phải kết luận ảnh giả.`,9,review.needs_review ? "#9b5712" : "#6d7c90");
                for (const reason of review.reasons) text(`- ${reason.message}`,9,reason.severity==="warning" ? "#9b5712" : "#6d7c90");
                doc.moveDown(0.4);
            }
            doc.moveDown(0.4);
        }
        ensure(90); heading("Xác nhận hồ sơ trước khi phát hành");
        text("Người lập hồ sơ: ____________________    Người kiểm tra: ____________________",9);
        text("Đại diện các bên và chữ ký: theo mẫu biểu được chủ đầu tư xác nhận.",9);
        const range=doc.bufferedPageRange();
        for (let index=range.start;index<range.start+range.count;index++) {
            doc.switchToPage(index);
            doc.fontSize(8).fillColor("#6d7c90").text(`XÂY DỰNG SỐ / Mẫu nội bộ / Trang ${index+1}/${range.count}`,48,783,{ lineBreak:false,width,align:"right" });
        }
        doc.end(); return finished;
    };
}
module.exports = { createReportPdfService,dossierData };

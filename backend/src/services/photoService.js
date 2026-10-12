const sharp = require("sharp");
const exifr = require("exifr");
const v = require("./siteValidation");

function distance(a,b,c,d) {
    const rad = (value) => value * Math.PI / 180;
    const h = Math.sin(rad(c-a)/2)**2 + Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(rad(d-b)/2)**2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
async function preparePhoto(body) {
    const client_uuid = v.uuid(body.client_uuid);
    const work_item_id = v.id(body.work_item_id);
    const filename = v.text(body.filename,"Tên ảnh",255);
    if (typeof body.data !== "string" || body.data.length > 14*1024*1024 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.data)) throw v.problem(400,"Dữ liệu ảnh không hợp lệ (tối đa 10 MB)");
    const original = Buffer.from(body.data,"base64");
    if (!original.length || original.length>10*1024*1024) throw v.problem(400,"Ảnh phải nhỏ hơn hoặc bằng 10 MB");
    if (body.checksum!==undefined && (!/^[a-f0-9]{64}$/.test(body.checksum) || body.checksum!==v.hash(original))) throw v.problem(400,"Checksum ảnh không khớp; gửi lại bản gốc");
    let metadata,thumbnail;
    try {
        const image = sharp(original,{ limitInputPixels: 40000000, failOn: "error" });
        metadata = await image.metadata();
        if (!["jpeg","png","webp"].includes(metadata.format) || (metadata.pages || 1)>1) throw new Error("Unsupported image");
        thumbnail = await image.rotate().resize({ width:1200,height:1200,fit:"inside",withoutEnlargement:true }).jpeg({ quality:75 }).toBuffer();
        if (thumbnail.length>=1048576) thumbnail = await sharp(thumbnail).resize({ width:800 }).jpeg({ quality:55 }).toBuffer();
    } catch { throw v.problem(400,"Ảnh phải là JPEG, PNG hoặc WebP hợp lệ, tối đa 40 megapixel"); }
    const exif = await exifr.parse(original).catch(() => null);
    if (body.display_data!==undefined) {
        try {
            if (typeof body.display_data!=="string" || body.display_data.length>1400000 || !/^[A-Za-z0-9+/]+={0,2}$/.test(body.display_data)) throw new Error("Invalid display image");
            const display=Buffer.from(body.display_data,"base64");
            if (!display.length || display.length>=1048576) throw new Error("Display too large");
            const resized=sharp(display,{ limitInputPixels:4000000,failOn:"error" });
            const displayMeta=await resized.metadata();
            if (displayMeta.format!=="jpeg" || (displayMeta.pages || 1)>1) throw new Error("Invalid display format");
            thumbnail=await resized.resize({ width:480,height:480,fit:"inside",withoutEnlargement:true }).jpeg({ quality:75 }).toBuffer();
        } catch { throw v.problem(400,"Bản ảnh nén phải là JPEG hợp lệ dưới 1 MB"); }
    } else thumbnail=await sharp(thumbnail).resize({ width:480,height:480,fit:"inside",withoutEnlargement:true }).jpeg({ quality:75 }).toBuffer();
    const lat = exif?.latitude, lon = exif?.longitude;
    const gps = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat)<=90 && Math.abs(lon)<=180;
    const taken = exif?.DateTimeOriginal;
    return { client_uuid,work_item_id,filename,original,thumbnail,content_hash:v.hash(original),mime_type:`image/${metadata.format}`,
        taken_at: taken instanceof Date && Number.isFinite(taken.getTime()) ? taken.toISOString() : null,
        latitude:gps ? lat : null,longitude:gps ? lon : null,
        metadata:{ has_exif:Boolean(metadata.exif),width:metadata.width,height:metadata.height,make:exif?.Make || null,model:exif?.Model || null,software:exif?.Software || null,orientation:exif?.Orientation || null,clock_source:"camera" }
    };
}
module.exports = { preparePhoto,distance };

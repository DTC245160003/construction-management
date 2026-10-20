const sharp = require("sharp");
const exifr = require("exifr");
const v = require("./siteValidation");

// These are review heuristics, not an authenticity test. The backlog leaves
// thresholds open; both time thresholds can be configured for each deployment.
const COMMON_PHONE_SCREEN_DIMENSIONS = new Set([
    "720x1280","750x1334","1080x1920","1080x2340","1080x2400",
    "1125x2436","1170x2532","1179x2556","1242x2688","1284x2778",
    "1290x2796","1440x2560","1440x2960","1440x3040"
]);
const DAY_MS = 86400000;
const positiveSetting = (name,fallback) => {
    const value=Number(process.env[name]);
    return Number.isFinite(value) && value>0 && value<=365 ? value : fallback;
};
const validDate = (value) => {
    if (value==null || value==="") return null;
    const date=value instanceof Date ? value : new Date(value);
    return Number.isFinite(date.getTime()) ? date : null;
};
const hasGps = (photo) => Number.isFinite(photo.latitude) && Number.isFinite(photo.longitude)
    && Math.abs(photo.latitude)<=90 && Math.abs(photo.longitude)<=180;

function captureTimeLabel(photo) {
    if(!photo.taken_at&&!photo.metadata?.capture_time_local)return 'Không có metadata thời gian';
    const raw=photo.metadata?.capture_time_local || validDate(photo.taken_at)?.toISOString().slice(0,19);
    if(!raw)return 'Không có metadata thời gian hợp lệ';
    return `${raw.replace('T',' ')} (EXIF máy ảnh${photo.metadata?.capture_time_offset ? ` ${photo.metadata.capture_time_offset}` : '; chưa khai báo múi giờ'})`;
}
function reviewPhoto(photo,{ referenceDate=null,site=null,now=new Date() } = {}) {
    const metadata=photo.metadata || {};
    const reasons=[];
    const categories=new Set();
    const add=(code,message,severity="warning",category=code) => {
        reasons.push({ code,message,severity });
        if (severity==="warning") categories.add(category);
    };
    const policy={ max_capture_age_days:positiveSetting("PHOTO_MAX_CAPTURE_AGE_DAYS",7),future_tolerance_hours:positiveSetting("PHOTO_FUTURE_TOLERANCE_HOURS",24) };
    if (!metadata.has_exif) add("missing_camera_exif","Ảnh không có EXIF máy ảnh; cần đối chiếu với hồ sơ hiện trường.","warning","metadata");
    else if (metadata.has_camera_exif===false) add("missing_camera_exif","EXIF không có thông tin máy ảnh hoặc thời điểm chụp gốc.","warning","metadata");
    const dimensions=[metadata.width,metadata.height].sort((a,b) => a-b).join("x");
    if (COMMON_PHONE_SCREEN_DIMENSIONS.has(dimensions)) add("phone_screen_dimensions",`Kích thước ${metadata.width} × ${metadata.height} trùng một kích thước màn hình điện thoại phổ biến; ảnh máy ảnh cũng có thể có kích thước này.`,"warning","screenshot");
    if (/screen[ _-]?(shot|capture)|ch[uụ]p[ _-]?m[aà]n[ _-]?h[iì]nh/i.test(`${photo.filename || ""} ${metadata.software || ""}`)) add("screenshot_hint","Tên tệp hoặc phần mềm ghi nhận dấu hiệu ảnh chụp màn hình.","warning","screenshot");
    const taken=validDate(photo.taken_at),reference=validDate(referenceDate),current=validDate(now);
    let captureAgeDays=null;
    if (!taken) add("capture_time_missing","Không có thời điểm chụp hợp lệ để đối chiếu.","info");
    else {
        if (current && taken-current>policy.future_tolerance_hours*3600000) add("capture_time_future",`Thời điểm chụp vượt thời gian hiện tại hơn ${policy.future_tolerance_hours} giờ; cần kiểm tra đồng hồ máy ảnh.`,"warning","capture_time");
        if (reference) {
            const dateValue=(date) => Date.UTC(date.getUTCFullYear(),date.getUTCMonth(),date.getUTCDate());
            captureAgeDays=Math.round((dateValue(reference)-dateValue(taken))/DAY_MS);
            if (Math.abs(captureAgeDays)>policy.max_capture_age_days) add("capture_far_from_acceptance",`Ngày chụp cách ngày nghiệm thu ${Math.abs(captureAgeDays)} ngày, vượt ngưỡng đối chiếu ${policy.max_capture_age_days} ngày.`,"warning","capture_time");
        }
    }
    const gps=hasGps(photo);
    if (!gps) add("gps_missing","Không có tọa độ GPS hợp lệ; chưa thể kiểm tra vị trí.","info");
    const siteReady=gps && site && Number.isFinite(site.latitude) && Number.isFinite(site.longitude) && Number.isFinite(site.radius_m) && site.radius_m>0;
    const distanceM=siteReady ? distance(photo.latitude,photo.longitude,site.latitude,site.longitude) : gps && Number.isFinite(photo.distance_m) ? photo.distance_m : null;
    const outsideSite=!gps ? null : siteReady ? distanceM>site.radius_m : metadata.review?.outside_site ?? (distanceM!==null && !metadata.review && photo.suspicious ? true : null);
    const accuracy=Number.isFinite(metadata.gps_accuracy_m) && metadata.gps_accuracy_m>=0 ? metadata.gps_accuracy_m : null;
    if (outsideSite) {
        const uncertainty=siteReady && accuracy!==null && distanceM-site.radius_m<=accuracy;
        add("outside_site_radius",`GPS cách tâm công trường ${Math.round(distanceM)} m${siteReady ? `, ngoài bán kính ${site.radius_m} m` : ""}.${uncertainty ? " Vị trí gần ranh giới trong sai số GPS được ghi nhận; cần kiểm tra thêm." : " Cần đối chiếu vị trí, không tự động bác bỏ ảnh."}`,"warning","location");
    }
    return { capture_time_display:captureTimeLabel(photo), reasons,confidence_level:categories.size>1 ? "medium" : categories.size ? "low" : "none",needs_review:categories.size>0,
        distance_m:distanceM,outside_site:outsideSite,reference_date:reference ? reference.toISOString().slice(0,10) : null,
        capture_age_days:captureAgeDays,gps_accuracy_m:accuracy,policy };
}

function distance(a,b,c,d) {
    const rad = (value) => value * Math.PI / 180;
    const h = Math.sin(rad(c-a)/2)**2 + Math.cos(rad(a))*Math.cos(rad(c))*Math.sin(rad(d-b)/2)**2;
    return 6371000 * 2 * Math.atan2(Math.sqrt(h),Math.sqrt(Math.max(0,1-h)));
}
async function preparePhoto(body,{ now=new Date() } = {}) {
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
    let exifReadError=false;
    const exif = await exifr.parse(original).catch(() => { exifReadError=true; return null; });
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
    const rawExif=metadata.exif ? await exifr.parse(original,{pick:['DateTimeOriginal','OffsetTimeOriginal'],reviveValues:false}).catch(()=>null) : null;
    const rawTime=typeof rawExif?.DateTimeOriginal==='string' ? rawExif.DateTimeOriginal.trim() : '';
    const localTime=/^\d{4}:\d{2}:\d{2} \d{2}:\d{2}:\d{2}$/.test(rawTime) ? rawTime.replace(/^(\d{4}):(\d{2}):(\d{2}) /,'$1-$2-$3T') : null;
    const offset=typeof rawExif?.OffsetTimeOriginal==='string' && /^[+-]\d{2}:\d{2}$/.test(rawExif.OffsetTimeOriginal) ? rawExif.OffsetTimeOriginal : null;
    const instant=localTime&&offset ? validDate(localTime+offset) : validDate(taken);
    const prepared={ client_uuid,work_item_id,filename,original,thumbnail,content_hash:v.hash(original),mime_type:`image/${metadata.format}`,
        taken_at:instant ? instant.toISOString() : null,
        latitude:gps ? lat : null,longitude:gps ? lon : null,
        metadata:{ has_exif:Boolean(metadata.exif),has_camera_exif:Boolean(metadata.exif && (exif?.Make || exif?.Model || validDate(taken))),
            exif_status:exifReadError ? "unreadable" : metadata.exif ? "present" : "absent",width:metadata.width,height:metadata.height,
            make:exif?.Make || null,model:exif?.Model || null,software:exif?.Software || null,orientation:exif?.Orientation || null,
            clock_source:taken instanceof Date && Number.isFinite(taken.getTime()) ? "camera" : null,
            capture_time_local:localTime,capture_time_offset:offset,
            gps_accuracy_m:Number.isFinite(exif?.GPSHPositioningError) && exif.GPSHPositioningError>=0 ? exif.GPSHPositioningError : null }
    };
    prepared.metadata.review=reviewPhoto(prepared,{ now });
    return prepared;
}
module.exports = { preparePhoto,distance,reviewPhoto,COMMON_PHONE_SCREEN_DIMENSIONS,captureTimeLabel };

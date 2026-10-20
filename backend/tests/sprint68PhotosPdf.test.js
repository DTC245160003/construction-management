const fs = require("node:fs");
const path = require("node:path");
const { randomUUID } = require("node:crypto");
const sharp = require("sharp");
const exifr = require("exifr");
const { preparePhoto,reviewPhoto,distance } = require("../src/services/photoService");
const { createReportPdfService,dossierData } = require("../src/services/reportPdfService");

const now=new Date("2026-10-14T12:00:00Z");
const cameraPhoto=(changes={}) => ({ id:8,filename:"camera.jpg",taken_at:"2026-10-05T08:30:00Z",latitude:10.78,longitude:106.7,
    metadata:{ has_exif:true,has_camera_exif:true,width:4000,height:3000,make:"Camera",model:"Test" },...changes });
const codes=(review) => review.reasons.map((reason) => reason.code);
const input=(bytes,extra={}) => ({ client_uuid:randomUUID(),work_item_id:2,filename:"camera.jpg",data:bytes.toString("base64"),...extra });

describe("Photo metadata from original bytes and explainable review signals",() => {
    test('preserves camera wall clock and applies only an explicitly supplied offset',async()=>{
        const camera=offset=>sharp({create:{width:40,height:30,channels:3,background:'blue'}}).jpeg().withExif({IFD2:{DateTimeOriginal:'2026:10:05 08:30:00',...(offset?{OffsetTimeOriginal:offset}:{})}}).toBuffer();
        const unknown=await preparePhoto(input(await camera(null)),{now});
        expect(unknown.metadata.capture_time_local).toBe('2026-10-05T08:30:00');expect(unknown.metadata.capture_time_offset).toBeNull();
        expect(unknown.metadata.review.capture_time_display).toContain('08:30:00');expect(unknown.metadata.review.capture_time_display).toContain('chưa khai báo múi giờ');
        const explicit=await preparePhoto(input(await camera('+07:00')),{now});
        expect(explicit.taken_at).toBe('2026-10-05T01:30:00.000Z');expect(explicit.metadata.review.capture_time_display).toContain('08:30:00');expect(explicit.metadata.capture_time_offset).toBe('+07:00');
    });
    afterEach(() => { jest.restoreAllMocks(); delete process.env.PHOTO_MAX_CAPTURE_AGE_DAYS; delete process.env.PHOTO_FUTURE_TOLERANCE_HOURS; });
    test("retains original bytes and leaves missing EXIF time/GPS unknown, ignoring client coordinates",async () => {
        const bytes=await sharp({ create:{ width:120,height:100,channels:3,background:"#2489ce" } }).jpeg().toBuffer();
        const photo=await preparePhoto(input(bytes,{ latitude:10,longitude:106,taken_at:"2026-10-05" }),{ now });
        expect(photo.original.equals(bytes)).toBe(true);
        expect(photo).toMatchObject({ taken_at:null,latitude:null,longitude:null,metadata:{ has_exif:false,has_camera_exif:false,exif_status:"absent",clock_source:null } });
        expect(codes(photo.metadata.review)).toEqual(expect.arrayContaining(["missing_camera_exif","gps_missing","capture_time_missing"]));
        expect(photo.metadata.review).toMatchObject({ needs_review:true,confidence_level:"low",outside_site:null,distance_m:null });
        expect((await sharp(photo.thumbnail).metadata()).exif).toBeUndefined();
    });
    test("extracts real camera EXIF time and GPS without replacing it with thumbnail metadata",async () => {
        const bytes=await sharp({ create:{ width:120,height:100,channels:3,background:"#2489ce" } })
            .withExif({ IFD0:{ Make:"Test camera",Model:"Real EXIF" },IFD2:{ DateTimeOriginal:"2026:10:05 08:30:00" },
                IFD3:{ GPSLatitudeRef:"N",GPSLatitude:"10/1 46/1 48/1",GPSLongitudeRef:"E",GPSLongitude:"106/1 42/1 0/1" } }).jpeg().toBuffer();
        const display=await sharp({ create:{ width:50,height:50,channels:3,background:"#ffffff" } }).jpeg().toBuffer();
        const photo=await preparePhoto(input(bytes,{ display_data:display.toString("base64") }),{ now });
        expect(photo.original.equals(bytes)).toBe(true);
        expect(photo.latitude).toBeCloseTo(10.78); expect(photo.longitude).toBeCloseTo(106.7);
        expect(photo.taken_at).not.toBeNull();
        expect(photo.metadata).toMatchObject({ has_exif:true,has_camera_exif:true,make:"Test camera",model:"Real EXIF",clock_source:"camera",width:120,height:100 });
        expect(codes(photo.metadata.review)).not.toContain("missing_camera_exif");
    });
    test("a malformed EXIF parser result cannot invent valid coordinates or capture time",async () => {
        jest.spyOn(exifr,"parse").mockResolvedValue({ latitude:91,longitude:Infinity,DateTimeOriginal:new Date("invalid") });
        const bytes=await sharp({ create:{ width:12,height:10,channels:3,background:"#2489ce" } }).jpeg().toBuffer();
        expect(await preparePhoto(input(bytes),{ now })).toMatchObject({ taken_at:null,latitude:null,longitude:null,metadata:{ clock_source:null } });
    });
    test("missing GPS alone stays unknown and does not flag a camera image as suspicious",() => {
        const review=reviewPhoto(cameraPhoto({ latitude:null,longitude:null }),{ referenceDate:"2026-10-05",now });
        expect(review).toMatchObject({ needs_review:false,confidence_level:"none",outside_site:null,distance_m:null });
        expect(codes(review)).toEqual(["gps_missing"]);
    });
    test("matches exact common phone screens in either orientation and labels weak evidence",() => {
        const photo=cameraPhoto({ metadata:{ has_exif:true,has_camera_exif:true,width:2400,height:1080 } });
        const review=reviewPhoto(photo,{ now });
        expect(codes(review)).toContain("phone_screen_dimensions");
        expect(review).toMatchObject({ needs_review:true,confidence_level:"low" });
        expect(codes(reviewPhoto({ ...photo,metadata:{ ...photo.metadata,width:2401 } },{ now }))).not.toContain("phone_screen_dimensions");
    });
    test("capture age is calculated for each acceptance date with a configurable strict boundary",() => {
        const photo=cameraPhoto();
        expect(codes(reviewPhoto(photo,{ referenceDate:"2026-10-12",now }))).not.toContain("capture_far_from_acceptance");
        expect(reviewPhoto(photo,{ referenceDate:"2026-10-13",now })).toMatchObject({ capture_age_days:8,reference_date:"2026-10-13",needs_review:true });
        process.env.PHOTO_MAX_CAPTURE_AGE_DAYS="10";
        expect(codes(reviewPhoto(photo,{ referenceDate:"2026-10-13",now }))).not.toContain("capture_far_from_acceptance");
        process.env.PHOTO_MAX_CAPTURE_AGE_DAYS="invalid";
        expect(reviewPhoto(photo,{ now }).policy.max_capture_age_days).toBe(7);
    });
    test("future time and independent screenshot clues raise a visible heuristic confidence level",() => {
        const review=reviewPhoto(cameraPhoto({ filename:"Screenshot_01.jpg",taken_at:"2026-10-16T12:00:00Z" }),{ now });
        expect(codes(review)).toEqual(expect.arrayContaining(["capture_time_future","screenshot_hint"]));
        expect(review).toMatchObject({ needs_review:true,confidence_level:"medium" });
    });
    test("uses real GPS distance, gives outside-radius reason, and mentions recorded GPS uncertainty",() => {
        const site={ latitude:10.78,longitude:106.7,radius_m:100 };
        const photo=cameraPhoto({ latitude:10.781,metadata:{ ...cameraPhoto().metadata,gps_accuracy_m:30 } });
        const review=reviewPhoto(photo,{ site,now });
        expect(review.distance_m).toBeCloseTo(111.1949,3);
        expect(review).toMatchObject({ outside_site:true,needs_review:true,gps_accuracy_m:30 });
        expect(review.reasons.find((reason) => reason.code==="outside_site_radius").message).toContain("sai số GPS");
        expect(reviewPhoto(cameraPhoto(),{ site,now })).toMatchObject({ outside_site:false,distance_m:0,needs_review:false });
        expect(distance(10.78,106.7,10.78,106.7)).toBe(0);
    });
    test("invalid reference/time remains unknown and missing EXIF does not reject image upload",() => {
        const review=reviewPhoto(cameraPhoto({ taken_at:"not-a-date",metadata:{} }),{ referenceDate:"not-a-day",now });
        expect(review).toMatchObject({ reference_date:null,capture_age_days:null });
        expect(codes(review)).toContain("capture_time_missing");
    });
});

function pdfFixture(thumbnail) {
    const items=[{ id:1,parent_id:null,title:"Kết cấu công trình" },{ id:2,parent_id:1,title:"Móng bê tông" },{ id:3,parent_id:2,title:"Thép móng" },{ id:4,parent_id:null,title:"Ngoài phạm vi" }];
    const base={ work_item_id:2,item_name:"Móng bê tông",status:"approved",period:"Đợt nghiệm thu móng",day:"2026-10-05",previous_cumulative:"0.0000",quantity:"7.0000",cumulative:"7.0000",unit:"m³",unit_price:"25.50",author:"Nguyễn Văn Lập",approver:"Trần Thị Duyệt",approved_at:"2026-10-06T08:00:00Z",notes:"Đã kiểm tra khối lượng và hồ sơ hiện trường.",photo_ids:[8] };
    const forms=[{ ...base,id:11,work_item_id:3,item_name:"Thép móng",period:"Đợt 2 - thép",day:"2026-10-14",previous_cumulative:"7.0000",quantity:"3.0000",cumulative:"10.0000" },{ ...base,id:10 },{ ...base,id:12,status:"draft" },{ ...base,id:13,work_item_id:4 }];
    const photo=cameraPhoto({ thumbnail,filename:"ảnh-móng.jpg",metadata:{ ...cameraPhoto().metadata,capture_time_offset:null } });
    const t={ item:jest.fn(async (_pid,id) => items.find((entry) => entry.id===id) || null),items:jest.fn(async () => items),acceptances:jest.fn(async () => forms),photo:jest.fn(async (_pid,id) => id===photo.id ? photo : null),project:jest.fn(async () => ({ name:"Dự án Xây dựng số - kiểm tra tiếng Việt",location:"Thành phố Hồ Chí Minh" })),settings:jest.fn(async () => ({ latitude:10.78,longitude:106.7,radius_m:100 })) };
    return { model:{ transaction:jest.fn(async (_id,callback) => callback(t)) },t,forms };
}

describe("Acceptance PDF dossiers",() => {
    test("collects approved descendant periods chronologically and fetches each shared photo once",async () => {
        const { model,t }=pdfFixture(null);
        const data=await dossierData(model,20,1);
        expect(data.forms.map((form) => form.id)).toEqual([10,11]);
        expect(t.photo).toHaveBeenCalledTimes(1);
        expect(data.photos).toHaveLength(1);
        expect((await dossierData(model,20,2)).forms.map((form) => form.id)).toEqual([10,11]);
        await expect(dossierData(model,20,999)).rejects.toMatchObject({ status:404 });
    });
    test("produces a real multipage Vietnamese-font PDF with embedded image and internal-template metadata",async () => {
        const image=await sharp({ create:{ width:180,height:120,channels:3,background:"#2489ce" } }).jpeg().toBuffer();
        const { model,forms }=pdfFixture(image);
        forms[0].notes="Ghi chú đối chiếu tiếng Việt có dấu. ".repeat(70);
        const pdf=await createReportPdfService({ model })(20,{ id:1,role:"viewer" },1);
        expect(pdf.subarray(0,5).toString()).toBe("%PDF-");
        const raw=pdf.toString("latin1");
        expect(raw).toContain("/Subtype /Image");
        expect(raw).toContain("/FontFile2");
        expect(Number(raw.match(/\/Type \/Pages\s*\/Count (\d+)/)?.[1] || 0)).toBeGreaterThan(1);
        expect(raw).toContain("/Subject");
        if (process.env.SPRINT68_PDF_QA_DIR) {
            fs.mkdirSync(process.env.SPRINT68_PDF_QA_DIR,{ recursive:true });
            fs.writeFileSync(path.join(process.env.SPRINT68_PDF_QA_DIR,"acceptance-dossier.pdf"),pdf);
        }
    });
    test("rejects invalid item IDs before touching the database",async () => {
        const { model }=pdfFixture(null);
        await expect(createReportPdfService({ model })(20,{ role:"viewer" },0)).rejects.toMatchObject({ status:400 });
        expect(model.transaction).not.toHaveBeenCalled();
    });
});

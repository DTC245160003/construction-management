const sharp=require("../backend/node_modules/sharp");
const fs=require("node:fs");
const path=require("node:path");
const dir=path.join(__dirname,"../frontend/public/icons");
fs.mkdirSync(dir,{ recursive:true });
const svg='<svg width="512" height="512" xmlns="http://www.w3.org/2000/svg"><rect width="512" height="512" rx="100" fill="#0c294a"/><path d="M120 340V230l136-90 136 90v110H290V240h-68v100z" fill="#fff"/><path d="M110 370h292" stroke="#24b6ef" stroke-width="28"/></svg>';
Promise.all([192,512].map((size) => sharp(Buffer.from(svg)).resize(size,size).png().toFile(path.join(dir,`icon-${size}.png`)))).catch((e) => { console.error(e); process.exitCode=1; });

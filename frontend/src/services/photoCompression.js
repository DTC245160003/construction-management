export async function prepareLocalPhoto(file) {
  if (!["image/jpeg","image/png","image/webp"].includes(file.type) || file.size>10*1024*1024) throw new Error("Chọn ảnh JPEG, PNG hoặc WebP, tối đa 10 MB.");
  const bitmap=await createImageBitmap(file);
  try {
    if (bitmap.width*bitmap.height>40000000) throw new Error("Ảnh tối đa 40 megapixel.");
    const canvas=document.createElement("canvas"),scale=Math.min(1,1600/Math.max(bitmap.width,bitmap.height));
    canvas.width=Math.max(1,Math.round(bitmap.width*scale)); canvas.height=Math.max(1,Math.round(bitmap.height*scale)); canvas.getContext("2d").drawImage(bitmap,0,0,canvas.width,canvas.height);
    let display;
    for (const quality of [0.8,0.65,0.5,0.3]) { display=await new Promise((resolve) => canvas.toBlob(resolve,"image/jpeg",quality)); if (display && display.size<1048576) break; }
    if (!display || display.size>=1048576) throw new Error("Không nén được ảnh dưới 1 MB. Chọn ảnh nhỏ hơn.");
    const digest=await crypto.subtle.digest("SHA-256",await file.arrayBuffer()),checksum=Array.from(new Uint8Array(digest),(b) => b.toString(16).padStart(2,"0")).join("");
    return { file,display,checksum,clientUuid:crypto.randomUUID(),filename:file.name,metadata:{ width:bitmap.width,height:bitmap.height,originalBytes:file.size,displayBytes:display.size } };
  } finally { bitmap.close(); }
}

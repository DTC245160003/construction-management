import { api,projectPath } from "./operationsApi";
export const workflowLabels = { draft:"Nháp",submitted:"Chờ duyệt",approved:"Đã duyệt",returned:"Trả lại" };
export const workflowTones = { draft:"gray",submitted:"orange",approved:"green",returned:"red" };
export const moneyLabel = (value) => {
  const [whole,decimal = "00"] = String(value ?? "0").split(".");
  return `${whole.replace(/\B(?=(\d{3})+(?!\d))/g,".")},${decimal.padEnd(2,"0").slice(0,2)}`;
};
export const cents = (value) => { const [whole,fraction = ""] = String(value ?? "0").split("."); return BigInt(whole) * 100n + BigInt(fraction.padEnd(2,"0").slice(0,2)); };
export const totalMoney = (rows,key) => { const sum = rows.reduce((total,row) => total+cents(row[key]),0n).toString().padStart(3,"0"); return `${sum.slice(0,-2)}.${sum.slice(-2)}`; };
export function fileData(file) {
  return new Promise((resolve,reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result).split(",")[1]); reader.onerror = () => reject(new Error("Không thể đọc ảnh")); reader.readAsDataURL(file); });
}
export async function uploadPhoto(projectId,itemId,file,clientUuid = crypto.randomUUID()) {
  if (file.size>10*1024*1024) throw new Error("Mỗi ảnh tối đa 10 MB.");
  return (await api(projectPath(projectId,"/photos"),{ method:"POST",body:{ work_item_id:Number(itemId),client_uuid:clientUuid,filename:file.name,data:await fileData(file) } })).photo;
}
export const photoUrl = (projectId,id,original = false) => projectPath(projectId,`/photos/${id}/${original ? "original" : "thumbnail"}`);

export async function api(path, { body, ...options } = {}) {
  const response = await fetch(path, {
    ...options,
    credentials: "include",
    headers: { Accept: "application/json", ...(body === undefined ? {} : { "Content-Type": "application/json" }) },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
  if (response.status === 204) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    const error = new Error(data?.message || (response.status === 401 ? "Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại." : response.status === 403 ? "Bạn không có quyền thực hiện thao tác trong dự án này." : "Không thể tải dữ liệu. Vui lòng thử lại."));
    error.status = response.status;
    throw error;
  }
  if (!data) throw new Error("Máy chủ trả về dữ liệu không hợp lệ.");
  return data;
}

export const projectPath = (projectId, suffix = "") => `/projects/${projectId}${suffix}`;
export const dateLabel = (date) => date ? new Date(`${date.slice(0, 10)}T00:00:00`).toLocaleDateString("vi-VN") : "Chưa thiết lập";
export const numberLabel = (value) => Number(value || 0).toLocaleString("vi-VN", { maximumFractionDigits: 4 });
export const today = () => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
export const projectStatuses = { planned: "Chuẩn bị", active: "Đang triển khai", on_hold: "Tạm dừng", completed: "Hoàn thành" };
export const roleLabels = { admin: "Ban quản lý", project_manager: "Chỉ huy trưởng", engineer: "Kỹ sư giám sát", worker: "Đội trưởng", accountant: "Kế toán", viewer: "Chủ đầu tư", manager: "Quản lý", member: "Thành viên" };

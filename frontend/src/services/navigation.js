export const navigation = [
  ["Tổng quan", "/home", "chart"], ["Dự án", "/projects", "folder"],
  ["Thành viên & phân quyền", "/members", "users"], ["Cây hạng mục", "/work-items", "tree"],
  ["Tiến độ & đường găng", "/schedule", "chart"], ["Lịch làm việc", "/calendar", "calendar"],
  ["Giao việc hiện trường", "/field-assignments", "task"], ["Nhật ký công trường", "/site-journal", "document"],
  ["Nghiệm thu khối lượng", "/acceptance", "document"], ["Thanh toán", "/payments", "money"],
  ["Chi phí & vật tư", "/costs-materials", "cube"], ["Ảnh hiện trường", "/site-photos", "photo"],
  ["Báo cáo", "/reports", "chart"], ["Thông báo", "/notifications", "bell"],
  ["Nhật ký hệ thống", "/audit-logs", "document"], ["Cài đặt", "/settings", "settings"],
];
export const validProjectId = (value) => /^\d+$/.test(String(value)) && Number(value) > 0 && Number(value) <= 2147483647;
export const scopedLink = (path, projectId) => validProjectId(projectId) ? `${path}?projectId=${Number(projectId)}` : path;

const projectNavigation={
  admin: null,project_manager:null,manager:null,
  engineer:["/members","/work-items","/schedule","/calendar","/field-assignments","/site-journal","/acceptance","/site-photos","/notifications","/settings"],
  worker:["/field-assignments","/site-photos","/notifications","/settings"],
  accountant:["/members","/calendar","/payments","/costs-materials","/site-photos","/reports","/notifications","/settings"],
  viewer:["/members","/work-items","/schedule","/calendar","/field-assignments","/site-journal","/acceptance","/payments","/costs-materials","/site-photos","/reports","/notifications","/settings"],
};
export function visibleNavigation(memberRole,systemRole) {
  const allowed=projectNavigation[memberRole];
  const entries=navigation.filter(([,path]) => ["/home","/projects"].includes(path) || systemRole==="super_admin" || (memberRole && Object.hasOwn(projectNavigation,memberRole) && (allowed===null || allowed.includes(path))));
  return systemRole==="super_admin" ? [["Quản trị hệ thống","/system-admin","settings"],...entries] : entries;
}

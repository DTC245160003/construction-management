import { useMemo, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import "../styles/Members.css";

const I = {
  home: "M3 10.5 12 3l9 7.5V21a1 1 0 0 1-1 1h-5v-6H9v6H4a1 1 0 0 1-1-1z",
  project: "M3 7h7l2 2h9v11H3z",
  users: "M16 19v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 9a4 4 0 1 0 0-8 4 4 0 0 0 0 8m13 10v-2a4 4 0 0 0-3-3.9",
  tree: "M4 4h6v5H4zM14 2h6v5h-6zM14 11h6v5h-6zM10 6.5h4M10 13.5h4M7 9v10h7",
  gantt: "M4 6h9M4 11h13M4 16h7M4 21h16M4 3v18",
  calendar: "M3 5h18v16H3zM3 10h18M8 3v4M16 3v4",
  assign: "M9 11l3 3 7-7M4 5h10M4 10h5M4 15h7M4 20h9",
  journal: "M5 3h14v18H5zM9 7h7M9 11h7M9 15h4",
  check: "M4 4h16v16H4zM8 12l3 3 5-6",
  payment: "M3 7h18v10H3zM3 11h18M7 15h3",
  cost: "M12 2 3 7v10l9 5 9-5V7zM3 7l9 5 9-5M12 12v10",
  photo: "M3 5h18v14H3zM3 15l5-5 4 4 3-3 6 6",
  report: "M6 3h9l4 4v14H6zM14 3v5h5M9 13h7M9 17h5",
  bell: "M18 16V11a6 6 0 1 0-12 0v5l-2 3h16zM10 22h4",
  system: "M4 5h16v14H4zM8 9h8M8 13h5",
  settings: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-2.9 1.2V21a2 2 0 1 1-4 0v-.1A1.7 1.7 0 0 0 7 19.4a1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0-1.2-2.9H1a2 2 0 1 1 0-4h.1A1.7 1.7 0 0 0 2.6 7",
  search: "M11 19a8 8 0 1 0 0-16 8 8 0 0 0 0 16m10 2-4.5-4.5",
  help: "M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20M9.5 9a2.5 2.5 0 1 1 3.4 2.3c-.6.3-.9.9-.9 1.5v.5M12 17h.01",
  chevron: "m6 9 6 6 6-6",
  plus: "M12 5v14M5 12h14",
  download: "M12 3v12m0 0 4-4m-4 4-4-4M5 19h14",
  history: "M3 12a9 9 0 1 0 3-6.7L3 8m0-5v5h5",
  mail: "M3 5h18v14H3zM3 7l9 7 9-7",
  shield: "M12 3l7 3v5c0 4.7-3 8.4-7 10-4-1.6-7-5.3-7-10V6zM9 12l2 2 4-5",
  team: "M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8m10 10v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75",
  grid: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z",
  eye: "M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Zm10 3a3 3 0 1 0 0-6 3 3 0 0 0 0 6",
  edit: "M4 20h4L19 9l-4-4L4 16v4Zm9-13 4 4",
  lockUsers: "M5 20v-1a5 5 0 0 1 5-5h4a5 5 0 0 1 5 5v1M12 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8M18 8h4M20 6v4",
  trash: "M4 7h16M9 7V4h6v3m-8 0 1 13h8l1-13M10 11v5M14 11v5",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  arrowUp: "M12 19V5m0 0-5 5m5-5 5 5",
  menu: "M4 6h16M4 12h16M4 18h16",
};

function Icon({ d, size = 18, color = "currentColor", width = 1.8 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke={color}
      strokeWidth={width}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={d} />
    </svg>
  );
}

const MENU = [
  { label: "Tổng quan", icon: I.home, to: "/home" },
  { label: "Dự án", icon: I.project, disabled: true },
  { label: "Thành viên & phân quyền", icon: I.users, active: true },
  { label: "Cây hạng mục", icon: I.tree, to: "/work-items?projectId=2" },
  { label: "Tiến độ & đường găng", icon: I.gantt, to: "/schedule?projectId=2" },
  { label: "Lịch làm việc", icon: I.calendar, disabled: true },
  { label: "Giao việc hiện trường", icon: I.assign, disabled: true },
  { label: "Nhật ký công trường", icon: I.journal, disabled: true },
  { label: "Nghiệm thu khối lượng", icon: I.check, disabled: true },
  { label: "Thanh toán", icon: I.payment, disabled: true },
  { label: "Chi phí & vật tư", icon: I.cost, disabled: true },
  { label: "Ảnh hiện trường", icon: I.photo, disabled: true },
  { label: "Báo cáo", icon: I.report, disabled: true },
  { label: "Thông báo", icon: I.bell, badge: "3", disabled: true },
  { label: "Nhật ký hệ thống", icon: I.system, disabled: true },
  { label: "Cài đặt", icon: I.settings, disabled: true },
];

const DEMO_MEMBERS = [
  { name: "Trần Văn Hùng", email: "hung.tvh@riverside.vn", role: "Ban quản lý", roleTone: "blue", team: "Ban QLDA Riverside", status: "Đang hoạt động", statusTone: "active", last: "10 phút trước", permission: "Toàn quyền dự án", avatar: "https://i.pravatar.cc/80?img=12" },
  { name: "Lê Minh Quân", email: "quan.lmq@invest.vn", role: "Chủ đầu tư", roleTone: "orange", team: "Đại diện chủ đầu tư", status: "Đang hoạt động", statusTone: "active", last: "1 giờ trước", permission: "Xem tiến độ, duyệt thanh toán", avatar: "https://i.pravatar.cc/80?img=11" },
  { name: "Phạm Thị Hạnh", email: "hanh.pth@site.vn", role: "Chỉ huy trưởng", roleTone: "purple", team: "Khối thi công A", status: "Đang hoạt động", statusTone: "active", last: "22 phút trước", permission: "Giao việc, cập nhật tiến độ, nhật ký", avatar: "https://i.pravatar.cc/80?img=47" },
  { name: "Nguyễn Hoàng Nam", email: "nam.nhn@site.vn", role: "Kỹ sư giám sát", roleTone: "cyan", team: "Giám sát hiện trường", status: "Đang hoạt động", statusTone: "active", last: "35 phút trước", permission: "Nhật ký, ảnh hiện trường, nghiệm thu", avatar: "https://i.pravatar.cc/80?img=15" },
  { name: "Vũ Đức Long", email: "long.vdl@team.vn", role: "Đội trưởng", roleTone: "green", team: "Đội thi công cọc", status: "Đang hoạt động", statusTone: "active", last: "Hôm nay", permission: "Xem việc được giao, báo khối lượng", avatar: "https://i.pravatar.cc/80?img=13" },
  { name: "Đỗ Thu Trang", email: "trang.dtt@finance.vn", role: "Kế toán", roleTone: "yellow", team: "Phòng tài chính", status: "Đang hoạt động", statusTone: "active", last: "Hôm qua", permission: "Theo dõi thanh toán, hồ sơ đề nghị", avatar: "https://i.pravatar.cc/80?img=48" },
  { name: "Hoàng Gia Bảo", email: "bao.hgb@gmail.com", role: "Kỹ sư giám sát", roleTone: "cyan", team: "Giám sát MEP", status: "Chờ xác nhận", statusTone: "pending", last: "Chưa đăng nhập", permission: "Nhật ký, nghiệm thu", avatar: "https://i.pravatar.cc/80?img=14" },
  { name: "Trần Quốc Anh", email: "anh.tqa@team.vn", role: "Đội trưởng", roleTone: "green", team: "Đội coppha", status: "Tạm khóa", statusTone: "locked", last: "3 ngày trước", permission: "Xem việc được giao", avatar: "https://i.pravatar.cc/80?img=18" },
];

const ROLE_PERMISSIONS = [
  { name: "Ban quản lý", tone: "blue", permissions: ["Tạo dự án", "Quản lý thành viên", "Quản lý cây hạng mục", "Tiến độ, giao việc", "Nghiệm thu, thanh toán", "Báo cáo"] },
  { name: "Chủ đầu tư", tone: "orange", permissions: ["Xem tổng quan", "Xem tiến độ", "Xem nhật ký", "Duyệt nghiệm thu/thanh toán", "Xem báo cáo"] },
  { name: "Chỉ huy trưởng", tone: "purple", permissions: ["Xem dự án tham gia", "Giao việc hiện trường", "Cập nhật tiến độ", "Nhật ký công trường", "Xem cảnh báo"] },
  { name: "Kỹ sư giám sát", tone: "cyan", permissions: ["Ghi nhật ký công trường", "Tải ảnh hiện trường", "Lập phiếu nghiệm thu", "Xem công việc liên quan"] },
  { name: "Đội trưởng", tone: "green", permissions: ["Chỉ xem việc của đội mình", "Báo khối lượng đã làm", "Nhận việc trong tuần"] },
  { name: "Kế toán", tone: "yellow", permissions: ["Xem khối lượng đã duyệt", "Tạo/kiểm tra đề nghị thanh toán", "Xem hồ sơ tài chính"] },
];

const DEMO_INVITES = [
  { initials: "NM", name: "Nguyễn Thị Mai", email: "mai.nt@site.vn", role: "Kỹ sư giám sát", tone: "cyan", sent: "Đã gửi 2 ngày trước" },
  { initials: "PD", name: "Phạm Văn Duy", email: "duy.pvd@team.vn", role: "Đội trưởng", tone: "green", sent: "Đã gửi 1 ngày trước" },
  { initials: "TK", name: "Trịnh Minh Khoa", email: "khoa.tm@consult.vn", role: "Tư vấn giám sát", tone: "orange", sent: "Đã gửi 3 ngày trước" },
];

function Members() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const projectId = params.get("projectId") || "2";

  const [activeTab, setActiveTab] = useState("members");
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [onlyProject, setOnlyProject] = useState(true);
  const [roleFilter, setRoleFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all");
  const [teamFilter, setTeamFilter] = useState("all");
  const [keyword, setKeyword] = useState("");

  const filteredMembers = useMemo(() => {
    return DEMO_MEMBERS.filter((m) => {
      const matchRole = roleFilter === "all" || m.role === roleFilter;
      const matchStatus = statusFilter === "all" || m.status === statusFilter;
      const matchTeam = teamFilter === "all" || m.team === teamFilter;
      const key = keyword.trim().toLowerCase();
      const matchKeyword = !key || `${m.name} ${m.email} ${m.role} ${m.team}`.toLowerCase().includes(key);
      return matchRole && matchStatus && matchTeam && matchKeyword;
    });
  }, [roleFilter, statusFilter, teamFilter, keyword]);

  const projectLink = (path) => `${path}?projectId=${encodeURIComponent(projectId)}`;

  return (
    <div className={`xds-members-page${drawerOpen ? " is-drawer-open" : ""}`}>
      <aside className="xds-members-sidebar">
        <div className="xds-members-brand">
          <div className="xds-members-brand-logo">
            <Icon d={I.project} size={28} color="#ff8500" />
          </div>
          <div>
            <div className="xds-members-brand-name">XÂY DỰNG SỐ</div>
            <div className="xds-members-brand-sub">Nền tảng điều hành thi công công trình</div>
          </div>
        </div>

        <nav className="xds-members-nav">
          {MENU.map((item) => {
            if (item.active) {
              return (
                <Link
                  key={item.label}
                  to={projectLink("/members")}
                  className="xds-members-nav-item is-active"
                  onClick={() => setDrawerOpen(false)}
                >
                  <span className="xds-members-nav-icon"><Icon d={item.icon} size={17} /></span>
                  <span className="xds-members-nav-label">{item.label}</span>
                </Link>
              );
            }

            if (item.to) {
              const to = item.to.includes("?") ? item.to.replace("projectId=2", `projectId=${projectId}`) : item.to;
              return (
                <Link
                  key={item.label}
                  to={to}
                  className="xds-members-nav-item"
                  onClick={() => setDrawerOpen(false)}
                >
                  <span className="xds-members-nav-icon"><Icon d={item.icon} size={17} /></span>
                  <span className="xds-members-nav-label">{item.label}</span>
                  {item.badge ? <span className="xds-members-nav-badge">{item.badge}</span> : null}
                </Link>
              );
            }

            return (
              <button key={item.label} type="button" className="xds-members-nav-item" disabled={item.disabled}>
                <span className="xds-members-nav-icon"><Icon d={item.icon} size={17} /></span>
                <span className="xds-members-nav-label">{item.label}</span>
                {item.badge ? <span className="xds-members-nav-badge">{item.badge}</span> : null}
              </button>
            );
          })}
        </nav>

        <div className="xds-members-sidebar-footer">
          <div className="xds-members-sidebar-footer-title">XÂY DỰNG SỐ</div>
          <div className="xds-members-sidebar-footer-text">Kiến tạo công trình từ dữ liệu</div>
        </div>
      </aside>

      <div className="xds-members-main">
        <header className="xds-members-topbar">
          <button className="xds-members-burger" type="button" onClick={() => setDrawerOpen((v) => !v)} aria-label="Mở menu">
            <Icon d={I.menu} />
          </button>

          <div className="xds-members-project">
            <div className="xds-members-project-thumb">
              <Icon d={I.project} size={20} />
            </div>
            <div>
              <div className="xds-members-project-label">Dự án hiện tại:</div>
              <div className="xds-members-project-name">Chung cư Riverside</div>
            </div>
            <span className="xds-members-project-caret"><Icon d={I.chevron} size={15} /></span>
          </div>

          <div className="xds-members-search">
            <Icon d={I.search} size={17} />
            <input placeholder="Tìm kiếm thành viên, email, vai trò..." />
          </div>

          <div className="xds-members-topbar-right">
            <button className="xds-members-icon-btn" type="button" aria-label="Thông báo">
              <Icon d={I.bell} size={18} />
              <span className="xds-members-dot">12</span>
            </button>
            <button className="xds-members-icon-btn" type="button" aria-label="Trợ giúp">
              <Icon d={I.help} size={18} />
            </button>
            <div className="xds-members-user">
              <img className="xds-members-avatar" src="https://i.pravatar.cc/80?img=12" alt="Nguyễn Văn Minh" />
              <div className="xds-members-user-text">
                <div className="xds-members-user-name">Nguyễn Văn Minh</div>
                <div className="xds-members-user-role">Quản lý dự án</div>
              </div>
              <Icon d={I.chevron} size={15} />
            </div>
          </div>
        </header>

        <main className="xds-members-content">
          <section className="xds-members-header">
            <div className="xds-members-header-icon"><Icon d={I.users} size={25} /></div>
            <div>
              <h1 className="xds-members-title">Thành viên & phân quyền</h1>
              <p className="xds-members-subtitle">
                Quản lý người tham gia dự án, gán vai trò và kiểm soát quyền truy cập theo đúng phạm vi công việc.
              </p>
            </div>

            <div className="xds-members-header-actions">
              <button type="button" className="xds-members-btn is-primary"><Icon d={I.plus} /> Mời thành viên</button>
              <button type="button" className="xds-members-btn"><Icon d={I.download} /> Xuất danh sách</button>
              <button type="button" className="xds-members-btn"><Icon d={I.history} /> Nhật ký truy cập</button>
            </div>
          </section>

          <section className="xds-members-kpis">
            <article className="xds-members-kpi">
              <div className="xds-members-kpi-icon is-blue"><Icon d={I.users} size={22} /></div>
              <div><div className="xds-members-kpi-value">28</div><div className="xds-members-kpi-label">Thành viên đang hoạt động</div><div className="xds-members-kpi-trend"><Icon d={I.arrowUp} size={13} /> +4 so với tháng trước</div></div>
            </article>
            <article className="xds-members-kpi">
              <div className="xds-members-kpi-icon is-orange"><Icon d={I.mail} size={21} /></div>
              <div><div className="xds-members-kpi-value">3</div><div className="xds-members-kpi-label">Lời mời chờ xác nhận</div><div className="xds-members-kpi-trend is-orange"><Icon d={I.arrowUp} size={13} /> +1 so với tuần trước</div></div>
            </article>
            <article className="xds-members-kpi">
              <div className="xds-members-kpi-icon is-purple"><Icon d={I.shield} size={21} /></div>
              <div><div className="xds-members-kpi-value">6</div><div className="xds-members-kpi-label">Vai trò trong dự án</div><div className="xds-members-kpi-trend is-muted">Đã cấu hình phân quyền</div></div>
            </article>
            <article className="xds-members-kpi">
              <div className="xds-members-kpi-icon is-green"><Icon d={I.team} size={21} /></div>
              <div><div className="xds-members-kpi-value">4</div><div className="xds-members-kpi-label">Đội thi công đang tham gia</div><div className="xds-members-kpi-trend"><Icon d={I.arrowUp} size={13} /> +1 so với tháng trước</div></div>
            </article>
          </section>

          <section className="xds-members-body">
            <div className="xds-members-col-left">
              <div className="xds-members-card">
                <div className="xds-members-tabs">
                  <button className={`xds-members-tab${activeTab === "members" ? " is-active" : ""}`} onClick={() => setActiveTab("members")} type="button"><Icon d={I.users} /> Danh sách thành viên</button>
                  <button className={`xds-members-tab${activeTab === "matrix" ? " is-active" : ""}`} onClick={() => setActiveTab("matrix")} type="button"><Icon d={I.grid} /> Ma trận quyền</button>
                  <button className={`xds-members-tab${activeTab === "invites" ? " is-active" : ""}`} onClick={() => setActiveTab("invites")} type="button"><Icon d={I.mail} /> Lời mời chờ xử lý</button>
                  <button className={`xds-members-tab${activeTab === "teams" ? " is-active" : ""}`} onClick={() => setActiveTab("teams")} type="button"><Icon d={I.team} /> Nhóm/đội thi công</button>
                </div>
              </div>

              <div className="xds-members-card">
                <div className="xds-members-card-head"><h2 className="xds-members-card-title">Danh sách thành viên (28)</h2></div>

                <div className="xds-members-filters">
                  <div className="xds-members-select">
                    <select value={roleFilter} onChange={(e) => setRoleFilter(e.target.value)}>
                      <option value="all">Tất cả vai trò</option>
                      {[...new Set(DEMO_MEMBERS.map((m) => m.role))].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <span className="xds-members-select-caret"><Icon d={I.chevron} size={14} /></span>
                  </div>

                  <div className="xds-members-select">
                    <select value={statusFilter} onChange={(e) => setStatusFilter(e.target.value)}>
                      <option value="all">Tất cả trạng thái</option>
                      {[...new Set(DEMO_MEMBERS.map((m) => m.status))].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <span className="xds-members-select-caret"><Icon d={I.chevron} size={14} /></span>
                  </div>

                  <div className="xds-members-select">
                    <select value={teamFilter} onChange={(e) => setTeamFilter(e.target.value)}>
                      <option value="all">Tất cả đội/nhóm</option>
                      {[...new Set(DEMO_MEMBERS.map((m) => m.team))].map((v) => <option key={v} value={v}>{v}</option>)}
                    </select>
                    <span className="xds-members-select-caret"><Icon d={I.chevron} size={14} /></span>
                  </div>

                  <div className="xds-members-search is-inline">
                    <Icon d={I.search} size={15} />
                    <input value={keyword} onChange={(e) => setKeyword(e.target.value)} placeholder="Tìm kiếm thành viên..." />
                  </div>

                  <button type="button" className={`xds-members-toggle${onlyProject ? "" : " is-off"}`} onClick={() => setOnlyProject((v) => !v)}>
                    <span className="xds-members-toggle-track" />
                    <span>Chỉ hiện thành viên của dự án này</span>
                  </button>
                </div>

                <div className="xds-members-table-wrap">
                  <table className="xds-members-table">
                    <thead>
                      <tr>
                        <th className="xds-members-table-check"><input className="xds-members-checkbox" type="checkbox" /></th>
                        <th>Họ tên</th>
                        <th>Email</th>
                        <th>Vai trò</th>
                        <th>Đội / Nhóm</th>
                        <th>Trạng thái</th>
                        <th>Lần truy cập gần nhất</th>
                        <th>Quyền chính</th>
                        <th>Thao tác</th>
                      </tr>
                    </thead>
                    <tbody>
                      {filteredMembers.map((m) => (
                        <tr key={m.email}>
                          <td className="xds-members-table-check"><input className="xds-members-checkbox" type="checkbox" /></td>
                          <td><div className="xds-members-person"><img className="xds-members-avatar is-sm" src={m.avatar} alt="" /><span className="xds-members-person-name">{m.name}</span></div></td>
                          <td className="xds-members-email">{m.email}</td>
                          <td><span className={`xds-members-badge is-${m.roleTone}`}>{m.role}</span></td>
                          <td className="xds-members-cell-muted">{m.team}</td>
                          <td><span className={`xds-members-status is-${m.statusTone}`}>{m.status}</span></td>
                          <td className="xds-members-cell-muted">{m.last}</td>
                          <td className="xds-members-cell-perm">{m.permission}</td>
                          <td>
                            <div className="xds-members-actions">
                              <button type="button" className="xds-members-action" title="Xem"><Icon d={I.eye} size={14} /></button>
                              <button type="button" className="xds-members-action" title="Sửa"><Icon d={I.edit} size={14} /></button>
                              <button type="button" className="xds-members-action" title="Phân quyền"><Icon d={I.lockUsers} size={14} /></button>
                              <button type="button" className="xds-members-action is-danger" title="Xóa"><Icon d={I.trash} size={14} /></button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>

                <div className="xds-members-tablefoot">
                  <div className="xds-members-tablefoot-info">Hiển thị 1 - {filteredMembers.length} trong tổng số 28 thành viên</div>
                  <div className="xds-members-pagination">
                    <button className="xds-members-page-btn" type="button">‹</button>
                    <button className="xds-members-page-btn is-active" type="button">1</button>
                    <button className="xds-members-page-btn" type="button">2</button>
                    <button className="xds-members-page-btn" type="button">3</button>
                    <button className="xds-members-page-btn" type="button">4</button>
                    <button className="xds-members-page-btn" type="button">10 / trang</button>
                    <button className="xds-members-page-btn" type="button">›</button>
                  </div>
                </div>
              </div>
            </div>

            <aside className="xds-members-col-right">
              <div className="xds-members-card">
                <div className="xds-members-rc-head">
                  <h2 className="xds-members-rc-title">Tóm tắt quyền theo vai trò</h2>
                  <button className="xds-members-rc-link" type="button">Xem chi tiết ›</button>
                </div>
                <div className="xds-members-roles">
                  {ROLE_PERMISSIONS.map((role) => (
                    <div key={role.name} className={`xds-members-role is-${role.tone}`}>
                      <div className="xds-members-role-head"><Icon d={I.users} size={15} /> {role.name}</div>
                      <ul className="xds-members-role-list">
                        {role.permissions.map((p) => <li key={p}><span className="xds-members-check"><Icon d={I.check} size={13} /></span>{p}</li>)}
                      </ul>
                    </div>
                  ))}
                </div>
              </div>

              <div className="xds-members-card">
                <div className="xds-members-rc-head">
                  <h2 className="xds-members-rc-title">Lời mời chờ xác nhận (3)</h2>
                  <button className="xds-members-rc-link" type="button">Xem tất cả ›</button>
                </div>
                <div className="xds-members-invites">
                  {DEMO_INVITES.map((invite) => (
                    <div className="xds-members-invite" key={invite.email}>
                      <div className="xds-members-initials">{invite.initials}</div>
                      <div className="xds-members-invite-main">
                        <div className="xds-members-invite-name">{invite.name}</div>
                        <div className="xds-members-invite-mail">{invite.email}</div>
                      </div>
                      <div className="xds-members-invite-meta">
                        <span className={`xds-members-badge is-${invite.tone}`}>{invite.role}</span>
                        <div className="xds-members-invite-sent">{invite.sent}</div>
                      </div>
                      <div className="xds-members-invite-actions">
                        <button className="xds-members-resend" type="button"><Icon d={I.mail} size={13} /> Gửi lại lời mời</button>
                        <button className="xds-members-more" type="button"><Icon d={I.more} size={15} /></button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="xds-members-card">
                <div className="xds-members-security">
                  <div className="xds-members-security-icon"><Icon d={I.shield} size={18} /></div>
                  <div>
                    <div className="xds-members-security-title">Kiểm soát truy cập & bảo mật</div>
                    <ul className="xds-members-security-list">
                      <li>Người không thuộc dự án sẽ bị từ chối truy cập (403) ở máy chủ.</li>
                      <li>Không được tự ý đổi chính mình nếu là ban quản lý cuối cùng của dự án.</li>
                    </ul>
                  </div>
                </div>
              </div>
            </aside>
          </section>
        </main>
      </div>
    </div>
  );
}

export default Members;

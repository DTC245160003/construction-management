import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import "../styles/Register.css";

/* ===== Icons ===== */
const IconLogo = () => (
  <svg viewBox="0 0 48 48" width="38" height="38" aria-hidden="true">
    <defs>
      <linearGradient id="xdsRegisterLogoG" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#1e7ae8" />
        <stop offset="100%" stopColor="#062c5c" />
      </linearGradient>
    </defs>
    <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#xdsRegisterLogoG)" />
    <path d="M13 32l8-16 3 6-5 10z" fill="#ff7a00" />
    <path d="M24 16l11 16h-7l-7-11z" fill="#ffffff" />
  </svg>
);

const IconUser = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
    <circle cx="12" cy="8" r="3.4" />
    <path d="M4.8 20c.8-3.6 3.7-5.6 7.2-5.6s6.4 2 7.2 5.6" strokeLinecap="round" />
  </svg>
);

const IconMail = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="3" y="5" width="18" height="14" rx="2" />
    <path d="m4 7 8 6 8-6" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const IconLock = () => (
  <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.8">
    <rect x="4.5" y="10.5" width="15" height="9.5" rx="2.5" />
    <path d="M8 10.5V8a4 4 0 018 0v2.5" strokeLinecap="round" />
  </svg>
);

const IconEye = ({ off }) => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M2.5 12S6 5.8 12 5.8 21.5 12 21.5 12 18 18.2 12 18.2 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
    {off && <path d="M4 20L20 4" strokeLinecap="round" />}
  </svg>
);

const IconShield = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.8">
    <path d="M12 3l7 2.6v5.6c0 4.3-2.9 7.9-7 9.2-4.1-1.3-7-4.9-7-9.2V5.6L12 3z" />
    <path d="M9 12.2l2.2 2.2L15 10.6" strokeLinecap="round" />
  </svg>
);

const IconChart = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round">
    <path d="M5 19V11M12 19V5M19 19v-6" />
  </svg>
);

const IconTeam = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7">
    <circle cx="9" cy="9" r="3" />
    <circle cx="16.5" cy="10" r="2.3" />
    <path d="M3.5 19c.6-3 2.8-4.6 5.5-4.6s4.9 1.6 5.5 4.6M16 14.6c2.3.1 3.9 1.6 4.4 4.4" strokeLinecap="round" />
  </svg>
);

const IconReport = () => (
  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7">
    <path d="M7 3.5h7l4 4v13H7z" />
    <path d="M10 11h6M10 15h6" strokeLinecap="round" />
  </svg>
);

const IconArrow = () => (
  <svg viewBox="0 0 24 24" width="19" height="19" fill="none" stroke="currentColor" strokeWidth="2.1" strokeLinecap="round">
    <path d="M4 12h15M13 6l6 6-6 6" />
  </svg>
);


const FEATURES = [
  { icon: <IconShield />, tone: "blue", title: "Bảo mật dữ liệu", desc: "An toàn, tin cậy, đạt chuẩn doanh nghiệp" },
  { icon: <IconChart />, tone: "orange", title: "Theo dõi tiến độ thời gian thực", desc: "Cập nhật công trường 24/7" },
  { icon: <IconTeam />, tone: "green", title: "Quản lý nhân sự", desc: "Phân công, theo dõi và phối hợp hiệu quả" },
  { icon: <IconReport />, tone: "purple", title: "Báo cáo nhanh", desc: "Số liệu trực quan, hỗ trợ ra quyết định" },
];

const NAV = ["Tổng quan", "Dự án", "Tiến độ", "Nhân sự", "Vật tư", "Báo cáo"];

const KPIS = [
  { value: "68%", label: "Tiến độ tổng", delta: "12% so với tháng trước" },
  { value: "342", label: "Nhân sự đang làm việc", delta: "8% so với tháng trước" },
  { value: "125,8 tỷ", label: "Giá trị thi công", delta: "5% so với tháng trước" },
  { value: "98%", label: "Tỷ lệ an toàn", delta: "2% so với tháng trước" },
];

const PROJECTS = [
  { name: "Vinhomes Ocean Park 3", pct: 78 },
  { name: "The Matrix One", pct: 62 },
  { name: "KCN Bắc Ninh mở rộng", pct: 35 },
  { name: "Cầu Trần Hưng Đạo", pct: 80 },
];

const BARS = [38, 44, 52, 48, 60, 56, 66, 62, 72, 68, 82, 76];


async function registerAccount(payload) {
  const res = await fetch("/auth/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  let data;
  try {
    data = await res.json();
  } catch {
    data = null;
  }

  if (!res.ok) {
    throw new Error(
      data?.message || data?.error || "Không thể tạo tài khoản. Vui lòng thử lại.",
    );
  }

  return data;
}

export default function Register() {
  const navigate = useNavigate();

  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const [fieldErrors, setFieldErrors] = useState({});

  function validate() {
    const errors = {};

    if (!fullName.trim()) {
      errors.fullName = "Vui lòng nhập họ và tên.";
    }

    if (!email.trim()) {
      errors.email = "Vui lòng nhập email.";
    } else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      errors.email = "Email không hợp lệ.";
    }

    if (!password) {
      errors.password = "Vui lòng nhập mật khẩu.";
    } else if (
      password.length < 8 ||
      !/[A-Z]/.test(password) ||
      !/[a-z]/.test(password) ||
      !/\d/.test(password)
    ) {
      errors.password = "Tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và số.";
    }

    if (!confirmPassword) {
      errors.confirmPassword = "Vui lòng nhập lại mật khẩu.";
    } else if (confirmPassword !== password) {
      errors.confirmPassword = "Xác nhận mật khẩu không khớp.";
    }

    if (!acceptedTerms) {
      errors.acceptedTerms = "Bạn cần đồng ý với điều khoản sử dụng.";
    }

    return errors;
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError("");
    setSuccess("");

    const errors = validate();
    setFieldErrors(errors);

    if (Object.keys(errors).length > 0) {
      setError("Vui lòng kiểm tra lại thông tin đã nhập.");
      return;
    }

    setLoading(true);

    try {
      const data = await registerAccount({
        fullname: fullName.trim(),
        email: email.trim().toLowerCase(),
        password,
      });

      setSuccess(
        data?.message ||
          "Tạo tài khoản thành công. Đang chuyển tới trang đăng nhập...",
      );

      setTimeout(() => {
        navigate("/login");
      }, 1000);
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : "Không kết nối được máy chủ. Vui lòng thử lại.",
      );
    } finally {
      setLoading(false);
    }
  }

  const clearFieldError = (name) => {
    setFieldErrors((prev) => {
      if (!prev[name]) return prev;
      const next = { ...prev };
      delete next[name];
      return next;
    });
  };

  return (
    <main className="xds-register">
      <div className="xds-register-bg" />
      <div className="xds-register-veil" />

      <div className="xds-register-shell">
        {/* LEFT — giữ cùng ngôn ngữ thiết kế với Login */}
        <section className="xds-register-left">
          <header className="xds-register-top">
            <Link to="/home" className="xds-register-brand">
              <IconLogo />
              <span className="xds-register-brand-name">XÂY DỰNG SỐ</span>
              <span className="xds-register-brand-sep" />
              <span className="xds-register-brand-sub">
                NỀN TẢNG ĐIỀU HÀNH
                <br />
                THI CÔNG CÔNG TRÌNH
              </span>
            </Link>

            <div className="xds-register-tagline">
              <span className="is-active">SỐ HOÁ CÔNG TRƯỜNG</span>
              <i>•</i>
              <span>KẾT NỐI CON NGƯỜI</span>
              <i>•</i>
              <span>KIẾN TẠO TƯƠNG LAI</span>
            </div>
          </header>

          <div className="xds-register-hero">
            <h1 className="xds-register-headline">
              <span className="navy">Đăng ký để</span>
              <span className="orange">bắt đầu quản lý công trình</span>
            </h1>
            <p className="xds-register-desc">
              Tạo tài khoản để tham gia hệ thống quản lý dự án, tiến độ, công việc
              và phối hợp thi công trên một nền tảng duy nhất.
            </p>

            <div className="xds-register-features">
              {FEATURES.map((feature) => (
                <div className="xds-register-feature" key={feature.title}>
                  <span className={`xds-register-fic tone-${feature.tone}`}>
                    {feature.icon}
                  </span>
                  <div>
                    <h3>{feature.title}</h3>
                    <p>{feature.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="xds-register-mock-wrap">
            <div className="xds-register-mock">
              <aside className="xds-register-mock-side">
                <div className="xds-register-mock-side-brand">
                  <IconLogo />
                  <span>XÂY DỰNG SỐ</span>
                </div>

                <ul>
                  {NAV.map((item, index) => (
                    <li key={item} className={index === 0 ? "is-active" : ""}>
                      <span className="dot" />
                      {item}
                    </li>
                  ))}
                </ul>
              </aside>

              <div className="xds-register-mock-main">
                <div className="xds-register-mock-head">
                  <h4>Tổng quan dự án</h4>
                  <span className="xds-register-mock-pill">Q3 · 2026</span>
                </div>

                <div className="xds-register-mock-kpis">
                  {KPIS.map((kpi) => (
                    <div className="xds-register-mock-kpi" key={kpi.label}>
                      <strong>{kpi.value}</strong>
                      <span className="lbl">{kpi.label}</span>
                      <span className="delta">↑ {kpi.delta}</span>
                    </div>
                  ))}
                </div>

                <div className="xds-register-mock-grid">
                  <div className="xds-register-mock-card">
                    <div className="xds-register-mock-card-head">
                      <span>Tiến độ thi công theo tháng</span>
                      <span className="legend">
                        <i className="l1" /> Kế hoạch
                        <i className="l2" /> Thực tế
                      </span>
                    </div>

                    <div className="xds-register-mock-bars">
                      {BARS.map((height, index) => (
                        <div className="xds-register-mock-bar" key={index}>
                          <span className="plan" style={{ height: `${height}%` }} />
                          <span
                            className="real"
                            style={{ height: `${Math.max(12, height - 14)}%` }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>

                  <div className="xds-register-mock-card">
                    <div className="xds-register-mock-card-head">
                      <span>Dự án đang triển khai</span>
                    </div>

                    <ul className="xds-register-mock-projects">
                      {PROJECTS.map((project) => (
                        <li key={project.name}>
                          <span className="nm">{project.name}</span>
                          <span className="bar">
                            <i style={{ width: `${project.pct}%` }} />
                          </span>
                          <span className="pc">{project.pct}%</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
            </div>

            <div className="xds-register-float">
              <span className="xds-register-float-ic">
                <IconTeam />
              </span>
              <div>
                <strong>Kết nối đội ngũ</strong>
                <p>Bắt đầu dự án với một tài khoản duy nhất</p>
              </div>
            </div>
          </div>
        </section>

        {/* RIGHT — form đăng ký gọn trong 1 màn hình */}
        <section className="xds-register-right">
          <div className="xds-register-card">
            <div className="xds-register-lang">
              <span className="flag" aria-hidden="true">★</span>
              Tiếng Việt
              <span className="chev">˅</span>
            </div>

            <h2 className="xds-register-title">Đăng ký</h2>
            <p className="xds-register-subtitle">
              Tạo tài khoản để bắt đầu sử dụng Xây Dựng Số.
            </p>

            {error && (
              <div className="xds-register-alert is-error" role="alert">
                {error}
              </div>
            )}

            {success && (
              <div className="xds-register-alert is-success" role="status">
                {success}
              </div>
            )}

            <form className="xds-register-form" onSubmit={handleSubmit} noValidate>
              <div className="xds-register-row2">
                <div className="xds-register-field">
                  <label className="xds-register-label" htmlFor="xds-fullname">
                    Họ và tên
                  </label>
                  <div className="xds-register-input-wrap">
                    <span className="xds-register-input-icon"><IconUser /></span>
                    <input
                      id="xds-fullname"
                      type="text"
                      autoComplete="name"
                      placeholder="Nguyễn Văn A"
                      value={fullName}
                      onChange={(e) => {
                        setFullName(e.target.value);
                        clearFieldError("fullName");
                      }}
                      className={fieldErrors.fullName ? "has-error" : ""}
                      disabled={loading}
                    />
                  </div>
                  {fieldErrors.fullName && (
                    <span className="xds-register-error">{fieldErrors.fullName}</span>
                  )}
                </div>

                <div className="xds-register-field">
                  <label className="xds-register-label" htmlFor="xds-email">
                    Email
                  </label>
                  <div className="xds-register-input-wrap">
                    <span className="xds-register-input-icon"><IconMail /></span>
                    <input
                      id="xds-email"
                      type="email"
                      autoComplete="email"
                      placeholder="example@email.com"
                      value={email}
                      onChange={(e) => {
                        setEmail(e.target.value);
                        clearFieldError("email");
                      }}
                      className={fieldErrors.email ? "has-error" : ""}
                      disabled={loading}
                    />
                  </div>
                  {fieldErrors.email && (
                    <span className="xds-register-error">{fieldErrors.email}</span>
                  )}
                </div>
              </div>

              <p className="xds-register-hint">Tài khoản mới là người dùng thông thường. Vai trò dự án được quản trị viên cấp sau khi đăng ký.</p>

              <div className="xds-register-row2">
                <div className="xds-register-field">
                  <label className="xds-register-label" htmlFor="xds-password">
                    Mật khẩu
                  </label>
                  <div className="xds-register-input-wrap">
                    <span className="xds-register-input-icon"><IconLock /></span>
                    <input
                      id="xds-password"
                      type={showPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Nhập mật khẩu"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        clearFieldError("password");
                      }}
                      className={fieldErrors.password ? "has-error" : ""}
                      disabled={loading}
                    />
                    <button
                      type="button"
                      className="xds-register-eye"
                      onClick={() => setShowPassword((value) => !value)}
                      aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}
                    >
                      <IconEye off={!showPassword} />
                    </button>
                  </div>
                  {fieldErrors.password && (
                    <span className="xds-register-error">{fieldErrors.password}</span>
                  )}
                </div>

                <div className="xds-register-field">
                  <label className="xds-register-label" htmlFor="xds-confirm-password">
                    Xác nhận mật khẩu
                  </label>
                  <div className="xds-register-input-wrap">
                    <span className="xds-register-input-icon"><IconLock /></span>
                    <input
                      id="xds-confirm-password"
                      type={showConfirmPassword ? "text" : "password"}
                      autoComplete="new-password"
                      placeholder="Nhập lại mật khẩu"
                      value={confirmPassword}
                      onChange={(e) => {
                        setConfirmPassword(e.target.value);
                        clearFieldError("confirmPassword");
                      }}
                      className={fieldErrors.confirmPassword ? "has-error" : ""}
                      disabled={loading}
                    />
                    <button
                      type="button"
                      className="xds-register-eye"
                      onClick={() => setShowConfirmPassword((value) => !value)}
                      aria-label={
                        showConfirmPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"
                      }
                    >
                      <IconEye off={!showConfirmPassword} />
                    </button>
                  </div>
                  {fieldErrors.confirmPassword && (
                    <span className="xds-register-error">
                      {fieldErrors.confirmPassword}
                    </span>
                  )}
                </div>
              </div>

              <div className="xds-register-hint">
                Mật khẩu tối thiểu 8 ký tự, gồm chữ hoa, chữ thường và số.
              </div>

              <label className="xds-register-terms">
                <input
                  type="checkbox"
                  checked={acceptedTerms}
                  onChange={(e) => {
                    setAcceptedTerms(e.target.checked);
                    clearFieldError("acceptedTerms");
                  }}
                  disabled={loading}
                />
                <span>
                  Tôi đồng ý với{" "}
                  <button type="button" className="xds-register-inline-link">
                    Điều khoản sử dụng
                  </button>{" "}
                  và{" "}
                  <button type="button" className="xds-register-inline-link">
                    Chính sách bảo mật
                  </button>
                  .
                </span>
              </label>

              {fieldErrors.acceptedTerms && (
                <span className="xds-register-error xds-register-terms-error">
                  {fieldErrors.acceptedTerms}
                </span>
              )}

              <button
                type="submit"
                className="xds-register-submit"
                disabled={loading}
              >
                {loading ? "Đang tạo tài khoản..." : "Tạo tài khoản"}
                {!loading && <IconArrow />}
              </button>
            </form>

            <div className="xds-register-have">
              Đã có tài khoản? <Link to="/login">Đăng nhập ngay</Link>
            </div>

            <footer className="xds-register-foot">
              <div className="links">
                <button type="button">Chính sách bảo mật</button>
                <i>|</i>
                <button type="button">Điều khoản sử dụng</button>
                <i>|</i>
                <button type="button">Hỗ trợ</button>
              </div>
              <span className="ver">Phiên bản 1.0.0</span>
            </footer>
          </div>
        </section>
      </div>
    </main>
  );
}

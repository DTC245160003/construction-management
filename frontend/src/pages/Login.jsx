import { useState } from "react";
import { setOfflineIdentity } from "../services/journalOffline";

import { Link, useNavigate } from "react-router-dom";

import "../styles/Login.css";



/* ====== ICONS (SVG inline, không cần thư viện) ====== */

const IconLogo = () => (

  <svg viewBox="0 0 48 48" width="38" height="38" aria-hidden="true">

    <defs>

      <linearGradient id="xdsLogoG" x1="0" y1="0" x2="1" y2="1">

        <stop offset="0%" stopColor="#1e7ae8" />

        <stop offset="100%" stopColor="#062c5c" />

      </linearGradient>

    </defs>

    <rect x="2" y="2" width="44" height="44" rx="12" fill="url(#xdsLogoG)" />

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


const IconUserPlus = () => (

  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="1.7">

    <circle cx="10" cy="8.5" r="3.2" />

    <path d="M3.8 19.5c.7-3.2 3.2-5 6.2-5" strokeLinecap="round" />

    <path d="M17 13v6M14 16h6" strokeLinecap="round" />

  </svg>

);

const IconArrow = () => (

  <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round">

    <path d="M4 12h15M13 6l6 6-6 6" />

  </svg>

);



const FEATURES = [

  { icon: <IconShield />, tone: "blue", title: "Bảo mật dữ liệu", desc: "An toàn, tin cậy, đạt chuẩn doanh nghiệp" },

  { icon: <IconChart />, tone: "orange", title: "Theo dõi tiến độ thời gian thực", desc: "Cập nhật công trường 24/7" },

  { icon: <IconTeam />, tone: "green", title: "Quản lý nhân sự", desc: "Phân công, chấm công, nâng cao hiệu suất" },

  { icon: <IconReport />, tone: "purple", title: "Báo cáo nhanh", desc: "Số liệu trực quan, hỗ trợ ra quyết định kịp thời" },

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






export default function Login() {

  const navigate = useNavigate();



  const [identifier, setIdentifier] = useState(() => localStorage.getItem("rememberedEmail") || "");

  const [password, setPassword] = useState("");

  const [remember, setRemember] = useState(() => Boolean(localStorage.getItem("rememberedEmail")));

  const [showPassword, setShowPassword] = useState(false);

  const [loading, setLoading] = useState(false);

  const [error, setError] = useState("");



  async function login(payload) {

    const res = await fetch("/auth/login", {

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

      const message =

        (data && (data.message || data.error)) ||

        (res.status === 401

          ? "Email hoặc mật khẩu không đúng."

          : "Không thể đăng nhập, vui lòng thử lại sau.");

      throw new Error(message);

    }

    return data;

  }



  async function handleSubmit(e) {

    e.preventDefault();

    setError("");



    const email = identifier.trim().toLowerCase();



    if (!email || !password) {

      setError("Vui lòng nhập đầy đủ email và mật khẩu.");

      return;

    }



    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {

      setError("Email không hợp lệ.");

      return;

    }



    if (password.length < 8) {

      setError("Mật khẩu phải có ít nhất 8 ký tự.");

      return;

    }



    setLoading(true);



    try {

      const data = await login({ email, password });



      if (!Number.isInteger(data?.user?.id) || data.user.id <= 0) {

        throw new Error("Phản hồi đăng nhập không hợp lệ. Vui lòng thử lại.");

      }



      localStorage.setItem("user", JSON.stringify(data.user));
      await setOfflineIdentity(data.user.id);



      if (remember) {

        localStorage.setItem("rememberedEmail", email);

      } else {

        localStorage.removeItem("rememberedEmail");

      }



      navigate("/home");

    } catch (err) {

      setError(err.message || "Đăng nhập thất bại, vui lòng thử lại.");

    } finally {

      setLoading(false);

    }

  }



  return (

    <div className="xds-login">

      <div className="xds-login-bg" />

      <div className="xds-login-veil" />



      <div className="xds-login-shell">

        {/* ============ LEFT: BRANDING / HERO ============ */}

        <section className="xds-login-left">

          <header className="xds-login-top">

            <Link to="/home" className="xds-login-brand">

              <IconLogo />

              <span className="xds-login-brand-name">XÂY DỰNG SỐ</span>

              <span className="xds-login-brand-sep" />

              <span className="xds-login-brand-sub">

                NỀN TẢNG ĐIỀU HÀNH

                <br />

                THI CÔNG CÔNG TRÌNH

              </span>

            </Link>



            <div className="xds-login-tagline">

              <span className="is-active">SỐ HOÁ CÔNG TRƯỜNG</span>

              <i>•</i>

              <span>KẾT NỐI CON NGƯỜI</span>

              <i>•</i>

              <span>KIẾN TẠO TƯƠNG LAI</span>

            </div>

          </header>



          <div className="xds-login-hero">

            <h1 className="xds-login-headline">

              <span className="navy">Đăng nhập để</span>

              <span className="orange">điều hành thi công hiệu quả</span>

            </h1>

            <p className="xds-login-desc">

              Quản lý toàn diện dự án, tiến độ, nhân sự, vật tư, an toàn và báo cáo trên một nền

              tảng duy nhất. Giúp doanh nghiệp xây dựng vận hành hiệu quả, tiết kiệm thời gian và

              tối ưu chi phí.

            </p>



            <div className="xds-login-features">

              {FEATURES.map((f) => (

                <div className="xds-login-feature" key={f.title}>

                  <span className={`xds-login-fic tone-${f.tone}`}>{f.icon}</span>

                  <div>

                    <h3>{f.title}</h3>

                    <p>{f.desc}</p>

                  </div>

                </div>

              ))}

            </div>

          </div>



          {/* ============ DASHBOARD MOCKUP ============ */}

          <div className="xds-login-mock-wrap">

            <div className="xds-login-mock">

              <aside className="xds-mock-side">

                <div className="xds-mock-side-brand">

                  <IconLogo />

                  <span>XÂY DỰNG SỐ</span>

                </div>

                <ul>

                  {NAV.map((n, i) => (

                    <li key={n} className={i === 0 ? "is-active" : ""}>

                      <span className="dot" />

                      {n}

                    </li>

                  ))}

                </ul>

              </aside>



              <div className="xds-mock-main">

                <div className="xds-mock-head">

                  <h4>Tổng quan dự án</h4>

                  <span className="xds-mock-pill">Q3 · 2026</span>

                </div>



                <div className="xds-mock-kpis">

                  {KPIS.map((k) => (

                    <div className="xds-mock-kpi" key={k.label}>

                      <strong>{k.value}</strong>

                      <span className="lbl">{k.label}</span>

                      <span className="delta">↑ {k.delta}</span>

                    </div>

                  ))}

                </div>



                <div className="xds-mock-grid">

                  <div className="xds-mock-card">

                    <div className="xds-mock-card-head">

                      <span>Tiến độ thi công theo tháng</span>

                      <span className="legend">

                        <i className="l1" /> Kế hoạch <i className="l2" /> Thực tế

                      </span>

                    </div>

                    <div className="xds-mock-bars">

                      {BARS.map((h, i) => (

                        <div className="xds-mock-bar" key={i}>

                          <span className="plan" style={{ height: `${h}%` }} />

                          <span className="real" style={{ height: `${Math.max(12, h - 14)}%` }} />

                        </div>

                      ))}

                    </div>

                  </div>



                  <div className="xds-mock-card">

                    <div className="xds-mock-card-head">

                      <span>Dự án đang triển khai</span>

                    </div>

                    <ul className="xds-mock-projects">

                      {PROJECTS.map((p) => (

                        <li key={p.name}>

                          <span className="nm">{p.name}</span>

                          <span className="bar">

                            <i style={{ width: `${p.pct}%` }} />

                          </span>

                          <span className="pc">{p.pct}%</span>

                        </li>

                      ))}

                    </ul>

                  </div>

                </div>

              </div>

            </div>



            <div className="xds-login-float">

              <span className="xds-login-float-ic">

                <IconChart />

              </span>

              <div>

                <strong>Vận hành hiệu quả</strong>

                <p>Kiến tạo những công trình giá trị</p>

              </div>

            </div>

          </div>

        </section>



        {/* ============ RIGHT: LOGIN CARD ============ */}

        <section className="xds-login-right">

          <div className="xds-login-card">

            <div className="xds-login-lang">

              <span className="flag" aria-hidden="true">

                ★

              </span>

              Tiếng Việt

              <span className="chev">˅</span>

            </div>



            <h2 className="xds-login-title">Đăng nhập</h2>

            <p className="xds-login-subtitle">

              Truy cập hệ thống để quản lý và điều hành thi công công trình một cách hiệu quả, an

              toàn và chuyên nghiệp.

            </p>



            <form className="xds-login-form" onSubmit={handleSubmit} noValidate>

              <label className="xds-login-label" htmlFor="xds-identifier">

                Email

              </label>

              <div className="xds-login-field">

                <span className="xds-login-field-ic">

                  <IconUser />

                </span>

                <input

                  id="xds-identifier"

                  type="email"

                  autoComplete="email"

                  placeholder="Nhập email"

                  value={identifier}

                  onChange={(e) => setIdentifier(e.target.value)}

                  disabled={loading}

                />

              </div>



              <label className="xds-login-label" htmlFor="xds-password">

                Mật khẩu

              </label>

              <div className="xds-login-field">

                <span className="xds-login-field-ic">

                  <IconLock />

                </span>

                <input

                  id="xds-password"

                  type={showPassword ? "text" : "password"}

                  autoComplete="current-password"

                  placeholder="Nhập mật khẩu"

                  value={password}

                  onChange={(e) => setPassword(e.target.value)}

                  disabled={loading}

                />

                <button

                  type="button"

                  className="xds-login-eye"

                  onClick={() => setShowPassword((v) => !v)}

                  aria-label={showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"}

                >

                  <IconEye off={!showPassword} />

                </button>

              </div>



              <div className="xds-login-row">

                <label className="xds-login-check">

                  <input

                    type="checkbox"

                    checked={remember}

                    onChange={(e) => setRemember(e.target.checked)}

                    disabled={loading}

                  />

                  <span className="box" aria-hidden="true" />

                  Ghi nhớ đăng nhập

                </label>

                <button type="button" className="xds-login-link">

                  Quên mật khẩu?

                </button>

              </div>



              {error && (

                <div className="xds-login-error" role="alert">

                  {error}

                </div>

              )}



              <button type="submit" className="xds-login-submit" disabled={loading}>

                {loading ? "Đang đăng nhập..." : "Đăng nhập"}

                {!loading && <IconArrow />}

              </button>

            </form>




            <div className="xds-login-register">

              <span className="ic">

                <IconUserPlus />

              </span>

              <div>

                <p className="ln">

                  Chưa có tài khoản?{" "}

                  <Link to="/register" className="xds-login-register-link">

                    Đăng ký ngay

                  </Link>

                </p>

                <p className="sub">Hoặc liên hệ quản trị hệ thống của doanh nghiệp.</p>

              </div>

            </div>




            <footer className="xds-login-foot">

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

    </div>

  );

}

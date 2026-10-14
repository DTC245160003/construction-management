import { useEffect, useId, useRef } from "react";
import { Link } from "react-router-dom";
import Icon from "./OperationsIcon";
import { Skeleton } from "./OperationsVisuals";

export function Notice({ children, tone = "info" }) {
  return children ? <div className={`ops-notice ops-notice-${tone}`} role={tone === "error" ? "alert" : "status"}>{children}</div> : null;
}
export function RemoteState({ state, children, layout = "table" }) {
  if (state.loading) return <Skeleton type={layout} />;
  if (state.error) return <Notice tone="error"><p>{state.error.message}</p>{state.error.status === 401 ? <Link to="/login">Đăng nhập</Link> : <button className="ops-btn" onClick={state.reload}>Thử lại</button>}</Notice>;
  return children;
}
export function Empty({ children, icon = "folder", title }) { return <div className="ops-empty"><span className="ops-empty-icon"><Icon name={icon} size={28} /></span>{title && <h3>{title}</h3>}{typeof children === "string" ? <p>{children}</p> : children}</div>; }
export function NoProject() { return <section className="ops-card"><Empty><h2>Chọn dự án để tiếp tục</h2><p>Mỗi dự án có lịch làm việc, đội thi công và dữ liệu riêng.</p><Link className="ops-btn ops-primary" to="/projects">Danh sách dự án</Link></Empty></section>; }
export function Modal({ title, children, onClose, busy = false, className = "", variant = "modal", subtitle }) {
  const ref = useRef(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const previous = document.activeElement;
    dialog.showModal();
    return () => { dialog.close(); previous?.focus(); };
  }, []);
  return <dialog className={`ops-modal ${variant === "drawer" ? "ops-drawer" : ""} ${className}`} ref={ref} aria-labelledby={titleId} onCancel={(event) => { event.preventDefault(); if (!busy) onClose(); }} onClick={(event) => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <header><div><h2 id={titleId}>{title}</h2>{subtitle && <p className="ops-modal-subtitle">{subtitle}</p>}</div><button type="button" className="ops-close" aria-label="Đóng" disabled={busy} onClick={onClose}><Icon name="close" size={18} /></button></header>{children}
  </dialog>;
}
export function Field({ label, children, hint }) { return <label className="ops-field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function FormActions({ busy, onClose, label = "Lưu" }) { return <div className="ops-form-actions"><button className="ops-btn" type="button" disabled={busy} onClick={onClose}>Hủy</button><button className="ops-btn ops-primary" disabled={busy} type="submit">{busy ? "Đang lưu…" : label}</button></div>; }
export function Stat({ label, value, tone = "blue", icon, note }) { return <div className={`ops-stat ops-stat-${tone}`}><span className="ops-stat-icon"><Icon name={icon || ({ blue:"chart",green:"check",orange:"clock",purple:"users",red:"warning" }[tone])} size={22} /></span><div><span>{label}</span><strong>{value}</strong>{note && <small>{note}</small>}</div></div>; }

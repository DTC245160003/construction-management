import Icon from "./OperationsIcon";
import "../styles/Visuals.css";

export function SectionHeading({ icon = "chart", title, description, action, tone = "blue" }) {
  return <div className="visual-section-heading"><span className={`visual-icon tone-${tone}`}><Icon name={icon} /></span><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action && <div className="visual-heading-action">{action}</div>}</div>;
}

export function StatusDistribution({ title, entries, total, label = "Tổng cộng", compact = false }) {
  const sum = total ?? entries.reduce((count, entry) => count + entry.value, 0);

  return <div className={`visual-distribution ${compact ? "is-compact" : ""}`}>
    {title && <h3>{title}</h3>}<div className="visual-distribution-body"><div className="visual-ring"><svg viewBox="0 0 120 120" aria-hidden="true"><circle cx="60" cy="60" r="47" fill="none" stroke="#edf1f6" strokeWidth="11" />{entries.map((entry, index) => { const offset = sum ? entries.slice(0, index).reduce((value, previous) => value + previous.value, 0) / sum * 295.31 : 0; const length = sum ? entry.value / sum * 295.31 : 0; const segment = <circle key={entry.label} cx="60" cy="60" r="47" fill="none" stroke={entry.color || "#1677ff"} strokeWidth="11" strokeDasharray={`${length} ${295.31 - length}`} strokeDashoffset={-offset} transform="rotate(-90 60 60)" />; return segment; })}</svg><div><strong>{sum.toLocaleString("vi-VN")}</strong><small>{label}</small></div></div><ul>{entries.map((entry) => <li key={entry.label}><i style={{ background: entry.color || "#1677ff" }} /><span>{entry.label}</span><strong>{entry.value.toLocaleString("vi-VN")}</strong></li>)}</ul></div>
  </div>;
}

export function DataBar({ label, value, max = 100, display, color = "blue", note }) {
  const ratio = max > 0 && value != null ? Math.min(100, Math.max(0, value / max * 100)) : 0;
  return <div className={`visual-data-bar bar-${color}`}><div><span>{label}</span><strong>{display ?? (value == null ? "—" : value.toLocaleString("vi-VN"))}</strong></div><div className="visual-track" aria-hidden="true"><span style={{ width: `${ratio}%` }} /></div>{note && <small>{note}</small>}</div>;
}

export function ContextCard({ icon = "help", title, children, tone = "blue", action }) {
  return <section className={`visual-context tone-${tone}`}><span className="visual-icon"><Icon name={icon} size={22} /></span><div><h3>{title}</h3><div className="visual-context-copy">{children}</div>{action}</div></section>;
}

export function WorkflowStrip({ records }) {
  const stages = [["draft", "Bản nháp", "document"], ["submitted", "Chờ phê duyệt", "clock"], ["approved", "Đã phê duyệt", "check"], ["returned", "Cần bổ sung", "refresh"]];
  return <div className="visual-workflow" aria-label="Tình trạng hồ sơ">{stages.map(([key, label, icon]) => <div className={`workflow-${key}`} key={key}><span className="visual-icon"><Icon name={icon} size={20} /></span><div><strong>{records.filter((record) => record.status === key).length}</strong><span>{label}</span></div></div>)}</div>;
}

export function Skeleton({ type = "table", label = "Đang tải dữ liệu…" }) {
  return <div className={`visual-skeleton layout-${type}`} role="status" aria-label={label}><span className="visual-sr-only">{label}</span><div className="skeleton-heading"><i /><div><i /><i /></div></div><div className="skeleton-content">{[1, 2, 3, 4].map((key) => <div className="skeleton-row" key={key}><i /><i /><i /></div>)}</div></div>;
}

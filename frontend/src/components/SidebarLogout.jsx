import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { api } from "../services/operationsApi";
import { clearOfflineIdentity } from "../services/journalOffline";
import "../styles/SidebarLogout.css";

export default function SidebarLogout() {
  const navigate = useNavigate();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function logout() {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      if (globalThis.xdsJournalEditing) throw new Error("Hãy lưu hoặc đóng biểu mẫu nhật ký trước khi đăng xuất để giữ nội dung và ảnh đang nhập.");
      const queue = globalThis.XdsJournalQueue;
      if (!queue) throw new Error("Chưa thể kiểm tra dữ liệu offline. Hãy đợi ứng dụng tải xong rồi thử lại.");
      const [journals, photos] = await Promise.all([queue.all("queue"), queue.all("photos")]);
      if ((journals.length || photos.some((photo) => photo.status!=="archived")) && !window.confirm("Thiết bị còn nhật ký hoặc ảnh offline chưa đồng bộ. Đăng xuất vẫn giữ dữ liệu trên thiết bị; bạn cần đăng nhập lại đúng tài khoản để tiếp tục. Bạn có muốn đăng xuất?")) return;
      // Persist the guard before ending the server session. Retained offline
      // data stays inaccessible even if later identity cleanup fails.
      const token=await queue.beginLogout();
      try { await api("/auth/logout", { method: "POST" }); }
      catch (failure) { if (failure.status) await queue.cancelLogout(token); throw failure; }
      try { await clearOfflineIdentity({ logoutToken:token }); } catch { /* The durable logout guard still blocks cached data and sync. */ }
      try { localStorage.removeItem("user"); } catch { /* Remembered metadata does not authorize offline access. */ }
      navigate("/login", { replace: true });
    } catch (failure) {
      setError(failure.message || "Không thể đăng xuất. Hãy kiểm tra kết nối rồi thử lại; dữ liệu offline vẫn được giữ.");
    } finally {
      setBusy(false);
    }
  }

  return <footer className="xds-sidebar-logout">
    {error && <p className="xds-sidebar-logout-error" role="alert">{error}</p>}
    <button className="xds-sidebar-logout-button" type="button" disabled={busy} onClick={logout}>
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M9 4H4v16h5M14 8l4 4-4 4M8 12h12" /></svg>
      <span>{busy ? "Đang đăng xuất…" : "Đăng xuất"}</span>
    </button>
  </footer>;
}

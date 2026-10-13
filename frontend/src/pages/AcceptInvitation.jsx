import { useState } from "react";
import { Link,useSearchParams,useNavigate } from "react-router-dom";
import { api } from "../services/operationsApi";
import { setOfflineIdentity } from "../services/journalOffline";
import "../styles/Login.css";
export default function AcceptInvitation() {
  const [params]=useSearchParams(),navigate=useNavigate(),[error,setError]=useState(""),[busy,setBusy]=useState(false);
  async function submit(event) {
    event.preventDefault(); setBusy(true); setError("");
    const form=new FormData(event.currentTarget),email=params.get("email"),password=form.get("password");
    try {
      await api("/auth/register",{ method:"POST",body:{ email,password,fullname:form.get("fullname"),role:"engineer",invitation_token:params.get("token") } });
      const { user }=await api("/auth/login",{ method:"POST",body:{ email,password } });
      await setOfflineIdentity(user.id); localStorage.setItem("user",JSON.stringify(user)); navigate("/projects",{ replace:true });
    } catch(e) { setError(e.message); setBusy(false); }
  }
  return <main className="ops-invitation"><h1>Thiết lập tài khoản được mời</h1><p>{params.get("email")}</p><form onSubmit={submit}><label>Họ và tên<input name="fullname" required maxLength={255} autoComplete="name" /></label><label>Mật khẩu mới<input name="password" type="password" required minLength={8} autoComplete="new-password" /></label>{error && <p role="alert">{error}</p>}<button className="ops-btn ops-create" disabled={busy}>Thiết lập và đăng nhập</button></form><Link to="/login">Đã có tài khoản? Đăng nhập</Link></main>;
}

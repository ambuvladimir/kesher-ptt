import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { api, type User } from "../api";
import { useAuth } from "../store";

export function LoginPage() {
  const nav = useNavigate();
  const { setSession, homeFor } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("KesherAdmin!23");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await api<{ token: string; user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setSession(res.token, res.user);
      nav(homeFor(res.user.role));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <form className="login-card" onSubmit={submit}>
        <div className="brand-mark" style={{ width: 48, height: 48, fontSize: 22 }}>ק</div>
        <h2>קשר</h2>
        <p>מערכת PTT ארגונית לשרת מקומי — מוקד, ערוצים וניידות</p>
        <div style={{ display: "grid", gap: 12 }}>
          <div>
            <label>שם משתמש</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div>
            <label>סיסמה</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error ? <div style={{ color: "#fca5a5" }}>{error}</div> : null}
          <button className="btn primary" disabled={busy} type="submit">
            {busy ? "מתחבר..." : "כניסה"}
          </button>
        </div>
        <p style={{ marginTop: 16, fontSize: 12 }}>
          דמו: admin / dispatcher / siur1 — הסיסמאות מופיעות ב-README
        </p>
      </form>
    </div>
  );
}

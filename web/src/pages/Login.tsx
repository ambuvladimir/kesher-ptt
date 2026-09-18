import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { Moon, Sun } from "lucide-react";
import { api, type User } from "../api";
import { COMPANY } from "../brand";
import { useAuth } from "../store";
import { radioTones } from "../tones";

export function LoginPage() {
  const nav = useNavigate();
  const { setSession, homeFor, theme, toggleTheme } = useAuth();
  const [username, setUsername] = useState("admin");
  const [password, setPassword] = useState("KesherAdmin!23");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    radioTones.unlock();
    try {
      const res = await api<{ token: string; user: User }>("/api/auth/login", {
        method: "POST",
        body: JSON.stringify({ username, password }),
      });
      setSession(res.token, res.user);
      radioTones.start();
      nav(homeFor(res.user.role));
    } catch (err) {
      radioTones.error();
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="login-wrap">
      <button className="btn ghost icon" style={{ position: "fixed", top: 16, left: 16 }} onClick={toggleTheme} type="button">
        {theme === "dark" ? <Sun size={16} /> : <Moon size={16} />}
        {theme === "dark" ? "בהיר" : "כהה"}
      </button>
      <form className="login-card" onSubmit={submit}>
        <img src={COMPANY.logo} alt={COMPANY.name} style={{ width: 88, height: 88, borderRadius: "50%", border: "3px solid var(--amber)" }} />
        <h2>{COMPANY.name}</h2>
        <p>{COMPANY.product} ארגונית — מוקד, ערוצים וניידות</p>
        <div className="fields">
          <div>
            <label>שם משתמש</label>
            <input className="input" value={username} onChange={(e) => setUsername(e.target.value)} autoComplete="username" />
          </div>
          <div>
            <label>סיסמה</label>
            <input className="input" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </div>
          {error ? <div style={{ color: "var(--brand)" }}>{error}</div> : null}
          <button className="btn primary" disabled={busy} type="submit">
            {busy ? "מתחבר..." : "כניסה"}
          </button>
          <p style={{ margin: 0, fontSize: 12, color: "var(--muted)" }}>
            מנהל: admin · דיספאצר: dispatcher · נהג: driver1
          </p>
        </div>
      </form>
    </div>
  );
}

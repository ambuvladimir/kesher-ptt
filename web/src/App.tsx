import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { Home, LogOut, Radio, Shield, Map, Moon, Sun } from "lucide-react";
import { useEffect } from "react";
import { api, type User } from "./api";
import { COMPANY } from "./brand";
import { useAuth } from "./store";
import { isAdmin, isDispatcher, roleLabel } from "./roles";
import { pttAudio } from "./audio";
import { disconnectSocket } from "./socket";
import { radioTones } from "./tones";

export function AppShell() {
  const { token, user, setSession, logout, theme, toggleTheme } = useAuth();
  const nav = useNavigate();

  useEffect(() => {
    const unlock = () => {
      radioTones.unlock();
      void pttAudio.init();
    };
    window.addEventListener("pointerdown", unlock);
    window.addEventListener("keydown", unlock);
    window.addEventListener("touchstart", unlock, { passive: true });
    return () => {
      window.removeEventListener("pointerdown", unlock);
      window.removeEventListener("keydown", unlock);
      window.removeEventListener("touchstart", unlock);
    };
  }, []);

  useEffect(() => {
    if (!token) return;
    void api<User>("/api/me")
      .then((u) => setSession(token, u))
      .catch(() => {
        logout();
        nav("/login");
      });
  }, [token, setSession, logout, nav]);

  if (!token) return <Navigate to="/login" replace />;

  const canDispatch = isDispatcher(user?.role);
  const canAdmin = isAdmin(user?.role);

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => nav("/dashboard")} style={{ border: 0, background: "transparent", cursor: "pointer", width: "100%" }}>
          <img className="brand-logo" src={COMPANY.logo} alt={COMPANY.name} />
          <div>
            <h1>{COMPANY.name}</h1>
            <p>{COMPANY.product} · {roleLabel(user?.role)} · {user?.callSign ?? "…"}</p>
          </div>
        </button>
        <NavLink to="/dashboard" className={({ isActive }) => `nav-btn ${isActive ? "home-active" : ""}`}>
          <Home size={18} /> מסך ראשי
        </NavLink>
        {canDispatch && (
          <NavLink to="/dispatch" className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}>
            <Map size={18} /> מוקד דיספאצר
          </NavLink>
        )}
        <NavLink to="/radio" className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}>
          <Radio size={18} /> מכשיר קשר
        </NavLink>
        {canAdmin && (
          <NavLink to="/admin" className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}>
            <Shield size={18} /> ניהול
          </NavLink>
        )}
        <div style={{ flex: 1 }} />
        <button className="nav-btn" onClick={toggleTheme}>
          {theme === "dark" ? <Sun size={18} /> : <Moon size={18} />}
          {theme === "dark" ? "עיצוב בהיר" : "עיצוב כהה"}
        </button>
        <button
          className="nav-btn"
          onClick={() => {
            disconnectSocket();
            logout();
            nav("/login");
          }}
        >
          <LogOut size={18} /> יציאה
        </button>
      </aside>
      <div className="content-col">
        <header className="app-top">
          <button className="btn icon ghost" onClick={() => nav("/dashboard")}>
            <Home size={16} /> דאשבורד
          </button>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>
            {roleLabel(user?.role)} · {user?.displayName} · {user?.callSign}
          </div>
        </header>
        <main className="main">
          <Outlet />
        </main>
      </div>
    </div>
  );
}

export function HomeRedirect() {
  const { token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  return <Navigate to="/dashboard" replace />;
}

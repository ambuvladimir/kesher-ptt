import { NavLink, Navigate, Outlet, useNavigate } from "react-router-dom";
import { LogOut, Radio, Shield, Map } from "lucide-react";
import { useEffect } from "react";
import { api, type User } from "./api";
import { useAuth } from "./store";
import { disconnectSocket } from "./socket";

export function AppShell() {
  const { token, user, setSession, logout } = useAuth();
  const nav = useNavigate();

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
  if (user?.role === "field") return <Navigate to="/radio" replace />;

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <div className="brand-mark">ק</div>
          <div>
            <h1>קשר</h1>
            <p>{user?.callSign ?? "טוען..."}</p>
          </div>
        </div>
        {(user?.role === "admin" || user?.role === "dispatcher" || user?.role === "supervisor") && (
          <NavLink to="/dispatch" className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}>
            <Map size={18} /> מוקד דיספאצר
          </NavLink>
        )}
        <NavLink to="/radio" className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}>
          <Radio size={18} /> מכשיר קשר
        </NavLink>
        {user?.role === "admin" && (
          <NavLink to="/admin" className={({ isActive }) => `nav-btn ${isActive ? "active" : ""}`}>
            <Shield size={18} /> ניהול
          </NavLink>
        )}
        <div style={{ flex: 1 }} />
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
      <main className="main">
        <Outlet />
      </main>
    </div>
  );
}

export function HomeRedirect() {
  const { user, homeFor, token } = useAuth();
  if (!token) return <Navigate to="/login" replace />;
  if (!user) return <div className="login-wrap">טוען...</div>;
  return <Navigate to={homeFor(user.role)} replace />;
}

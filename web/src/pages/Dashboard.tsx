import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Map, Radio, Shield, Users } from "lucide-react";
import { api, type Channel, type User } from "../api";
import { COMPANY } from "../brand";
import { isAdmin, isDispatcher, isDriver, roleLabel } from "../roles";
import { useAuth } from "../store";

export function DashboardPage() {
  const { user } = useAuth();
  const nav = useNavigate();
  const [users, setUsers] = useState<User[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);

  useEffect(() => {
    void Promise.all([
      api<User[]>("/api/users").catch(() => [] as User[]),
      api<Channel[]>("/api/channels"),
    ]).then(([u, c]) => {
      setUsers(u);
      setChannels(c);
    });
  }, []);

  const online = users.filter((u) => u.status && u.status !== "offline").length;
  const emergency = users.filter((u) => u.status === "emergency").length;
  const canDispatch = isDispatcher(user?.role);
  const canAdmin = isAdmin(user?.role);

  return (
    <div>
      <div className="card dash-hero">
        <img src={COMPANY.logo} alt={COMPANY.name} />
        <div>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>{COMPANY.product}</div>
          <h2 style={{ margin: "4px 0" }}>{COMPANY.name}</h2>
          <p style={{ margin: 0, color: "var(--muted)" }}>
            שלום {user?.displayName} ({user?.callSign}) — {roleLabel(user?.role)}
          </p>
        </div>
      </div>

      <div className="grid-4" style={{ marginBottom: 16 }}>
        <div className="stat"><span>נהגים</span><b>{users.filter((u) => isDriver(u.role)).length || "—"}</b></div>
        <div className="stat"><span>דיספאצרים</span><b>{users.filter((u) => u.role === "dispatcher" || u.role === "supervisor").length || "—"}</b></div>
        <div className="stat"><span>מנהלים</span><b>{users.filter((u) => isAdmin(u.role)).length || "—"}</b></div>
        <div className="stat"><span>חירום פעיל</span><b style={{ color: emergency ? "var(--brand)" : undefined }}>{emergency}</b></div>
      </div>

      <div className="quick-grid">
        {canDispatch && (
          <button className="quick-card" onClick={() => nav("/dispatch")}>
            <Map size={22} color="var(--brand)" />
            <b>מוקד דיספאצר</b>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>מפה, כוחות ושידור לערוצים</span>
          </button>
        )}
        <button className="quick-card" onClick={() => nav("/radio")}>
          <Radio size={22} color="var(--brand)" />
          <b>מכשיר קשר</b>
          <span style={{ color: "var(--muted)", fontSize: 13 }}>PTT, ערוצים וקריאת חירום</span>
        </button>
        {canAdmin && (
          <button className="quick-card" onClick={() => nav("/admin")}>
            <Users size={22} color="var(--brand)" />
            <b>משתמשים וערוצים</b>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>הוספה, עריכה ומחיקה</span>
          </button>
        )}
        {canAdmin && (
          <button className="quick-card" onClick={() => nav("/admin")}>
            <Shield size={22} color="var(--brand)" />
            <b>ניהול מערכת</b>
            <span style={{ color: "var(--muted)", fontSize: 13 }}>יחידות, הרשאות ויומן</span>
          </button>
        )}
      </div>
    </div>
  );
}

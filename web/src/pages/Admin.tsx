import { useEffect, useMemo, useState } from "react";
import { api, type Channel, type Unit, type User } from "../api";
import { radioTones } from "../tones";

type Tab = "users" | "channels" | "units" | "audit";
type UserForm = Partial<User> & {
  password?: string;
  channelIds?: { channelId: string; canTalk: boolean; canListen: boolean; isPrimary: boolean }[];
};

export function AdminPage() {
  const [tab, setTab] = useState<Tab>("users");
  const [users, setUsers] = useState<User[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [units, setUnits] = useState<Unit[]>([]);
  const [audit, setAudit] = useState<{ id: string; action: string; detail: string; createdAt: string; user?: { displayName: string } }[]>([]);
  const [editingUser, setEditingUser] = useState<UserForm | null>(null);
  const [editingChannel, setEditingChannel] = useState<Partial<Channel> | null>(null);
  const [error, setError] = useState("");
  const [q, setQ] = useState("");

  async function reload() {
    const [u, c, un] = await Promise.all([
      api<User[]>("/api/users"),
      api<Channel[]>("/api/channels"),
      api<Unit[]>("/api/units"),
    ]);
    setUsers(u);
    setChannels(c);
    setUnits(un);
  }

  useEffect(() => {
    void reload().catch((e) => setError((e as Error).message));
  }, []);

  useEffect(() => {
    if (tab === "audit") {
      void api<typeof audit>("/api/audit").then(setAudit).catch((e) => setError((e as Error).message));
    }
  }, [tab]);

  const filteredUsers = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return users;
    return users.filter((u) =>
      [u.callSign, u.displayName, u.username, u.unit?.name, u.role].some((v) => (v ?? "").toLowerCase().includes(s)),
    );
  }, [users, q]);

  const filteredChannels = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return channels;
    return channels.filter((c) => [c.name, c.code, c.kind].some((v) => v.toLowerCase().includes(s)));
  }, [channels, q]);

  async function removeUser(u: User) {
    if (!confirm(`למחוק את ${u.displayName} (${u.callSign})?`)) return;
    try {
      await api(`/api/users/${u.id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      radioTones.error();
      setError((e as Error).message);
    }
  }

  async function removeChannel(c: Channel) {
    if (!confirm(`למחוק את הערוץ ${c.name}?`)) return;
    try {
      await api(`/api/channels/${c.id}`, { method: "DELETE" });
      await reload();
    } catch (e) {
      radioTones.error();
      setError((e as Error).message);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h2 style={{ margin: 0 }}>ניהול משתמשים וערוצים</h2>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>הוספה, עריכה ומחיקה — כולל הרשאות האזנה ודיבור</div>
        </div>
        <div className="toolbar">
          {(["users", "channels", "units", "audit"] as Tab[]).map((t) => (
            <button key={t} className={`btn ${tab === t ? "primary" : "ghost"}`} onClick={() => { setTab(t); setQ(""); }}>
              {{ users: "משתמשים", channels: "ערוצים", units: "יחידות", audit: "יומן" }[t]}
            </button>
          ))}
        </div>
      </div>
      {error ? <div className="alert-banner">{error}<button className="btn" onClick={() => setError("")}>סגור</button></div> : null}

      {tab === "users" && (
        <div className="card">
          <div className="toolbar" style={{ marginBottom: 12, justifyContent: "space-between" }}>
            <input className="input" style={{ maxWidth: 280 }} placeholder="חיפוש לפי שם, קריאה, משתמש..." value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn primary" onClick={() => setEditingUser({
              role: "field",
              isActive: true,
              channelIds: channels.map((c) => ({
                channelId: c.id,
                canTalk: c.kind !== "broadcast",
                canListen: true,
                isPrimary: c.kind === "talkgroup",
              })),
            })}>משתמש חדש</button>
          </div>
          <table className="table">
            <thead>
              <tr>
                <th>קריאה</th><th>שם</th><th>תפקיד</th><th>יחידה</th><th>ערוצים</th><th>סטטוס</th><th>פעולות</th>
              </tr>
            </thead>
            <tbody>
              {filteredUsers.map((u) => (
                <tr key={u.id}>
                  <td>{u.callSign}</td>
                  <td>{u.displayName}<div style={{ color: "var(--muted)", fontSize: 12 }}>{u.username}</div></td>
                  <td>{roleHe(u.role)}</td>
                  <td>{u.unit?.name ?? "-"}</td>
                  <td>{u.memberships?.length ?? 0}</td>
                  <td><span className={`dot ${u.status === "offline" ? "" : "on"}`} /> {u.isActive ? "פעיל" : "מושבת"}</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn ghost" onClick={() => setEditingUser({
                        ...u,
                        channelIds: channels.map((c) => {
                          const m = u.memberships?.find((x) => x.channelId === c.id);
                          return { channelId: c.id, canTalk: m?.canTalk ?? false, canListen: m?.canListen ?? false, isPrimary: m?.isPrimary ?? false };
                        }),
                      })}>עריכה</button>
                      <button className="btn danger" onClick={() => void removeUser(u)}>מחיקה</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "channels" && (
        <div className="card">
          <div className="toolbar" style={{ marginBottom: 12, justifyContent: "space-between" }}>
            <input className="input" style={{ maxWidth: 280 }} placeholder="חיפוש ערוץ..." value={q} onChange={(e) => setQ(e.target.value)} />
            <button className="btn primary" onClick={() => setEditingChannel({ kind: "talkgroup", maxTalkSec: 45, isActive: true, color: "#c81e1e" })}>ערוץ חדש</button>
          </div>
          <table className="table">
            <thead><tr><th>שם</th><th>קוד</th><th>סוג</th><th>חברים</th><th>מגבלת דיבור</th><th>פעולות</th></tr></thead>
            <tbody>
              {filteredChannels.map((c) => (
                <tr key={c.id}>
                  <td>{c.name}</td>
                  <td>{c.code}</td>
                  <td>{kindHe(c.kind)}</td>
                  <td>{c.members?.length ?? 0}</td>
                  <td>{c.maxTalkSec} שנ׳</td>
                  <td>
                    <div className="row-actions">
                      <button className="btn ghost" onClick={() => setEditingChannel(c)}>עריכה</button>
                      <button className="btn danger" onClick={() => void removeChannel(c)}>מחיקה</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "units" && (
        <UnitsPanel units={units} onChange={() => void reload()} />
      )}

      {tab === "audit" && (
        <div className="card">
          <b>יומן ביקורת</b>
          <table className="table">
            <thead><tr><th>זמן</th><th>משתמש</th><th>פעולה</th><th>פירוט</th></tr></thead>
            <tbody>
              {audit.map((a) => (
                <tr key={a.id}>
                  <td>{new Date(a.createdAt).toLocaleString("he-IL")}</td>
                  <td>{a.user?.displayName ?? "-"}</td>
                  <td>{a.action}</td>
                  <td>{a.detail}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {editingUser ? (
        <UserModal
          value={editingUser}
          units={units}
          channels={channels}
          onClose={() => setEditingUser(null)}
          onSave={async (body) => {
            try {
              if (editingUser.id) await api(`/api/users/${editingUser.id}`, { method: "PATCH", body: JSON.stringify(body) });
              else await api("/api/users", { method: "POST", body: JSON.stringify(body) });
              setEditingUser(null);
              await reload();
            } catch (e) {
              radioTones.error();
              throw e;
            }
          }}
        />
      ) : null}

      {editingChannel ? (
        <ChannelModal
          value={editingChannel}
          users={users}
          onClose={() => setEditingChannel(null)}
          onSave={async (body) => {
            try {
              if (editingChannel.id) await api(`/api/channels/${editingChannel.id}`, { method: "PATCH", body: JSON.stringify(body) });
              else await api("/api/channels", { method: "POST", body: JSON.stringify(body) });
              setEditingChannel(null);
              await reload();
            } catch (e) {
              radioTones.error();
              throw e;
            }
          }}
        />
      ) : null}
    </div>
  );
}

function UnitsPanel({ units, onChange }: { units: Unit[]; onChange: () => void }) {
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [color, setColor] = useState("#c81e1e");
  const [editing, setEditing] = useState<Unit | null>(null);

  return (
    <div className="card">
      <b>יחידות ארגוניות</b>
      <div className="form-grid" style={{ margin: "12px 0" }}>
        <input className="input" placeholder="שם יחידה" value={name} onChange={(e) => setName(e.target.value)} />
        <input className="input" placeholder="קוד" value={code} onChange={(e) => setCode(e.target.value)} />
        <input className="input" type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        <button className="btn primary" onClick={async () => {
          await api("/api/units", { method: "POST", body: JSON.stringify({ name, code, color }) });
          setName(""); setCode("");
          onChange();
        }}>הוספת יחידה</button>
      </div>
      <table className="table">
        <thead><tr><th>שם</th><th>קוד</th><th>צבע</th><th>פעולות</th></tr></thead>
        <tbody>
          {units.map((u) => (
            <tr key={u.id}>
              <td>{u.name}</td>
              <td>{u.code}</td>
              <td><span style={{ display: "inline-block", width: 16, height: 16, borderRadius: 4, background: u.color }} /></td>
              <td>
                <div className="row-actions">
                  <button className="btn ghost" onClick={() => setEditing(u)}>עריכה</button>
                  <button className="btn danger" onClick={async () => {
                    if (!confirm(`למחוק את היחידה ${u.name}?`)) return;
                    await api(`/api/units/${u.id}`, { method: "DELETE" });
                    onChange();
                  }}>מחיקה</button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      {editing ? (
        <div className="modal-back" onClick={() => setEditing(null)}>
          <div className="card modal" onClick={(e) => e.stopPropagation()} style={{ width: 420 }}>
            <h3>עריכת יחידה</h3>
            <div style={{ display: "grid", gap: 10 }}>
              <div><label>שם</label><input className="input" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} /></div>
              <div><label>קוד</label><input className="input" value={editing.code} onChange={(e) => setEditing({ ...editing, code: e.target.value })} /></div>
              <div><label>צבע</label><input className="input" type="color" value={editing.color} onChange={(e) => setEditing({ ...editing, color: e.target.value })} /></div>
            </div>
            <div className="row-actions" style={{ marginTop: 14, justifyContent: "flex-end" }}>
              <button className="btn ghost" onClick={() => setEditing(null)}>ביטול</button>
              <button className="btn primary" onClick={async () => {
                await api(`/api/units/${editing.id}`, { method: "PATCH", body: JSON.stringify({ name: editing.name, code: editing.code, color: editing.color }) });
                setEditing(null);
                onChange();
              }}>שמירה</button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function UserModal({
  value, units, channels, onClose, onSave,
}: {
  value: UserForm;
  units: Unit[];
  channels: Channel[];
  onClose: () => void;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [form, setForm] = useState(value);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  function set<K extends string>(k: K, v: unknown) {
    setForm((f) => ({ ...f, [k]: v }));
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h3>{form.id ? "עריכת משתמש" : "משתמש חדש"}</h3>
        {err ? <div className="alert-banner">{err}</div> : null}
        <div className="form-grid">
          <div><label>שם משתמש</label><input className="input" value={form.username ?? ""} onChange={(e) => set("username", e.target.value)} /></div>
          <div><label>סיסמה {form.id ? "(ריק = ללא שינוי)" : ""}</label><input className="input" type="password" value={form.password ?? ""} onChange={(e) => set("password", e.target.value)} /></div>
          <div><label>שם תצוגה</label><input className="input" value={form.displayName ?? ""} onChange={(e) => set("displayName", e.target.value)} /></div>
          <div><label>אות קריאה</label><input className="input" value={form.callSign ?? ""} onChange={(e) => set("callSign", e.target.value)} /></div>
          <div>
            <label>תפקיד</label>
            <select className="input" value={form.role ?? "field"} onChange={(e) => set("role", e.target.value)}>
              <option value="admin">מנהל</option>
              <option value="dispatcher">דיספאצר</option>
              <option value="supervisor">אחמ״ש</option>
              <option value="field">שטח</option>
            </select>
          </div>
          <div>
            <label>יחידה</label>
            <select className="input" value={form.unitId ?? ""} onChange={(e) => set("unitId", e.target.value || null)}>
              <option value="">ללא</option>
              {units.map((u) => <option key={u.id} value={u.id}>{u.name}</option>)}
            </select>
          </div>
          <div><label>טלפון</label><input className="input" value={form.phone ?? ""} onChange={(e) => set("phone", e.target.value)} /></div>
          <div>
            <label>פעיל</label>
            <select className="input" value={String(form.isActive ?? true)} onChange={(e) => set("isActive", e.target.value === "true")}>
              <option value="true">כן</option>
              <option value="false">לא</option>
            </select>
          </div>
        </div>
        <div style={{ marginTop: 14 }}>
          <b>הרשאות ערוצים</b>
          {channels.map((c) => {
            const m = form.channelIds?.find((x) => x.channelId === c.id) ?? { channelId: c.id, canTalk: false, canListen: false, isPrimary: false };
            const patch = (p: Partial<typeof m>) => {
              const rest = (form.channelIds ?? []).filter((x) => x.channelId !== c.id);
              set("channelIds", [...rest, { ...m, ...p }]);
            };
            return (
              <div key={c.id} style={{ display: "grid", gridTemplateColumns: "1fr auto auto auto", gap: 8, alignItems: "center", padding: "8px 0", borderBottom: "1px solid var(--line)" }}>
                <span>{c.name} <span style={{ color: "var(--muted)" }}>{c.code}</span></span>
                <label style={{ margin: 0 }}><input type="checkbox" checked={m.canListen} onChange={(e) => patch({ canListen: e.target.checked })} /> האזנה</label>
                <label style={{ margin: 0 }}><input type="checkbox" checked={m.canTalk} onChange={(e) => patch({ canTalk: e.target.checked })} /> דיבור</label>
                <label style={{ margin: 0 }}><input type="checkbox" checked={m.isPrimary} onChange={(e) => patch({ isPrimary: e.target.checked })} /> ראשי</label>
              </div>
            );
          })}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onClose}>ביטול</button>
          <button className="btn primary" disabled={busy} onClick={async () => {
            setBusy(true);
            setErr("");
            try {
              await onSave({
                username: form.username,
                password: form.password,
                displayName: form.displayName,
                callSign: form.callSign,
                role: form.role,
                unitId: form.unitId ?? null,
                phone: form.phone ?? "",
                isActive: form.isActive ?? true,
                channelIds: form.channelIds,
              });
            } catch (e) {
              setErr((e as Error).message);
            } finally {
              setBusy(false);
            }
          }}>שמירה</button>
        </div>
      </div>
    </div>
  );
}

function ChannelModal({
  value, users, onClose, onSave,
}: {
  value: Partial<Channel>;
  users: User[];
  onClose: () => void;
  onSave: (body: unknown) => Promise<void>;
}) {
  const [form, setForm] = useState(value);
  const [err, setErr] = useState("");
  const members = form.members ?? [];
  function toggle(userId: string) {
    const exists = members.find((m) => m.userId === userId);
    const next = exists ? members.filter((m) => m.userId !== userId) : [...members, { id: "", userId, canTalk: true, canListen: true, isPrimary: false }];
    setForm({ ...form, members: next });
  }
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="card modal" onClick={(e) => e.stopPropagation()}>
        <h3>{form.id ? "עריכת ערוץ" : "ערוץ חדש"}</h3>
        {err ? <div className="alert-banner">{err}</div> : null}
        <div className="form-grid">
          <div><label>שם</label><input className="input" value={form.name ?? ""} onChange={(e) => setForm({ ...form, name: e.target.value })} /></div>
          <div><label>קוד</label><input className="input" value={form.code ?? ""} onChange={(e) => setForm({ ...form, code: e.target.value })} /></div>
          <div>
            <label>סוג</label>
            <select className="input" value={form.kind ?? "talkgroup"} onChange={(e) => setForm({ ...form, kind: e.target.value })}>
              <option value="talkgroup">קבוצת דיבור</option>
              <option value="dispatch">מוקד</option>
              <option value="emergency">חירום</option>
              <option value="broadcast">שידור כללי</option>
            </select>
          </div>
          <div><label>מגבלת דיבור (שניות)</label><input className="input" type="number" value={form.maxTalkSec ?? 45} onChange={(e) => setForm({ ...form, maxTalkSec: Number(e.target.value) })} /></div>
        </div>
        <div style={{ marginTop: 12 }}><label>תיאור</label><input className="input" value={form.description ?? ""} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
        <div style={{ marginTop: 14 }}>
          <b>חברי ערוץ</b>
          <div style={{ maxHeight: 220, overflow: "auto" }}>
            {users.map((u) => (
              <label key={u.id} style={{ display: "flex", gap: 8, padding: "6px 0" }}>
                <input type="checkbox" checked={!!members.find((m) => m.userId === u.id)} onChange={() => toggle(u.id)} />
                {u.callSign} · {u.displayName}
              </label>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 16, justifyContent: "flex-end" }}>
          <button className="btn ghost" onClick={onClose}>ביטול</button>
          <button className="btn primary" onClick={async () => {
            setErr("");
            try {
              await onSave({
                name: form.name,
                code: form.code,
                kind: form.kind,
                description: form.description ?? "",
                color: form.color,
                maxTalkSec: form.maxTalkSec,
                isActive: form.isActive ?? true,
                members: (form.members ?? []).map((m) => ({ userId: m.userId, canTalk: m.canTalk, canListen: m.canListen, isPrimary: m.isPrimary })),
              });
            } catch (e) {
              setErr((e as Error).message);
            }
          }}>שמירה</button>
        </div>
      </div>
    </div>
  );
}

function roleHe(role: string) {
  return { admin: "מנהל", dispatcher: "דיספאצר", supervisor: "אחמ״ש", field: "שטח" }[role] ?? role;
}
function kindHe(kind: string) {
  return { talkgroup: "קבוצה", dispatch: "מוקד", emergency: "חירום", broadcast: "שידור" }[kind] ?? kind;
}

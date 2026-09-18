import { useEffect, useMemo, useState } from "react";
import { MapContainer, Popup, TileLayer, CircleMarker } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { Radio, ShieldAlert } from "lucide-react";
import { api, type Channel, type User } from "../api";
import { pttAudio } from "../audio";
import { connectSocket } from "../socket";
import { useAuth } from "../store";
import { radioTones } from "../tones";
import { roleLabel } from "../roles";

delete (L.Icon.Default.prototype as unknown as { _getIconUrl?: string })._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png",
  iconUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png",
  shadowUrl: "https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png",
});

const CENTER: [number, number] = [32.0853, 34.7818];

export function DispatchPage() {
  const { token, user } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selected, setSelected] = useState("");
  const [speaker, setSpeaker] = useState("");
  const [talking, setTalking] = useState(false);
  const [alert, setAlert] = useState<string | null>(null);
  const [rosterQ, setRosterQ] = useState("");
  const [messages, setMessages] = useState<{ id: string; body: string; kind?: string; user?: { callSign: string; displayName: string } }[]>([]);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!token) return;
    void Promise.all([api<User[]>("/api/users"), api<Channel[]>("/api/channels")]).then(([u, c]) => {
      setUsers(u);
      setChannels(c);
      const disp = c.find((x) => x.kind === "dispatch") ?? c[0];
      if (disp) setSelected(disp.id);
    });
  }, [token]);

  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);
    void pttAudio.init();
    radioTones.unlock();

    const onLoc = (loc: User & { userId?: string }) => {
      const id = loc.userId ?? loc.id;
      setUsers((prev) =>
        prev.map((u) => (u.id === id ? { ...u, lat: loc.lat, lng: loc.lng, locationAt: loc.locationAt as string, status: loc.status ?? u.status } : u)),
      );
    };
    const onPresence = (p: { userId: string; status: string }) => {
      setUsers((prev) => prev.map((u) => (u.id === p.userId ? { ...u, status: p.status } : u)));
    };
    const onStart = (p: { channelId: string; callSign: string; displayName: string; userId?: string }) => {
      if (p.channelId !== selected) return;
      setSpeaker(`${p.callSign} · ${p.displayName}`);
      if (p.userId !== user?.id) radioTones.start();
    };
    const onEnd = (p: { channelId: string; userId?: string }) => {
      if (p.channelId !== selected) return;
      setSpeaker("");
      setTalking(false);
      if (p.userId !== user?.id) radioTones.end();
    };
    const onAudio = (data: ArrayBuffer) => pttAudio.playChunk(data);
    const onMsg = (msg: { channelId: string } & (typeof messages)[0]) => {
      if (msg.channelId === selected) setMessages((m) => [...m.slice(-50), msg]);
    };
    const onEmergency = (a: { callSign: string; displayName: string; note: string }) => {
      radioTones.emergency();
      setAlert(`חירום · ${a.callSign} ${a.displayName}: ${a.note}`);
    };
    const onDenied = (p: { reason?: string }) => {
      radioTones.error();
      setAlert(p.reason || "הערוץ תפוס");
    };
    const onDirect = (p: { channel: { id: string; name: string }; from: { id: string; callSign: string } }) => {
      radioTones.start();
      setChannels((prev) => (prev.some((c) => c.id === p.channel.id) ? prev : [...prev, p.channel as Channel]));
      setSelected(p.channel.id);
      socket.emit("channel:join", { channelId: p.channel.id });
      socket.emit("channel:select", { channelId: p.channel.id });
      setAlert(`שיחה אישית: ${p.channel.name}`);
    };

    socket.on("location:broadcast", onLoc);
    socket.on("presence:update", onPresence);
    socket.on("ptt:start", onStart);
    socket.on("ptt:end", onEnd);
    socket.on("ptt:audio", onAudio);
    socket.on("message:new", onMsg);
    socket.on("emergency:alert", onEmergency);
    socket.on("ptt:denied", onDenied);
    socket.on("direct:open", onDirect);
    socket.on("ptt:granted", async () => {
      radioTones.start();
      setTalking(true);
      try {
        await pttAudio.startTalk(socket, selected);
      } catch {
        radioTones.error();
        setAlert("אין גישה למיקרופון");
      }
    });

    return () => {
      socket.off("location:broadcast", onLoc);
      socket.off("presence:update", onPresence);
      socket.off("ptt:start", onStart);
      socket.off("ptt:end", onEnd);
      socket.off("ptt:audio", onAudio);
      socket.off("message:new", onMsg);
      socket.off("emergency:alert", onEmergency);
      socket.off("ptt:denied", onDenied);
      socket.off("direct:open", onDirect);
    };
  }, [token, selected, user?.id]);

  useEffect(() => {
    if (!selected || !token) return;
    void api<typeof messages>(`/api/messages?channelId=${selected}`).then(setMessages);
    connectSocket(token).emit("channel:select", { channelId: selected });
  }, [selected, token]);

  const online = users.filter((u) => u.status !== "offline").length;
  const withLoc = users.filter((u) => u.lat != null && u.lng != null);
  const current = useMemo(() => channels.find((c) => c.id === selected), [channels, selected]);
  const roster = useMemo(() => {
    const s = rosterQ.trim().toLowerCase();
    const list = !s ? users : users.filter((u) => [u.callSign, u.displayName, u.unit?.name].some((v) => (v ?? "").toLowerCase().includes(s)));
    return [...list].sort((a, b) => Number(b.status === "emergency") - Number(a.status === "emergency") || a.callSign.localeCompare(b.callSign, "he"));
  }, [users, rosterQ]);

  function pttDown() {
    if (!selected) return;
    radioTones.unlock();
    connectSocket(token!).emit("ptt:request", { channelId: selected });
  }
  function pttUp() {
    pttAudio.stopTalk();
    if (selected) connectSocket(token!).emit("ptt:release", { channelId: selected });
    if (talking) radioTones.end();
    setTalking(false);
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h2 style={{ margin: 0 }}>מוקד דיספאצר</h2>
          <div style={{ color: "var(--muted)" }}>{user?.displayName} · ניטור כוחות ושידור לערוץ</div>
        </div>
        <div className="grid-3" style={{ minWidth: 380 }}>
          <div className="stat"><span>מחוברים</span><b>{online}</b></div>
          <div className="stat"><span>עם מיקום</span><b>{withLoc.length}</b></div>
          <div className="stat"><span>ערוץ פעיל</span><b>{current?.code ?? "-"}</b></div>
        </div>
      </div>
      {alert ? (
        <div className="alert-banner">
          <span><ShieldAlert size={16} style={{ verticalAlign: "middle" }} /> {alert}</span>
          <button className="btn" onClick={() => setAlert(null)}>סגור</button>
        </div>
      ) : null}
      {speaker ? <div className="talking-banner">באוויר: {speaker} · {current?.name}</div> : null}
      <div className="grid-2">
        <div className="card" style={{ padding: 0 }}>
          <div className="map-wrap">
            <MapContainer center={CENTER} zoom={13} style={{ height: "100%", width: "100%" }}>
              <TileLayer attribution='&copy; OpenStreetMap' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {withLoc.map((u) => (
                <CircleMarker
                  key={u.id}
                  center={[u.lat!, u.lng!]}
                  radius={u.status === "emergency" ? 14 : 9}
                  pathOptions={{
                    color: u.status === "emergency" ? "#c81e1e" : u.status === "talking" ? "#c9a227" : u.unit?.color || "#2563eb",
                    fillOpacity: 0.9,
                  }}
                >
                  <Popup>
                    <b>{u.callSign}</b> {u.displayName}
                    <br />
                    {u.unit?.name} · {statusHe(u.status)}
                  </Popup>
                </CircleMarker>
              ))}
            </MapContainer>
          </div>
        </div>
        <div style={{ display: "grid", gap: 12 }}>
          <div className="card">
            <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
              <b>ערוצי קשר</b>
              <span style={{ color: "var(--muted)" }}>{speaker || "שקט בקו"}</span>
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12 }}>
              {channels.filter((c) => c.kind !== "direct").map((c) => (
                <button key={c.id} className={`ch-pill ${c.id === selected ? "active" : ""}`} onClick={() => setSelected(c.id)}>
                  {c.name}
                </button>
              ))}
            </div>
            {current?.kind === "direct" ? (
              <div className="talking-banner">שיחה אישית פתוחה: {current.name}</div>
            ) : null}
            <button
              className={`btn primary ${talking ? "live" : ""}`}
              style={{ width: "100%", padding: 16, fontSize: 18 }}
              onMouseDown={pttDown}
              onMouseUp={pttUp}
              onMouseLeave={() => talking && pttUp()}
            >
              <Radio size={18} style={{ verticalAlign: "middle" }} /> {talking ? "משדר — שחררו לסיום" : "PTT מוקד"}
            </button>
          </div>
          <div className="card">
            <div className="toolbar" style={{ marginBottom: 8 }}>
              <b style={{ flex: 1 }}>כוחות</b>
              <input className="input" style={{ maxWidth: 180 }} placeholder="חיפוש ניידת..." value={rosterQ} onChange={(e) => setRosterQ(e.target.value)} />
            </div>
            <div style={{ maxHeight: 220, overflow: "auto" }}>
              {roster.map((u) => (
                <div key={u.id} style={{ display: "flex", justifyContent: "space-between", padding: "6px 0", borderBottom: "1px solid var(--line)" }}>
                  <span>
                    <span className={`dot ${u.status === "emergency" ? "em" : u.status === "talking" ? "talk" : u.status === "offline" ? "" : "on"}`} />
                    {" "}{u.callSign} · {u.displayName}
                    <span style={{ color: "var(--muted)", fontSize: 12 }}> · {roleLabel(u.role)}</span>
                  </span>
                  <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
                    <span style={{ color: "var(--muted)", fontSize: 12 }}>{statusHe(u.status)}</span>
                    {u.id !== user?.id ? (
                      <button className="btn ghost" style={{ padding: "4px 8px", fontSize: 12 }} onClick={() => connectSocket(token!).emit("direct:open", { peerId: u.id })}>
                        אישי
                      </button>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="card chat">
            <b>הודעות ערוץ</b>
            <div className="chat-log">
              {messages.map((m) => (
                <div key={m.id} className="bubble" style={{ borderRight: m.kind === "emergency" ? "3px solid var(--brand)" : undefined }}>
                  <b>{m.user?.callSign}:</b> {m.body}
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
              <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="שידור טקסט לכוחות" />
              <button className="btn gold" onClick={() => {
                if (!text.trim() || !selected) return;
                connectSocket(token!).emit("message:send", { channelId: selected, body: text.trim() });
                setText("");
              }}>שלח</button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function statusHe(status: string): string {
  return ({ offline: "לא מחובר", available: "פנוי", busy: "עסוק", talking: "משדר", emergency: "חירום" } as Record<string, string>)[status] ?? status;
}

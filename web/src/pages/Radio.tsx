import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { api, type Channel, type User } from "../api";
import { pttAudio } from "../audio";
import { connectSocket } from "../socket";
import { useAuth } from "../store";

export function RadioPage() {
  const { token, user, logout } = useAuth();
  const nav = useNavigate();
  const [channels, setChannels] = useState<Channel[]>([]);
  const [selected, setSelected] = useState<string>("");
  const [status, setStatus] = useState("מוכן");
  const [talking, setTalking] = useState(false);
  const [speaker, setSpeaker] = useState("");
  const [messages, setMessages] = useState<{ id: string; body: string; user?: { callSign: string } }[]>([]);
  const [text, setText] = useState("");
  const hold = useRef(false);

  const current = useMemo(() => channels.find((c) => c.id === selected), [channels, selected]);

  useEffect(() => {
    if (!token) {
      nav("/login");
      return;
    }
    void (async () => {
      const list = await api<Channel[]>("/api/channels");
      setChannels(list);
      const primary = user?.memberships?.find((m) => m.isPrimary)?.channelId ?? list[0]?.id;
      if (primary) setSelected(primary);
    })();
  }, [token, user, nav]);

  useEffect(() => {
    if (!token) return;
    const socket = connectSocket(token);
    void pttAudio.init();
    socket.emit("channel:select", { channelId: selected });

    const onStart = (p: { channelId: string; callSign: string; displayName: string }) => {
      if (p.channelId !== selected) return;
      setSpeaker(`${p.callSign} · ${p.displayName}`);
      setStatus("משדר");
    };
    const onEnd = (p: { channelId: string }) => {
      if (p.channelId !== selected) return;
      setSpeaker("");
      setStatus("מוכן");
      setTalking(false);
    };
    const onGranted = () => {
      setTalking(true);
      setStatus("אתה משדר");
    };
    const onDenied = (p: { reason: string; holder?: string }) => {
      setTalking(false);
      setStatus(p.holder ? `${p.reason} (${p.holder})` : p.reason);
    };
    const onAudio = (data: ArrayBuffer) => pttAudio.playChunk(data);
    const onMsg = (msg: { channelId: string; id: string; body: string; user?: { callSign: string } }) => {
      if (msg.channelId && selected && (msg as { channelId?: string }).channelId !== selected) return;
      setMessages((m) => [...m.slice(-40), msg]);
    };
    const onEmergency = (a: { callSign: string; note: string }) => {
      setStatus(`חירום: ${a.callSign} — ${a.note}`);
    };

    socket.on("ptt:start", onStart);
    socket.on("ptt:end", onEnd);
    socket.on("ptt:granted", onGranted);
    socket.on("ptt:denied", onDenied);
    socket.on("ptt:audio", onAudio);
    socket.on("message:new", onMsg);
    socket.on("emergency:alert", onEmergency);

    let watch = 0;
    if (navigator.geolocation) {
      watch = navigator.geolocation.watchPosition(
        (pos) => {
          socket.emit("location:update", {
            lat: pos.coords.latitude,
            lng: pos.coords.longitude,
            accuracy: pos.coords.accuracy,
            heading: pos.coords.heading,
            speed: pos.coords.speed,
          });
        },
        () => undefined,
        { enableHighAccuracy: true, maximumAge: 5000 },
      );
    }

    return () => {
      socket.off("ptt:start", onStart);
      socket.off("ptt:end", onEnd);
      socket.off("ptt:granted", onGranted);
      socket.off("ptt:denied", onDenied);
      socket.off("ptt:audio", onAudio);
      socket.off("message:new", onMsg);
      socket.off("emergency:alert", onEmergency);
      if (watch) navigator.geolocation.clearWatch(watch);
    };
  }, [token, selected]);

  useEffect(() => {
    if (!selected || !token) return;
    void api<typeof messages>(`/api/messages?channelId=${selected}`).then(setMessages);
    connectSocket(token).emit("channel:select", { channelId: selected });
  }, [selected, token]);

  async function press() {
    if (!selected || talking) return;
    hold.current = true;
    const socket = connectSocket(token!);
    await pttAudio.init();
    socket.emit("ptt:request", { channelId: selected });
    socket.once("ptt:granted", async () => {
      if (!hold.current) {
        socket.emit("ptt:release", { channelId: selected });
        return;
      }
      try {
        await pttAudio.startTalk(socket, selected);
      } catch {
        setStatus("אין גישה למיקרופון — נדרש HTTPS או אפליקציית אנדרואיד");
      }
    });
  }

  function release() {
    hold.current = false;
    pttAudio.stopTalk();
    if (selected) connectSocket(token!).emit("ptt:release", { channelId: selected });
    setTalking(false);
  }

  function sendMsg() {
    if (!text.trim() || !selected) return;
    connectSocket(token!).emit("message:send", { channelId: selected, body: text.trim() });
    setText("");
  }

  function emergency() {
    if (!confirm("לשלוח קריאת חירום למוקד?")) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        connectSocket(token!).emit("emergency", {
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          note: "קריאת חירום מהשטח",
        });
      },
      () => connectSocket(token!).emit("emergency", { note: "קריאת חירום מהשטח" }),
    );
  }

  return (
    <div className="ptt-wrap">
      <div className="ptt-head">
        <div>
          <b>{user?.callSign}</b>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>{user?.displayName}</div>
        </div>
        <button className="btn ghost" onClick={() => { logout(); nav("/login"); }}>יציאה</button>
      </div>
      <div className="channels">
        {channels.map((c) => (
          <button key={c.id} className={`ch-pill ${c.id === selected ? "active" : ""}`} onClick={() => setSelected(c.id)}>
            {c.name}
          </button>
        ))}
      </div>
      <div className="ptt-body">
        <div>
          <button
            className={`ptt-btn ${talking ? "live" : ""}`}
            onMouseDown={() => void press()}
            onMouseUp={release}
            onMouseLeave={() => hold.current && release()}
            onTouchStart={(e) => { e.preventDefault(); void press(); }}
            onTouchEnd={(e) => { e.preventDefault(); release(); }}
          >
            PTT
          </button>
          <div className="ptt-meta">
            <div>{current ? `${current.name} · ${current.code}` : "אין ערוץ"}</div>
            <div>{speaker ? `באוויר: ${speaker}` : status}</div>
          </div>
        </div>
      </div>
      <div className="card" style={{ margin: "0 16px 12px" }}>
        <div className="chat-log" style={{ maxHeight: 140 }}>
          {messages.map((m) => (
            <div key={m.id} className="bubble">
              <b>{m.user?.callSign}:</b> {m.body}
            </div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} placeholder="הודעת טקסט לערוץ" />
          <button className="btn" onClick={sendMsg}>שלח</button>
        </div>
      </div>
      <button className="emergency" onClick={emergency}>חירום</button>
    </div>
  );
}

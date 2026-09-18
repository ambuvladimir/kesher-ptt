import { useEffect, useState, type FormEvent } from "react";
import { Navigate } from "react-router-dom";
import { api } from "../api";
import { useBranding, type Branding } from "../branding";
import { isAdmin } from "../roles";
import { useAuth } from "../store";
import { radioTones } from "../tones";

const ACCEPT = "image/png,image/jpeg,image/webp,image/gif";

export function SettingsPage() {
  const { user, token } = useAuth();
  const branding = useBranding();
  const [name, setName] = useState(branding.name);
  const [product, setProduct] = useState(branding.product);
  const [preview, setPreview] = useState(branding.logoUrl);
  const [logo, setLogo] = useState<{ mime: string; data: string } | null>(null);
  const [clearLogo, setClearLogo] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [saved, setSaved] = useState("");

  useEffect(() => {
    setName(branding.name);
    setProduct(branding.product);
    if (!logo && !clearLogo) setPreview(branding.logoUrl);
  }, [branding.name, branding.product, branding.logoUrl, logo, clearLogo]);

  if (token && !user) return null;
  if (!isAdmin(user?.role)) return <Navigate to="/dashboard" replace />;

  async function onFile(file: File | undefined) {
    if (!file) return;
    try {
      const next = await compressLogo(file);
      setLogo(next);
      setClearLogo(false);
      setPreview(`data:${next.mime};base64,${next.data}`);
      setSaved("");
    } catch {
      setError("לא ניתן לקרוא את קובץ הלוגו");
    }
  }

  async function save(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    setSaved("");
    try {
      const res = await api<Branding>("/api/branding", {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          product: product.trim(),
          logoBase64: logo?.data,
          logoMime: logo?.mime,
          clearLogo: clearLogo || undefined,
        }),
      });
      branding.apply(res);
      setLogo(null);
      setClearLogo(false);
      radioTones.end();
      setSaved("ההגדרות נשמרו");
    } catch (err) {
      radioTones.error();
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div>
      <div className="topbar">
        <div>
          <h2 style={{ margin: 0 }}>הגדרות מערכת</h2>
          <div style={{ color: "var(--muted)", fontSize: 13 }}>שם ולוגו שמוצגים במסך הכניסה ובכל העמודים — למנהל בלבד</div>
        </div>
      </div>
      {error ? <div className="alert-banner">{error}<button className="btn" onClick={() => setError("")}>סגור</button></div> : null}
      {saved ? <div className="talking-banner">{saved}</div> : null}
      <form className="card" style={{ maxWidth: 560 }} onSubmit={(e) => void save(e)}>
        <div className="fields" style={{ display: "grid", gap: 14 }}>
          <div>
            <label>שם המערכת</label>
            <input className="input" value={name} onChange={(e) => setName(e.target.value)} maxLength={80} required />
          </div>
          <div>
            <label>תיאור קצר</label>
            <input className="input" value={product} onChange={(e) => setProduct(e.target.value)} maxLength={80} placeholder="מערכת קשר" />
          </div>
          <div>
            <label>לוגו</label>
            <div style={{ display: "flex", gap: 16, alignItems: "center", marginTop: 8 }}>
              <img src={preview} alt="" style={{ width: 88, height: 88, borderRadius: "50%", objectFit: "cover", border: "3px solid var(--amber)" }} />
              <div style={{ display: "grid", gap: 8 }}>
                <input
                  type="file"
                  accept={ACCEPT}
                  onChange={(e) => void onFile(e.target.files?.[0])}
                />
                <button
                  type="button"
                  className="btn ghost"
                  onClick={() => {
                    setLogo(null);
                    setClearLogo(true);
                    setPreview("/logo.png");
                    setSaved("");
                  }}
                >
                  חזרה ללוגו ברירת מחדל
                </button>
              </div>
            </div>
          </div>
          <button className="btn primary" disabled={busy} type="submit">
            {busy ? "שומר..." : "שמירת הגדרות"}
          </button>
        </div>
      </form>
    </div>
  );
}

function compressLogo(file: File): Promise<{ mime: string; data: string }> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("not image"));
      return;
    }
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const max = 512;
      const scale = Math.min(1, max / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const mime = file.type === "image/jpeg" ? "image/jpeg" : "image/png";
      const dataUrl = canvas.toDataURL(mime, 0.9);
      URL.revokeObjectURL(url);
      resolve({ mime, data: dataUrl.split(",")[1] ?? "" });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("load"));
    };
    img.src = url;
  });
}

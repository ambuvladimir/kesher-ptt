import { pttAudio } from "./audio";

let ctx: AudioContext | null = null;
let ringAudio: HTMLAudioElement | null = null;
let ringUrl: string | null = null;
let ringTimer = 0;
let silentUrl: string | null = null;
let looping = false;

function audio(): AudioContext {
  if (!ctx) ctx = new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(freq: number, when: number, duration: number, type: OscillatorType, volume = 0.12): void {
  const c = audio();
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.exponentialRampToValueAtTime(volume, when + 0.012);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + duration);
  osc.connect(gain);
  gain.connect(c.destination);
  osc.start(when);
  osc.stop(when + duration + 0.03);
}

function dualTone(f1: number, f2: number, when: number, duration: number, volume: number): void {
  tone(f1, when, duration, "sine", volume);
  tone(f2, when, duration, "sine", volume);
}

function makeWav(seconds: number, writeSample: (i: number, sr: number) => number): string {
  const sr = 22050;
  const n = Math.floor(sr * seconds);
  const pcm = new Int16Array(n);
  for (let i = 0; i < n; i++) {
    const s = Math.max(-1, Math.min(1, writeSample(i, sr)));
    pcm[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  const bytes = pcm.byteLength;
  const buf = new ArrayBuffer(44 + bytes);
  const v = new DataView(buf);
  const str = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  str(0, "RIFF");
  v.setUint32(4, 36 + bytes, true);
  str(8, "WAVEfmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 1, true);
  v.setUint32(24, sr, true);
  v.setUint32(28, sr * 2, true);
  v.setUint16(32, 2, true);
  v.setUint16(34, 16, true);
  str(36, "data");
  v.setUint32(40, bytes, true);
  new Uint8Array(buf, 44).set(new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength));
  return URL.createObjectURL(new Blob([buf], { type: "audio/wav" }));
}

function ringtoneUrl(): string {
  if (ringUrl) return ringUrl;
  ringUrl = makeWav(2.8, (i, sr) => {
    const t = i / sr;
    const cycle = t % 0.7;
    if (cycle > 0.4) return 0;
    const env = Math.min(1, cycle / 0.012) * Math.min(1, (0.4 - cycle) / 0.02);
    return (Math.sin(2 * Math.PI * 440 * t) + Math.sin(2 * Math.PI * 480 * t)) * 0.48 * env;
  });
  return ringUrl;
}

function silenceUrl(): string {
  if (silentUrl) return silentUrl;
  silentUrl = makeWav(0.08, () => 0);
  return silentUrl;
}

function playHtml(url: string, loop: boolean, volume = 1): HTMLAudioElement {
  stopHtml();
  const el = new Audio(url);
  el.loop = loop;
  el.volume = volume;
  el.playsInline = true;
  void el.play().catch(() => undefined);
  ringAudio = el;
  return el;
}

function stopHtml(): void {
  if (!ringAudio) return;
  ringAudio.pause();
  ringAudio.currentTime = 0;
  ringAudio = null;
}

/** צלילי מכשיר קשר: פתיחה, סיום, תפוס, חירום, וצלצול נכנס חזק */
export const radioTones = {
  unlock(): void {
    void audio().resume();
    void pttAudio.resume();
    const a = new Audio(silenceUrl());
    a.volume = 0.01;
    void a.play()
      .then(() => {
        a.pause();
      })
      .catch(() => undefined);
  },
  start(): void {
    const t = audio().currentTime;
    tone(1050, t, 0.07, "square", 0.16);
    tone(1480, t + 0.08, 0.09, "square", 0.18);
  },
  end(): void {
    const t = audio().currentTime;
    tone(1750, t, 0.08, "sine", 0.18);
    tone(1250, t + 0.09, 0.11, "sine", 0.16);
  },
  error(): void {
    const t = audio().currentTime;
    for (let i = 0; i < 3; i++) tone(470, t + i * 0.2, 0.14, "square", 0.16);
  },
  emergency(): void {
    const t = audio().currentTime;
    for (let i = 0; i < 4; i++) {
      tone(880, t + i * 0.26, 0.11, "square", 0.22);
      tone(1174, t + i * 0.26 + 0.12, 0.11, "square", 0.22);
    }
  },
  /** צלצול נכנס — WAV + אוסילטורים, נשמע גם אם AudioContext היה חסום */
  incoming(loop = false): void {
    this.stopIncoming();
    looping = loop;
    this.unlock();
    playHtml(ringtoneUrl(), loop, 1);
    const t = audio().currentTime;
    const rings = loop ? 8 : 1;
    for (let i = 0; i < rings; i++) {
      dualTone(440, 480, t + i * 0.7, 0.45, 0.42);
    }
    if (!loop) {
      ringTimer = window.setTimeout(() => this.stopIncoming(), 900);
    }
  },
  /** Stops a looping incoming ringtone (direct call). Leaves the short PTT ring alone. */
  stopIncomingLoop(): void {
    if (looping) this.stopIncoming();
  },
  stopIncoming(): void {
    looping = false;
    if (ringTimer) {
      window.clearTimeout(ringTimer);
      ringTimer = 0;
    }
    stopHtml();
  },
};

declare global {
  interface HTMLAudioElement {
    playsInline: boolean;
  }
}

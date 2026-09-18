let ctx: AudioContext | null = null;

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

/** צלילי מכשיר קשר מקצועי: תחילת שידור, סיום (רוג׳ר), תפוס/תקלה, חירום */
export const radioTones = {
  unlock(): void {
    void audio().resume();
  },
  start(): void {
    const t = audio().currentTime;
    tone(1050, t, 0.06, "square", 0.09);
    tone(1480, t + 0.07, 0.08, "square", 0.1);
  },
  end(): void {
    const t = audio().currentTime;
    tone(1750, t, 0.07, "sine", 0.13);
    tone(1250, t + 0.08, 0.1, "sine", 0.11);
  },
  error(): void {
    const t = audio().currentTime;
    for (let i = 0; i < 3; i++) tone(470, t + i * 0.2, 0.14, "square", 0.1);
  },
  emergency(): void {
    const t = audio().currentTime;
    for (let i = 0; i < 4; i++) {
      tone(880, t + i * 0.26, 0.11, "square", 0.14);
      tone(1174, t + i * 0.26 + 0.12, 0.11, "square", 0.14);
    }
  },
};

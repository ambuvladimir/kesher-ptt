import {
  JitterBuffer,
  NET_SAMPLE_RATE,
  floatTo16,
  int16ToFloat,
  parsePttAudio,
  pcmBytes,
  resample,
} from "../web/src/pcm.ts";

function assert(cond: boolean, msg: string): void {
  if (!cond) throw new Error(msg);
}

function sine(n: number, freq: number, rate: number): Float32Array {
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) out[i] = Math.sin((2 * Math.PI * freq * i) / rate);
  return out;
}

function rms(a: Float32Array): number {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += a[i] * a[i];
  return Math.sqrt(s / a.length);
}

function roundtrip(): void {
  const src = sine(4800, 700, 48000);
  const down = resample(src, 48000, NET_SAMPLE_RATE);
  const up = resample(down, NET_SAMPLE_RATE, 48000);
  const n = Math.min(src.length, up.length);
  let err = 0;
  const skip = 16;
  for (let i = skip; i < n - skip; i++) err += (src[i] - up[i]) ** 2;
  const rmse = Math.sqrt(err / (n - 2 * skip));
  assert(down.length > 2300 && down.length < 2500, `24k length ${down.length}`);
  assert(rmse < 0.08, `resample RMSE too high: ${rmse}`);
}

function pcmExactBytes(): void {
  const samples = floatTo16(sine(240, 440, NET_SAMPLE_RATE));
  const bytes = pcmBytes(samples);
  assert(bytes.byteLength === samples.length * 2, "pcm byte length");
  const back = int16ToFloat(new Int16Array(bytes.buffer, bytes.byteOffset, samples.length));
  assert(Math.abs(back[10]) > 0.01, "pcm roundtrip has signal");
}

function jitterSmooth(): void {
  const preroll = 1920;
  const buf = new JitterBuffer(preroll, preroll * 5);
  const out = new Float32Array(960);
  assert(!buf.pull(out), "should wait for preroll");
  assert(out[0] === 0, "silence before preroll");
  for (let i = 0; i < 3; i++) buf.push(sine(960, 440, 48000));
  assert(buf.buffered >= preroll, "preroll filled");
  assert(buf.pull(out), "plays after preroll");
  assert(rms(out) > 0.2, "output has voice");
  buf.reset();
  assert(!buf.playing && buf.buffered === 0, "reset");
  buf.push(sine(4000, 440, 48000));
  buf.push(sine(4000, 440, 48000));
  assert(buf.buffered <= preroll * 5 + 4000, "drops oldest when over max");
}

function parsePackets(): void {
  const pcm = pcmBytes(floatTo16(sine(80, 440, NET_SAMPLE_RATE)));
  const a = parsePttAudio(["chan-1", pcm]);
  assert(a?.channelId === "chan-1" && a.pcm.byteLength === pcm.byteLength, "channelId first");
  const b = parsePttAudio([pcm, { channelId: "chan-2" }]);
  assert(b?.channelId === "chan-2", "legacy meta");
  const c = parsePttAudio([{ pcm, channelId: "chan-3" }]);
  assert(c?.channelId === "chan-3", "object packet");
  assert(parsePttAudio([]) === null, "empty");
}

roundtrip();
pcmExactBytes();
jitterSmooth();
parsePackets();
console.log("audio pipeline ok: 24 kHz resample, exact PCM bytes, jitter preroll, channel packets");

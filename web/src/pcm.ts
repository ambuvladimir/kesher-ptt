/** Network PCM: 24 kHz 16-bit mono. Wideband speech, still light on LAN. */
export const NET_SAMPLE_RATE = 24000;

export function floatTo16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? (s * 0x8000) | 0 : (s * 0x7fff) | 0;
  }
  return out;
}

export function int16ToFloat(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] / 0x8000;
  return out;
}

/** Cubic Hermite interpolation — clearer than linear for voice resample. */
export function resample(input: Float32Array, fromRate: number, toRate: number): Float32Array {
  if (fromRate === toRate || input.length === 0) return input;
  const ratio = fromRate / toRate;
  const outLen = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(outLen);
  const last = input.length - 1;
  for (let i = 0; i < outLen; i++) {
    const x = i * ratio;
    const i1 = Math.min(last, Math.floor(x));
    const t = x - i1;
    const i0 = i1 > 0 ? i1 - 1 : 0;
    const i2 = i1 < last ? i1 + 1 : last;
    const i3 = i2 < last ? i2 + 1 : last;
    const y0 = input[i0];
    const y1 = input[i1];
    const y2 = input[i2];
    const y3 = input[i3];
    const c1 = 0.5 * (y2 - y0);
    const c2 = y0 - 2.5 * y1 + 2 * y2 - 0.5 * y3;
    const c3 = 0.5 * (y3 - y0) + 1.5 * (y1 - y2);
    out[i] = ((c3 * t + c2) * t + c1) * t + y1;
  }
  return out;
}

export function pcmBytes(samples: Int16Array): Uint8Array {
  return new Uint8Array(samples.buffer, samples.byteOffset, samples.byteLength);
}

export function toArrayBuffer(data: unknown): ArrayBuffer | null {
  if (!data) return null;
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const v = data as ArrayBufferView;
    return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
  }
  if (typeof data === "object" && data !== null && "data" in data) {
    const arr = (data as { data: number[] }).data;
    if (Array.isArray(arr)) return new Uint8Array(arr).buffer as ArrayBuffer;
  }
  return null;
}

export function parsePttAudio(args: unknown[]): { pcm: ArrayBuffer; channelId?: string } | null {
  if (!args.length) return null;
  const a0 = args[0];
  const a1 = args[1];
  if (typeof a0 === "string") {
    const pcm = toArrayBuffer(a1);
    return pcm ? { pcm, channelId: a0 } : null;
  }
  if (a0 && typeof a0 === "object" && !ArrayBuffer.isView(a0) && !(a0 instanceof ArrayBuffer) && "pcm" in (a0 as object)) {
    const o = a0 as { pcm: unknown; channelId?: string };
    const pcm = toArrayBuffer(o.pcm);
    return pcm ? { pcm, channelId: o.channelId } : null;
  }
  const pcm = toArrayBuffer(a0);
  if (!pcm) return null;
  const channelId =
    a1 && typeof a1 === "object" && a1 !== null && "channelId" in a1
      ? String((a1 as { channelId: unknown }).channelId)
      : undefined;
  return { pcm, channelId };
}

/** Jitter buffer: preroll before start, wait again on underrun, drop oldest if too full. */
export class JitterBuffer {
  private chunks: Float32Array[] = [];
  private samples = 0;
  playing = false;

  constructor(
    private prerollSamples: number,
    private maxSamples: number,
  ) {}

  get buffered(): number {
    return this.samples;
  }

  push(frame: Float32Array): void {
    if (!frame.length) return;
    this.chunks.push(frame);
    this.samples += frame.length;
    while (this.samples > this.maxSamples && this.chunks.length > 1) {
      const dropped = this.chunks.shift()!;
      this.samples -= dropped.length;
    }
  }

  pull(out: Float32Array): boolean {
    if (!this.playing) {
      if (this.samples < this.prerollSamples) {
        out.fill(0);
        return false;
      }
      this.playing = true;
    }
    let filled = 0;
    while (filled < out.length) {
      if (this.chunks.length === 0) {
        out.fill(0, filled);
        this.playing = false;
        return false;
      }
      const chunk = this.chunks[0];
      const take = Math.min(chunk.length, out.length - filled);
      out.set(chunk.subarray(0, take), filled);
      this.samples -= take;
      filled += take;
      if (take === chunk.length) this.chunks.shift();
      else this.chunks[0] = chunk.subarray(take);
    }
    return true;
  }

  reset(): void {
    this.chunks = [];
    this.samples = 0;
    this.playing = false;
  }
}

import type { Socket } from "socket.io-client";

const SAMPLE_RATE = 16000;

function floatTo16(input: Float32Array): Int16Array {
  const out = new Int16Array(input.length);
  for (let i = 0; i < input.length; i++) {
    const s = Math.max(-1, Math.min(1, input[i]));
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff;
  }
  return out;
}

function int16ToFloat(input: Int16Array): Float32Array {
  const out = new Float32Array(input.length);
  for (let i = 0; i < input.length; i++) out[i] = input[i] / 0x8000;
  return out;
}

export class PttAudio {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private processor: ScriptProcessorNode | null = null;
  private source: MediaStreamAudioSourceNode | null = null;
  private talking = false;
  private playTime = 0;

  async init(): Promise<void> {
    if (this.ctx) return;
    this.ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
    if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  async startTalk(socket: Socket, channelId: string): Promise<void> {
    await this.init();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true, channelCount: 1 },
    });
    const ctx = this.ctx!;
    this.source = ctx.createMediaStreamSource(this.stream);
    this.processor = ctx.createScriptProcessor(2048, 1, 1);
    this.processor.onaudioprocess = (ev) => {
      if (!this.talking) return;
      const pcm = floatTo16(ev.inputBuffer.getChannelData(0));
      socket.emit("ptt:audio", pcm.buffer, { channelId });
    };
    const mute = ctx.createGain();
    mute.gain.value = 0;
    this.source.connect(this.processor);
    this.processor.connect(mute);
    mute.connect(ctx.destination);
    this.talking = true;
  }

  stopTalk(): void {
    this.talking = false;
    this.processor?.disconnect();
    this.source?.disconnect();
    this.processor = null;
    this.source = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  playChunk(raw: ArrayBuffer | Uint8Array | { data?: number[] }): void {
    const buffer = toArrayBuffer(raw);
    if (!this.ctx || !buffer) return;
    const ctx = this.ctx;
    const samples = int16ToFloat(new Int16Array(buffer));
    const audioBuffer = ctx.createBuffer(1, samples.length, SAMPLE_RATE);
    audioBuffer.getChannelData(0).set(samples);
    const src = ctx.createBufferSource();
    src.buffer = audioBuffer;
    src.connect(ctx.destination);
    const now = ctx.currentTime;
    if (this.playTime < now) this.playTime = now;
    src.start(this.playTime);
    this.playTime += audioBuffer.duration;
  }
}

export const pttAudio = new PttAudio();

function toArrayBuffer(data: unknown): ArrayBuffer | null {
  if (!data) return null;
  if (data instanceof ArrayBuffer) return data;
  if (ArrayBuffer.isView(data)) {
    const v = data as ArrayBufferView;
    return v.buffer.slice(v.byteOffset, v.byteOffset + v.byteLength) as ArrayBuffer;
  }
  if (typeof data === "object" && data !== null && "data" in data) {
    return new Uint8Array((data as { data: number[] }).data).buffer as ArrayBuffer;
  }
  return null;
}

import type { Socket } from "socket.io-client";
import {
  NET_SAMPLE_RATE,
  JitterBuffer,
  floatTo16,
  int16ToFloat,
  pcmBytes,
  resample,
  toArrayBuffer,
} from "./pcm";

const CAPTURE_CODE = `
class PttCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this._n = 0;
    this._acc = new Float32Array(2048);
  }
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (!ch) return true;
    for (let i = 0; i < ch.length; i++) {
      this._acc[this._n++] = ch[i];
      if (this._n >= 960) {
        this.port.postMessage(this._acc.slice(0, this._n));
        this._n = 0;
      }
    }
    return true;
  }
}
registerProcessor('ptt-capture', PttCapture);
`;

const PLAYBACK_CODE = `
class PttPlayback extends AudioWorkletProcessor {
  constructor() {
    super();
    this.queue = [];
    this.samples = 0;
    this.playing = false;
    this.preroll = Math.round(sampleRate * 0.08);
    this.max = Math.round(sampleRate * 0.4);
    this.port.onmessage = (e) => {
      const d = e.data;
      if (d && d.reset) {
        this.queue = [];
        this.samples = 0;
        this.playing = false;
        return;
      }
      if (d && d.samples) {
        const f = new Float32Array(d.samples);
        this.queue.push(f);
        this.samples += f.length;
        while (this.samples > this.max && this.queue.length > 1) {
          this.samples -= this.queue.shift().length;
        }
      }
    };
  }
  process(_inputs, outputs) {
    const out = outputs[0] && outputs[0][0];
    if (!out) return true;
    if (!this.playing) {
      if (this.samples < this.preroll) {
        out.fill(0);
        return true;
      }
      this.playing = true;
    }
    let i = 0;
    while (i < out.length) {
      if (!this.queue.length) {
        out.fill(0, i);
        this.playing = false;
        break;
      }
      const buf = this.queue[0];
      const take = Math.min(buf.length, out.length - i);
      out.set(buf.subarray(0, take), i);
      i += take;
      this.samples -= take;
      if (take === buf.length) this.queue.shift();
      else this.queue[0] = buf.subarray(take);
    }
    return true;
  }
}
registerProcessor('ptt-playback', PttPlayback);
`;

export class PttAudio {
  private ctx: AudioContext | null = null;
  private stream: MediaStream | null = null;
  private captureNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  private captureSource: MediaStreamAudioSourceNode | null = null;
  private captureMute: GainNode | null = null;
  private playNode: AudioWorkletNode | ScriptProcessorNode | null = null;
  private playGain: GainNode | null = null;
  private fallbackBuf = new JitterBuffer(Math.round(48000 * 0.08), Math.round(48000 * 0.4));
  private workletReady = false;
  private talking = false;
  private dcX = 0;
  private dcY = 0;

  async init(): Promise<void> {
    if (!this.ctx) {
      this.ctx = new AudioContext();
    }
    if (this.ctx.state === "suspended") await this.ctx.resume();
    if (!this.workletReady) {
      try {
        const cap = URL.createObjectURL(new Blob([CAPTURE_CODE], { type: "application/javascript" }));
        const play = URL.createObjectURL(new Blob([PLAYBACK_CODE], { type: "application/javascript" }));
        await this.ctx.audioWorklet.addModule(cap);
        await this.ctx.audioWorklet.addModule(play);
        this.workletReady = true;
        URL.revokeObjectURL(cap);
        URL.revokeObjectURL(play);
      } catch {
        this.workletReady = false;
      }
    }
    this.ensurePlayback();
  }

  async resume(): Promise<void> {
    if (!this.ctx) await this.init();
    else if (this.ctx.state === "suspended") await this.ctx.resume();
  }

  private ensurePlayback(): void {
    const ctx = this.ctx;
    if (!ctx || this.playNode) return;
    this.playGain = ctx.createGain();
    this.playGain.gain.value = 1;
    this.playGain.connect(ctx.destination);
    const native = ctx.sampleRate;
    this.fallbackBuf = new JitterBuffer(Math.round(native * 0.08), Math.round(native * 0.4));
    if (this.workletReady) {
      const node = new AudioWorkletNode(ctx, "ptt-playback", {
        numberOfInputs: 0,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      node.connect(this.playGain);
      this.playNode = node;
      return;
    }
    const proc = ctx.createScriptProcessor(1024, 1, 1);
    proc.onaudioprocess = (ev) => {
      this.fallbackBuf.pull(ev.outputBuffer.getChannelData(0));
    };
    proc.connect(this.playGain);
    this.playNode = proc;
  }

  beginReceive(): void {
    this.resetPlayback();
  }

  endReceive(): void {
    /* leftover jitter plays out, then prerolls on next talk */
  }

  resetPlayback(): void {
    this.fallbackBuf.reset();
    if (this.playNode && "port" in this.playNode) {
      (this.playNode as AudioWorkletNode).port.postMessage({ reset: true });
    }
  }

  async startTalk(socket: Socket, channelId: string): Promise<void> {
    await this.init();
    this.resetPlayback();
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        channelCount: 1,
        sampleRate: 48000,
      },
    });
    const ctx = this.ctx!;
    this.captureSource = ctx.createMediaStreamSource(this.stream);
    this.captureMute = ctx.createGain();
    this.captureMute.gain.value = 0;
    this.talking = true;
    this.dcX = 0;
    this.dcY = 0;

    const emitFrame = (native: Float32Array, rate: number) => {
      if (!this.talking) return;
      const cleaned = this.dcBlock(native);
      const atNet = resample(cleaned, rate, NET_SAMPLE_RATE);
      const bytes = pcmBytes(floatTo16(atNet));
      socket.emit("ptt:audio", channelId, bytes);
    };

    if (this.workletReady) {
      const node = new AudioWorkletNode(ctx, "ptt-capture", {
        numberOfInputs: 1,
        numberOfOutputs: 1,
        outputChannelCount: [1],
      });
      node.port.onmessage = (e) => {
        const frame = e.data as Float32Array;
        emitFrame(frame, ctx.sampleRate);
      };
      this.captureSource.connect(node);
      node.connect(this.captureMute);
      this.captureMute.connect(ctx.destination);
      this.captureNode = node;
      return;
    }

    const proc = ctx.createScriptProcessor(2048, 1, 1);
    proc.onaudioprocess = (ev) => {
      emitFrame(new Float32Array(ev.inputBuffer.getChannelData(0)), ctx.sampleRate);
    };
    this.captureSource.connect(proc);
    proc.connect(this.captureMute);
    this.captureMute.connect(ctx.destination);
    this.captureNode = proc;
  }

  stopTalk(): void {
    this.talking = false;
    this.captureNode?.disconnect();
    this.captureSource?.disconnect();
    this.captureMute?.disconnect();
    this.captureNode = null;
    this.captureSource = null;
    this.captureMute = null;
    this.stream?.getTracks().forEach((t) => t.stop());
    this.stream = null;
  }

  playChunk(raw: ArrayBuffer | Uint8Array | { data?: number[] }): void {
    if (this.talking) return;
    const buffer = toArrayBuffer(raw);
    if (!buffer || buffer.byteLength < 4) return;
    if (!this.ctx) {
      void this.init().then(() => this.enqueue(buffer));
      return;
    }
    if (this.ctx.state === "suspended") void this.ctx.resume();
    this.ensurePlayback();
    this.enqueue(buffer);
  }

  /** Sine through the same jitter path — used by the sound-test button. */
  playTestTone(freq = 620, seconds = 0.45): void {
    if (!this.ctx) {
      void this.init().then(() => this.playTestTone(freq, seconds));
      return;
    }
    const n = Math.round(NET_SAMPLE_RATE * seconds);
    const samples = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const env = Math.min(1, i / 80) * Math.min(1, (n - i) / 120);
      samples[i] = Math.sin((2 * Math.PI * freq * i) / NET_SAMPLE_RATE) * 0.35 * env;
    }
    this.enqueuePcmFloat(samples);
  }

  private enqueue(buffer: ArrayBuffer): void {
    const samples = int16ToFloat(new Int16Array(buffer));
    this.enqueuePcmFloat(samples);
  }

  private enqueuePcmFloat(netRateSamples: Float32Array): void {
    const ctx = this.ctx;
    if (!ctx) return;
    const native = resample(netRateSamples, NET_SAMPLE_RATE, ctx.sampleRate);
    if (this.playNode && "port" in this.playNode) {
      const copy = new Float32Array(native);
      (this.playNode as AudioWorkletNode).port.postMessage({ samples: copy.buffer }, [copy.buffer]);
      return;
    }
    this.fallbackBuf.push(native);
  }

  private dcBlock(input: Float32Array): Float32Array {
    const out = new Float32Array(input.length);
    let x1 = this.dcX;
    let y1 = this.dcY;
    for (let i = 0; i < input.length; i++) {
      const x = input[i];
      const y = x - x1 + 0.995 * y1;
      out[i] = y;
      x1 = x;
      y1 = y;
    }
    this.dcX = x1;
    this.dcY = y1;
    return out;
  }
}

export const pttAudio = new PttAudio();

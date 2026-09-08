/** Browser microphone capture streamed to Sahara through Dami's authenticated gateway. */
export class MicrophoneError extends Error {
  constructor(message: string, public reason: "denied" | "unavailable" | "empty") { super(message); this.name = "MicrophoneError"; }
}

export interface AudioCapture { blob: Blob; mimeType: string; extension: string; durationMs: number; transcript?: string; streamed?: boolean; }
export interface Recorder { stop(): Promise<AudioCapture>; cancel(): void; level(): number; transcript(): string; }
export interface TranscriptionResult { text: string; durationMs: number; requestId: string | null; }

const VOICE_WS_URL = (import.meta.env.VITE_DAMI_VOICE_WS_URL as string | undefined) || "wss://dami-ai-core-1.onrender.com/stt";

function toBase64(bytes: Uint8Array) {
  let binary = "";
  const step = 0x8000;
  for (let i = 0; i < bytes.length; i += step) binary += String.fromCharCode(...bytes.subarray(i, i + step));
  return btoa(binary);
}

function resampleTo16k(input: Float32Array, inputRate: number) {
  if (inputRate === 16000) return input;
  const ratio = inputRate / 16000;
  const length = Math.max(1, Math.round(input.length / ratio));
  const out = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    const pos = i * ratio, left = Math.floor(pos), right = Math.min(input.length - 1, left + 1), frac = pos - left;
    out[i] = (input[left] ?? 0) * (1 - frac) + (input[right] ?? 0) * frac;
  }
  return out;
}

function pcm16Bytes(samples: Float32Array) {
  const buffer = new ArrayBuffer(samples.length * 2), view = new DataView(buffer);
  for (let i = 0; i < samples.length; i++) {
    const s = Math.max(-1, Math.min(1, samples[i] ?? 0));
    view.setInt16(i * 2, s < 0 ? s * 0x8000 : s * 0x7fff, true);
  }
  return new Uint8Array(buffer);
}

export async function startRecording(maxSeconds: number, language = "en"): Promise<Recorder> {
  if (!navigator.mediaDevices?.getUserMedia || typeof WebSocket === "undefined") throw new MicrophoneError("This browser can't use Dami's live microphone mode. You can still type your question.", "unavailable");
  let stream: MediaStream;
  try { stream = await navigator.mediaDevices.getUserMedia({ audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true, autoGainControl: true } }); }
  catch (error) {
    const name = (error as DOMException)?.name;
    if (name === "NotAllowedError" || name === "SecurityError") throw new MicrophoneError("Dami needs microphone access to listen. Allow microphone access, then try again.", "denied");
    throw new MicrophoneError("Dami couldn't open your microphone. Check that it is connected and free.", "unavailable");
  }

  const AudioCtx = window.AudioContext ?? (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!AudioCtx) { stream.getTracks().forEach(t => t.stop()); throw new MicrophoneError("Live audio isn't supported in this browser.", "unavailable"); }
  const context = new AudioCtx(); if (context.state === "suspended") await context.resume();
  const source = context.createMediaStreamSource(stream), analyser = context.createAnalyser(), processor = context.createScriptProcessor(2048, 1, 1);
  analyser.fftSize = 512; source.connect(analyser); source.connect(processor); processor.connect(context.destination);
  const meter = new Float32Array(analyser.fftSize), startedAt = Date.now();
  let transcript = "", stopped = false, cancelled = false, ack = 0, pending = new Uint8Array(0), finalResolve: ((text: string) => void) | null = null;
  let terminalError = "";
  const finalPromise = new Promise<string>(resolve => { finalResolve = resolve; });
  const ws = new WebSocket(`${VOICE_WS_URL}?language=${encodeURIComponent(language || "en")}`);

  const sendChunk = (chunk: Uint8Array) => {
    ws.send(JSON.stringify({ message_type: "INPUT_AUDIO_CHUNK", audio_base_64: toBase64(chunk), ack_id: ++ack }));
  };

  const flushFullChunks = () => {
    if (ws.readyState !== WebSocket.OPEN) return;
    while (pending.length >= 4096) {
      const send = pending.slice(0, 4096);
      pending = pending.slice(4096);
      sendChunk(send);
    }
  };

  const appendAndSend = (chunk: Uint8Array) => {
    const merged = new Uint8Array(pending.length + chunk.length);
    merged.set(pending); merged.set(chunk, pending.length); pending = merged;
    flushFullChunks();
  };

  processor.onaudioprocess = event => {
    if (!stopped && !cancelled) appendAndSend(pcm16Bytes(resampleTo16k(event.inputBuffer.getChannelData(0), context.sampleRate)));
  };

  ws.onopen = () => flushFullChunks();
  ws.onmessage = event => {
    try {
      const msg = JSON.parse(String(event.data));
      const type = String(msg.message_type ?? "");
      const text = String(
        type === "COMMITTED_TRANSCRIPT"
          ? (msg.transcript_text ?? msg.transcript ?? msg.text ?? "")
          : (msg.transcript ?? msg.transcript_text ?? msg.text ?? "")
      ).trim();

      if ((type === "PARTIAL_TRANSCRIPT" || type === "COMMITTED_TRANSCRIPT") && text) transcript = text;
      if (type === "COMMITTED_TRANSCRIPT") finalResolve?.(transcript);

      if (["GATEWAY_ERROR", "ERROR", "INPUT_ERROR", "AUTHENTICATION_ERROR", "RESOURCE_EXHAUSTED", "QUOTA_EXCEEDED", "CHUNK_SIZE_TOO_SMALL", "CHUNK_SIZE_TOO_LARGE", "INSUFFICIENT_AUDIO_ACTIVITY", "SESSION_TIME_LIMIT_EXCEEDED", "CHUNK_ID_MISMATCH_WITH_TOTAL"].includes(type)) {
        terminalError = String(msg.message ?? type).trim();
        finalResolve?.("");
      }
    } catch { /* ignore malformed upstream events */ }
  };
  ws.onerror = () => { terminalError ||= "Voice streaming connection failed."; finalResolve?.(""); };
  ws.onclose = () => { if (!stopped && !cancelled) finalResolve?.(transcript); };

  const teardown = () => { processor.onaudioprocess = null; try { processor.disconnect(); source.disconnect(); analyser.disconnect(); } catch {} stream.getTracks().forEach(t => t.stop()); void context.close(); };
  const timer = setTimeout(() => { if (!stopped) void finish(); }, maxSeconds * 1000);

  const waitForSocket = async () => {
    if (ws.readyState === WebSocket.OPEN) return true;
    if (ws.readyState !== WebSocket.CONNECTING) return false;
    return new Promise<boolean>(resolve => {
      const opened = () => { cleanup(); resolve(true); };
      const failed = () => { cleanup(); resolve(false); };
      const cleanup = () => { ws.removeEventListener("open", opened); ws.removeEventListener("error", failed); ws.removeEventListener("close", failed); clearTimeout(timeout); };
      const timeout = window.setTimeout(() => { cleanup(); resolve(false); }, 4000);
      ws.addEventListener("open", opened, { once: true });
      ws.addEventListener("error", failed, { once: true });
      ws.addEventListener("close", failed, { once: true });
    });
  };

  const finish = async (): Promise<AudioCapture> => {
    if (stopped) throw new MicrophoneError("That recording has already ended.", "empty");
    stopped = true; clearTimeout(timer); teardown();

    const socketReady = await waitForSocket();
    if (!socketReady) {
      try { ws.close(); } catch {}
      throw new MicrophoneError("Dami couldn't connect to Sahara's live transcription service. Please try again.", "unavailable");
    }

    flushFullChunks();
    if (pending.length >= 1024) {
      sendChunk(pending);
      pending = new Uint8Array(0);
    }
    ws.send(JSON.stringify({ message_type: "COMMIT" }));

    const final = await Promise.race([finalPromise, new Promise<string>(resolve => setTimeout(() => resolve(transcript), 7000))]);
    try { ws.close(1000); } catch {}
    if (!final.trim()) {
      const detail = terminalError && !/AUTHENTICATION|QUOTA/i.test(terminalError) ? ` (${terminalError})` : "";
      throw new MicrophoneError(`Dami didn't receive a transcript from Sahara${detail}. Please try again.`, "empty");
    }
    transcript = final.trim();
    return { blob: new Blob(), mimeType: "audio/pcm", extension: "pcm", durationMs: Date.now() - startedAt, transcript, streamed: true };
  };

  return {
    stop: finish,
    cancel() { if (cancelled) return; cancelled = true; stopped = true; clearTimeout(timer); teardown(); try { ws.close(1000); } catch {} },
    level() { analyser.getFloatTimeDomainData(meter); let peak=0; for(let i=0;i<meter.length;i+=4) peak=Math.max(peak,Math.abs(meter[i]??0)); return Math.min(1,peak*3); },
    transcript: () => transcript,
  };
}

async function saharaFinal(capture: AudioCapture, options: { language: string; codeSwitching: boolean }) {
  const form=new FormData(); form.set("audio",capture.blob,`dami.${capture.extension}`); form.set("language",options.language||"en"); form.set("codeSwitching",String(options.codeSwitching)); form.set("durationMs",String(capture.durationMs));
  const response=await fetch("/api/sahara-stt",{method:"POST",body:form}); const raw=await response.text(); let payload:any=null; try{payload=raw?JSON.parse(raw):null}catch{}
  if(response.ok&&payload?.text?.trim()) return {text:payload.text.trim(),durationMs:payload.durationMs??0,requestId:payload.requestId??null};
  throw new Error(payload?.error?.trim()||`Speech transcription failed (HTTP ${response.status}). Please try again.`);
}

export async function transcribeSamples(capture: AudioCapture, options: { language: string; codeSwitching: boolean; browserTranscript?: string }): Promise<TranscriptionResult> {
  if (capture.streamed && capture.transcript?.trim()) return { text: capture.transcript.trim(), durationMs: capture.durationMs, requestId: null };
  return saharaFinal(capture, options);
}

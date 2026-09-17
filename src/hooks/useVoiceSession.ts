/** Dami voice session state machine. */
import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";
import { askDami } from "@/lib/dami.functions";
import { getDamiLanguage } from "@/lib/languages";
import { newId, storage } from "@/lib/storage";
import { buildVoiceTranscript, MAX_LEGAL_QUERY_CHARACTERS } from "@/lib/transcript";
import { voiceDiagnostic } from "@/lib/voiceDiagnostics";
import {
  prepareAudioPlayback,
  speak,
  startRecording,
  transcribeSamples,
  warmSaharaVoice,
  warmVoiceGateway,
  type Recorder,
  type SpeechHandle,
} from "@/services/sahara/browser";
import { playListeningCue, playListeningEndCue } from "@/services/voice/listeningCue";
import type {
  DamiState,
  ResearchAnswer,
  ResearchSession,
  VoiceStage,
  VoiceTranscript,
} from "@/lib/types";

const STAGE_TO_ROBOT: Record<VoiceStage, DamiState> = {
  welcome: "welcome",
  idle: "idle",
  "requesting-permission": "listening",
  listening: "listening",
  transcribing: "thinking",
  researching: "thinking",
  thinking: "thinking",
  answered: "success",
  speaking: "speaking",
  error: "error",
};
export const STAGE_LABEL: Record<VoiceStage, string> = {
  welcome: "Hi, I'm Dami. Talk to me when you're ready.",
  idle: "Ready when you are.",
  "requesting-permission": "Dami is opening your microphone...",
  listening: "Dami is listening. Speak naturally and pause when you're done.",
  transcribing: "Dami is finishing your transcript...",
  researching: "Dami is researching the law and the strongest available authorities...",
  thinking: "Dami is ranking the evidence and preparing your answer...",
  answered: "I found something useful for you.",
  speaking: "Dami is speaking...",
  error: "Something went wrong.",
};
const END_OF_SPEECH_SILENCE_MS = 650,
  NO_SPEECH_TIMEOUT_MS = 6500,
  LISTENING_GRACE_MS = 280,
  SPEECH_CONFIRM_MS = 90,
  MIN_SPEECH_THRESHOLD = 0.022,
  NOISE_MULTIPLIER = 1.8,
  NOISE_MARGIN = 0.012;

function publicVoiceError(error: unknown, fallback: string) {
  const message = error instanceof Error ? error.message : "";
  if (/groq|whisper|invalid_enum|zod|transcriptengine|api[_ -]?key|provider/i.test(message))
    return fallback;
  return message.trim() || fallback;
}

export function useVoiceSession() {
  const [stage, setStage] = useState<VoiceStage>("welcome"),
    [question, setQuestion] = useState(""),
    [partial, setPartial] = useState(""),
    [answer, setAnswer] = useState<ResearchAnswer | null>(null),
    [error, setError] = useState<string | null>(null),
    [level, setLevel] = useState(0),
    [session, setSession] = useState<ResearchSession | null>(null),
    [transcript, setTranscript] = useState<VoiceTranscript | null>(null),
    [speechPaused, setSpeechPaused] = useState(false);
  const recorderRef = useRef<Recorder | null>(null),
    speechRef = useRef<SpeechHandle | null>(null),
    levelTimer = useRef<ReturnType<typeof setInterval> | null>(null),
    cancelled = useRef(false),
    autoStoppingRef = useRef(false),
    interactionStartedRef = useRef(0);
  const runResearch = useServerFn(askDami);
  const stopLevelMeter = useCallback(() => {
    if (levelTimer.current) clearInterval(levelTimer.current);
    levelTimer.current = null;
    setLevel(0);
  }, []);
  useEffect(() => {
    const t = setTimeout(() => setStage((c) => (c === "welcome" ? "idle" : c)), 1200);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    // Start a sleeping gateway while the user is reading the page instead of
    // making their first spoken word pay the cold-start cost.
    void warmVoiceGateway();
    const warm = () => {
      if (document.visibilityState === "visible" || window.damiDesktop?.isDesktop)
        void warmVoiceGateway();
    };
    const timer = window.setInterval(warm, 10 * 60 * 1000);
    window.addEventListener("focus", warm);
    document.addEventListener("visibilitychange", warm);
    return () => {
      window.removeEventListener("focus", warm);
      document.removeEventListener("visibilitychange", warm);
      window.clearInterval(timer);
    };
  }, []);
  useEffect(
    () => () => {
      recorderRef.current?.cancel();
      speechRef.current?.stop();
      if (levelTimer.current) clearInterval(levelTimer.current);
    },
    [],
  );
  const clear = useCallback(() => {
    cancelled.current = true;
    autoStoppingRef.current = false;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    speechRef.current?.stop();
    speechRef.current = null;
    setSpeechPaused(false);
    stopLevelMeter();
    setStage("idle");
    setQuestion("");
    setPartial("");
    setAnswer(null);
    setError(null);
    setSession(null);
    setTranscript(null);
  }, [stopLevelMeter]);
  const stopSpeaking = useCallback(() => {
    speechRef.current?.stop();
    speechRef.current = null;
    setSpeechPaused(false);
    setStage((c) => (c === "speaking" ? "answered" : c));
  }, []);
  const toggleSpeechPause = useCallback(() => {
    const handle = speechRef.current;
    if (!handle) return;
    if (handle.isPaused()) {
      handle.resume();
      setSpeechPaused(false);
    } else {
      handle.pause();
      setSpeechPaused(true);
    }
  }, []);
  const readAloud = useCallback(async (text: string, onStarted?: () => void) => {
    const settings = storage.getSettings(),
      language = getDamiLanguage(settings.speechLanguage);
    speechRef.current?.stop();
    setSpeechPaused(false);
    try {
      voiceDiagnostic("TTS START", {
        answerCharacters: text.length,
        language: language.ttsLanguage,
        accent: settings.voiceAccent || language.preferredAccent,
      });
      setStage("speaking");
      const handle = await speak(text, {
        accent: settings.voiceAccent || language.preferredAccent,
        gender: settings.voiceGender,
        language: language.ttsLanguage,
      });
      speechRef.current = handle;
      await handle.started;
      if (speechRef.current !== handle) return;
      voiceDiagnostic("AUDIO PLAYBACK START", {
        elapsedMs: interactionStartedRef.current
          ? Math.round(performance.now() - interactionStartedRef.current)
          : 0,
      });
      onStarted?.();
      await handle.ended;
      if (speechRef.current === handle) speechRef.current = null;
      setSpeechPaused(false);
      setStage("answered");
    } catch (err) {
      onStarted?.();
      speechRef.current = null;
      setSpeechPaused(false);
      setStage("answered");
      setError(err instanceof Error ? err.message : "I couldn't read that answer aloud.");
    }
  }, []);
  const ask = useCallback(
    async (text: string, suppliedTranscript?: VoiceTranscript) => {
      const trimmed = text.trim();
      if (trimmed.length < 3) {
        setError("Give me a little more to work with.");
        setStage("error");
        return;
      }
      if (trimmed.length > MAX_LEGAL_QUERY_CHARACTERS) {
        setError(
          `That transcript is ${trimmed.length.toLocaleString()} characters. Keep one turn below ${MAX_LEGAL_QUERY_CHARACTERS.toLocaleString()} characters.`,
        );
        setStage("error");
        return;
      }
      if (!interactionStartedRef.current) interactionStartedRef.current = performance.now();
      const settings = storage.getSettings(),
        language = getDamiLanguage(settings.speechLanguage),
        activeTranscript =
          suppliedTranscript ?? buildVoiceTranscript(trimmed, "typed", language, 0, null);
      cancelled.current = false;
      setQuestion(trimmed);
      setTranscript(activeTranscript);
      setPartial("");
      setError(null);
      setAnswer(null);
      setStage("researching");

      // Open and authenticate Sahara TTS while legal research is running.
      // By the time the answer returns, Dami can send text over an already-ready
      // voice session instead of paying websocket + Sahara session startup latency.
      if (settings.speakAnswers) {
        void warmSaharaVoice({
          accent: settings.voiceAccent || language.preferredAccent,
          gender: settings.voiceGender,
          language: language.ttsLanguage,
        });
      }

      voiceDiagnostic("LEGAL INTENT", {
        originalCharacters: activeTranscript.originalTranscript.length,
        retrievalCharacters: activeTranscript.normalizedRetrievalQuery.length,
        engine: activeTranscript.engine,
        selectedLanguage: activeTranscript.selectedLanguage,
      });
      voiceDiagnostic("RETRIEVAL START", { selectedLanguage: activeTranscript.selectedLanguage });
      const thinkingTimer = window.setTimeout(
        () => setStage((current) => (current === "researching" ? "thinking" : current)),
        1200,
      );
      try {
        const result = await runResearch({
          data: {
            question: trimmed,
            context: {
              originalTranscript: activeTranscript.originalTranscript,
              normalizedRetrievalQuery: activeTranscript.normalizedRetrievalQuery,
              transcriptEngine: activeTranscript.engine,
              selectedLanguage: activeTranscript.selectedLanguage,
              expectedLanguages: activeTranscript.expectedLanguages,
              codeSwitchedMode: activeTranscript.codeSwitchedMode,
            },
          },
        });
        if (cancelled.current) return;
        voiceDiagnostic("RETRIEVAL COMPLETE", { citations: result.citations.length });
        voiceDiagnostic("RESPONSE START", { answerCharacters: result.answer.length });
        voiceDiagnostic("FIRST TOKEN", {
          elapsedMs: Math.round(performance.now() - interactionStartedRef.current),
        });
        const record: ResearchSession = {
          id: newId("ses"),
          conversationId: null,
          question: trimmed,
          transcript: activeTranscript,
          answer: result,
          createdAt: new Date().toISOString(),
          saved: false,
        };
        storage.saveSession(record);
        setSession(record);
        setAnswer(result);
        voiceDiagnostic("TOTAL INTERACTION TIME", {
          textReadyMs: Math.round(performance.now() - interactionStartedRef.current),
        });
        if (storage.getSettings().speakAnswers) {
          // Start quickly, but never truncate Dami to one sentence. The TTS
          // client already chunks long answers and begins playback as soon as
          // the first Sahara audio chunk arrives, so pass the complete answer.
          void readAloud(result.answer);
        } else setStage("answered");
      } catch (err) {
        if (cancelled.current) return;
        console.error(err);
        const message = err instanceof Error ? err.message : "";
        // Mobile Chromium can surface an AbortSignal cancellation from an
        // interrupted/replaced request as the raw string "signal is aborted
        // without reason". Never expose that implementation error to users.
        // A retry remains available and uses the preserved question.
        setError(
          /signal is aborted|aborterror|aborted without reason/i.test(message)
            ? "The request was interrupted. Please try again."
            : message || "I couldn't complete that research. Please try again.",
        );
        setStage("error");
      } finally {
        window.clearTimeout(thinkingTimer);
      }
    },
    [readAloud, runResearch],
  );
  const processRecording = useCallback(
    async (recorder: Recorder) => {
      stopLevelMeter();
      void playListeningEndCue();
      const browserTranscript = recorder.transcript().trim();
      if (browserTranscript) setPartial(browserTranscript);
      setStage("transcribing");
      const settings = storage.getSettings(),
        language = getDamiLanguage(settings.speechLanguage);
      try {
        const samples = await recorder.stop();
        voiceDiagnostic("AUDIO CAPTURE COMPLETE", {
          durationMs: samples.durationMs,
          bytes: samples.blob.size,
        });
        voiceDiagnostic("SAHARA REQUEST", {
          language: language.saharaSttLanguage,
          codeSwitched: language.codeSwitched,
        });
        const transcriptionStartedAt = performance.now(),
          result = await transcribeSamples(samples, {
            language: language.saharaSttLanguage,
            codeSwitching: language.codeSwitched,
            browserTranscript,
          }),
          transcriptionLatencyMs = Math.round(performance.now() - transcriptionStartedAt);
        if (cancelled.current) return;
        const voiceTranscript = buildVoiceTranscript(
          result.text,
          result.engine,
          language,
          transcriptionLatencyMs,
          result.requestId,
        );
        voiceDiagnostic("SAHARA TRANSCRIPT", {
          engine: result.engine,
          language: result.language,
          characters: result.text.length,
          latencyMs: transcriptionLatencyMs,
        });
        voiceDiagnostic("DETECTED LANGUAGE/CODE-SWITCH", {
          selectedMode: language.shortLabel,
          codeSwitched: language.codeSwitched,
        });
        setPartial("");
        setQuestion(result.text);
        setTranscript(voiceTranscript);
        await ask(result.text, voiceTranscript);
      } catch (err) {
        if (cancelled.current) return;
        console.error(err);
        setError(
          err instanceof Error && err.message
            ? err.message
            : "I couldn't turn that recording into text.",
        );
        setStage("error");
      } finally {
        autoStoppingRef.current = false;
      }
    },
    [ask, stopLevelMeter],
  );
  const askWakeCapture = useCallback(
    async (audioBase64: string, fallbackText: string) => {
      const fallback = fallbackText.trim();
      // Native Desktop wake turns can arrive with the spoken command already
      // captured, so they bypass startListening(). Prime the same reusable
      // audio element here as the normal browser/tap flow. This keeps automatic
      // Dami Voice playback alive after the async transcription + research
      // round trip without changing STT, wake detection, or research.
      void prepareAudioPlayback();
      setError(null);
      setAnswer(null);
      setPartial(fallback);
      setStage("transcribing");
      try {
        if (!audioBase64) {
          throw new Error(
            "Sahara did not receive captured audio for this wake request. Please click Dami and try again.",
          );
        }
        const binary = atob(audioBase64),
          bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index++) bytes[index] = binary.charCodeAt(index);
        const settings = storage.getSettings(),
          language = getDamiLanguage(settings.speechLanguage),
          transcriptionStartedAt = performance.now(),
          result = await transcribeSamples(
            {
              blob: new Blob([bytes], { type: "audio/wav" }),
              mimeType: "audio/wav",
              extension: "wav",
              durationMs: Math.max(250, Math.round((bytes.length / 32000) * 1000)),
            },
            {
              language: language.saharaSttLanguage,
              codeSwitching: language.codeSwitched,
              browserTranscript: fallback,
            },
          ),
          transcriptionLatencyMs = Math.round(performance.now() - transcriptionStartedAt),
          originalTranscript = result.text.trim() || fallback,
          voiceTranscript = buildVoiceTranscript(
            originalTranscript,
            result.engine,
            language,
            transcriptionLatencyMs,
            result.requestId,
          );
        voiceDiagnostic("SAHARA TRANSCRIPT", {
          engine: result.engine,
          language: result.language,
          characters: originalTranscript.length,
          latencyMs: transcriptionLatencyMs,
        });
        setPartial("");
        setTranscript(voiceTranscript);
        await ask(originalTranscript, voiceTranscript);
      } catch (err) {
        // Competition path: a desktop wake request must also complete through
        // Sahara STT. Native Windows recognition is used only to detect the
        // wake phrase and must not replace Sahara transcription when Sahara is
        // unavailable or out of credits.
        setError(err instanceof Error ? err.message : "Sahara couldn't transcribe that wake request.");
        setStage("error");
      }
    },
    [ask],
  );
  const startListening = useCallback(async () => {
    interactionStartedRef.current = performance.now();
    cancelled.current = false;
    autoStoppingRef.current = false;
    setError(null);
    setAnswer(null);
    setPartial("");
    setQuestion("");
    setTranscript(null);
    setStage("requesting-permission");
    const settings = storage.getSettings(),
      language = getDamiLanguage(settings.speechLanguage);
    try {
      // Prime mobile audio playback during the user's activation gesture so
      // Dami can speak automatically after the async research/TTS round trip.
      void prepareAudioPlayback();
      const recorder = await startRecording(
        settings.maxRecordingSeconds,
        language.saharaSttLanguage,
      );
      recorderRef.current = recorder;
      setStage("listening");
      voiceDiagnostic("LISTENING START", {
        language: language.saharaSttLanguage,
        codeSwitched: language.codeSwitched,
      });
      void playListeningCue();
      const startedAt = Date.now();
      let noiseFloor = 0.01,
        speechDetected = false,
        speechStartedAt: number | null = null,
        silenceStartedAt: number | null = null;
      levelTimer.current = setInterval(() => {
        const currentRecorder = recorderRef.current;
        if (!currentRecorder || autoStoppingRef.current) return;
        const now = Date.now(),
          currentLevel = currentRecorder.level();
        setLevel(currentLevel);
        const live = currentRecorder.transcript();
        if (live) {
          setPartial(live);
          speechDetected = true;
        }
        if (now - startedAt < LISTENING_GRACE_MS) {
          noiseFloor = Math.min(0.035, noiseFloor * 0.8 + currentLevel * 0.2);
          if (currentLevel >= 0.08) speechDetected = true;
          return;
        }
        const speechThreshold = Math.max(
            MIN_SPEECH_THRESHOLD,
            Math.min(0.12, noiseFloor * NOISE_MULTIPLIER + NOISE_MARGIN),
          ),
          quietThreshold = Math.max(MIN_SPEECH_THRESHOLD * 0.8, speechThreshold * 0.72);
        if (currentLevel >= speechThreshold) {
          if (speechStartedAt === null) speechStartedAt = now;
          if (now - speechStartedAt >= SPEECH_CONFIRM_MS) speechDetected = true;
          silenceStartedAt = null;
          return;
        }
        speechStartedAt = null;
        if (!speechDetected) {
          if (now - startedAt >= NO_SPEECH_TIMEOUT_MS) {
            autoStoppingRef.current = true;
            recorderRef.current = null;
            currentRecorder.cancel();
            stopLevelMeter();
            void playListeningEndCue();
            setStage("idle");
            return;
          }
          noiseFloor = Math.min(0.035, noiseFloor * 0.96 + currentLevel * 0.04);
          return;
        }
        if (currentLevel <= quietThreshold) {
          if (silenceStartedAt === null) silenceStartedAt = now;
          if (now - silenceStartedAt >= END_OF_SPEECH_SILENCE_MS) {
            autoStoppingRef.current = true;
            recorderRef.current = null;
            void processRecording(currentRecorder);
          }
        } else silenceStartedAt = null;
      }, 70);
    } catch (err) {
      recorderRef.current = null;
      stopLevelMeter();
      setError(
        err instanceof Error && err.name === "MicrophoneError"
          ? err.message
          : "I couldn't start listening. You can type your question instead.",
      );
      setStage("error");
    }
  }, [processRecording, stopLevelMeter]);
  const stopListening = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder || autoStoppingRef.current) return;
    autoStoppingRef.current = true;
    recorderRef.current = null;
    await processRecording(recorder);
  }, [processRecording]);
  const cancelListening = useCallback(() => {
    cancelled.current = true;
    autoStoppingRef.current = false;
    recorderRef.current?.cancel();
    recorderRef.current = null;
    stopLevelMeter();
    setPartial("");
    setStage("idle");
  }, [stopLevelMeter]);
  const retry = useCallback(() => {
    setError(null);
    if (question) void ask(question, transcript ?? undefined);
    else setStage("idle");
  }, [ask, question, transcript]);
  return {
    stage,
    robotState: STAGE_TO_ROBOT[stage] as DamiState,
    statusText: error && stage === "error" ? error : STAGE_LABEL[stage],
    question,
    partial,
    answer,
    error,
    level,
    session,
    transcript,
    speechPaused,
    isBusy: stage === "transcribing" || stage === "researching" || stage === "thinking",
    startListening,
    askWakeCapture,
    stopListening,
    cancelListening,
    ask,
    retry,
    clear,
    readAloud,
    stopSpeaking,
    toggleSpeechPause,
    setQuestion,
  };
}

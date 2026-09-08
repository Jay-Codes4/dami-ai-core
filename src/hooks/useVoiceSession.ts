/**
 * The Dami voice session state machine.
 *
 *   welcome → idle → listening → transcribing → researching → answered → speaking
 *
 * Voice capture uses an adaptive silence detector so users can speak naturally
 * without pressing Done Speaking. After real speech has started, roughly 2
 * seconds of sustained quiet is treated as the end of the turn and submitted
 * automatically for transcription.
 */

import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";

import { askDami } from "@/lib/dami.functions";
import { getDamiLanguage } from "@/lib/languages";
import { newId, storage } from "@/lib/storage";
import {
  speak,
  startRecording,
  transcribeSamples,
  type Recorder,
  type SpeechHandle,
} from "@/services/sahara/browser";
import type { DamiState, ResearchAnswer, ResearchSession, VoiceStage } from "@/lib/types";

const STAGE_TO_ROBOT: Record<VoiceStage, DamiState> = {
  welcome: "welcome",
  idle: "idle",
  "requesting-permission": "idle",
  listening: "listening",
  transcribing: "thinking",
  researching: "thinking",
  answered: "success",
  speaking: "speaking",
  error: "error",
};

export const STAGE_LABEL: Record<VoiceStage, string> = {
  welcome: "Hi — I'm Dami. Talk to me when you're ready.",
  idle: "Ready when you are.",
  "requesting-permission": "Waiting for microphone permission…",
  listening: "I'm listening… just speak naturally and I'll know when you're done.",
  transcribing: "Got it. Turning your voice into text…",
  researching: "I'm checking the law and the strongest available authorities…",
  answered: "I found something useful for you.",
  speaking: "I'm speaking…",
  error: "Something went wrong.",
};

const END_OF_SPEECH_SILENCE_MS = 2000;
const LISTENING_GRACE_MS = 650;
const SPEECH_CONFIRM_MS = 160;
const MIN_SPEECH_THRESHOLD = 0.032;
const NOISE_MULTIPLIER = 2.0;
const NOISE_MARGIN = 0.016;

export function useVoiceSession() {
  const [stage, setStage] = useState<VoiceStage>("welcome");
  const [question, setQuestion] = useState("");
  const [partial, setPartial] = useState("");
  const [answer, setAnswer] = useState<ResearchAnswer | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(0);
  const [session, setSession] = useState<ResearchSession | null>(null);

  const recorderRef = useRef<Recorder | null>(null);
  const speechRef = useRef<SpeechHandle | null>(null);
  const levelTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const cancelled = useRef(false);
  const autoStoppingRef = useRef(false);

  const runResearch = useServerFn(askDami);

  const stopLevelMeter = useCallback(() => {
    if (levelTimer.current) clearInterval(levelTimer.current);
    levelTimer.current = null;
    setLevel(0);
  }, []);

  useEffect(() => {
    const welcomeTimer = setTimeout(
      () => setStage((current) => (current === "welcome" ? "idle" : current)),
      2200,
    );
    return () => clearTimeout(welcomeTimer);
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
    stopLevelMeter();
    setStage("idle");
    setQuestion("");
    setPartial("");
    setAnswer(null);
    setError(null);
    setSession(null);
  }, [stopLevelMeter]);

  const stopSpeaking = useCallback(() => {
    speechRef.current?.stop();
    speechRef.current = null;
    setStage((current) => (current === "speaking" ? "answered" : current));
  }, []);

  const readAloud = useCallback(async (text: string) => {
    const settings = storage.getSettings();
    const language = getDamiLanguage(settings.speechLanguage);
    try {
      setStage("speaking");
      const handle = await speak(text, {
        accent: settings.voiceAccent || language.preferredAccent,
        gender: settings.voiceGender,
        language: language.ttsLanguage,
      });
      speechRef.current = handle;
      await handle.ended;
      speechRef.current = null;
      setStage("answered");
    } catch (err) {
      speechRef.current = null;
      setStage("answered");
      setError(err instanceof Error ? err.message : "I couldn't read that answer aloud.");
    }
  }, []);

  const ask = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length < 3) {
        setError("Give me a little more to work with.");
        setStage("error");
        return;
      }

      cancelled.current = false;
      setQuestion(trimmed);
      setError(null);
      setAnswer(null);
      setStage("researching");

      try {
        const result = await runResearch({ data: { question: trimmed } });
        if (cancelled.current) return;

        setAnswer(result);
        setStage("answered");

        const record: ResearchSession = {
          id: newId("ses"),
          conversationId: null,
          question: trimmed,
          answer: result,
          createdAt: new Date().toISOString(),
          saved: false,
        };
        storage.saveSession(record);
        setSession(record);

        if (storage.getSettings().speakAnswers && !result.insufficientEvidence) {
          await readAloud(result.answer);
        }
      } catch (err) {
        if (cancelled.current) return;
        console.error(err);
        setError(
          err instanceof Error && err.message
            ? err.message
            : "I couldn't complete that research. Please try again.",
        );
        setStage("error");
      }
    },
    [readAloud, runResearch],
  );

  const processRecording = useCallback(
    async (recorder: Recorder) => {
      stopLevelMeter();
      setStage("transcribing");

      const settings = storage.getSettings();
      const language = getDamiLanguage(settings.speechLanguage);
      try {
        const samples = await recorder.stop();
        const result = await transcribeSamples(samples, {
          language: language.code,
          codeSwitching: language.codeSwitched,
        });
        if (cancelled.current) return;
        setPartial("");
        setQuestion(result.text);
        await ask(result.text);
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

  const startListening = useCallback(async () => {
    cancelled.current = false;
    autoStoppingRef.current = false;
    setError(null);
    setAnswer(null);
    setPartial("");
    setQuestion("");
    setStage("requesting-permission");

    const settings = storage.getSettings();
    try {
      const recorder = await startRecording(settings.maxRecordingSeconds);
      recorderRef.current = recorder;
      setStage("listening");

      const startedAt = Date.now();
      let noiseFloor = 0.01;
      let speechDetected = false;
      let speechStartedAt: number | null = null;
      let silenceStartedAt: number | null = null;

      levelTimer.current = setInterval(() => {
        const currentRecorder = recorderRef.current;
        if (!currentRecorder || autoStoppingRef.current) return;

        const now = Date.now();
        const currentLevel = currentRecorder.level();
        setLevel(currentLevel);

        if (now - startedAt < LISTENING_GRACE_MS) {
          noiseFloor = Math.min(0.035, noiseFloor * 0.8 + currentLevel * 0.2);
          if (currentLevel >= 0.08) speechDetected = true;
          return;
        }

        const speechThreshold = Math.max(
          MIN_SPEECH_THRESHOLD,
          Math.min(0.12, noiseFloor * NOISE_MULTIPLIER + NOISE_MARGIN),
        );
        const quietThreshold = Math.max(MIN_SPEECH_THRESHOLD * 0.8, speechThreshold * 0.72);

        if (currentLevel >= speechThreshold) {
          if (speechStartedAt === null) speechStartedAt = now;
          if (now - speechStartedAt >= SPEECH_CONFIRM_MS) speechDetected = true;
          silenceStartedAt = null;
          return;
        }

        speechStartedAt = null;

        if (!speechDetected) {
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
        } else {
          silenceStartedAt = null;
        }
      }, 100);
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
    if (question) void ask(question);
    else setStage("idle");
  }, [ask, question]);

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
    isBusy: stage === "transcribing" || stage === "researching",
    startListening,
    stopListening,
    cancelListening,
    ask,
    retry,
    clear,
    readAloud,
    stopSpeaking,
    setQuestion,
  };
}

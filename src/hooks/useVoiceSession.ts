/**
 * The Dami voice session state machine.
 *
 *   idle → listening → transcribing → researching → answered → speaking
 *
 * Every failure path resolves to a friendly, Dami-specific message; raw
 * technical errors are logged, never shown. Nothing is ever faked: if a
 * service is unavailable the session reports it and stops.
 */

import { useServerFn } from "@tanstack/react-start";
import { useCallback, useEffect, useRef, useState } from "react";

import { askDami } from "@/lib/dami.functions";
import { newId, storage } from "@/lib/storage";
import { MicrophoneError, startRecording, transcribeSamples, type Recorder } from "@/services/sahara/stt.client";
import { speak, type SpeechHandle } from "@/services/sahara/tts.client";
import type { DamiState, ResearchAnswer, ResearchSession, VoiceStage } from "@/lib/types";

const STAGE_TO_ROBOT: Record<VoiceStage, DamiState> = {
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
  idle: "Ready when you are.",
  "requesting-permission": "Waiting for microphone permission…",
  listening: "Listening…",
  transcribing: "Turning your words into text…",
  researching: "Researching Ghanaian authorities…",
  answered: "Here's what Dami found.",
  speaking: "Dami is speaking…",
  error: "Something went wrong.",
};

export function useVoiceSession() {
  const [stage, setStage] = useState<VoiceStage>("idle");
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

  const runResearch = useServerFn(askDami);

  const stopLevelMeter = useCallback(() => {
    if (levelTimer.current) clearInterval(levelTimer.current);
    levelTimer.current = null;
    setLevel(0);
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
    try {
      setStage("speaking");
      const handle = await speak(text, {
        accent: settings.voiceAccent,
        gender: settings.voiceGender,
        language: settings.codeSwitching ? "en-GH" : "en",
      });
      speechRef.current = handle;
      await handle.ended;
      speechRef.current = null;
      setStage("answered");
    } catch (err) {
      speechRef.current = null;
      setStage("answered");
      setError(err instanceof Error ? err.message : "Dami couldn't read that answer aloud.");
    }
  }, []);

  const ask = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (trimmed.length < 3) {
        setError("Give Dami a little more to work with.");
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
            : "Dami couldn't complete that research. Please try again.",
        );
        setStage("error");
      }
    },
    [readAloud, runResearch],
  );

  const startListening = useCallback(async () => {
    cancelled.current = false;
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
      levelTimer.current = setInterval(() => setLevel(recorder.level()), 100);
    } catch (err) {
      recorderRef.current = null;
      stopLevelMeter();
      setError(
        err instanceof MicrophoneError
          ? err.message
          : "Dami couldn't start listening. You can type your question instead.",
      );
      setStage("error");
    }
  }, [stopLevelMeter]);

  const stopListening = useCallback(async () => {
    const recorder = recorderRef.current;
    if (!recorder) return;
    recorderRef.current = null;
    stopLevelMeter();
    setStage("transcribing");

    const settings = storage.getSettings();
    try {
      const samples = await recorder.stop();
      const result = await transcribeSamples(samples, {
        language: settings.codeSwitching ? "en-GH" : "en",
        codeSwitching: settings.codeSwitching,
      });
      if (cancelled.current) return;
      setPartial("");
      setQuestion(result.text);
      await ask(result.text);
    } catch (err) {
      console.error(err);
      setError(
        err instanceof Error && err.message
          ? err.message
          : "Dami couldn't turn that recording into text.",
      );
      setStage("error");
    }
  }, [ask, stopLevelMeter]);

  const cancelListening = useCallback(() => {
    cancelled.current = true;
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

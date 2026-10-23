"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import { resolveLang } from "@/lib/languages";
import { cleanTranscript, isSpeechFriendlyBrowser, micErrorHint } from "@/lib/transcript";

type RecognitionAlternative = { transcript: string; confidence?: number };
type RecognitionResult = { isFinal: boolean; length: number } & Record<number, RecognitionAlternative>;
type RecognitionEvent = { resultIndex: number; results: { length: number } & Record<number, RecognitionResult> };

/** Pick the alternative the engine is most confident about. */
export function bestAlternative(result: RecognitionResult): string {
  const count = Math.max(1, result.length ?? 1);
  let best = result[0]?.transcript ?? "";
  let bestScore = result[0]?.confidence ?? 0;
  for (let i = 1; i < count; i += 1) {
    const alternative = result[i];
    if (!alternative) continue;
    const score = alternative.confidence ?? 0;
    if (score > bestScore) {
      best = alternative.transcript;
      bestScore = score;
    }
  }
  return best;
}

type RecognitionLike = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  maxAlternatives: number;
  start: () => void;
  stop: () => void;
  abort: () => void;
  onresult: ((event: RecognitionEvent) => void) | null;
  onerror: ((event: { error?: string }) => void) | null;
  onend: (() => void) | null;
};

type RecognitionCtor = new () => RecognitionLike;

function getRecognitionCtor(): RecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: RecognitionCtor;
    webkitSpeechRecognition?: RecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

export type VoicePrefs = {
  /** 0 – 1, multiplied into the Web Audio gain stage. */
  volume: number;
  /** 0.7 – 1.2 speaking rate. */
  speed: number;
  /** "auto" | polly voice id | `browser:<voiceURI>` */
  voiceId: string;
};

export const DEFAULT_PREFS: VoicePrefs = { volume: 1, speed: 0.9, voiceId: "auto" };
const PREFS_KEY = "careloop.voice.v1";

export function loadPrefs(): VoicePrefs {
  if (typeof window === "undefined") return DEFAULT_PREFS;
  try {
    const raw = window.localStorage.getItem(PREFS_KEY);
    if (!raw) return DEFAULT_PREFS;
    const parsed = JSON.parse(raw) as Partial<VoicePrefs>;
    return {
      volume: clamp(Number(parsed.volume ?? DEFAULT_PREFS.volume), 0, 1),
      speed: clamp(Number(parsed.speed ?? DEFAULT_PREFS.speed), 0.7, 1.2),
      voiceId: typeof parsed.voiceId === "string" ? parsed.voiceId : DEFAULT_PREFS.voiceId,
    };
  } catch {
    return DEFAULT_PREFS;
  }
}

const prefsListeners = new Set<() => void>();
let prefsCache: VoicePrefs | null = null;

function getPrefsSnapshot(): VoicePrefs {
  if (!prefsCache) prefsCache = loadPrefs();
  return prefsCache;
}

function getPrefsServerSnapshot(): VoicePrefs {
  return DEFAULT_PREFS;
}

function subscribePrefs(listener: () => void) {
  prefsListeners.add(listener);
  return () => {
    prefsListeners.delete(listener);
  };
}

function writePrefs(next: VoicePrefs) {
  prefsCache = next;
  try {
    window.localStorage.setItem(PREFS_KEY, JSON.stringify(next));
  } catch {
    /* storage unavailable — settings stay for this session only */
  }
  prefsListeners.forEach((listener) => listener());
}

let voicesCache: SpeechSynthesisVoice[] = [];
const EMPTY_VOICES: SpeechSynthesisVoice[] = [];
const voiceListeners = new Set<() => void>();

function subscribeVoices(listener: () => void) {
  voiceListeners.add(listener);
  if (typeof window === "undefined" || !("speechSynthesis" in window)) {
    return () => {
      voiceListeners.delete(listener);
    };
  }
  const sync = () => {
    voicesCache = window.speechSynthesis.getVoices();
    voiceListeners.forEach((fn) => fn());
  };
  voicesCache = window.speechSynthesis.getVoices();
  window.speechSynthesis.addEventListener("voiceschanged", sync);
  return () => {
    voiceListeners.delete(listener);
    window.speechSynthesis.removeEventListener("voiceschanged", sync);
  };
}

function getVoicesSnapshot() {
  return voicesCache;
}

function getVoicesServerSnapshot() {
  return EMPTY_VOICES;
}

function clamp(value: number, min: number, max: number) {
  if (!Number.isFinite(value)) return min;
  return Math.min(max, Math.max(min, value));
}

export function splitWords(text: string) {
  return text.match(/\S+/g) ?? [];
}

/** Lifts quiet words and tames peaks: gain 1.4 → compressor → speakers. */
type AudioGraph = { ctx: AudioContext; gain: GainNode };
let graph: AudioGraph | null = null;
let audioUnlocked = false;

function getAudioGraph(): AudioGraph | null {
  if (typeof window === "undefined") return null;
  if (graph) return graph;
  const Ctor =
    window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctor) return null;
  try {
    const ctx = new Ctor();
    const gain = ctx.createGain();
    gain.gain.value = 1.4;

    const compressor = ctx.createDynamicsCompressor();
    compressor.threshold.value = -24;
    compressor.knee.value = 30;
    compressor.ratio.value = 12;
    compressor.attack.value = 0.003;
    compressor.release.value = 0.25;

    gain.connect(compressor);
    compressor.connect(ctx.destination);
    graph = { ctx, gain };
    return graph;
  } catch {
    return null;
  }
}

/**
 * Browsers only allow audio to start from a user gesture. We build and resume
 * the AudioContext on the first click/keypress/touch so later replies — which
 * are triggered by code, not by a click — are audible instead of silently
 * dropped into a suspended graph.
 */
export function unlockAudio() {
  if (audioUnlocked) return;
  const audioGraph = getAudioGraph();
  if (!audioGraph) return;
  audioGraph.ctx.resume().catch(() => {});
  try {
    // A one-sample silent buffer satisfies stricter autoplay implementations.
    const buffer = audioGraph.ctx.createBuffer(1, 1, 22050);
    const source = audioGraph.ctx.createBufferSource();
    source.buffer = buffer;
    source.connect(audioGraph.ctx.destination);
    source.start(0);
  } catch {
    /* unlocking is best effort */
  }
  if (typeof window !== "undefined" && "speechSynthesis" in window) {
    // Priming speechSynthesis inside the gesture keeps the fallback voice working too.
    try {
      const primer = new SpeechSynthesisUtterance("");
      primer.volume = 0;
      window.speechSynthesis.speak(primer);
      window.speechSynthesis.cancel();
    } catch {
      /* ignore */
    }
  }
  audioUnlocked = true;
}

/**
 * Synthesised audio cache.
 *
 * The key ALWAYS includes the language, so switching language can never
 * replay audio recorded in the previous one. clearTtsCache() is called on
 * every language change as a second line of defence.
 */
const ttsCache = new Map<string, Blob>();
const TTS_CACHE_LIMIT = 24;

export function ttsCacheKey(lang: string, voiceId: string, rate: number, text: string) {
  return `${lang}|${voiceId}|${rate}|${text}`;
}

export function clearTtsCache() {
  ttsCache.clear();
}

/** Silence before a turn is finalised, so nobody gets cut off mid-sentence. */
const SILENCE_MS = 1200;
/** Quiet gap after the assistant speaks before the mic may open. */
const SPEECH_COOLDOWN_MS = 400;
/** How many times recognition may restart itself in one turn. */
const MAX_RESTARTS = 2;

const NATURAL_VOICE = /(google|natural|neural|online|enhanced|premium)/i;

/** Browser voices that can speak a language tag, best first. */
export function browserVoicesFor(voices: SpeechSynthesisVoice[], lang: string) {
  const wanted = lang.toLowerCase().replace("_", "-");
  const base = wanted.split("-")[0];
  const sameLocale = voices.filter((voice) => voice.lang.toLowerCase().replace("_", "-") === wanted);
  const sameLanguage = voices.filter(
    (voice) => voice.lang.toLowerCase().replace("_", "-").split("-")[0] === base && !sameLocale.includes(voice),
  );
  const rank = (list: SpeechSynthesisVoice[]) =>
    [...list].sort((a, b) => Number(NATURAL_VOICE.test(b.name)) - Number(NATURAL_VOICE.test(a.name)));
  return [...rank(sameLocale), ...rank(sameLanguage)];
}

/** Pick the clearest available browser voice for a language tag. */
export function pickBrowserVoice(voices: SpeechSynthesisVoice[], lang: string, preferredUri?: string) {
  if (preferredUri) {
    const exact = voices.find((voice) => voice.voiceURI === preferredUri);
    if (exact) return exact;
  }
  return browserVoicesFor(voices, lang)[0] ?? null;
}

/**
 * Voices arrive asynchronously in most browsers: getVoices() is empty on the
 * first call and fills in once "voiceschanged" fires. Always wait for it
 * before deciding that a language has no voice.
 */
export async function waitForVoices(timeoutMs = 2000): Promise<SpeechSynthesisVoice[]> {
  if (typeof window === "undefined" || !("speechSynthesis" in window)) return [];
  const existing = window.speechSynthesis.getVoices();
  if (existing.length > 0) return existing;

  return new Promise((resolve) => {
    let settled = false;
    const finish = () => {
      if (settled) return;
      settled = true;
      window.speechSynthesis.removeEventListener("voiceschanged", finish);
      window.clearTimeout(timer);
      resolve(window.speechSynthesis.getVoices());
    };
    const timer = window.setTimeout(finish, timeoutMs);
    window.speechSynthesis.addEventListener("voiceschanged", finish);
  });
}

export type SpokenState = { words: string[]; index: number } | null;

export type UseVoiceOptions = {
  /** The one shared language value, e.g. "hi-IN". */
  lang: string;
  onFinalTranscript: (text: string) => void;
  onError: (message: string) => void;
  /** Live transcript while speaking: committed words plus the current guess. */
  onInterim?: (final: string, interim: string) => void;
};

const subscribeToNothing = () => () => {};
const readSupport = () => Boolean(getRecognitionCtor());
const readServerSupport = () => true;

export function useVoice({ lang, onFinalTranscript, onError, onInterim }: UseVoiceOptions) {
  const browserSupport = useSyncExternalStore(subscribeToNothing, readSupport, readServerSupport);
  const [blocked, setBlocked] = useState(false);
  const supported = browserSupport && !blocked;
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState("");
  const [muted, setMuted] = useState(false);
  const prefs = useSyncExternalStore(subscribePrefs, getPrefsSnapshot, getPrefsServerSnapshot);
  const browserVoices = useSyncExternalStore(subscribeVoices, getVoicesSnapshot, getVoicesServerSnapshot);
  const [spoken, setSpoken] = useState<SpokenState>(null);
  /** True when no voice exists for the chosen language (text only). */
  const [noVoice, setNoVoice] = useState(false);

  /** Interim (grey) text, shown live in the chat box while speaking. */
  const [interimText, setInterimText] = useState("");
  /** Final (dark) text captured so far in this listening turn. */
  const [finalText, setFinalText] = useState("");
  /** 0..1 microphone level, drives the little bar meter. */
  const [micLevel, setMicLevel] = useState(0);
  /** Friendly hint shown under the chat box. */
  const [micHint, setMicHint] = useState<string | null>(null);
  /** Permission state so the UI can explain itself. */
  const [micPermission, setMicPermission] = useState<"unknown" | "granted" | "denied">("unknown");

  const recognitionRef = useRef<RecognitionLike | null>(null);
  const silenceTimerRef = useRef<number | null>(null);
  /** Guards against the engine delivering the same turn twice. */
  const turnDoneRef = useRef(false);
  const speechEndedAtRef = useRef(0);
  const meterStreamRef = useRef<MediaStream | null>(null);
  const meterFrameRef = useRef<number | null>(null);
  const meterCtxRef = useRef<AudioContext | null>(null);
  /**
   * The live language for recognition. `startListening` reads this instead of
   * the captured `lang` prop, so a caller that switches language and
   * immediately reopens the mic gets the NEW tag, not the one from the render
   * its callback was created in.
   */
  const activeLangRef = useRef(lang);
  const speakingRef = useRef(false);
  const retriesRef = useRef(0);
  const wantsListeningRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const frameRef = useRef<number | null>(null);
  const finalRef = useRef("");
  const mutedRef = useRef(false);
  const prefsRef = useRef(DEFAULT_PREFS);
  const handlersRef = useRef({ onFinalTranscript, onError, onInterim });

  useEffect(() => {
    handlersRef.current = { onFinalTranscript, onError, onInterim };
  }, [onFinalTranscript, onError, onInterim]);

  useEffect(() => {
    mutedRef.current = muted;
  }, [muted]);

  useEffect(() => {
    prefsRef.current = prefs;
    if (graph) graph.gain.gain.value = 1.4 * prefs.volume;
  }, [prefs]);

  const setPrefs = useCallback((update: Partial<VoicePrefs>) => {
    const current = getPrefsSnapshot();
    writePrefs({
      volume: clamp(update.volume ?? current.volume, 0, 1),
      speed: clamp(update.speed ?? current.speed, 0.7, 1.2),
      voiceId: update.voiceId ?? current.voiceId,
    });
  }, []);

  // ---------------------------------------------------------------- meter
  /** Stop the level meter and release the microphone stream. */
  const stopMeter = useCallback(() => {
    if (meterFrameRef.current !== null) {
      cancelAnimationFrame(meterFrameRef.current);
      meterFrameRef.current = null;
    }
    meterStreamRef.current?.getTracks().forEach((track) => track.stop());
    meterStreamRef.current = null;
    if (meterCtxRef.current) {
      meterCtxRef.current.close().catch(() => {});
      meterCtxRef.current = null;
    }
    setMicLevel(0);
  }, []);

  /** Live input level from an AnalyserNode, so the bars show real sound. */
  const startMeter = useCallback(async () => {
    if (typeof window === "undefined" || !navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      meterStreamRef.current = stream;

      const Ctor =
        window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      const ctx = new Ctor();
      meterCtxRef.current = ctx;
      const source = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      analyser.smoothingTimeConstant = 0.8;
      source.connect(analyser);

      const data = new Uint8Array(analyser.frequencyBinCount);
      const tick = () => {
        analyser.getByteTimeDomainData(data);
        let peak = 0;
        for (let i = 0; i < data.length; i += 1) {
          peak = Math.max(peak, Math.abs(data[i] - 128) / 128);
        }
        setMicLevel(Math.min(1, peak * 1.8));
        meterFrameRef.current = requestAnimationFrame(tick);
      };
      meterFrameRef.current = requestAnimationFrame(tick);
    } catch {
      /* the meter is a nicety; recognition still works without it */
    }
  }, []);

  /**
   * Ask for microphone permission up front, with the processing that makes
   * recognition accurate, then release the stream straight away so the
   * recognition engine can claim the device itself.
   */
  const requestMicPermission = useCallback(async (): Promise<boolean> => {
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      stream.getTracks().forEach((track) => track.stop());
      setMicPermission("granted");
      return true;
    } catch {
      setMicPermission("denied");
      setMicHint(micErrorHint("not-allowed"));
      handlersRef.current.onError(micErrorHint("not-allowed"));
      return false;
    }
  }, []);

  const clearSilenceTimer = useCallback(() => {
    if (silenceTimerRef.current !== null) {
      window.clearTimeout(silenceTimerRef.current);
      silenceTimerRef.current = null;
    }
  }, []);

  const stopListening = useCallback(() => {
    wantsListeningRef.current = false;
    retriesRef.current = 0;
    clearSilenceTimer();
    stopMeter();
    try {
      recognitionRef.current?.stop();
    } catch {
      /* recognition already stopped */
    }
    setListening(false);
    setInterimText("");
  }, [clearSilenceTimer, stopMeter]);

  /** Throw away anything captured in this turn. */
  const clearTranscript = useCallback(() => {
    turnDoneRef.current = true;
    finalRef.current = "";
    setFinalText("");
    setInterimText("");
    setMicHint(null);
  }, []);

  const startListening = useCallback(
    (options?: { retry?: boolean; lang?: string }) => {
      if (options?.lang) activeLangRef.current = resolveLang(options.lang).code;

      const Ctor = getRecognitionCtor();
      if (!Ctor) {
        setBlocked(true);
        const hint = isSpeechFriendlyBrowser(navigator.userAgent)
          ? micErrorHint("unknown")
          : "Please use Chrome or Edge for voice input. You can still type your message.";
        setMicHint(hint);
        handlersRef.current.onError(hint);
        return;
      }

      // Never open the microphone while CareLoop is talking, and leave a short
      // gap after it stops so the tail of the reply is not heard as speech.
      if (speakingRef.current) return;
      const sinceSpeech = Date.now() - speechEndedAtRef.current;
      if (sinceSpeech < SPEECH_COOLDOWN_MS) {
        // Wait out the quiet gap, then start with the SAME options: forcing
        // retry here would skip the fresh-turn reset below.
        const wait = SPEECH_COOLDOWN_MS - sinceSpeech;
        wantsListeningRef.current = true;
        window.setTimeout(() => {
          if (wantsListeningRef.current && !speakingRef.current) startListening(options);
        }, wait);
        return;
      }

      if (!options?.retry) {
        retriesRef.current = 0;
        finalRef.current = "";
        turnDoneRef.current = false;
        setFinalText("");
        setMicHint(null);
      }
      wantsListeningRef.current = true;

      // Detach the old instance first: aborting it would otherwise fire
      // onend/onerror and restart us in a loop.
      const previous = recognitionRef.current;
      if (previous) {
        previous.onresult = null;
        previous.onerror = null;
        previous.onend = null;
        try {
          previous.abort();
        } catch {
          /* nothing to abort */
        }
      }

      try {
        const recognition = new Ctor();
        recognition.lang = activeLangRef.current; // always the CURRENT language
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.maxAlternatives = 3;

        /** Finalise after a pause, rather than cutting the person off. */
        const scheduleFinalise = () => {
          clearSilenceTimer();
          silenceTimerRef.current = window.setTimeout(() => {
            wantsListeningRef.current = false;
            retriesRef.current = MAX_RESTARTS;
            try {
              recognition.stop();
            } catch {
              /* already stopped */
            }
          }, SILENCE_MS);
        };

        recognition.onresult = (event) => {
          let interim = "";
          for (let i = event.resultIndex; i < event.results.length; i += 1) {
            const result = event.results[i];
            const transcript = bestAlternative(result); // highest confidence
            if (result.isFinal) {
              // Tidy as we go so the editable text is never messy.
              finalRef.current = cleanTranscript(`${finalRef.current} ${transcript}`);
            } else {
              interim += transcript;
            }
          }
          setFinalText(finalRef.current);
          setInterimText(interim);
          handlersRef.current.onInterim?.(finalRef.current, interim);
          scheduleFinalise();
        };

        recognition.onerror = (event) => {
          const code = event.error ?? "unknown";
          setListening(false);
          clearSilenceTimer();

          // Transient glitches: restart quietly and keep what we already have.
          const recoverable = code === "network" || code === "audio-capture" || code === "aborted";
          if (recoverable && wantsListeningRef.current && retriesRef.current < MAX_RESTARTS) {
            retriesRef.current += 1;
            window.setTimeout(() => {
              if (wantsListeningRef.current && !speakingRef.current) startListening({ retry: true });
            }, 400);
            return;
          }

          wantsListeningRef.current = false;
          stopMeter();
          if (code !== "aborted" || retriesRef.current >= MAX_RESTARTS) {
            const hint = micErrorHint(code);
            setMicHint(hint);
            if (code === "not-allowed" || code === "service-not-allowed") setMicPermission("denied");
            handlersRef.current.onError(hint);
          }
        };

        recognition.onend = () => {
          setListening(false);
          clearSilenceTimer();
          setInterimText("");

          // A turn is delivered exactly once, however many times the engine
          // stops and starts underneath us.
          if (turnDoneRef.current) return;

          const captured = cleanTranscript(finalRef.current);

          // The engine often ends early with nothing heard. If the person has
          // not asked us to stop, restart and KEEP anything already captured.
          if (!captured && wantsListeningRef.current && retriesRef.current < MAX_RESTARTS && !speakingRef.current) {
            retriesRef.current += 1;
            window.setTimeout(() => {
              if (wantsListeningRef.current && !turnDoneRef.current && !speakingRef.current) {
                startListening({ retry: true });
              }
            }, 250);
            return;
          }

          turnDoneRef.current = true;
          wantsListeningRef.current = false;
          retriesRef.current = 0;
          stopMeter();

          if (captured) {
            setFinalText(captured);
            handlersRef.current.onFinalTranscript(captured);
          } else {
            setMicHint(micErrorHint("no-speech"));
          }
        };

        recognitionRef.current = recognition;
        recognition.start();
        setListening(true);
        setInterimText("");
        void startMeter();
      } catch {
        setListening(false);
        stopMeter();
        const hint = micErrorHint("unknown");
        setMicHint(hint);
        handlersRef.current.onError(hint);
      }
    },
    [clearSilenceTimer, startMeter, stopMeter],
  );

  /** Ask permission (first time) and then begin listening. */
  const beginListening = useCallback(async () => {
    setMicHint(null);
    const allowed = await requestMicPermission();
    if (!allowed) return false;
    startListening();
    return true;
  }, [requestMicPermission, startListening]);

  /**
   * The language is one shared value: when it changes we restart recognition
   * cleanly on the new tag.
   *
   * Stopping speech and clearing the old voice/audio is deliberately NOT done
   * here — applyLanguage() does it *before* changing the language and then
   * speaks the new greeting. Cancelling here would race with, and silence,
   * that new greeting.
   */
  const langRef = useRef(lang);
  useEffect(() => {
    activeLangRef.current = resolveLang(lang).code;
    if (langRef.current === lang) return;
    const wasListening = wantsListeningRef.current || listening;
    langRef.current = lang;

    try {
      recognitionRef.current?.abort();
    } catch {
      /* nothing to abort */
    }
    wantsListeningRef.current = false;
    retriesRef.current = 0;

    if (wasListening) {
      const timer = window.setTimeout(() => startListening(), 150);
      return () => window.clearTimeout(timer);
    }
  }, [lang, listening, startListening]);

  /** Forget a voice that was picked for a different language. */
  const resetVoiceChoice = useCallback(() => {
    const current = getPrefsSnapshot();
    if (current.voiceId !== "auto") writePrefs({ ...current, voiceId: "auto" });
    clearTtsCache();
  }, []);

  /** Re-read the browser voice list, waiting for voiceschanged if needed. */
  const refreshBrowserVoices = useCallback(async () => {
    const voices = await waitForVoices();
    voicesCache = voices;
    voiceListeners.forEach((listener) => listener());
    return voices;
  }, []);

  const stopSpeaking = useCallback(() => {
    speakingRef.current = false;
    speechEndedAtRef.current = Date.now();
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.src = "";
      audioRef.current = null;
    }
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      window.speechSynthesis.cancel();
    }
    setSpoken(null);
  }, []);

  /** Play Polly audio through gain + compressor and follow it word by word. */
  const playAudio = useCallback(async (blob: Blob, words: string[]) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    audio.preload = "auto";
    audio.volume = 1.0;
    audio.crossOrigin = "anonymous";
    audioRef.current = audio;

    const audioGraph = getAudioGraph();
    let sourceNode: MediaElementAudioSourceNode | null = null;
    if (audioGraph) {
      try {
        if (audioGraph.ctx.state === "suspended") await audioGraph.ctx.resume();
        // Only route through Web Audio once the context is really running,
        // otherwise the element would be captured into a silent graph.
        if (audioGraph.ctx.state === "running") {
          audioGraph.gain.gain.value = 1.4 * prefsRef.current.volume;
          sourceNode = audioGraph.ctx.createMediaElementSource(audio);
          sourceNode.connect(audioGraph.gain);
        } else {
          audio.volume = Math.max(0.1, prefsRef.current.volume);
        }
      } catch {
        /* no Web Audio routing — the element still plays at full volume */
        sourceNode = null;
      }
    } else {
      audio.volume = Math.max(0.1, prefsRef.current.volume);
    }

    const weights = words.map((word) => word.length + 1);
    const total = weights.reduce((a, b) => a + b, 0) || 1;
    const cumulative: number[] = [];
    weights.reduce((acc, weight) => {
      const next = acc + weight;
      cumulative.push(next);
      return next;
    }, 0);

    const track = () => {
      const current = audioRef.current;
      if (!current) return;
      const duration = Number.isFinite(current.duration) && current.duration > 0 ? current.duration : 0;
      if (duration > 0) {
        const progress = current.currentTime / duration;
        const target = progress * total;
        let index = cumulative.findIndex((value) => value > target);
        if (index < 0) index = words.length - 1;
        setSpoken({ words, index });
      }
      frameRef.current = requestAnimationFrame(track);
    };

    let played = false;
    await new Promise<void>((resolve) => {
      let settled = false;
      // Watchdog: if the element never reports ended/error we must not hang
      // the state machine in "speaking" forever.
      let watchdog = window.setTimeout(() => finish(), 20000);
      const finish = () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(watchdog);
        resolve();
      };
      audio.onended = finish;
      audio.onerror = finish;
      audio.onloadedmetadata = () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          window.clearTimeout(watchdog);
          watchdog = window.setTimeout(finish, audio.duration * 1000 + 4000);
        }
      };
      audio
        .play()
        .then(() => {
          played = true;
          frameRef.current = requestAnimationFrame(track);
        })
        .catch(() => finish());
    });

    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    try {
      sourceNode?.disconnect();
    } catch {
      /* already disconnected */
    }
    URL.revokeObjectURL(url);
    audioRef.current = null;
    return played;
  }, []);

  const speakWithBrowser = useCallback(
    async (text: string, words: string[], speakLang: string): Promise<"spoken" | "no-voice"> => {
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return "no-voice";

      // Voices load asynchronously — never decide "no voice" before they arrive.
      const available = await waitForVoices();
      const { volume, speed, voiceId } = prefsRef.current;
      const preferredUri = voiceId.startsWith("browser:") ? voiceId.slice(8) : undefined;
      const chosen = pickBrowserVoice(available, speakLang, preferredUri);

      if (!chosen) {
        // Nothing installed for this language: subtitles only.
        return "no-voice";
      }

      return new Promise<"spoken" | "no-voice">((resolve) => {
        try {
          const utterance = new SpeechSynthesisUtterance(text);
          utterance.lang = speakLang;
          utterance.volume = Math.max(0.1, volume); // loud by default
          utterance.rate = clamp(speed, 0.7, 1.2);
          utterance.pitch = 1;
          utterance.voice = chosen;

          // Boundary events give us real word timing for the subtitles.
          utterance.onboundary = (event) => {
            const charIndex = event.charIndex ?? 0;
            let consumed = 0;
            let index = 0;
            for (let i = 0; i < words.length; i += 1) {
              consumed = text.indexOf(words[i], consumed);
              if (consumed > charIndex) break;
              index = i;
              consumed += words[i].length;
            }
            setSpoken({ words, index });
          };
          let settled = false;
          const finish = () => {
            if (settled) return;
            settled = true;
            window.clearTimeout(watchdog);
            window.clearInterval(keepAlive);
            resolve("spoken");
          };
          // Roughly 12 characters per second, plus headroom.
          const estimate = Math.min(60000, 4000 + (text.length / 12) * 1000 * (1 / utterance.rate));
          const watchdog = window.setTimeout(() => {
            try {
              window.speechSynthesis.cancel();
            } catch {
              /* ignore */
            }
            finish();
          }, estimate);
          // Chrome pauses long utterances after ~15s unless nudged.
          const keepAlive = window.setInterval(() => {
            if (!window.speechSynthesis.speaking) {
              finish();
              return;
            }
            window.speechSynthesis.pause();
            window.speechSynthesis.resume();
          }, 10000);

          utterance.onend = finish;
          utterance.onerror = finish;

          window.speechSynthesis.cancel();
          window.speechSynthesis.speak(utterance);
        } catch {
          resolve("no-voice");
        }
      });
    },
    [],
  );

  const speak = useCallback(
    async (text: string, language: string, options?: { force?: boolean }) => {
      if ((mutedRef.current && !options?.force) || !text.trim()) return;
      stopSpeaking();

      // The microphone must be closed for the whole time we are talking.
      speakingRef.current = true;
      wantsListeningRef.current = false;
      try {
        recognitionRef.current?.abort();
      } catch {
        /* nothing to abort */
      }

      const words = splitWords(text);
      setSpoken({ words, index: 0 });

      const { voiceId, speed } = prefsRef.current;
      // "browser:<uri>" means the person explicitly chose a browser voice.
      const useBrowserVoice = voiceId.startsWith("browser:");
      const speakLang = resolveLang(language || lang).code;
      setNoVoice(false);

      const cacheKey = ttsCacheKey(speakLang, voiceId || "auto", speed, text);

      try {
        if (!useBrowserVoice) {
          const cached = ttsCache.get(cacheKey);
          if (cached) {
            const played = await playAudio(cached, words);
            if (played) {
              setSpoken(null);
              return;
            }
          }

          const response = await fetch("/tts", {
            method: "POST",
            headers: { "content-type": "application/json" },
            // The full language tag goes to Polly unchanged.
            body: JSON.stringify({
              text,
              lang: speakLang,
              voice: voiceId && voiceId !== "auto" ? voiceId : undefined,
              rate: speed,
            }),
          });

          const contentType = response.headers.get("content-type") ?? "";
          if (response.ok && contentType.includes("audio")) {
            const blob = await response.blob();
            // Key includes the language, so this can never be reused for another.
            if (ttsCache.size >= TTS_CACHE_LIMIT) ttsCache.clear();
            ttsCache.set(cacheKey, blob);
            const played = await playAudio(blob, words);
            if (played) {
              setSpoken(null);
              return;
            }
            // Autoplay was refused — fall through to the browser voice.
          }
          // Otherwise Polly cannot speak this language (Tamil/Telugu, no
          // credentials, or a failure) and the browser takes over.
        }
      } catch {
        /* fall through to the browser voice */
      }

      const outcome = await speakWithBrowser(text, words, speakLang);
      if (outcome === "no-voice") {
        // Subtitles stay on screen; the UI shows a short explanation.
        setNoVoice(true);
        await new Promise((resolve) => window.setTimeout(resolve, Math.min(6000, 1200 + text.length * 45)));
      }
      setSpoken(null);
    },
    [lang, playAudio, speakWithBrowser, stopSpeaking],
  );

  /** Public wrapper that guarantees the speaking flag is always cleared. */
  const speakSafely = useCallback(
    async (text: string, language: string, options?: { force?: boolean }) => {
      try {
        await speak(text, language, options);
      } catch (error) {
        console.warn("speech failed, continuing silently", error);
      } finally {
        speakingRef.current = false;
        speechEndedAtRef.current = Date.now();
        setSpoken(null);
      }
    },
    [speak],
  );

  useEffect(
    () => () => {
      try {
        recognitionRef.current?.abort();
      } catch {
        /* ignore */
      }
      if (frameRef.current !== null) cancelAnimationFrame(frameRef.current);
      if (meterFrameRef.current !== null) cancelAnimationFrame(meterFrameRef.current);
      meterStreamRef.current?.getTracks().forEach((track) => track.stop());
      if (typeof window !== "undefined" && "speechSynthesis" in window) window.speechSynthesis.cancel();
    },
    [],
  );

  return useMemo(
    () => ({
      supported,
      listening,
      interim,
      muted,
      setMuted,
      prefs,
      setPrefs,
      browserVoices,
      spoken,
      noVoice,
      interimText,
      finalText,
      micLevel,
      micHint,
      micPermission,
      setMicHint,
      clearTranscript,
      beginListening,
      startListening,
      stopListening,
      speak: speakSafely,
      stopSpeaking,
      unlockAudio,
      resetVoiceChoice,
      refreshBrowserVoices,
    }),
    [
      supported,
      listening,
      interim,
      muted,
      prefs,
      setPrefs,
      browserVoices,
      spoken,
      noVoice,
      interimText,
      finalText,
      micLevel,
      micHint,
      micPermission,
      clearTranscript,
      beginListening,
      startListening,
      stopListening,
      speakSafely,
      stopSpeaking,
      resetVoiceChoice,
      refreshBrowserVoices,
    ],
  );
}

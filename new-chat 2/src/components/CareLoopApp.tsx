"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Conversation from "./Conversation";
import Dashboard from "./Dashboard";
import HeroCard from "./HeroCard";
import TopBar from "./TopBar";
import { clearTtsCache, useVoice } from "@/hooks/useVoice";
import { isSpeechFriendlyBrowser } from "@/lib/transcript";
import { ui } from "@/lib/i18n";
import { stringsFor } from "@/lib/agent";
import { DEFAULT_LANG, LANG_STORAGE_KEY, resolveLang } from "@/lib/languages";
import type { ChatMessage, DashboardData, VoiceState } from "@/lib/types";

/** What each suggestion chip actually means, independent of language. */
const SUGGESTION_UTTERANCES = [
  "I took my medicine",
  "How was my week?",
  "Alert my family",
] as const;

const DEMO_SCRIPT = [
  "I took my Metformin 500mg this morning",
  "What medicines do I have today?",
  "I had breakfast but I skipped lunch",
  "I am feeling a little lonely today",
  "I drank two glasses of water",
  "I have a doctor visit on Friday",
  "Is anything wrong with my routine?",
  "How was my week?",
];

let messageCounter = 0;
const nextId = () => {
  messageCounter += 1;
  return `m${messageCounter}-${Date.now()}`;
};

/** Verified Polly voices for a language (empty when Polly cannot speak it). */
async function loadPollyVoices(lang: string): Promise<{ id: string; label: string }[]> {
  try {
    const response = await fetch(`/tts/voices?lang=${encodeURIComponent(lang)}`, { cache: "no-store" });
    if (!response.ok) return [];
    const payload = (await response.json()) as { voices?: { id: string; label: string }[] };
    return payload.voices ?? [];
  } catch {
    return [];
  }
}

/** Remembered language, read before the first paint on the client. */
function storedLang(): string {
  if (typeof window === "undefined") return DEFAULT_LANG;
  try {
    return resolveLang(window.localStorage.getItem(LANG_STORAGE_KEY) ?? DEFAULT_LANG).code;
  } catch {
    return DEFAULT_LANG;
  }
}

export default function CareLoopApp({ initialDashboard }: { initialDashboard: DashboardData | null }) {
  /**
   * THE single shared language value (a full tag such as "hi-IN").
   * It drives the UI, the mic, every /api/chat call and every /tts call.
   */
  const [lang, setLang] = useState<string>(DEFAULT_LANG);
  const [state, setState] = useState<VoiceState>("idle");
  // Starts empty; the greeting is produced by applyLanguage() so it is always
  // in the language that is selected right now, never the one at page load.
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState("");
  const [typed, setTyped] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [dashboard, setDashboard] = useState<DashboardData | null>(initialDashboard);
  const [demoRunning, setDemoRunning] = useState(false);

  const [pollyVoices, setPollyVoices] = useState<{ id: string; label: string }[]>([]);
  const [interimText, setInterimText] = useState("");
  const [autoSend, setAutoSend] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(true);

  const autoSendRef = useRef(true);
  const sendMessageRef = useRef<((text: string, displayAs?: string) => Promise<void>) | null>(null);

  const labels = ui(lang);
  const language = resolveLang(lang);
  const busyRef = useRef(false);

  /**
   * The live language, readable from inside callbacks and async work without
   * capturing a stale value. `lang` state drives rendering; this ref is what
   * long-running code (a reply arriving, a queued utterance) must consult.
   */
  const currentLangRef = useRef(lang);
  useEffect(() => {
    currentLangRef.current = lang;
  }, [lang]);

  useEffect(() => {
    autoSendRef.current = autoSend;
  }, [autoSend]);

  /**
   * Bumped by every language change. Long-running work (a demo run, an
   * in-flight reply) captures the value it started with and stops as soon as
   * it no longer matches, so nothing from the previous language can arrive
   * late and speak or render in the wrong language.
   */
  const langGenerationRef = useRef(0);
  const inFlightRef = useRef<AbortController | null>(null);

  /** Interim words stream straight into the chat box as the person talks. */
  const handleInterim = useCallback((final: string, interim: string) => {
    setTyped(final);
    setInterimText(interim);
  }, []);

  const handleFinalTranscript = useCallback((text: string) => {
    setTyped(text);
    setInterimText("");
    setState("idle");
    // Auto-send is a ref so this callback never goes stale.
    if (autoSendRef.current) {
      window.setTimeout(() => void sendMessageRef.current?.(text), 120);
    }
  }, []);

  const handleVoiceError = useCallback((message: string) => {
    setNotice(message);
    setState("idle");
  }, []);

  const voice = useVoice({
    lang,
    onFinalTranscript: handleFinalTranscript,
    onError: handleVoiceError,
    onInterim: handleInterim,
  });

  // The Web Speech API is only dependable on Chrome and Edge.
  useEffect(() => {
    setSpeechSupported(isSpeechFriendlyBrowser(navigator.userAgent) && voice.supported);
  }, [voice.supported]);

  const refreshDashboard = useCallback(async () => {
    try {
      const response = await fetch("/api/dashboard", { cache: "no-store" });
      if (!response.ok) return;
      const payload = (await response.json()) as { data?: DashboardData };
      if (payload.data) setDashboard(payload.data);
    } catch {
      /* dashboard stays on last known values */
    }
  }, []);

  const sendMessage = useCallback(
    async (text: string, displayAs?: string) => {
      const trimmed = text.trim();
      if (!trimmed || busyRef.current) return;
      voice.unlockAudio();

      busyRef.current = true;
      setNotice(null);
      setDraft("");
      setTyped("");
      setInterimText("");
      voice.stopListening();
      voice.stopSpeaking();
      setMessages((current) => [...current, { id: nextId(), role: "user", content: displayAs ?? trimmed }]);
      setState("thinking");

      const controller = new AbortController();
      inFlightRef.current = controller;
      const timeout = window.setTimeout(() => controller.abort(), 15000);

      // Read the language at the moment of use, not from a captured constant.
      const requestLang = currentLangRef.current;
      const generation = langGenerationRef.current;

      try {
        const response = await fetch("/api/chat", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text: trimmed, lang: requestLang }),
          signal: controller.signal,
        });

        if (!response.ok) throw new Error(`chat failed with ${response.status}`);
        const payload = (await response.json()) as {
          reply: string;
          toolCalls?: { name: string; status: string; summary?: string }[];
        };

        // If the language changed while this was in flight, the answer belongs
        // to the previous language: drop it rather than show or speak it.
        if (langGenerationRef.current !== generation) return;

        setMessages((current) => [
          ...current,
          { id: nextId(), role: "assistant", content: payload.reply, toolCalls: payload.toolCalls },
        ]);

        await refreshDashboard();

        if (langGenerationRef.current !== generation) return;
        setState("speaking");
        await voice.speak(payload.reply, requestLang);
      } catch {
        // A language switch aborted this on purpose: stay quiet.
        if (langGenerationRef.current !== generation) return;
        // Spoken in whatever language is current right now.
        const trouble = stringsFor(currentLangRef.current).trouble;
        setNotice(trouble);
        setMessages((current) => [...current, { id: nextId(), role: "assistant", content: trouble }]);
      } finally {
        window.clearTimeout(timeout);
        if (inFlightRef.current === controller) inFlightRef.current = null;
        if (langGenerationRef.current === generation) {
          setState("idle");
          busyRef.current = false;
        }
      }
    },
    [refreshDashboard, voice],
  );

  useEffect(() => {
    sendMessageRef.current = sendMessage;
  }, [sendMessage]);

  /** Mic button in the chat box: tap to start, tap to stop. */
  const handleComposerMic = useCallback(() => {
    voice.unlockAudio();
    if (voice.listening) {
      voice.stopListening();
      setState("idle");
      return;
    }
    if (state === "thinking") return;
    // Stop any reply first, then listen (the hook waits out the cooldown).
    voice.stopSpeaking();
    setState("listening");
    void voice.beginListening().then((started) => {
      if (!started) setState("idle");
    });
  }, [state, voice]);

  const handleComposerClear = useCallback(() => {
    setTyped("");
    setInterimText("");
    voice.clearTranscript();
    if (voice.listening) voice.stopListening();
  }, [voice]);

  const handleMicToggle = useCallback(() => {
    setNotice(null);
    voice.unlockAudio();

    if (voice.listening) {
      voice.stopListening();
      setState("idle");
      return;
    }

    // Never open the microphone mid-reply: stop the voice, then listen.
    if (state === "speaking") {
      voice.stopSpeaking();
      setState("idle");
      window.setTimeout(() => {
        voice.startListening();
        setState("listening");
      }, 120);
      return;
    }

    if (state === "thinking") return;

    voice.startListening();
    setState("listening");
  }, [state, voice]);

  const handleStop = useCallback(() => {
    voice.stopListening();
    voice.stopSpeaking();
    setState("idle");
  }, [voice]);

  const handleRerecord = useCallback(() => {
    setDraft("");
    setNotice(null);
    voice.unlockAudio();
    voice.stopSpeaking();
    window.setTimeout(() => {
      voice.startListening();
      setState("listening");
    }, 80);
  }, [voice]);

  const handleMuteToggle = useCallback(() => {
    voice.setMuted((current) => {
      if (!current) voice.stopSpeaking();
      return !current;
    });
  }, [voice]);

  const handleTestVoice = useCallback(() => {
    voice.unlockAudio();
    const live = currentLangRef.current;
    void voice.speak(ui(live).testPhrase, live, { force: true });
  }, [voice]);

  const runDemo = useCallback(async () => {
    if (demoRunning) return;
    setDemoRunning(true);
    // Stop immediately if the language changes partway through, so the demo
    // cannot keep talking in the language it started in.
    const generation = langGenerationRef.current;
    try {
      for (const line of DEMO_SCRIPT) {
        if (langGenerationRef.current !== generation) return;
        await sendMessage(line);
        await new Promise((resolve) => setTimeout(resolve, 500));
      }
    } finally {
      if (langGenerationRef.current === generation) setDemoRunning(false);
    }
  }, [demoRunning, sendMessage]);

  /**
   * The ONE place a language change happens.
   *
   * Everything that could still be holding the previous language is reset
   * here: audio, speech, the microphone, the voice list, the conversation and
   * the greeting. Static text re-renders automatically because every label is
   * read from `ui(lang)` during render rather than captured at load time.
   */
  const applyLanguage = useCallback(
    async (next: string, options?: { speak?: boolean; initial?: boolean }) => {
      const resolved = resolveLang(next).code;
      const strings = ui(resolved);
      const generation = langGenerationRef.current + 1;

      // 1. Remember the choice.
      try {
        window.localStorage.setItem(LANG_STORAGE_KEY, resolved);
      } catch {
        /* storage unavailable — the choice lasts for this session */
      }

      // 2. Abandon anything still running under the previous language: a demo
      //    loop, an in-flight reply, audio already synthesised for it.
      langGenerationRef.current = generation;
      inFlightRef.current?.abort();
      inFlightRef.current = null;
      setDemoRunning(false);

      // Remember whether the mic was open so it can be reopened on the new tag.
      const wasListening = voice.listening;
      voice.stopSpeaking();
      voice.stopListening();
      clearTtsCache();

      // 3. Point every live surface at the new language.
      currentLangRef.current = resolved;
      setLang(resolved);
      setNotice(null);
      setDraft("");
      setTyped("");
      setInterimText("");
      voice.clearTranscript();
      busyRef.current = false;
      setState("idle");

      // 4. Forget a voice chosen for the old language.
      voice.resetVoiceChoice();

      // 5. Fresh conversation with a greeting in the new language: nothing
      //    from the previous language is left on screen.
      setMessages([{ id: nextId(), role: "assistant", content: strings.greeting }]);

      // 6. Reload the voice list for this language and pick the best match.
      const voices = await loadPollyVoices(resolved);
      setPollyVoices(voices);
      await voice.refreshBrowserVoices();

      // 7. Say the greeting in the new language.
      if (options?.speak !== false && langGenerationRef.current === generation) {
        await voice.speak(strings.greeting, resolved);
      }

      // 8. Reopen the microphone on the new tag if it had been listening.
      if (wasListening && langGenerationRef.current === generation) {
        // Pass the tag explicitly so recognition.lang is the new language.
        voice.startListening({ lang: resolved });
        setState("listening");
      }
    },
    [voice],
  );

  // Restore the saved language once, on the client, through the same path.
  const bootstrapped = useRef(false);
  useEffect(() => {
    if (bootstrapped.current) return;
    bootstrapped.current = true;
    // No speech on first load: browsers block audio before a user gesture.
    void applyLanguage(storedLang(), { speak: false, initial: true });
  }, [applyLanguage]);

  const changeLanguage = useCallback(
    (next: string) => {
      void applyLanguage(next);
    },
    [applyLanguage],
  );

  // Browsers block audio until the user interacts: unlock on the first gesture.
  useEffect(() => {
    const unlock = () => voice.unlockAudio();
    const events: (keyof WindowEventMap)[] = ["pointerdown", "keydown", "touchstart"];
    events.forEach((event) => window.addEventListener(event, unlock, { once: true, passive: true }));
    return () => events.forEach((event) => window.removeEventListener(event, unlock));
  }, [voice]);

  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(null), 6000);
    return () => clearTimeout(timer);
  }, [notice]);

  const captions = voice.listening ? voice.interim || "…" : draft;

  return (
    <main
      dir={language.rtl ? "rtl" : "ltr"}
      lang={lang}
      className="relative mx-auto w-full max-w-6xl px-4 py-6 sm:px-6 sm:py-10"
    >
      {/* Three very slow, very soft colour blobs behind everything. */}
      <div className="pointer-events-none fixed inset-0 -z-10 overflow-hidden" aria-hidden="true">
        <span className="blob blob-a -left-32 top-[-10%] h-[460px] w-[460px] bg-[#1F4D3A]/10" />
        <span className="blob blob-b right-[-12%] top-[18%] h-[520px] w-[520px] bg-[#E9DFC8]/50" />
        <span className="blob blob-c bottom-[-18%] left-[22%] h-[420px] w-[420px] bg-[#C9A227]/8" />
      </div>

      <TopBar
        language={lang}
        onLanguageChange={changeLanguage}
        onRunDemo={runDemo}
        demoRunning={demoRunning}
        labels={{ demo: labels.demo, demoMode: labels.demoMode }}
      />

      <div className="mt-6 grid gap-5 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-6">
        <div className="space-y-4">
          <HeroCard
            state={state}
            labels={labels}
            captions={captions}
            draft={draft}
            onDraftChange={setDraft}
            onSend={() => void sendMessage(draft)}
            onRerecord={handleRerecord}
            onMicToggle={handleMicToggle}
            onStop={handleStop}
            muted={voice.muted}
            onMuteToggle={handleMuteToggle}
            supported={voice.supported}
            notice={notice}
            language={lang}
            languageLabel={language.label}
            dir={language.rtl ? "rtl" : "ltr"}
            pollyVoices={pollyVoices}
            noVoice={voice.noVoice}
            noVoiceMessage={labels.noVoice}
            prefs={voice.prefs}
            onPrefsChange={voice.setPrefs}
            browserVoices={voice.browserVoices}
            onTestVoice={handleTestVoice}
            spoken={voice.spoken}
            audioLevel={voice.micLevel}
          />

          <div className="flex flex-wrap gap-2">
            {labels.suggestions.map((suggestion, index) => (
              <button
                key={suggestion}
                type="button"
                // The chip shows the translated label but sends a canonical
                // phrase, so routing never depends on translating the label.
                onClick={() => void sendMessage(SUGGESTION_UTTERANCES[index], suggestion)}
                disabled={state === "thinking"}
                className="animate-card-in rounded-full border border-forest/15 bg-white px-4 py-2 text-sm text-forest shadow-[0_8px_22px_-18px_rgba(31,77,58,0.8)] transition hover:border-forest/35 hover:bg-sand-light disabled:opacity-50"
              >
                {suggestion}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-5">
          <Conversation
            title={labels.conversation}
            messages={messages}
            busy={state === "thinking"}
            thinking={state === "thinking"}
            composer={{
              labels: {
                placeholder: labels.typePlaceholder,
                send: labels.send,
                clear: labels.clear,
                listen: labels.listen,
                stopListening: labels.stop,
                autoSend: labels.autoSend,
              },
              value: typed,
              onChange: (value) => {
                setTyped(value);
                setInterimText("");
              },
              interim: interimText,
              listening: voice.listening,
              micLevel: voice.micLevel,
              hint: voice.micHint,
              busy: state === "thinking",
              speechSupported,
              unsupportedMessage: labels.useChrome,
              autoSend,
              onAutoSendChange: setAutoSend,
              onMicToggle: handleComposerMic,
              onSend: () => void sendMessage(typed),
              onClear: handleComposerClear,
            }}
          />
          <Dashboard
            data={dashboard}
            labels={{
              dashboard: labels.dashboard,
              mood: labels.mood,
              adherence: labels.adherence,
              hydration: labels.hydration,
              hydrationGoal: labels.hydrationGoal,
              appointments: labels.appointments,
              noAppointments: labels.noAppointments,
              alertsFeed: labels.alertsFeed,
            }}
          />
        </div>
      </div>

      <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 text-xs text-charcoal-soft/60">
        <p>CareLoop · six MCP tools over one calm conversation.</p>
        <p>Demo data only — no real medical advice.</p>
      </footer>
    </main>
  );
}

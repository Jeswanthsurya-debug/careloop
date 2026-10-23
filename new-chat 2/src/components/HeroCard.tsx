"use client";

import Orb from "./Orb";
import VoiceSettings from "./VoiceSettings";
import type { VoicePrefs } from "@/hooks/useVoice";
import type { VoiceState } from "@/lib/types";

type Labels = {
  headline: string;
  subhead: string;
  states: Record<VoiceState, string>;
  listen: string;
  stop: string;
  mute: string;
  unmute: string;
  send: string;
  rerecord: string;
  captions: string;
  unsupported: string;
  typePlaceholder: string;
  autoVoice: string;
  subtitles: string;
  voiceSettings: string;
  volume: string;
  speed: string;
  voiceName: string;
  testVoice: string;
  browserVoice: string;
};

type Props = {
  state: VoiceState;
  languageLabel: string;
  dir: "ltr" | "rtl";
  pollyVoices: { id: string; label: string }[];
  noVoice: boolean;
  noVoiceMessage: string;
  audioLevel?: number;
  labels: Labels;
  captions: string;
  draft: string;
  onDraftChange: (value: string) => void;
  onSend: () => void;
  onRerecord: () => void;
  onMicToggle: () => void;
  onStop: () => void;
  muted: boolean;
  onMuteToggle: () => void;
  supported: boolean;
  notice: string | null;
  language: string;
  prefs: VoicePrefs;
  onPrefsChange: (update: Partial<VoicePrefs>) => void;
  browserVoices: { name: string; lang: string; voiceURI: string }[];
  onTestVoice: () => void;
  spoken: { words: string[]; index: number } | null;
};

function MicIcon({ active }: { active: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="30" height="30" aria-hidden="true" fill="none">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" opacity={active ? 1 : 0.92} />
      <path
        d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3"
        stroke="currentColor"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  );
}

export default function HeroCard(props: Props) {
  const { state, labels, captions, draft, muted, supported, notice } = props;
  const listening = state === "listening";
  const busy = state === "thinking";
  const micDisabled = !supported || busy;

  return (
    <section
      className="animate-card-in relative overflow-hidden rounded-[20px] border border-forest-deep/40 p-6 text-sand-light shadow-lift sm:p-9"
      style={{
        animationDelay: "60ms",
        background: "linear-gradient(160deg, #24573F 0%, #1F4D3A 46%, #163828 100%)",
      }}
    >
      <div
        className="pointer-events-none absolute -right-20 -top-24 h-64 w-64 rounded-full opacity-40 blur-3xl"
        style={{ background: "radial-gradient(circle, rgba(233,223,200,0.35), rgba(233,223,200,0) 70%)" }}
      />

      <div className="relative">
        <h1 className="font-display text-[clamp(1.9rem,4.4vw,2.9rem)] leading-[1.1] text-sand-light">
          {labels.headline}
        </h1>
        <p className="mt-3 max-w-md text-sm leading-relaxed text-sand/80 sm:text-base">{labels.subhead}</p>

        <div className="mt-8 flex flex-col items-center gap-6">
          <Orb state={state} level={props.audioLevel ?? 0} />

          <div className="relative grid place-items-center">
            {listening ? (
              <>
                <span className="mic-ring absolute h-24 w-24 rounded-full border border-sand/60" />
                <span
                  className="mic-ring absolute h-24 w-24 rounded-full border border-sand/40"
                  style={{ animationDelay: "1.25s" }}
                />
              </>
            ) : null}
            <button
              type="button"
              onClick={props.onMicToggle}
              disabled={micDisabled}
              aria-pressed={listening}
              aria-label={listening ? labels.stop : labels.listen}
              className={`relative grid h-20 w-20 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-45 ${
                listening
                  ? "bg-sand-light text-forest"
                  : "bg-sand/15 text-sand-light ring-1 ring-sand/40 hover:bg-sand/25"
              }`}
            >
              <MicIcon active={listening} />
            </button>
          </div>

          <span className="pill border-sand/30 bg-sand/10 text-sand-light/90">
            <span
              className={`mr-2 inline-block h-1.5 w-1.5 rounded-full align-middle ${
                state === "idle" ? "bg-sand/70" : "bg-gold"
              }`}
            />
            {labels.states[state]}
          </span>

          <div className="w-full rounded-2xl border border-sand/15 bg-forest-deep/35 p-4 text-center">
            <p className="text-[11px] uppercase tracking-[0.18em] text-sand/50">
              {props.spoken ? labels.subtitles : labels.captions} · {props.languageLabel}
            </p>
            {props.spoken ? (
              <p className="mt-2 min-h-[1.5rem] text-base leading-relaxed" aria-live="polite">
                {props.spoken.words.map((word, index) => (
                  <span
                    key={`${word}-${index}`}
                    className={
                      index === props.spoken?.index
                        ? "rounded-md bg-sand-light px-1 font-medium text-forest transition-colors"
                        : index < (props.spoken?.index ?? 0)
                          ? "text-sand-light/85 transition-colors"
                          : "text-sand/50 transition-colors"
                    }
                  >
                    {word}{" "}
                  </span>
                ))}
              </p>
            ) : (
              <p className="mt-2 min-h-[1.5rem] text-sm leading-relaxed text-sand-light/95" aria-live="polite">
                {captions || "…"}
              </p>
            )}
          </div>

          {draft ? (
            <div className="animate-fade-up w-full rounded-2xl border border-sand/20 bg-sand-light/95 p-3 text-charcoal">
              <label className="sr-only" htmlFor="draft">
                Edit your message before sending
              </label>
              <textarea
                id="draft"
                value={draft}
                rows={2}
                onChange={(event) => props.onDraftChange(event.target.value)}
                placeholder={labels.typePlaceholder}
                className="w-full resize-none rounded-xl border border-forest/10 bg-white px-3 py-2 text-sm text-charcoal outline-none"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={props.onSend}
                  className="rounded-full bg-forest px-4 py-2 text-sm font-medium text-sand-light transition hover:bg-forest-soft"
                >
                  {labels.send}
                </button>
                <button
                  type="button"
                  onClick={props.onRerecord}
                  disabled={!supported}
                  className="rounded-full border border-forest/25 px-4 py-2 text-sm font-medium text-forest transition hover:bg-forest/5 disabled:opacity-45"
                >
                  {labels.rerecord}
                </button>
              </div>
            </div>
          ) : null}

          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={props.onMuteToggle}
              aria-pressed={muted}
              className="rounded-full border border-sand/30 px-4 py-2 text-sm text-sand-light/90 transition hover:bg-sand/10"
            >
              {muted ? labels.unmute : labels.mute}
            </button>
            <button
              type="button"
              onClick={props.onStop}
              className="rounded-full border border-sand/30 px-4 py-2 text-sm text-sand-light/90 transition hover:bg-sand/10"
            >
              {labels.stop}
            </button>
            <VoiceSettings
              language={props.language}
              labels={{
                voiceSettings: labels.voiceSettings,
                volume: labels.volume,
                speed: labels.speed,
                voiceName: labels.voiceName,
                testVoice: labels.testVoice,
                browserVoice: labels.browserVoice,
                autoVoice: labels.autoVoice,
              }}
              pollyVoices={props.pollyVoices}
              prefs={props.prefs}
              onChange={props.onPrefsChange}
              browserVoices={props.browserVoices}
              onTest={props.onTestVoice}
            />
          </div>

          {!supported ? (
            <p className="rounded-2xl border border-gold/35 bg-gold/10 px-4 py-2 text-center text-xs text-sand-light/90">
              {labels.unsupported}
            </p>
          ) : null}

          {props.noVoice ? (
            <p className="animate-fade-up rounded-2xl border border-gold/35 bg-gold/10 px-4 py-2 text-center text-xs text-sand-light/90" role="status">
              {props.noVoiceMessage}
            </p>
          ) : null}

          {notice ? (
            <p className="animate-fade-up text-center text-xs text-sand/80" role="status">
              {notice}
            </p>
          ) : null}
        </div>
      </div>
    </section>
  );
}

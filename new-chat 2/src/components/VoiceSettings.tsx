"use client";

import { useEffect, useRef, useState } from "react";
import type { VoicePrefs } from "@/hooks/useVoice";

type Labels = {
  voiceSettings: string;
  volume: string;
  speed: string;
  voiceName: string;
  testVoice: string;
  browserVoice: string;
  autoVoice: string;
};

type Props = {
  language: string;
  /** Verified Polly voices for the selected language (may be empty). */
  pollyVoices: { id: string; label: string }[];
  labels: Labels;
  prefs: VoicePrefs;
  onChange: (update: Partial<VoicePrefs>) => void;
  browserVoices: { name: string; lang: string; voiceURI: string }[];
  onTest: () => void;
};

function SliderRow({
  id,
  label,
  value,
  min,
  max,
  step,
  display,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  display: string;
  onChange: (value: number) => void;
}) {
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <label htmlFor={id} className="text-xs font-medium text-charcoal">
          {label}
        </label>
        <span className="text-[11px] tabular-nums text-charcoal-soft/70">{display}</span>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        className="mt-1.5 h-1.5 w-full cursor-pointer appearance-none rounded-full bg-sand accent-forest"
      />
    </div>
  );
}

export default function VoiceSettings({
  language,
  pollyVoices,
  labels,
  prefs,
  onChange,
  browserVoices,
  onTest,
}: Props) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: MouseEvent) => {
      if (!wrapRef.current?.contains(event.target as Node)) setOpen(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  // Only voices that can actually speak the selected language are listed.
  const base = language.toLowerCase().split("-")[0];
  const matchingBrowserVoices = browserVoices.filter(
    (voice) => voice.lang.toLowerCase().replace("_", "-").split("-")[0] === base,
  );

  const pollyOptions = pollyVoices;
  const isKnownVoice =
    prefs.voiceId === "auto" ||
    pollyOptions.some((voice) => voice.id === prefs.voiceId) ||
    matchingBrowserVoices.some((voice) => `browser:${voice.voiceURI}` === prefs.voiceId);
  const selectedVoiceValue = isKnownVoice ? prefs.voiceId : "auto";

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-haspopup="dialog"
        className="inline-flex items-center gap-2 rounded-full border border-sand/30 px-4 py-2 text-sm text-sand-light/90 transition hover:bg-sand/10"
      >
        <svg viewBox="0 0 24 24" width="15" height="15" aria-hidden="true" fill="none">
          <path
            d="M4 14V10M8 17V7M12 20V4M16 17V7M20 14V10"
            stroke="currentColor"
            strokeWidth="1.8"
            strokeLinecap="round"
          />
        </svg>
        {labels.voiceSettings}
      </button>

      {open ? (
        <div
          role="dialog"
          aria-label={labels.voiceSettings}
          className="animate-fade-up absolute bottom-[calc(100%+0.6rem)] left-1/2 z-30 w-72 -translate-x-1/2 rounded-[20px] border border-forest/10 bg-white p-4 text-charcoal shadow-[0_26px_70px_-34px_rgba(31,77,58,0.6)]"
        >
          <div className="space-y-4">
            <SliderRow
              id="voice-volume"
              label={labels.volume}
              value={prefs.volume}
              min={0}
              max={1}
              step={0.05}
              display={`${Math.round(prefs.volume * 100)}%`}
              onChange={(value) => onChange({ volume: value })}
            />
            <SliderRow
              id="voice-speed"
              label={labels.speed}
              value={prefs.speed}
              min={0.7}
              max={1.2}
              step={0.05}
              display={`${prefs.speed.toFixed(2)}×`}
              onChange={(value) => onChange({ speed: value })}
            />

            <div>
              <label htmlFor="voice-pick" className="text-xs font-medium text-charcoal">
                {labels.voiceName}
              </label>
              <select
                id="voice-pick"
                value={selectedVoiceValue}
                onChange={(event) => onChange({ voiceId: event.target.value })}
                className="mt-1.5 w-full rounded-xl border border-forest/15 bg-cream px-3 py-2 text-sm text-charcoal"
              >
                <option value="auto">{labels.autoVoice}</option>
                {pollyOptions.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.label}
                  </option>
                ))}
                {matchingBrowserVoices.map((voice) => (
                  <option key={voice.voiceURI} value={`browser:${voice.voiceURI}`}>
                    {labels.browserVoice}: {voice.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              onClick={onTest}
              className="w-full rounded-full bg-forest px-4 py-2 text-sm font-medium text-sand-light transition hover:bg-forest-soft"
            >
              {labels.testVoice}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

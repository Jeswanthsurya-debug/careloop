"use client";

import { LANGUAGES } from "@/lib/i18n";

type Props = {
  language: string;
  onLanguageChange: (code: string) => void;
  onRunDemo: () => void;
  demoRunning: boolean;
  labels: { demo: string; demoMode: string };
};

function LeafMark() {
  return (
    <span className="grid h-10 w-10 place-items-center rounded-full bg-forest text-sand-light shadow-soft">
      <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" fill="none">
        <path
          d="M12 19c-4.2-2.6-6.5-5.2-6.5-8.1A3.9 3.9 0 0 1 12 8.4a3.9 3.9 0 0 1 6.5 2.5c0 2.9-2.3 5.5-6.5 8.1Z"
          fill="currentColor"
          opacity="0.95"
        />
        <path d="M12 8.4V19" stroke="#1F4D3A" strokeWidth="1.1" strokeLinecap="round" opacity="0.35" />
      </svg>
    </span>
  );
}

export default function TopBar({ language, onLanguageChange, onRunDemo, demoRunning, labels }: Props) {
  return (
    <header className="animate-card-in flex flex-wrap items-center gap-3 sm:gap-4">
      <div className="flex items-center gap-3">
        <LeafMark />
        <div className="leading-tight">
          <p className="font-display text-xl text-forest">CareLoop</p>
          <p className="text-[11px] uppercase tracking-[0.18em] text-charcoal-soft/70">Voice care companion</p>
        </div>
      </div>

      <span className="pill border-gold/40 bg-gold/10 text-[11px] font-medium text-[#8a6f14]">
        {labels.demoMode}
      </span>

      <div className="ml-auto flex items-center gap-2 sm:gap-3">
        <label className="relative">
          <span className="sr-only">Language</span>
          <select
            value={language}
            onChange={(event) => onLanguageChange(event.target.value)}
            className="appearance-none rounded-full border border-forest/15 bg-white px-4 py-2 pr-9 text-sm text-charcoal shadow-[0_6px_18px_-14px_rgba(31,77,58,0.6)] transition hover:border-forest/30"
          >
            {LANGUAGES.map((option) => (
              <option key={option.code} value={option.code}>
                {option.label}
              </option>
            ))}
          </select>
          <svg
            viewBox="0 0 20 20"
            className="pointer-events-none absolute right-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-forest/60"
            aria-hidden="true"
          >
            <path d="M5 8l5 5 5-5" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
          </svg>
        </label>

        <button
          type="button"
          onClick={onRunDemo}
          disabled={demoRunning}
          className="rounded-full border border-forest/25 px-4 py-2 text-sm font-medium text-forest transition hover:border-forest/50 hover:bg-forest/5 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {demoRunning ? "Running…" : labels.demo}
        </button>
      </div>
    </header>
  );
}

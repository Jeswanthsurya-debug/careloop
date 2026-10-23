"use client";

import { useEffect, useRef } from "react";

type Labels = {
  placeholder: string;
  send: string;
  clear: string;
  listen: string;
  stopListening: string;
  autoSend: string;
};

type Props = {
  labels: Labels;
  /** Text the person can edit (committed words). */
  value: string;
  onChange: (value: string) => void;
  /** Grey, still-being-guessed words shown after the committed text. */
  interim: string;
  listening: boolean;
  /** 0..1 live microphone level. */
  micLevel: number;
  /** Friendly error hint shown under the box. */
  hint: string | null;
  busy: boolean;
  speechSupported: boolean;
  unsupportedMessage: string;
  autoSend: boolean;
  onAutoSendChange: (value: boolean) => void;
  onMicToggle: () => void;
  onSend: () => void;
  onClear: () => void;
};

/** Thin animated bars showing that the microphone is hearing something. */
function LevelMeter({ level, active }: { level: number; active: boolean }) {
  const bars = [0.55, 0.85, 1, 0.75, 0.45];
  return (
    <span className="flex h-5 items-center gap-[3px]" aria-hidden="true">
      {bars.map((weight, index) => {
        const height = active ? Math.max(3, Math.min(18, level * 18 * weight + 3)) : 3;
        return (
          <span
            key={index}
            className="w-[3px] rounded-full bg-forest/70 transition-[height] duration-100 ease-out motion-reduce:transition-none"
            style={{ height: `${height}px` }}
          />
        );
      })}
    </span>
  );
}

function MicGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true" fill="none">
      <rect x="9" y="3" width="6" height="11" rx="3" fill="currentColor" />
      <path d="M5.5 11.5a6.5 6.5 0 0 0 13 0M12 18v3" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" />
    </svg>
  );
}

export default function ChatComposer(props: Props) {
  const { labels, value, interim, listening, busy } = props;
  const inputRef = useRef<HTMLTextAreaElement | null>(null);

  // Keep the caret at the end while dictation is adding words.
  useEffect(() => {
    if (!listening || !inputRef.current) return;
    const element = inputRef.current;
    element.scrollTop = element.scrollHeight;
  }, [value, interim, listening]);

  const canSend = !busy && value.trim().length > 0;

  return (
    <div className="mt-4 border-t border-forest/10 pt-4">
      {!props.speechSupported ? (
        <p className="mb-2 rounded-xl border border-gold/40 bg-gold/10 px-3 py-2 text-xs text-[#8a6f14]" role="status">
          {props.unsupportedMessage}
        </p>
      ) : null}

      <div
        className={`rounded-[20px] border bg-cream px-3 py-2.5 transition-colors ${
          listening ? "border-forest/40 ring-2 ring-forest/10" : "border-forest/15"
        }`}
      >
        <div className="flex items-start gap-2">
          <div className="relative min-w-0 flex-1">
            <label className="sr-only" htmlFor="typed-message">
              {labels.placeholder}
            </label>
            <textarea
              id="typed-message"
              ref={inputRef}
              rows={2}
              value={value}
              onChange={(event) => props.onChange(event.target.value)}
              onKeyDown={(event) => {
                // Enter sends; Shift+Enter makes a new line.
                if (event.key === "Enter" && !event.shiftKey) {
                  event.preventDefault();
                  if (canSend) props.onSend();
                }
              }}
              placeholder={labels.placeholder}
              className="w-full resize-none bg-transparent text-sm leading-relaxed text-charcoal outline-none placeholder:text-charcoal-soft/50"
            />

            {/* Interim words trail the editable text, in grey. */}
            {interim ? (
              <p className="pointer-events-none -mt-1 text-sm leading-relaxed text-charcoal-soft/55" aria-live="polite">
                {interim}
              </p>
            ) : null}
          </div>

          {listening ? <LevelMeter level={props.micLevel} active /> : null}
        </div>

        <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-forest/10 pt-2">
          <div className="relative">
            {listening ? (
              <span className="mic-ring pointer-events-none absolute inset-0 rounded-full border border-forest/50" />
            ) : null}
            <button
              type="button"
              onClick={props.onMicToggle}
              disabled={!props.speechSupported || busy}
              aria-pressed={listening}
              aria-label={listening ? labels.stopListening : labels.listen}
              className={`press relative grid h-9 w-9 place-items-center rounded-full transition disabled:cursor-not-allowed disabled:opacity-40 ${
                listening ? "bg-forest text-sand-light" : "bg-sand text-forest hover:bg-sand/70"
              }`}
            >
              <MicGlyph />
            </button>
          </div>

          <label className="flex cursor-pointer select-none items-center gap-2 text-xs text-charcoal-soft">
            <input
              type="checkbox"
              checked={props.autoSend}
              onChange={(event) => props.onAutoSendChange(event.target.checked)}
              className="h-3.5 w-3.5 accent-[#1F4D3A]"
            />
            {labels.autoSend}
          </label>

          <div className="ml-auto flex items-center gap-2">
            <button
              type="button"
              onClick={props.onClear}
              disabled={!value && !interim}
              className="press rounded-full border border-forest/20 px-3 py-1.5 text-xs font-medium text-forest transition hover:bg-forest/5 disabled:opacity-40"
            >
              {labels.clear}
            </button>
            <button
              type="button"
              onClick={props.onSend}
              disabled={!canSend}
              className="press rounded-full bg-forest px-4 py-1.5 text-sm font-medium text-sand-light transition hover:bg-forest-soft disabled:cursor-not-allowed disabled:opacity-40"
            >
              {labels.send}
            </button>
          </div>
        </div>
      </div>

      {props.hint ? (
        <p className="animate-fade-up mt-2 text-xs leading-relaxed text-[#8a6f14]" role="status">
          {props.hint}
        </p>
      ) : null}
    </div>
  );
}

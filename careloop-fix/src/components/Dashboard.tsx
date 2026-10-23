"use client";

import { useEffect, useRef, useState } from "react";
import type { DashboardData } from "@/lib/types";

type Labels = {
  dashboard: string;
  mood: string;
  adherence: string;
  hydration: string;
  hydrationGoal: string;
  appointments: string;
  noAppointments: string;
  alertsFeed: string;
};

function MoodChart({ points }: { points: { date: string; score: number }[] }) {
  const width = 320;
  const height = 110;
  const padding = 10;

  if (points.length === 0) {
    return <p className="mt-4 text-sm text-charcoal-soft/70">No mood entries yet.</p>;
  }

  const stepX = points.length > 1 ? (width - padding * 2) / (points.length - 1) : 0;
  const scaleY = (score: number) => {
    const clamped = Math.min(5, Math.max(1, score));
    return height - padding - ((clamped - 1) / 4) * (height - padding * 2);
  };

  const coords = points.map((point, index) => ({
    x: padding + index * stepX,
    y: scaleY(point.score),
    ...point,
  }));

  const line = coords.map((c, i) => `${i === 0 ? "M" : "L"}${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ");
  const area = `${line} L${coords[coords.length - 1].x.toFixed(1)} ${height - padding} L${coords[0].x.toFixed(
    1,
  )} ${height - padding} Z`;

  return (
    <svg
      viewBox={`0 0 ${width} ${height}`}
      className="mt-4 w-full"
      role="img"
      aria-label={`Mood trend across ${points.length} days`}
    >
      {[1, 3, 5].map((score) => (
        <line
          key={score}
          x1={padding}
          x2={width - padding}
          y1={scaleY(score)}
          y2={scaleY(score)}
          stroke="#1F4D3A"
          strokeOpacity="0.08"
          strokeWidth="1"
        />
      ))}
      <path d={area} fill="#1F4D3A" fillOpacity="0.06" />
      <path
        d={line}
        fill="none"
        stroke="#1F4D3A"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="animate-draw"
        style={{ ["--draw-length" as string]: `${Math.round(width * 1.6)}` }}
      />
      {coords.map((c) => (
        <circle key={c.date} cx={c.x} cy={c.y} r="2.6" fill="#FAF7F0" stroke="#1F4D3A" strokeWidth="1.3" />
      ))}
    </svg>
  );
}

/** Count a number up smoothly; honours prefers-reduced-motion. */
function useCountUp(target: number, duration = 1100) {
  const [shown, setShown] = useState(0);
  const frame = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reduce = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (reduce) {
      // Jump straight to the value on the next frame, not during the effect.
      frame.current = requestAnimationFrame(() => setShown(target));
      return () => {
        if (frame.current !== null) cancelAnimationFrame(frame.current);
      };
    }
    const start = performance.now();
    const from = 0;
    const step = (now: number) => {
      const progress = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - progress, 3);
      setShown(Math.round(from + (target - from) * eased));
      if (progress < 1) frame.current = requestAnimationFrame(step);
    };
    frame.current = requestAnimationFrame(step);
    return () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    };
  }, [target, duration]);

  return shown;
}

function AdherenceRing({ value, taken, total }: { value: number; taken: number; total: number }) {
  const radius = 46;
  const circumference = 2 * Math.PI * radius;
  const shown = useCountUp(value);
  const offset = circumference * (1 - Math.min(100, Math.max(0, shown)) / 100);

  return (
    <div className="mt-4 flex items-center gap-5">
      <svg viewBox="0 0 120 120" className="h-28 w-28" role="img" aria-label={`${value} percent adherence`}>
        <circle cx="60" cy="60" r={radius} fill="none" stroke="#E9DFC8" strokeWidth="9" />
        <circle
          cx="60"
          cy="60"
          r={radius}
          fill="none"
          stroke="#1F4D3A"
          strokeWidth="9"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          transform="rotate(-90 60 60)"
          style={{ transition: "stroke-dashoffset 120ms linear" }}
        />
        <text
          x="60"
          y="66"
          textAnchor="middle"
          fontSize="24"
          fill="#1F4D3A"
          fontFamily="Fraunces, Georgia, serif"
        >
          {shown}%
        </text>
      </svg>
      <div className="text-sm text-charcoal-soft">
        <p className="font-medium text-charcoal">
          {taken} of {total} doses
        </p>
        <p className="mt-1 text-xs leading-relaxed text-charcoal-soft/75">Rolling 7-day window, updated live.</p>
      </div>
    </div>
  );
}

function HydrationGlasses({ today, goal }: { today: number; goal: number }) {
  const filled = Math.min(today, goal);
  const percent = goal > 0 ? Math.round((Math.min(today, goal) / goal) * 100) : 0;

  return (
    <div className="mt-4">
      <div className="flex items-end gap-1.5" role="img" aria-label={`${today} of ${goal} glasses of water today`}>
        {Array.from({ length: goal }, (_, index) => (
          <span
            key={index}
            className={`h-9 flex-1 rounded-b-[5px] rounded-t-[3px] border transition-colors ${
              index < filled ? "border-forest/30 bg-forest/70" : "border-forest/15 bg-sand/40"
            }`}
          />
        ))}
      </div>
      <p className="mt-3 text-sm text-charcoal-soft">
        <span className="font-display text-xl text-forest">{today}</span>
        <span className="text-charcoal-soft/70"> / {goal}</span>
        <span className="ml-2 text-xs text-charcoal-soft/70">({percent}%)</span>
      </p>
    </div>
  );
}

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

/** Deterministic (UTC) short date so server and client markup always match. */
function shortDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return `${MONTHS[date.getUTCMonth()]} ${date.getUTCDate()}`;
}

/** ISO calendar day (2026-03-06) rendered without any timezone drift. */
function shortDay(iso: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso);
  if (!match) return shortDate(iso);
  return `${MONTHS[Number(match[2]) - 1]} ${Number(match[3])}`;
}

const severityTone: Record<string, string> = {
  urgent: "border-gold/50 bg-gold/10 text-[#8a6f14]",
  warning: "border-gold/30 bg-gold/5 text-[#8a6f14]",
  info: "border-forest/12 bg-sand-light/60 text-charcoal",
};

export default function Dashboard({ data, labels }: { data: DashboardData | null; labels: Labels }) {
  return (
    <section className="space-y-4">
      <h2 className="font-display text-lg text-forest">{labels.dashboard}</h2>

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="animate-rise-in card p-5" style={{ animationDelay: "80ms" }}>
          <p className="text-[11px] uppercase tracking-[0.16em] text-charcoal-soft/60">{labels.mood}</p>
          {data ? <MoodChart points={data.mood.points} /> : <div className="mt-4 h-24 rounded-xl bg-sand/40" />}
          {data ? (
            <p className="mt-2 text-sm text-charcoal-soft">Average {data.mood.average} of 5</p>
          ) : null}
        </article>

        <article className="animate-rise-in card p-5" style={{ animationDelay: "160ms" }}>
          <p className="text-[11px] uppercase tracking-[0.16em] text-charcoal-soft/60">{labels.adherence}</p>
          {data ? (
            <AdherenceRing
              value={data.adherence.adherence}
              taken={data.adherence.taken}
              total={data.adherence.total}
            />
          ) : (
            <div className="mt-4 h-28 w-28 rounded-full bg-sand/40" />
          )}
        </article>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <article className="animate-rise-in card p-5" style={{ animationDelay: "240ms" }}>
          <p className="text-[11px] uppercase tracking-[0.16em] text-charcoal-soft/60">{labels.hydration}</p>
          {data ? (
            <HydrationGlasses today={data.hydration.today} goal={data.hydration.goal} />
          ) : (
            <div className="mt-4 h-9 rounded-xl bg-sand/40" />
          )}
          {data ? (
            <p className="mt-1 text-xs text-charcoal-soft/70">
              {Math.round((Math.min(data.hydration.today, data.hydration.goal) / data.hydration.goal) * 100)}%{" "}
              {labels.hydrationGoal}
            </p>
          ) : null}
        </article>

        <article className="animate-rise-in card p-5" style={{ animationDelay: "320ms" }}>
          <p className="text-[11px] uppercase tracking-[0.16em] text-charcoal-soft/60">{labels.appointments}</p>
          <ul className="mt-4 space-y-2">
            {(data?.appointments ?? []).slice(0, 3).map((appointment) => (
              <li
                key={appointment.id}
                className="flex items-start gap-3 rounded-2xl border border-forest/12 bg-sand-light/60 px-3 py-2.5 text-sm"
              >
                <span className="mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full bg-forest/10 text-forest">
                  <svg viewBox="0 0 24 24" width="13" height="13" aria-hidden="true" fill="none">
                    <rect x="3.5" y="5" width="17" height="15" rx="3" stroke="currentColor" strokeWidth="1.6" />
                    <path d="M3.5 9.5h17M8 3.5v3M16 3.5v3" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" />
                  </svg>
                </span>
                <span className="flex-1 leading-snug text-charcoal">{appointment.title}</span>
                <time className="shrink-0 text-[11px] text-charcoal-soft/70" dateTime={appointment.date}>
                  {shortDay(appointment.date)}
                </time>
              </li>
            ))}
            {!data || data.appointments.length === 0 ? (
              <li className="text-sm text-charcoal-soft/70">{labels.noAppointments}</li>
            ) : null}
          </ul>
        </article>
      </div>

      <article className="animate-rise-in card p-5" style={{ animationDelay: "400ms" }}>
        <p className="text-[11px] uppercase tracking-[0.16em] text-charcoal-soft/60">{labels.alertsFeed}</p>
        <ul className="mt-4 space-y-2">
          {(data?.alerts ?? []).map((alert) => (
            <li
              key={alert.id}
              className={`animate-glow-3 flex items-start gap-3 rounded-2xl border px-4 py-3 text-sm ${
                severityTone[alert.severity] ?? severityTone.info
              }`}
            >
              <span className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full bg-current opacity-70" />
              <span className="flex-1 leading-relaxed">{alert.message}</span>
              <time className="shrink-0 text-[11px] text-charcoal-soft/60" dateTime={alert.createdAt}>
                {shortDate(alert.createdAt)}
              </time>
            </li>
          ))}
          {!data || data.alerts.length === 0 ? (
            <li className="text-sm text-charcoal-soft/70">Nothing needs attention right now.</li>
          ) : null}
        </ul>
      </article>
    </section>
  );
}

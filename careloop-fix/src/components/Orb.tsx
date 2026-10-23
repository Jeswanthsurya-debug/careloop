"use client";

import type { VoiceState } from "@/lib/types";

const motionFor: Record<VoiceState, string> = {
  idle: "orb-breathe",
  listening: "orb-pulse",
  thinking: "orb-shimmer",
  speaking: "orb-ripple",
};

export default function Orb({ state, level = 0 }: { state: VoiceState; level?: number }) {
  // Ripple rings follow the live audio level while speaking.
  const rippleScale = 1 + Math.min(0.22, level * 0.28);
  return (
    <div className="relative grid h-32 w-32 place-items-center sm:h-40 sm:w-40" aria-hidden="true">
      <div
        className="absolute inset-0 rounded-full blur-2xl"
        style={{
          background:
            "radial-gradient(circle at 50% 45%, rgba(233,223,200,0.55), rgba(201,162,39,0.18) 45%, rgba(31,77,58,0) 72%)",
        }}
      />
      {state === "speaking" ? (
        <>
          <span
            className="absolute inset-2 rounded-full border border-sand/40 transition-transform duration-150 ease-out"
            style={{ transform: `scale(${rippleScale})` }}
          />
          <span
            className="absolute inset-0 rounded-full border border-sand/20 transition-transform duration-300 ease-out"
            style={{ transform: `scale(${1 + (rippleScale - 1) * 0.6})` }}
          />
        </>
      ) : null}
      <div
        className={`absolute inset-3 rounded-full ${motionFor[state]}`}
        style={{
          background:
            "radial-gradient(circle at 38% 32%, #ffffff 0%, #f5efdf 22%, #e9dfc8 48%, #9fc3ad 76%, #2f6b51 100%)",
          boxShadow: "0 0 50px -8px rgba(233,223,200,0.55), inset 0 -10px 24px -12px rgba(22,56,40,0.7)",
        }}
      />
      <div
        className="absolute inset-3 rounded-full mix-blend-screen opacity-70"
        style={{
          background: "radial-gradient(circle at 65% 70%, rgba(201,162,39,0.35), rgba(201,162,39,0) 55%)",
        }}
      />
    </div>
  );
}

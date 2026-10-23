"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import ChatComposer from "./ChatComposer";
import type { ChatMessage } from "@/lib/types";

type ComposerProps = ComponentProps<typeof ChatComposer>;

type Props = {
  title: string;
  messages: ChatMessage[];
  busy: boolean;
  /** True while the assistant is thinking, so the dots can show. */
  thinking: boolean;
  composer: ComposerProps;
};

function ToolChip({ name, status, index }: { name: string; status: string; index: number }) {
  const done = status === "done";
  return (
    <span
      style={{ animationDelay: `${index * 90}ms` }}
      className={`animate-chip-in inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium ${
        done ? "border-forest/15 bg-sand-light text-forest" : "border-gold/40 bg-gold/10 text-[#8a6f14]"
      }`}
      title={name}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${done ? "bg-forest-soft" : "bg-gold"}`} />
      {name} · {status}
    </span>
  );
}

export default function Conversation({ title, messages, busy, thinking, composer }: Props) {
  const endRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    endRef.current?.scrollIntoView({ block: "end", behavior: "smooth" });
  }, [messages.length, thinking]);

  return (
    <section className="animate-card-in card flex flex-col p-5 sm:p-6">
      <div className="flex items-center justify-between">
        <h2 className="font-display text-lg text-forest">{title}</h2>
        <span className="text-[11px] uppercase tracking-[0.16em] text-charcoal-soft/60">
          {messages.length} messages
        </span>
      </div>

      <div className="mt-4 max-h-[420px] min-h-[220px] space-y-4 overflow-y-auto pr-1">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`animate-fade-up flex flex-col gap-2 ${
              message.role === "user" ? "items-end" : "items-start"
            }`}
          >
            <div
              className={`max-w-[85%] rounded-[18px] px-4 py-3 text-sm leading-relaxed ${
                message.role === "user"
                  ? "bg-forest text-sand-light"
                  : "border border-forest/10 bg-sand-light/70 text-charcoal"
              }`}
            >
              {message.content}
            </div>
            {message.toolCalls && message.toolCalls.length > 0 ? (
              <div className="flex max-w-[90%] flex-wrap gap-1.5">
                {message.toolCalls.map((tool, index) => (
                  <ToolChip
                    key={`${message.id}-${tool.name}-${index}`}
                    name={tool.name}
                    status={tool.status}
                    index={index}
                  />
                ))}
              </div>
            ) : null}
          </div>
        ))}
        {thinking ? (
          <div className="animate-fade-up flex items-start" aria-live="polite">
            <div className="flex items-center gap-1.5 rounded-[18px] border border-forest/10 bg-sand-light/70 px-4 py-3">
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-forest/50" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-forest/50" />
              <span className="typing-dot h-1.5 w-1.5 rounded-full bg-forest/50" />
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      <ChatComposer {...composer} />

    </section>
  );
}

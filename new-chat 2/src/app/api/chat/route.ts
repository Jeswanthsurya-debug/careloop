import { NextResponse } from "next/server";
import { getDb } from "@/db";
import { messages } from "@/db/schema";
import { composeReply, planTurn } from "@/lib/agent";
import { bedrockEnabled, phraseWithBedrock } from "@/lib/bedrock";
import { resolveLang } from "@/lib/languages";
import { localizeToolSummary, toolChipLabel } from "@/lib/replies";
import { ensureSeedData, runTool, type ToolResult } from "@/lib/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { text?: string; lang?: string; language?: string };
    const text = (body.text ?? "").toString().trim();

    // One shared language value, never truncated: "hi-IN" stays "hi-IN".
    const language = resolveLang(body.lang ?? body.language);

    if (!text) {
      return NextResponse.json({ error: "Message text is required." }, { status: 400 });
    }

    await ensureSeedData();

    const plan = planTurn(text);
    const results: ToolResult[] = [];
    const toolCalls: {
      name: string;
      status: string;
      /** English, for the MCP/tool layer and the logs. */
      summary?: string;
      /** Translated, for the chip in the UI. */
      title?: string;
      label?: string;
      detail?: string;
    }[] = [];

    for (const call of plan.calls) {
      const result = await runTool(call.name, call.args);
      results.push(result);

      const chip = toolChipLabel(call.name, result.ok ? "done" : "failed", language.code);
      toolCalls.push({
        name: call.name, // tool names stay English on purpose
        status: result.ok ? "done" : "failed",
        summary: result.summary,
        title: chip.title,
        label: chip.status,
        detail: result.ok ? localizeToolSummary(call.name, result.data, language.code) : undefined,
      });
    }

    // Mock mode (no AWS) uses the translated templates; Bedrock, when
    // configured, re-phrases the same answer pinned to the same language.
    const template = composeReply(plan, results, language.code);
    const reply = (await phraseWithBedrock(template, language.code, text)) ?? template;

    const db = await getDb();
    await db.insert(messages).values([
      { role: "user", content: text, language: language.code },
      { role: "assistant", content: reply, language: language.code, toolCalls },
    ]);

    return NextResponse.json({
      reply,
      intent: plan.intent,
      lang: language.code,
      source: bedrockEnabled() ? "bedrock" : "mock",
      toolCalls,
    });
  } catch (error) {
    console.error("chat route failed", error);
    return NextResponse.json(
      { error: "I could not reach my notes just now. Please try again in a moment." },
      { status: 500 },
    );
  }
}

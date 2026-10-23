import { NextResponse } from "next/server";
import { ensureSeedData, runTool } from "@/lib/tools";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

export async function GET() {
  try {
    await ensureSeedData();
    const summary = await runTool("get_wellness_summary", { days: 7 });
    return NextResponse.json({ ok: summary.ok, summary: summary.summary, data: summary.data });
  } catch (error) {
    console.error("dashboard route failed", error);
    return NextResponse.json({ ok: false, error: "Dashboard unavailable right now." }, { status: 500 });
  }
}

import { NextResponse } from "next/server";
import { getDb, getDbMode } from "@/db";
import { sql } from "drizzle-orm";
import { toolNames } from "@/lib/tools";
import { isMockLlm } from "@/lib/bedrock";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/** Public liveness probe. `/api/health` stays as the platform probe. */
export async function GET() {
  try {
    const db = await getDb();
    await db.execute(sql`select 1`);
    return NextResponse.json({
      ok: true,
      database: "up",
      // Which backend answered: postgres, or the embedded fallback.
      mode: await getDbMode(),
      tools: toolNames.length,
      mockLlm: isMockLlm(),
    });
  } catch (error) {
    console.error("health check failed", error);
    return NextResponse.json({ ok: false, database: "down" }, { status: 503 });
  }
}

import CareLoopApp from "@/components/CareLoopApp";
import { ensureSeedData, runTool } from "@/lib/tools";
import type { DashboardData } from "@/lib/types";

export const dynamic = "force-dynamic";

async function loadDashboard(): Promise<DashboardData | null> {
  try {
    await ensureSeedData();
    const summary = await runTool("get_wellness_summary", { days: 7 });
    if (!summary.ok) return null;
    return JSON.parse(JSON.stringify(summary.data)) as DashboardData;
  } catch (error) {
    console.error("dashboard preload failed", error);
    return null;
  }
}

export default async function HomePage() {
  const dashboard = await loadDashboard();
  return <CareLoopApp initialDashboard={dashboard} />;
}

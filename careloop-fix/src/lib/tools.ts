import { getDb } from "@/db";
import {
  alerts,
  appointments,
  carePlanItems,
  checkins,
  hydrationLogs,
  medicationLogs,
  moodEntries,
} from "@/db/schema";
import { and, desc, eq, gte, sql } from "drizzle-orm";

export type JsonSchema = {
  type: "object";
  properties: Record<string, { type: string; description: string; enum?: string[]; items?: { type: string } }>;
  required?: string[];
};

export type ToolResult = {
  ok: boolean;
  summary: string;
  data?: unknown;
};

export type CareTool = {
  name: string;
  title: string;
  description: string;
  inputSchema: JsonSchema;
  run: (args: Record<string, unknown>) => Promise<ToolResult>;
};

const str = (value: unknown, fallback = "") =>
  typeof value === "string" && value.trim().length > 0 ? value.trim() : fallback;

const num = (value: unknown, fallback: number) => {
  const parsed = typeof value === "number" ? value : Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
};

const list = (value: unknown): string[] =>
  Array.isArray(value) ? value.map((item) => String(item).trim().toLowerCase()).filter(Boolean) : [];

const daysAgo = (days: number) => new Date(Date.now() - days * 24 * 60 * 60 * 1000);

const windowDays = (value: unknown, fallback = 7) => Math.min(90, Math.max(1, Math.round(num(value, fallback))));

/** Shared read used by several tools so they always agree on the numbers. */
async function readAdherence(days: number) {
  const db = await getDb();
  const rows = await db
    .select({ status: medicationLogs.status })
    .from(medicationLogs)
    .where(gte(medicationLogs.takenAt, daysAgo(days)));
  const total = rows.length;
  const taken = rows.filter((row) => row.status === "taken").length;
  const missed = total - taken;
  return { adherence: total === 0 ? 0 : Math.round((taken / total) * 100), taken, missed, total, days };
}

async function readMood(days: number) {
  const db = await getDb();
  const rows = await db
    .select({ score: moodEntries.score, createdAt: moodEntries.createdAt })
    .from(moodEntries)
    .where(gte(moodEntries.createdAt, daysAgo(days)))
    .orderBy(moodEntries.createdAt);

  const buckets = new Map<string, number[]>();
  for (const row of rows) {
    const key = new Date(row.createdAt).toISOString().slice(0, 10);
    buckets.set(key, [...(buckets.get(key) ?? []), row.score]);
  }
  const points = [...buckets.entries()].map(([date, scores]) => ({
    date,
    score: Number((scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2)),
  }));
  const average =
    points.length === 0 ? 0 : Number((points.reduce((a, p) => a + p.score, 0) / points.length).toFixed(2));
  return { points, average, days };
}

/** Glasses of water considered a full day. */
export const HYDRATION_GOAL = 8;

export function todayIso(now = new Date()) {
  return now.toISOString().slice(0, 10);
}

function startOfToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start;
}

async function readHydration(days: number) {
  const db = await getDb();
  const rows = await db
    .select({ glasses: hydrationLogs.glasses, createdAt: hydrationLogs.createdAt })
    .from(hydrationLogs)
    .where(gte(hydrationLogs.createdAt, daysAgo(days)))
    .orderBy(hydrationLogs.createdAt);

  const buckets = new Map<string, number>();
  for (const row of rows) {
    const key = new Date(row.createdAt).toISOString().slice(0, 10);
    buckets.set(key, (buckets.get(key) ?? 0) + row.glasses);
  }
  const points = [...buckets.entries()].map(([date, glasses]) => ({ date, glasses }));
  const today = buckets.get(todayIso()) ?? 0;
  const average = points.length === 0 ? 0 : Number((points.reduce((a, p) => a + p.glasses, 0) / points.length).toFixed(1));
  return { today, goal: HYDRATION_GOAL, points, average, days };
}

async function readAppointments(limit = 10) {
  const db = await getDb();
  const rows = await db.select().from(appointments).orderBy(appointments.date).limit(50);
  const today = todayIso();
  const upcoming = rows.filter((row) => row.date >= today).slice(0, limit);
  return { upcoming, next: upcoming[0] ?? null, total: upcoming.length };
}

export const careTools: CareTool[] = [
  {
    name: "log_medication",
    title: "Log medication",
    description: "Record that a medication was taken or missed for the person being cared for.",
    inputSchema: {
      type: "object",
      properties: {
        medication: { type: "string", description: "Name of the medication, e.g. Metformin." },
        dose: { type: "string", description: "Dose description, e.g. 500mg." },
        status: { type: "string", description: "Whether the dose was taken or missed.", enum: ["taken", "missed"] },
        timeOfDay: {
          type: "string",
          description: "When the dose belongs to.",
          enum: ["morning", "afternoon", "evening"],
        },
      },
      required: ["medication"],
    },
    async run(args) {
      const db = await getDb();
      const medication = str(args.medication, "Daily medication");
      const dose = str(args.dose) || null;
      const status = str(args.status, "taken") === "missed" ? "missed" : "taken";
      const [row] = await db.insert(medicationLogs).values({ medication, dose, status }).returning();
      const adherence = await readAdherence(7);
      return {
        ok: true,
        summary:
          status === "missed"
            ? `${medication} marked as missed`
            : `${medication}${dose ? ` (${dose})` : ""} marked as taken`,
        data: { entry: row, status, medication, adherence },
      };
    },
  },
  {
    name: "get_care_plan",
    title: "Get care plan",
    description: "List the medications scheduled for today, with the time of day and what is still outstanding.",
    inputSchema: {
      type: "object",
      properties: {
        timeOfDay: {
          type: "string",
          description: "Optionally narrow the plan to one part of the day.",
          enum: ["morning", "afternoon", "evening"],
        },
      },
    },
    async run(args) {
      const db = await getDb();
      const timeOfDay = str(args.timeOfDay);
      const rows = await db
        .select()
        .from(carePlanItems)
        .where(
          timeOfDay
            ? and(eq(carePlanItems.active, true), eq(carePlanItems.timeOfDay, timeOfDay))
            : eq(carePlanItems.active, true),
        );

      const startOfToday = new Date();
      startOfToday.setHours(0, 0, 0, 0);
      const todaysLogs = await db
        .select({ medication: medicationLogs.medication, status: medicationLogs.status })
        .from(medicationLogs)
        .where(gte(medicationLogs.takenAt, startOfToday));
      const takenToday = new Set(
        todaysLogs.filter((log) => log.status === "taken").map((log) => log.medication.toLowerCase()),
      );

      const order = { morning: 0, afternoon: 1, evening: 2 } as Record<string, number>;
      const items = rows
        .map((row) => ({
          medication: row.medication,
          dose: row.dose,
          timeOfDay: row.timeOfDay,
          instructions: row.instructions,
          taken: takenToday.has(row.medication.toLowerCase()),
        }))
        .sort((a, b) => (order[a.timeOfDay] ?? 9) - (order[b.timeOfDay] ?? 9));

      const remaining = items.filter((item) => !item.taken);
      return {
        ok: true,
        summary:
          items.length === 0
            ? "No medications are scheduled today"
            : `${items.length} scheduled today, ${remaining.length} still to take`,
        data: { items, remaining, total: items.length },
      };
    },
  },
  {
    name: "daily_checkin",
    title: "Daily check-in",
    description:
      "Record a daily check-in: which meals were eaten or skipped, how the person feels (1 low to 5 bright), and a short note.",
    inputSchema: {
      type: "object",
      properties: {
        mealsEaten: { type: "array", description: "Meals eaten today.", items: { type: "string" } },
        mealsSkipped: { type: "array", description: "Meals skipped today.", items: { type: "string" } },
        mood: { type: "number", description: "Mood score from 1 (low) to 5 (bright)." },
        note: { type: "string", description: "Anything else they said, in their words." },
      },
    },
    async run(args) {
      const db = await getDb();
      const mealsEaten = list(args.mealsEaten);
      const mealsSkipped = list(args.mealsSkipped);
      const hasMood = args.mood !== undefined && args.mood !== null;
      const moodScore = hasMood ? Math.min(5, Math.max(1, Math.round(num(args.mood, 3)))) : null;
      const note = str(args.note) || null;

      const [row] = await db
        .insert(checkins)
        .values({ mealsEaten, mealsSkipped, moodScore, note })
        .returning();

      // A mood given at check-in also feeds the family mood chart.
      if (moodScore !== null) {
        await db.insert(moodEntries).values({ score: moodScore, note });
      }

      const parts: string[] = [];
      if (mealsEaten.length) parts.push(`ate ${mealsEaten.join(", ")}`);
      if (mealsSkipped.length) parts.push(`skipped ${mealsSkipped.join(", ")}`);
      if (moodScore !== null) parts.push(`mood recorded`);

      const mood = await readMood(7);
      return {
        ok: true,
        summary: parts.length ? `Check-in saved: ${parts.join(", ")}` : "Check-in saved",
        data: { checkin: row, mealsEaten, mealsSkipped, moodScore, mood },
      };
    },
  },
  {
    name: "get_wellness_summary",
    title: "Get wellness summary",
    description: "Summarise the recent week: mood trend, medication adherence and the latest family alerts.",
    inputSchema: {
      type: "object",
      properties: { days: { type: "number", description: "Window size in days, default 7." } },
    },
    async run(args) {
      const db = await getDb();
      const days = windowDays(args.days);
      const [adherence, mood, hydration, upcoming] = await Promise.all([
        readAdherence(days),
        readMood(days),
        readHydration(days),
        readAppointments(),
      ]);
      const recentAlerts = await db.select().from(alerts).orderBy(desc(alerts.createdAt)).limit(5);
      return {
        ok: true,
        summary: `${adherence.adherence}% of doses taken, mood averaging ${mood.average} of 5, ${hydration.today} glasses of water today, ${upcoming.total} upcoming appointments, ${recentAlerts.length} recent alerts`,
        data: {
          adherence,
          mood,
          hydration,
          appointments: upcoming.upcoming,
          nextAppointment: upcoming.next,
          alerts: recentAlerts,
          days,
        },
      };
    },
  },
  {
    name: "detect_anomalies",
    title: "Detect anomalies",
    description:
      "Look for anything unusual in the routine: missed doses, skipped meals, low hydration or a dip in mood.",
    inputSchema: {
      type: "object",
      properties: { days: { type: "number", description: "Window size in days, default 7." } },
    },
    async run(args) {
      const db = await getDb();
      const days = windowDays(args.days);
      const [adherence, mood, hydration] = await Promise.all([
        readAdherence(days),
        readMood(days),
        readHydration(days),
      ]);
      const recentCheckins = await db
        .select()
        .from(checkins)
        .where(gte(checkins.createdAt, daysAgo(days)))
        .orderBy(desc(checkins.createdAt));

      // Plain words instead of raw counts: this text is spoken aloud.
      const countWord = (count: number, singular: string, plural: string) =>
        count === 1 ? `one ${singular}` : count <= 3 ? `a few ${plural}` : `several ${plural}`;

      // `count` lets the chat layer translate the finding without parsing English.
      const findings: { kind: string; severity: "info" | "warning"; count: number; detail: string }[] = [];

      if (adherence.total > 0 && adherence.missed > 0) {
        findings.push({
          kind: "missed_doses",
          severity: adherence.adherence < 70 ? "warning" : "info",
          count: adherence.missed,
          detail: `${countWord(adherence.missed, "dose", "doses")} ${
            adherence.missed === 1 ? "was" : "were"
          } missed this week`,
        });
      }

      const skippedMeals = recentCheckins.flatMap((row) => row.mealsSkipped ?? []);
      if (skippedMeals.length > 0) {
        findings.push({
          kind: "skipped_meals",
          severity: skippedMeals.length >= 3 ? "warning" : "info",
          count: skippedMeals.length,
          detail: `${countWord(skippedMeals.length, "meal", "meals")} ${
            skippedMeals.length === 1 ? "was" : "were"
          } skipped recently`,
        });
      }

      const recent = mood.points.slice(-3);
      if (recent.length >= 2 && recent.every((point) => point.score <= 2.5)) {
        findings.push({
          kind: "low_mood",
          severity: "warning",
          count: recent.length,
          detail: "mood has been low for a few days",
        });
      }

      if (hydration.points.length > 0 && hydration.average < HYDRATION_GOAL / 2) {
        findings.push({
          kind: "low_hydration",
          severity: "info",
          count: 1,
          detail: "water intake has been lower than usual",
        });
      }

      if (mood.points.length === 0) {
        findings.push({ kind: "no_checkins", severity: "info", count: 0, detail: "there have been no check-ins yet" });
      }

      const worst = findings.some((finding) => finding.severity === "warning") ? "warning" : "info";
      return {
        ok: true,
        summary: findings.length === 0 ? "Nothing unusual in the routine" : findings.map((f) => f.detail).join("; "),
        data: { findings, severity: findings.length === 0 ? "none" : worst, adherence, mood, hydration, days },
      };
    },
  },
  {
    name: "log_hydration",
    title: "Log hydration",
    description: "Record glasses of water the person has drunk, and report how today is going against their goal.",
    inputSchema: {
      type: "object",
      properties: {
        glasses: { type: "number", description: "How many glasses of water were drunk, e.g. 2." },
      },
      required: ["glasses"],
    },
    async run(args) {
      const db = await getDb();
      const glasses = Math.min(20, Math.max(1, Math.round(num(args.glasses, 1))));
      const [row] = await db.insert(hydrationLogs).values({ glasses }).returning();
      const hydration = await readHydration(7);
      return {
        ok: true,
        summary: `${glasses} glass${glasses === 1 ? "" : "es"} logged, ${hydration.today} of ${HYDRATION_GOAL} today`,
        data: { entry: row, glasses, hydration },
      };
    },
  },
  {
    name: "add_appointment",
    title: "Add appointment",
    description: "Save an upcoming appointment such as a doctor or dentist visit, with its calendar date.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", description: "What the appointment is, e.g. Doctor visit." },
        date: { type: "string", description: "Calendar day in YYYY-MM-DD form, e.g. 2026-03-06." },
        notes: { type: "string", description: "Anything else worth remembering." },
      },
      required: ["title", "date"],
    },
    async run(args) {
      const db = await getDb();
      const title = str(args.title, "Appointment");
      const requested = str(args.date);
      // Accept only a real calendar day; anything else falls back to today.
      const date = /^\d{4}-\d{2}-\d{2}$/.test(requested) && !Number.isNaN(Date.parse(requested))
        ? requested
        : todayIso();
      const notes = str(args.notes) || null;

      // Saying the same thing twice should not fill the diary with duplicates.
      const [existing] = await db
        .select()
        .from(appointments)
        .where(and(sql`lower(${appointments.title}) = ${title.toLowerCase()}`, eq(appointments.date, date)))
        .limit(1);

      const row =
        existing ??
        (await db.insert(appointments).values({ title, date, notes }).returning())[0];

      const list = await readAppointments();
      return {
        ok: true,
        summary: `${title} ${existing ? "already in the diary for" : "saved for"} ${date}`,
        data: { appointment: row, title, date, duplicate: Boolean(existing), appointments: list },
      };
    },
  },
  {
    name: "alert_family",
    title: "Alert family",
    description: "Send a notification to the family circle, optionally marked urgent.",
    inputSchema: {
      type: "object",
      properties: {
        message: { type: "string", description: "What the family should know." },
        severity: { type: "string", description: "Urgency of the alert.", enum: ["info", "warning", "urgent"] },
      },
      required: ["message"],
    },
    async run(args) {
      const db = await getDb();
      const message = str(args.message, "Please check in with me when you can.");
      const requested = str(args.severity, "info");
      const severity = ["info", "warning", "urgent"].includes(requested) ? requested : "info";
      const [row] = await db.insert(alerts).values({ message, severity, kind: "family" }).returning();
      return { ok: true, summary: `Family notified (${severity})`, data: { alert: row, severity } };
    },
  },
];

export const careToolsByName = Object.fromEntries(careTools.map((tool) => [tool.name, tool])) as Record<
  string,
  CareTool
>;

export const toolNames = careTools.map((tool) => tool.name);

export async function runTool(name: string, args: Record<string, unknown> = {}): Promise<ToolResult> {
  const tool = careToolsByName[name];
  if (!tool) {
    return { ok: false, summary: `Unknown tool: ${name}` };
  }
  try {
    return await tool.run(args);
  } catch (error) {
    console.error(`tool ${name} failed`, error);
    return { ok: false, summary: error instanceof Error ? error.message : "Tool failed" };
  }
}

/** The person CareLoop is caring for in the demo. */
export const CARE_RECIPIENT = "Margaret";

/**
 * Seven days of demo data for Margaret, written once on first use.
 * Runs against whichever database getDb() returned, so the app is usable
 * straight away even with no DATABASE_URL.
 */
export async function ensureSeedData() {
  const db = await getDb();
  const [{ count: planCount }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(carePlanItems);

  if (planCount === 0) {
    await db.insert(carePlanItems).values([
      { medication: "Metformin", dose: "500mg", timeOfDay: "morning", instructions: "with breakfast" },
      { medication: "Lisinopril", dose: "10mg", timeOfDay: "morning", instructions: "with water" },
      { medication: "Vitamin D", dose: "1000 IU", timeOfDay: "afternoon", instructions: "after lunch" },
      { medication: "Atorvastatin", dose: "20mg", timeOfDay: "evening", instructions: "before bed" },
    ]);
  }

  const [{ count: hydrationCount }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(hydrationLogs);
  if (hydrationCount === 0) {
    await db.insert(hydrationLogs).values(
      [5, 6, 4, 7, 6, 5, 3].map((glasses, index) => ({ glasses, createdAt: daysAgo(6 - index) })),
    );
  }

  const [{ count: appointmentCount }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(appointments);
  if (appointmentCount === 0) {
    const inDays = (days: number) => todayIso(new Date(Date.now() + days * 86400000));
    await db.insert(appointments).values([
      { title: "Doctor visit", date: inDays(3), notes: "bring the blood pressure diary" },
      { title: "Dentist check-up", date: inDays(12), notes: null },
    ]);
  }

  const [{ count: moodCount }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(moodEntries);
  if (moodCount > 0) return;

  const moods = [4, 3, 4, 5, 3, 4, 4];
  await db.insert(moodEntries).values(
    moods.map((score, index) => ({ score, note: null, createdAt: daysAgo(6 - index) })),
  );

  const meds = ["Metformin", "Lisinopril", "Vitamin D"];
  await db.insert(medicationLogs).values(
    Array.from({ length: 18 }, (_, index) => ({
      medication: meds[index % meds.length],
      dose: index % 3 === 0 ? "500mg" : "10mg",
      status: index % 7 === 3 ? "missed" : "taken",
      takenAt: daysAgo(6 - Math.floor(index / 3)),
    })),
  );

  // Seven daily check-ins so the week looks lived-in.
  const [{ count: checkinCount }] = await db
    .select({ count: sql<number>`cast(count(*) as int)` })
    .from(checkins);
  if (checkinCount === 0) {
    await db.insert(checkins).values(
      moods.map((score, index) => ({
        mealsEaten: index % 4 === 2 ? ["breakfast", "dinner"] : ["breakfast", "lunch", "dinner"],
        mealsSkipped: index % 4 === 2 ? ["lunch"] : [],
        moodScore: score,
        note: null,
        createdAt: daysAgo(6 - index),
      })),
    );
  }

  await db.insert(alerts).values([
    {
      message: `${CARE_RECIPIENT} missed her evening dose on Tuesday.`,
      severity: "warning",
      kind: "system",
      createdAt: daysAgo(2),
    },
    {
      message: `${CARE_RECIPIENT} asked you to call her this weekend.`,
      severity: "info",
      kind: "family",
      createdAt: daysAgo(1),
    },
  ]);
}

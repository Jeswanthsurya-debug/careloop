import { pgTable, serial, text, timestamp, integer, boolean, jsonb } from "drizzle-orm/pg-core";

export const medicationLogs = pgTable("medication_logs", {
  id: serial("id").primaryKey(),
  medication: text("medication").notNull(),
  dose: text("dose"),
  status: text("status").notNull().default("taken"), // taken | skipped
  takenAt: timestamp("taken_at", { withTimezone: true }).notNull().defaultNow(),
});

export const moodEntries = pgTable("mood_entries", {
  id: serial("id").primaryKey(),
  score: integer("score").notNull(), // 1..5
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const alerts = pgTable("alerts", {
  id: serial("id").primaryKey(),
  kind: text("kind").notNull().default("family"), // family | system | caregiver
  severity: text("severity").notNull().default("info"), // info | warning | urgent
  message: text("message").notNull(),
  acknowledged: boolean("acknowledged").notNull().default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const carePlanItems = pgTable("care_plan_items", {
  id: serial("id").primaryKey(),
  medication: text("medication").notNull(),
  dose: text("dose"),
  timeOfDay: text("time_of_day").notNull().default("morning"), // morning | afternoon | evening
  instructions: text("instructions"),
  active: boolean("active").notNull().default(true),
});

export const checkins = pgTable("checkins", {
  id: serial("id").primaryKey(),
  mealsEaten: jsonb("meals_eaten").$type<string[]>().default([]),
  mealsSkipped: jsonb("meals_skipped").$type<string[]>().default([]),
  moodScore: integer("mood_score"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const hydrationLogs = pgTable("hydration_logs", {
  id: serial("id").primaryKey(),
  glasses: integer("glasses").notNull().default(1),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const appointments = pgTable("appointments", {
  id: serial("id").primaryKey(),
  title: text("title").notNull(),
  /** ISO calendar day, e.g. 2026-03-06 — stored as text so it is timezone-stable. */
  date: text("date").notNull(),
  notes: text("notes"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const messages = pgTable("messages", {
  id: serial("id").primaryKey(),
  role: text("role").notNull(), // user | assistant
  content: text("content").notNull(),
  language: text("language").notNull().default("en"),
  toolCalls: jsonb("tool_calls").$type<{ name: string; status: string; summary?: string }[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

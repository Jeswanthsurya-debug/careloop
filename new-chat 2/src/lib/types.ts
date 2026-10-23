export type ToolChip = { name: string; status: string; summary?: string };

export type ChatMessage = {
  id: string;
  role: "user" | "assistant";
  content: string;
  toolCalls?: ToolChip[];
};

export type AlertRow = {
  id: number;
  kind: string;
  severity: string;
  message: string;
  acknowledged: boolean;
  createdAt: string;
};

export type AppointmentRow = {
  id: number;
  title: string;
  /** ISO calendar day, e.g. 2026-03-06. */
  date: string;
  notes: string | null;
};

export type DashboardData = {
  adherence: { adherence: number; taken: number; total: number; days: number };
  mood: { points: { date: string; score: number }[]; average: number; days: number };
  hydration: { today: number; goal: number; points: { date: string; glasses: number }[]; average: number };
  appointments: AppointmentRow[];
  alerts: AlertRow[];
};

export type VoiceState = "idle" | "listening" | "thinking" | "speaking";

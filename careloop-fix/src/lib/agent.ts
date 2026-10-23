import type { ToolResult } from "./tools";
import {
  describeDate,
  findingText,
  numberWord,
  repliesFor,
  type ReplyStrings,
  type Tone,
} from "./replies";


export type Intent =
  | "log_medication"
  | "care_plan"
  | "daily_checkin"
  | "wellness_summary"
  | "anomalies"
  | "log_hydration"
  | "add_appointment"
  | "alert_family"
  | "greeting"
  | "smalltalk";

export type PlannedCall = { name: string; args: Record<string, unknown> };

export type Plan = {
  intent: Intent;
  calls: PlannedCall[];
};

const MED_WORDS =
  /\b(medicine|medicines|medication|medications|meds|pill|pills|tablet|tablets|dose|doses|insulin|metformin|lisinopril|atorvastatin|vitamin|aspirin|paracetamol)\b/i;
const TAKEN_WORDS = /\b(took|taken|take|had|swallowed|finished)\b/i;
const MISSED_WORDS = /\b(skip|skipped|missed|miss|forgot|forgotten|didn'?t take|did not take|haven'?t taken)\b/i;
/** Questions about the plan, not a log: "what medicines do I have today?" */
const PLAN_QUESTION =
  /\b(what|which|when|do i have|due|left|remaining|still need|schedule|scheduled|plan|supposed to take|should i take|list)\b/i;
const MEAL_WORDS = /\b(breakfast|lunch|dinner|supper|meal|meals|ate|eaten|eating|food|drank|drink)\b/i;
const MOOD_WORDS =
  /\b(feel|feeling|felt|mood|sad|lonely|alone|happy|anxious|worried|tired|exhausted|good|great|low|down|okay|ok|fine|unwell|poorly)\b/i;
const WEEK_WORDS = /\b(week|weekly|summary|recap|report|how (was|have|has|am|is)|overall|lately|been doing)\b/i;
const ANOMALY_WORDS =
  /\b(wrong|unusual|odd|strange|off|anomal\w*|concern\w*|worrying|problem|issue|routine|pattern|normal|out of the ordinary|anything i should know)\b/i;
const ALERT_WORDS =
  /\b(alert|tell (my|the) family|let (my|the) family know|call (my|the)|contact|notify|emergency|help me|daughter|son|family|carer|caregiver|nurse|doctor)\b/i;
const GREETING_WORDS = /^\s*(hi|hello|hey|good morning|good evening|good afternoon)\b[\s!.,]*$/i;

const POSITIVE = /\b(good|great|happy|wonderful|fine|better|bright|calm|lovely|well)\b/i;
const NEGATIVE =
  /\b(sad|lonely|alone|bad|tired|exhausted|anxious|low|down|awful|worried|pain|unwell|poorly|not feeling well|not well)\b/i;

const TIME_OF_DAY = /\b(morning|afternoon|evening|night|bedtime)\b/i;

const HYDRATION_WORDS = /\b(water|hydrat\w*|glass|glasses|cup|cups|drank|drink|drinking|sip|sipped|fluids?)\b/i;
const APPOINTMENT_WORDS =
  /\b(appointment|appointments|visit|visiting|checkup|check-?up|consultation|clinic|surgery|scan|x-?ray|booked|book|scheduled|see (?:my|the) (?:doctor|dentist|nurse|gp|physio)|meeting with)\b/i;
/** Explicit cries for help always outrank anything else in the message. */
const EXPLICIT_ALERT_WORDS =
  /\b(alert|tell (?:my|the) family|let (?:my|the) family know|notify|emergency|ambulance|help me|call (?:my|the))\b/i;

const WEEKDAYS = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
const MONTHS = [
  "january", "february", "march", "april", "may", "june",
  "july", "august", "september", "october", "november", "december",
];

const NUMBER_WORDS: Record<string, number> = {
  a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6,
  seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12, couple: 2, few: 3,
};

const isoDay = (date: Date) => {
  const copy = new Date(date.getTime());
  copy.setHours(12, 0, 0, 0); // midday avoids any DST edge shifting the day
  return copy.toISOString().slice(0, 10);
};

/** "two glasses", "a glass", "3 cups" -> a count. Defaults to one. */
export function extractGlasses(text: string): number {
  const digits = text.match(/\b(\d{1,2})\s*(?:glass|glasses|cup|cups)?\b/i);
  if (digits && Number.isFinite(Number(digits[1]))) {
    const value = Number(digits[1]);
    if (value >= 1 && value <= 20) return value;
  }

  const worded = [
    ...text
      .toLowerCase()
      .matchAll(
        /\b(a|an|one|two|three|four|five|six|seven|eight|nine|ten|eleven|twelve|couple|few)\b(?=[^.]*\b(?:glass|glasses|cup|cups|water)\b)/g,
      ),
  ].map((match) => match[1]);
  // "a couple of glasses" starts with an article: prefer a real quantity word.
  const quantity = worded.find((word) => word !== "a" && word !== "an") ?? worded[0];
  return quantity ? (NUMBER_WORDS[quantity] ?? 1) : 1;
}

/**
 * Turn everyday date talk into a calendar day.
 * Handles today/tomorrow, weekday names (next occurrence) and "3 March".
 */
export function extractDate(text: string, now = new Date()): string {
  const lower = text.toLowerCase();

  if (/\btoday\b/.test(lower)) return isoDay(now);
  if (/\btomorrow\b/.test(lower)) return isoDay(new Date(now.getTime() + 86400000));

  const weekday = lower.match(
    /\b(?:on\s+|next\s+|this\s+)?(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\b/,
  );
  if (weekday) {
    const target = WEEKDAYS.indexOf(weekday[1]);
    const current = now.getDay();
    let delta = (target - current + 7) % 7;
    // "on Friday" said on a Friday means the next one, not today.
    if (delta === 0 || /\bnext\s+\w+day\b/.test(lower)) delta = delta === 0 ? 7 : delta;
    return isoDay(new Date(now.getTime() + delta * 86400000));
  }

  const dayMonth = lower.match(/\b(\d{1,2})(?:st|nd|rd|th)?\s+(january|february|march|april|may|june|july|august|september|october|november|december)\b/);
  const monthDay = lower.match(/\b(january|february|march|april|may|june|july|august|september|october|november|december)\s+(\d{1,2})(?:st|nd|rd|th)?\b/);
  const parts = dayMonth
    ? { day: Number(dayMonth[1]), month: MONTHS.indexOf(dayMonth[2]) }
    : monthDay
      ? { day: Number(monthDay[2]), month: MONTHS.indexOf(monthDay[1]) }
      : null;
  if (parts && parts.month >= 0 && parts.day >= 1 && parts.day <= 31) {
    const candidate = new Date(now.getFullYear(), parts.month, parts.day, 12);
    if (candidate.getTime() < now.getTime() - 86400000) candidate.setFullYear(now.getFullYear() + 1);
    return isoDay(candidate);
  }

  const explicit = lower.match(/\b(\d{4}-\d{2}-\d{2})\b/);
  if (explicit && !Number.isNaN(Date.parse(explicit[1]))) return explicit[1];

  if (/\bnext week\b/.test(lower)) return isoDay(new Date(now.getTime() + 7 * 86400000));

  return isoDay(now);
}

/** "I have a doctor visit on Friday" -> "Doctor visit". */
export function extractAppointmentTitle(text: string): string {
  let title = text
    .replace(/^\s*(i\s+(?:have|have got|'ve got|got|need)|there is|there's|please\s+)?\s*/i, "")
    .replace(/\b(a|an|the)\b/gi, " ")
    .replace(
      /\b(on|next|this|at|in)?\s*(\d{1,2}(?:st|nd|rd|th)?\s+)?(today|tomorrow|next week|sunday|monday|tuesday|wednesday|thursday|friday|saturday|january|february|march|april|may|june|july|august|september|october|november|december)\b.*$/i,
      "",
    )
    .replace(/\b(\d{1,2})(st|nd|rd|th)?\b/g, " ")
    .replace(/\b(booked|scheduled|coming up|please|remember|remind me( about)?)\b/gi, " ")
    .replace(/[,.!?]+/g, " ")
    .replace(/\s+/g, " ")
    .replace(/\s*\b(on|at|in|next|this|for)\b\s*$/i, "")
    .trim();

  if (!title) title = "Appointment";
  return title.charAt(0).toUpperCase() + title.slice(1);
}

function normaliseTimeOfDay(value: string | undefined): string | undefined {
  if (!value) return undefined;
  const lower = value.toLowerCase();
  if (lower === "night" || lower === "bedtime") return "evening";
  if (lower === "morning" || lower === "afternoon" || lower === "evening") return lower;
  return undefined;
}

function extractMedication(text: string): string {
  const named = text.match(/\b(metformin|lisinopril|atorvastatin|vitamin d|vitamin|insulin|aspirin|paracetamol)\b/i);
  if (named) return named[1].replace(/\b\w/g, (char) => char.toUpperCase());
  const timed = text.match(TIME_OF_DAY);
  if (timed) return `${timed[1].replace(/\b\w/g, (char) => char.toUpperCase())} medication`;
  return "Daily medication";
}

function extractDose(text: string): string | undefined {
  const dose = text.match(/\b(\d+\s?(?:mg|ml|mcg|iu|units?))\b/i);
  return dose ? dose[1].replace(/\s+/g, "") : undefined;
}

function moodScore(text: string): number {
  if (/\b(amazing|wonderful|excellent|really good|very good)\b/i.test(text)) return 5;
  const negative = NEGATIVE.test(text);
  const positive = POSITIVE.test(text);
  if (negative && !positive) return 2;
  if (positive && !negative) return 4;
  if (negative && positive) return 3;
  return 3;
}

function extractMeals(text: string) {
  const mealsEaten: string[] = [];
  const mealsSkipped: string[] = [];
  const meals = ["breakfast", "lunch", "dinner", "supper"];

  for (const meal of meals) {
    const index = text.toLowerCase().indexOf(meal);
    if (index === -1) continue;
    // Look at the clause this meal sits in to decide eaten vs skipped.
    const clauseStart = Math.max(
      0,
      ...[". ", ", ", " but ", " and ", " though ", " however "]
        .map((sep) => text.toLowerCase().lastIndexOf(sep, index))
        .filter((position) => position >= 0),
    );
    const clause = text.slice(clauseStart, index + meal.length);
    if (MISSED_WORDS.test(clause) || /\bno\b/i.test(clause)) mealsSkipped.push(meal);
    else mealsEaten.push(meal);
  }
  return { mealsEaten, mealsSkipped };
}

/**
 * Keyword bridges for the non-English languages.
 *
 * The planner's rules are written in English. Rather than duplicating them ten
 * times, we spot the handful of words that matter in each language and append
 * the equivalent English hints before matching. The person's own words are
 * still what gets stored and echoed back.
 */
const MULTILINGUAL_HINTS: { pattern: RegExp; hint: string }[] = [
  // medicine
  { pattern: /(दवा|दवाई|गोली|खुराक)/i, hint: "medicine" },
  { pattern: /(மருந்|மாத்திரை)/i, hint: "medicine" },
  { pattern: /(మందు|మాత్ర)/i, hint: "medicine" },
  { pattern: /(medicina|medicamento|pastilla)/i, hint: "medicine" },
  { pattern: /(médicament|medicament|cachet|comprimé)/i, hint: "medicine" },
  { pattern: /(medikament|tablette|arznei)/i, hint: "medicine" },
  { pattern: /(دوا|حبوب|جرعة)/i, hint: "medicine" },
  { pattern: /(薬|くすり|服薬)/i, hint: "medicine" },
  // taken
  { pattern: /(ले लिया|ली|लिया)/i, hint: "took" },
  { pattern: /(எடுத்த|சாப்பிட்ட)/i, hint: "took" },
  { pattern: /(తీసుకున్న)/i, hint: "took" },
  { pattern: /(tomé|tomado|he tomado)/i, hint: "took" },
  { pattern: /(j'ai pris|ai pris|pris)/i, hint: "took" },
  { pattern: /(genommen|eingenommen)/i, hint: "took" },
  { pattern: /(أخذت|تناولت)/i, hint: "took" },
  { pattern: /(飲んだ|飲みました|のみました)/i, hint: "took" },
  // missed
  { pattern: /(छूट|भूल|नहीं ली)/i, hint: "missed" },
  { pattern: /(தவற|மறந்த)/i, hint: "missed" },
  { pattern: /(మర్చిపోయ|మిస్)/i, hint: "missed" },
  { pattern: /(olvidé|me salté|no tomé)/i, hint: "missed" },
  { pattern: /(oublié|j'ai oublié|sauté)/i, hint: "missed" },
  { pattern: /(vergessen|ausgelassen)/i, hint: "missed" },
  { pattern: /(نسيت|فاتت)/i, hint: "missed" },
  { pattern: /(忘れた|飲み忘れ)/i, hint: "missed" },
  // water
  { pattern: /(पानी|गिलास)/i, hint: "glasses of water" },
  { pattern: /(தண்ணீர்|டம்ளர்)/i, hint: "glasses of water" },
  { pattern: /(నీరు|గ్లాసు)/i, hint: "glasses of water" },
  { pattern: /(agua|vaso|vasos)/i, hint: "glasses of water" },
  { pattern: /(eau|verre|verres)/i, hint: "glasses of water" },
  { pattern: /(wasser|glas|gläser)/i, hint: "glasses of water" },
  { pattern: /(ماء|مياه|كوب|أكواب)/i, hint: "glasses of water" },
  { pattern: /(水|お水|水分)/i, hint: "glasses of water" },
  // week / summary
  { pattern: /(सप्ताह|हफ्ता|हफ़्ता)/i, hint: "week" },
  { pattern: /(வாரம்)/i, hint: "week" },
  { pattern: /(వారం)/i, hint: "week" },
  { pattern: /(semana)/i, hint: "week" },
  { pattern: /(semaine)/i, hint: "week" },
  { pattern: /(woche)/i, hint: "week" },
  { pattern: /(الأسبوع|اسبوعي)/i, hint: "week" },
  { pattern: /(今週|一週間)/i, hint: "week" },
  // family / alert
  { pattern: /(परिवार|घरवाल)/i, hint: "tell my family" },
  { pattern: /(குடும்ப)/i, hint: "tell my family" },
  { pattern: /(కుటుంబ)/i, hint: "tell my family" },
  { pattern: /(familia|avisar a mi familia)/i, hint: "tell my family" },
  { pattern: /(famille|préviens ma famille)/i, hint: "tell my family" },
  { pattern: /(familie|benachrichtige)/i, hint: "tell my family" },
  { pattern: /(عائلتي|العائلة|أبلغ)/i, hint: "tell my family" },
  { pattern: /(家族)/i, hint: "tell my family" },
  // appointment
  { pattern: /(अपॉइंटमेंट|मुलाकात|डॉक्टर)/i, hint: "appointment" },
  { pattern: /(சந்திப்பு|மருத்துவர்)/i, hint: "appointment" },
  { pattern: /(అపాయింట్|డాక్టర్)/i, hint: "appointment" },
  { pattern: /(cita|médico)/i, hint: "appointment" },
  { pattern: /(rendez-vous|médecin)/i, hint: "appointment" },
  { pattern: /(termin|arzt)/i, hint: "appointment" },
  { pattern: /(موعد|الطبيب)/i, hint: "appointment" },
  { pattern: /(予定|診察|予約)/i, hint: "appointment" },
  // routine check
  { pattern: /(दिनचर्या|कुछ गड़बड़)/i, hint: "anything wrong routine" },
  { pattern: /(வழக்கம்|ஏதாவது தவறு)/i, hint: "anything wrong routine" },
  { pattern: /(దినచర్య|ఏదైనా తప్పు)/i, hint: "anything wrong routine" },
  { pattern: /(rutina|algo mal)/i, hint: "anything wrong routine" },
  { pattern: /(routine|quelque chose ne va pas)/i, hint: "anything wrong routine" },
  { pattern: /(routine|stimmt etwas nicht)/i, hint: "anything wrong routine" },
  { pattern: /(روتين|خطأ ما)/i, hint: "anything wrong routine" },
  { pattern: /(生活|いつもと違う)/i, hint: "anything wrong routine" },
];

/** Append English hints so the English rules can read other languages too. */
export function withLanguageHints(text: string): string {
  const hints = MULTILINGUAL_HINTS.filter(({ pattern }) => pattern.test(text)).map(({ hint }) => hint);
  return hints.length === 0 ? text : `${text} ${[...new Set(hints)].join(" ")}`;
}

export function planTurn(rawText: string): Plan {
  const original = (rawText ?? "").toString();
  const text = withLanguageHints(original);

  // 1. An explicit cry for help always wins, before anything else is considered.
  if (EXPLICIT_ALERT_WORDS.test(text)) {
    const urgent = /\b(emergency|urgent|fall|fell|chest|can'?t breathe|ambulance|help me)\b/i.test(text);
    return {
      intent: "alert_family",
      calls: [
        {
          name: "alert_family",
          args: {
            message: original.trim() || "Please check in with me.",
            severity: urgent ? "urgent" : NEGATIVE.test(text) ? "warning" : "info",
          },
        },
      ],
    };
  }

  // 2. An appointment is a diary entry, even though it often names a doctor or nurse.
  if (APPOINTMENT_WORDS.test(text)) {
    return {
      intent: "add_appointment",
      calls: [
        {
          name: "add_appointment",
          args: {
            title: extractAppointmentTitle(original),
            date: extractDate(text),
          },
        },
      ],
    };
  }

  // 3. Water talk is hydration, not a meal, even though "drank" reads like one.
  if (HYDRATION_WORDS.test(text) && !MED_WORDS.test(text)) {
    return {
      intent: "log_hydration",
      calls: [{ name: "log_hydration", args: { glasses: extractGlasses(text) } }],
    };
  }

  // 4. Softer family mentions still reach the family circle.
  if (ALERT_WORDS.test(text)) {
    const urgent = /\b(emergency|urgent|fall|fell|chest|can'?t breathe|ambulance|help me)\b/i.test(text);
    return {
      intent: "alert_family",
      calls: [
        {
          name: "alert_family",
          args: {
            message: original.trim() || "Please check in with me.",
            severity: urgent ? "urgent" : NEGATIVE.test(text) ? "warning" : "info",
          },
        },
      ],
    };
  }

  // 5. Is something wrong with the routine? -> anomaly scan.
  if (ANOMALY_WORDS.test(text)) {
    return { intent: "anomalies", calls: [{ name: "detect_anomalies", args: { days: 7 } }] };
  }

  // 6. A question about medicines is a care-plan lookup, not a log.
  if (MED_WORDS.test(text) && (PLAN_QUESTION.test(text) || text.trim().endsWith("?"))) {
    const timeOfDay = normaliseTimeOfDay(text.match(TIME_OF_DAY)?.[1]);
    return {
      intent: "care_plan",
      calls: [{ name: "get_care_plan", args: timeOfDay ? { timeOfDay } : {} }],
    };
  }

  // 7. A statement about medicines is a log (taken or missed).
  if (MED_WORDS.test(text) && (TAKEN_WORDS.test(text) || MISSED_WORDS.test(text))) {
    const missed = MISSED_WORDS.test(text);
    return {
      intent: "log_medication",
      calls: [
        {
          name: "log_medication",
          args: {
            medication: extractMedication(text),
            dose: extractDose(text),
            status: missed ? "missed" : "taken",
            timeOfDay: normaliseTimeOfDay(text.match(TIME_OF_DAY)?.[1]),
          },
        },
      ],
    };
  }

  // 8. Weekly review.
  if (WEEK_WORDS.test(text)) {
    return { intent: "wellness_summary", calls: [{ name: "get_wellness_summary", args: { days: 7 } }] };
  }

  // 9. Meals and/or mood are a daily check-in.
  const mentionsMeal = MEAL_WORDS.test(text);
  const mentionsMood = MOOD_WORDS.test(text);
  if (mentionsMeal || mentionsMood) {
    const { mealsEaten, mealsSkipped } = mentionsMeal ? extractMeals(text) : { mealsEaten: [], mealsSkipped: [] };
    const args: Record<string, unknown> = { note: original.trim().slice(0, 240) };
    if (mealsEaten.length) args.mealsEaten = mealsEaten;
    if (mealsSkipped.length) args.mealsSkipped = mealsSkipped;
    if (mentionsMood) args.mood = moodScore(text);
    return { intent: "daily_checkin", calls: [{ name: "daily_checkin", args }] };
  }

  if (GREETING_WORDS.test(text)) {
    return { intent: "greeting", calls: [] };
  }

  return { intent: "smalltalk", calls: [] };
}

// ---------------------------------------------------------------- replies
// All user-facing wording lives in src/lib/replies.ts so every language is
// translated in one place. `lang` is a full BCP-47 tag such as "hi-IN".

export { describeDate, numberWord, findingText };
export type { Tone };

/** Back-compatible alias: the reply table for a language. */
export function stringsFor(lang: string): ReplyStrings {
  return repliesFor(lang);
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : {};
}

function toneFromPercent(percent: number | undefined): Tone {
  if (percent === undefined) return "good";
  if (percent >= 90) return "great";
  if (percent >= 70) return "good";
  return "low";
}

function toneFromScore(score: number | undefined): Tone {
  if (score === undefined) return "good";
  if (score >= 4) return "great";
  if (score <= 2) return "low";
  return "good";
}

function findAdherence(results: ToolResult[]): number | undefined {
  for (const result of results) {
    const data = asRecord(result.data);
    const nested = asRecord(data.adherence);
    if (typeof nested.adherence === "number") return nested.adherence;
    if (typeof data.adherence === "number") return data.adherence;
  }
  return undefined;
}

function findMoodAverage(results: ToolResult[]): number | undefined {
  for (const result of results) {
    const data = asRecord(result.data);
    const nested = asRecord(data.mood);
    if (typeof nested.average === "number") return nested.average;
    if (typeof data.average === "number") return data.average;
  }
  return undefined;
}

/**
 * Build the spoken reply in the selected language.
 * `lang` is the single shared language value (for example "ta-IN").
 */
export function composeReply(plan: Plan, results: ToolResult[], lang = "en-US"): string {
  const t = repliesFor(lang);
  if (results.some((result) => !result.ok)) return t.trouble;

  const first = asRecord(results[0]?.data);

  switch (plan.intent) {
    case "log_medication": {
      const missed = plan.calls[0]?.args.status === "missed" || first.status === "missed";
      return missed ? t.logged_missed : t.logged_taken(toneFromPercent(findAdherence(results)));
    }
    case "care_plan": {
      const remaining = Array.isArray(first.remaining)
        ? (first.remaining as { medication: string }[]).map((item) => item.medication)
        : [];
      return t.care_plan(remaining, remaining.length === 0);
    }
    case "daily_checkin": {
      const skippedMeals = Array.isArray(first.mealsSkipped) ? (first.mealsSkipped as string[]) : [];
      const eatenMeals = Array.isArray(first.mealsEaten) ? (first.mealsEaten as string[]) : [];
      const mood = typeof first.moodScore === "number" ? (first.moodScore as number) : undefined;
      // Feelings come first; meals only lead the reply when no mood was shared.
      if (mood !== undefined && (toneFromScore(mood) === "low" || skippedMeals.length + eatenMeals.length === 0)) {
        return t.checkin_mood(toneFromScore(mood));
      }
      if (skippedMeals.length || eatenMeals.length) return t.checkin_meals(skippedMeals.length > 0);
      return t.checkin_mood(toneFromScore(mood));
    }
    case "wellness_summary":
      return t.wellness(toneFromScore(findMoodAverage(results)), toneFromPercent(findAdherence(results)));
    case "anomalies": {
      const findings = Array.isArray(first.findings)
        ? (first.findings as { kind?: string; count?: number; detail?: string }[])
        : [];
      if (findings.length === 0) return t.anomalies_none;
      // Translate from the structured finding, never from the English detail.
      const translated = findingText(String(findings[0].kind ?? ""), Number(findings[0].count ?? 1), lang);
      return t.anomalies_found(translated || String(findings[0].detail ?? ""));
    }
    case "log_hydration": {
      const hydration = asRecord(first.hydration);
      const today = typeof hydration.today === "number" ? hydration.today : Number(first.glasses ?? 1);
      const goal = typeof hydration.goal === "number" ? hydration.goal : 8;
      return t.hydration(numberWord(today, lang), today >= goal);
    }
    case "add_appointment": {
      const title = typeof first.title === "string" ? first.title : "";
      const date = typeof first.date === "string" ? first.date : "";
      return t.appointment(title.toLowerCase(), describeDate(date, lang));
    }
    case "alert_family":
      return t.alerted;
    case "greeting":
      return t.greeting;
    default:
      return t.smalltalk;
  }
}

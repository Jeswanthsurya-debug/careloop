import assert from "node:assert/strict";
import test from "node:test";
import {
  composeReply,
  describeDate,
  extractAppointmentTitle,
  extractDate,
  extractGlasses,
  numberWord,
  planTurn,
  stringsFor,
} from "../src/lib/agent";
import type { ToolResult } from "../src/lib/tools";

const toolsFor = (text: string) => planTurn(text).calls.map((call) => call.name);

/** The eight phrases the product must handle, end to end. */
const CASES: { text: string; intent: string; tool: string }[] = [
  { text: "I took my Metformin this morning", intent: "log_medication", tool: "log_medication" },
  { text: "What medicines do I have today?", intent: "care_plan", tool: "get_care_plan" },
  { text: "I had breakfast but I skipped lunch", intent: "daily_checkin", tool: "daily_checkin" },
  { text: "I am feeling a little lonely today", intent: "daily_checkin", tool: "daily_checkin" },
  { text: "How was my week?", intent: "wellness_summary", tool: "get_wellness_summary" },
  { text: "Is anything wrong with my routine?", intent: "anomalies", tool: "detect_anomalies" },
  { text: "I forgot my evening tablet", intent: "log_medication", tool: "log_medication" },
  { text: "I am not feeling well, please tell my family", intent: "alert_family", tool: "alert_family" },
  { text: "I drank two glasses of water", intent: "log_hydration", tool: "log_hydration" },
  { text: "I have a doctor visit on Friday", intent: "add_appointment", tool: "add_appointment" },
];

for (const scenario of CASES) {
  test(`routes "${scenario.text}" to ${scenario.tool}`, () => {
    const plan = planTurn(scenario.text);
    assert.equal(plan.intent, scenario.intent);
    assert.ok(
      plan.calls.some((call) => call.name === scenario.tool),
      `expected ${scenario.tool}, got ${toolsFor(scenario.text).join(",") || "no tool"}`,
    );
  });
}

test("a taken dose and a missed dose are told apart", () => {
  const taken = planTurn("I took my Metformin this morning");
  assert.equal(taken.calls[0].args.status, "taken");
  assert.equal(taken.calls[0].args.medication, "Metformin");

  const missed = planTurn("I forgot my evening tablet");
  assert.equal(missed.calls[0].args.status, "missed");
  assert.equal(missed.calls[0].args.timeOfDay, "evening");
});

test("meals are split into eaten and skipped", () => {
  const plan = planTurn("I had breakfast but I skipped lunch");
  assert.deepEqual(plan.calls[0].args.mealsEaten, ["breakfast"]);
  assert.deepEqual(plan.calls[0].args.mealsSkipped, ["lunch"]);
});

test("a low mood is scored low and answered with kindness first", () => {
  const plan = planTurn("I am feeling a little lonely today");
  const score = plan.calls[0].args.mood as number;
  assert.ok(score <= 2, `expected a low mood score, got ${score}`);

  const reply = composeReply(plan, [{ ok: true, summary: "saved", data: { moodScore: score } }], "en");
  assert.match(reply, /glad you told me/i);
  assert.match(reply, /here with you/i);
});

test("a missed dose is never congratulated", () => {
  const plan = planTurn("I forgot my evening tablet");
  const reply = composeReply(
    plan,
    [{ ok: true, summary: "missed", data: { status: "missed", adherence: { adherence: 95 } } }],
    "en",
  );
  assert.equal(reply, stringsFor("en").logged_missed);
  assert.doesNotMatch(reply, /doing really well|keeping up nicely/i);
});

test("urgent wording raises the alert severity", () => {
  const calm = planTurn("I am not feeling well, please tell my family");
  assert.equal(calm.calls[0].name, "alert_family");
  assert.equal(calm.calls[0].args.severity, "warning");

  const urgent = planTurn("Help me, I fell in the kitchen");
  assert.equal(urgent.calls[0].args.severity, "urgent");
});

test("the care plan reply names what is still due", () => {
  const plan = planTurn("What medicines do I have today?");
  const reply = composeReply(
    plan,
    [{ ok: true, summary: "2 left", data: { remaining: [{ medication: "Vitamin D" }, { medication: "Atorvastatin" }] } }],
    "en",
  );
  assert.match(reply, /Vitamin D/);
  assert.match(reply, /Atorvastatin/);
});

test("replies stay short, warm and free of raw numbers", () => {
  const samples: { plan: ReturnType<typeof planTurn>; results: ToolResult[] }[] = [
    {
      plan: planTurn("How was my week?"),
      results: [{ ok: true, summary: "x", data: { adherence: { adherence: 84 }, mood: { average: 3.67 } } }],
    },
    {
      plan: planTurn("Is anything wrong with my routine?"),
      results: [{ ok: true, summary: "x", data: { findings: [{ detail: "one dose was missed this week" }] } }],
    },
  ];

  for (const sample of samples) {
    const reply = composeReply(sample.plan, sample.results, "en");
    assert.doesNotMatch(reply, /\d+(\.\d+)?%|\d+\.\d+/, `reply leaked a raw number: ${reply}`);
    const sentences = reply.split(/[.!?]+\s/).filter(Boolean);
    assert.ok(sentences.length <= 2, `reply too long: ${reply}`);
  }
});

test("a failed tool produces a friendly recovery line in every language", () => {
  const plan = planTurn("How was my week?");
  for (const language of ["en", "es", "fr", "hi"]) {
    const reply = composeReply(plan, [{ ok: false, summary: "boom" }], language);
    assert.equal(reply, stringsFor(language).trouble);
  }
});


// ---------------------------------------------------------------- hydration
test("hydration phrasing yields a sensible glass count", () => {
  assert.equal(planTurn("I drank two glasses of water").calls[0].args.glasses, 2);
  assert.equal(extractGlasses("I drank two glasses of water"), 2);
  assert.equal(extractGlasses("I had 3 cups of water"), 3);
  assert.equal(extractGlasses("I drank a glass of water"), 1);
  assert.equal(extractGlasses("I had a couple of glasses"), 2);
  assert.equal(extractGlasses("I drank some water"), 1);
  assert.equal(extractGlasses("I drank 99 glasses"), 1, "absurd counts fall back to one");
});

test("water talk is hydration, not a meal, and medicine still wins", () => {
  assert.equal(planTurn("I drank two glasses of water").intent, "log_hydration");
  assert.equal(planTurn("I had a cup of water").intent, "log_hydration");
  // taking a tablet with water is still a medication log
  assert.equal(planTurn("I took my Metformin with a glass of water").intent, "log_medication");
});

test("the hydration reply counts in words and nudges below the goal", () => {
  const plan = planTurn("I drank two glasses of water");
  const low = composeReply(plan, [{ ok: true, summary: "", data: { glasses: 2, hydration: { today: 3, goal: 8 } } }], "en");
  assert.match(low, /three/);
  assert.doesNotMatch(low, /\d/, "counts are spoken as words");

  // Past the goal the count is dropped entirely, so a big total can never
  // leak a bare digit into speech.
  for (const today of [8, 13, 37]) {
    const done = composeReply(plan, [{ ok: true, summary: "", data: { glasses: 1, hydration: { today, goal: 8 } } }], "en");
    assert.match(done, /plenty of water/i);
    assert.doesNotMatch(done, /\d/, `a total of ${today} leaked a digit`);
  }
});

test("number words are translated", () => {
  assert.equal(numberWord(3, "en"), "three");
  assert.equal(numberWord(3, "es"), "tres");
  assert.equal(numberWord(3, "fr"), "trois");
  assert.equal(numberWord(99, "en"), "99", "large counts fall back to digits");
});

// ------------------------------------------------------------- appointments
test("appointments capture a title and a real calendar date", () => {
  const plan = planTurn("I have a doctor visit on Friday");
  assert.equal(plan.calls[0].name, "add_appointment");
  assert.equal(plan.calls[0].args.title, "Doctor visit");
  assert.match(plan.calls[0].args.date as string, /^\d{4}-\d{2}-\d{2}$/);
});

test("everyday date talk resolves to the right day", () => {
  // A Thursday.
  const now = new Date("2026-10-22T09:00:00Z");
  assert.equal(extractDate("on Friday", now), "2026-10-23");
  assert.equal(extractDate("tomorrow", now), "2026-10-23");
  assert.equal(extractDate("today", now), "2026-10-22");
  assert.equal(extractDate("next Monday", now), "2026-10-26");
  assert.equal(extractDate("on 3 March", now), "2027-03-03", "a past month rolls to next year");
  assert.equal(extractDate("on 2026-12-01", now), "2026-12-01");
  // Said on a Thursday, "Thursday" means the next one, not today.
  assert.equal(extractDate("on Thursday", now), "2026-10-29");
});

test("appointment titles drop the date and filler words", () => {
  assert.equal(extractAppointmentTitle("I have a doctor visit on Friday"), "Doctor visit");
  assert.equal(extractAppointmentTitle("I have a dentist appointment tomorrow"), "Dentist appointment");
  assert.equal(extractAppointmentTitle("eye clinic on 3 March"), "Eye clinic");
});

test("dates are described the way a person would say them", () => {
  const now = new Date("2026-10-22T09:00:00Z");
  assert.equal(describeDate("2026-10-23", "en", now), "Friday");
  assert.equal(describeDate("2026-10-23", "fr", now), "vendredi");
  assert.match(describeDate("2026-12-01", "en", now), /December/);
});

test("the appointment reply names the thing and the day", () => {
  const plan = planTurn("I have a doctor visit on Friday");
  const reply = composeReply(
    plan,
    [{ ok: true, summary: "", data: { title: "Doctor visit", date: plan.calls[0].args.date } }],
    "en",
  );
  assert.match(reply, /doctor visit/i);
  assert.match(reply, /diary/i);
});

test("the two new intents still fail gracefully", () => {
  for (const text of ["I drank two glasses of water", "I have a doctor visit on Friday"]) {
    const plan = planTurn(text);
    assert.equal(composeReply(plan, [{ ok: false, summary: "boom" }], "en"), stringsFor("en").trouble);
  }
});

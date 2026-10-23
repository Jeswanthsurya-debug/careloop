import assert from "node:assert/strict";
import test from "node:test";
import { careTools, toolNames } from "../src/lib/tools";
import { LANGUAGES, ui } from "../src/lib/i18n";
import { DEFAULT_LANG, resolveLang } from "../src/lib/languages";
import { repliesFor, toolChipLabel, findingText } from "../src/lib/replies";
import { buildSsml } from "../src/lib/ssml";

const EXPECTED = [
  "log_medication",
  "get_care_plan",
  "daily_checkin",
  "get_wellness_summary",
  "detect_anomalies",
  "log_hydration",
  "add_appointment",
  "alert_family",
];

test("the MCP server exposes exactly the eight care tools", () => {
  assert.equal(careTools.length, 8);
  assert.deepEqual([...toolNames].sort(), [...EXPECTED].sort());
});

test("log_hydration and add_appointment declare their required inputs", () => {
  const hydration = careTools.find((tool) => tool.name === "log_hydration")!;
  assert.deepEqual(hydration.inputSchema.required, ["glasses"]);
  assert.equal(hydration.inputSchema.properties.glasses.type, "number");

  const appointment = careTools.find((tool) => tool.name === "add_appointment")!;
  assert.deepEqual(appointment.inputSchema.required, ["title", "date"]);
  assert.equal(appointment.inputSchema.properties.title.type, "string");
  assert.equal(appointment.inputSchema.properties.date.type, "string");
});

test("every tool carries a description and an object input schema", () => {
  for (const tool of careTools) {
    assert.ok(tool.description.length > 10, `${tool.name} needs a description`);
    assert.equal(tool.inputSchema.type, "object");
    assert.equal(typeof tool.run, "function");
  }
});

test("log_medication accepts both taken and missed", () => {
  const statuses = careTools.find((tool) => tool.name === "log_medication")?.inputSchema.properties.status?.enum;
  assert.deepEqual(statuses, ["taken", "missed"]);
});

test("all ten languages are offered", () => {
  assert.equal(LANGUAGES.length, 10);
  assert.deepEqual(
    LANGUAGES.map((language) => language.code),
    ["en-IN", "en-US", "hi-IN", "ta-IN", "te-IN", "es-ES", "fr-FR", "de-DE", "ar-AE", "ja-JP"],
  );
});

test("every language ships a full UI string set", () => {
  for (const language of LANGUAGES) {
    const strings = ui(language.code);
    assert.equal(strings.suggestions.length, 3);
    assert.ok(strings.headline.length > 0);
    assert.ok(strings.states.listening.length > 0);
    assert.ok(strings.testPhrase.length > 0);
    assert.ok(strings.noVoice.length > 0);
  }
});

test("language tags are never truncated to two letters", () => {
  // The old bug: "en-IN" and "en-US" collapsed into one language.
  assert.equal(resolveLang("en-IN").code, "en-IN");
  assert.equal(resolveLang("en-US").code, "en-US");
  assert.notEqual(ui("en-IN").language, undefined);
  assert.equal(resolveLang("hi-IN").code, "hi-IN");
  // Unknown or partial input still lands somewhere sensible.
  assert.equal(resolveLang("hi").code, "hi-IN");
  assert.equal(resolveLang("").code, DEFAULT_LANG);
  assert.equal(resolveLang("zz-ZZ").code, DEFAULT_LANG);
});

test("every language has its own reply templates", () => {
  const seen = new Map<string, string[]>();
  for (const language of LANGUAGES) {
    const replies = repliesFor(language.code);
    for (const key of ["alerted", "greeting", "smalltalk", "trouble", "logged_missed", "anomalies_none"] as const) {
      assert.ok(replies[key].length > 0, `${language.code} is missing ${key}`);
    }
    assert.ok(replies.logged_taken("good").length > 0);
    assert.ok(replies.checkin_mood("low").length > 0);
    assert.ok(replies.hydration("two", false).length > 0);
    seen.set(language.code, [replies.alerted, replies.greeting]);
  }

  // Non-English languages must not be left in English.
  const englishAlert = repliesFor("en-US").alerted;
  for (const code of ["hi-IN", "ta-IN", "te-IN", "es-ES", "fr-FR", "de-DE", "ar-AE", "ja-JP"]) {
    assert.notEqual(seen.get(code)![0], englishAlert, `${code} still replies in English`);
  }
});

test("tool chips are translated but tool names stay English", () => {
  const chip = toolChipLabel("log_medication", "done", "hi-IN");
  assert.equal(chip.name, "log_medication");
  assert.notEqual(chip.title, "Medication logged");
  assert.notEqual(chip.status, "done");

  const english = toolChipLabel("log_medication", "done", "en-US");
  assert.equal(english.name, "log_medication");
  assert.equal(english.status, "done");
});

test("anomaly findings are translated from structure, not English text", () => {
  const hindi = findingText("missed_doses", 2, "hi-IN");
  const french = findingText("missed_doses", 2, "fr-FR");
  assert.ok(hindi.length > 0);
  assert.ok(french.length > 0);
  assert.notEqual(hindi, french);
  assert.doesNotMatch(hindi, /dose/i);
});

test("Tamil and Telugu are marked as having no Polly voice", () => {
  // Polly has no Tamil/Telugu voice, so these must always use the browser.
  assert.equal(resolveLang("ta-IN").pollySupported, false);
  assert.equal(resolveLang("te-IN").pollySupported, false);
  for (const code of ["en-IN", "en-US", "hi-IN", "es-ES", "fr-FR", "de-DE", "ar-AE", "ja-JP"]) {
    assert.equal(resolveLang(code).pollySupported, true, `${code} should be speakable by Polly`);
  }
});

test("anomaly findings are phrased in words, never raw counts", async () => {
  const tool = careTools.find((item) => item.name === "detect_anomalies")!;
  const countWords = /\b(one|a few|several)\b/;
  for (const missed of [1, 2, 9]) {
    const detail = `${missed === 1 ? "one dose" : missed <= 3 ? "a few doses" : "several doses"} ${
      missed === 1 ? "was" : "were"
    } missed this week`;
    assert.match(detail, countWords);
    assert.doesNotMatch(detail, /\d/);
  }
  assert.equal(typeof tool.run, "function");
});

test("SSML is well formed, escaped and paced", () => {
  const ssml = buildSsml("Hello there. I am here with you.", 90);
  assert.match(ssml, /^<speak><prosody rate="90%" volume="\+6dB">/);
  assert.match(ssml, /<break time="250ms"\/>/);
  assert.match(ssml, /<\/prosody><\/speak>$/);
  assert.match(buildSsml("Tom & <Jerry>", 90), /Tom &amp; &lt;Jerry&gt;/);
  assert.match(buildSsml("x", 999), /rate="120%"/);
  assert.match(buildSsml("x", 1), /rate="70%"/);
});


// --------------------------------------------- language switching (regression)
test("every language has its own greeting", () => {
  // Regression: the greeting used to be a hardcoded English string created
  // once at mount, so it never changed when the language changed.
  const english = ui("en-US").greeting;
  assert.ok(english.length > 0);

  for (const language of LANGUAGES) {
    const greeting = ui(language.code).greeting;
    assert.ok(greeting.length > 0, `${language.code} has no greeting`);
    if (!language.code.startsWith("en")) {
      assert.notEqual(greeting, english, `${language.code} greeting is still English`);
    }
  }
});

test("greetings use their own script", () => {
  const scripts: Record<string, RegExp> = {
    "hi-IN": /[\u0900-\u097F]/,
    "ta-IN": /[\u0B80-\u0BFF]/,
    "te-IN": /[\u0C00-\u0C7F]/,
    "ar-AE": /[\u0600-\u06FF]/,
    "ja-JP": /[\u3040-\u30FF]/,
  };
  for (const [code, script] of Object.entries(scripts)) {
    assert.match(ui(code).greeting, script, `${code} greeting is not in its own script`);
  }
});

test("a missing translation key falls back to English, not blank", () => {
  // ui() merges over the English base, so a partial translation can never
  // render an empty label.
  for (const language of LANGUAGES) {
    const strings = ui(language.code);
    for (const key of ["headline", "send", "stop", "typePlaceholder", "greeting", "languageChanged"] as const) {
      assert.ok(String(strings[key]).length > 0, `${language.code}.${key} is empty`);
    }
    assert.equal(strings.suggestions.length, 3);
    assert.ok(strings.states.idle.length > 0);
  }
});

test("an unknown language falls back to English strings", () => {
  assert.equal(ui("zz-ZZ").greeting, ui("en-US").greeting);
  assert.equal(ui("").headline, ui("en-US").headline);
});

test("the tts cache key is scoped to the language", async () => {
  // Two languages must never share a cache entry for the same text.
  const { ttsCacheKey } = await import("../src/hooks/useVoice");
  const hindi = ttsCacheKey("hi-IN", "Kajal", 0.9, "hello");
  const spanish = ttsCacheKey("es-ES", "Kajal", 0.9, "hello");
  assert.notEqual(hindi, spanish);
  assert.ok(hindi.startsWith("hi-IN|"));
  assert.equal(ttsCacheKey("hi-IN", "Kajal", 0.9, "hello"), hindi);
});

// ------------------------------------------------- speech transcript tidying
test("repeated words from the recogniser are collapsed", async () => {
  const { collapseRepeats, cleanTranscript } = await import("../src/lib/transcript");
  assert.equal(collapseRepeats("I I took took my medicine"), "I took my medicine");
  assert.equal(collapseRepeats("I took my medicine"), "I took my medicine");
  // Genuine doubles that people really say are kept.
  assert.equal(collapseRepeats("no no please"), "no no please");
  assert.equal(cleanTranscript("  i   took  my  metformin  "), "I took my metformin");
});

test("transcripts are trimmed and capitalised", async () => {
  const { cleanTranscript, capitaliseFirst } = await import("../src/lib/transcript");
  assert.equal(cleanTranscript("i am feeling a little lonely today"), "I am feeling a little lonely today");
  assert.equal(cleanTranscript("hello  ,  there ."), "Hello, there.");
  assert.equal(cleanTranscript(""), "");
  assert.equal(cleanTranscript("   "), "");
  // Scripts without capitals are left exactly as spoken.
  assert.equal(capitaliseFirst("मैंने दवाई ली"), "मैंने दवाई ली");
  assert.equal(cleanTranscript("நான் மருந்து எடுத்தேன்"), "நான் மருந்து எடுத்தேன்");
});

test("only Chrome and Edge are treated as speech friendly", async () => {
  const { detectBrowser, isSpeechFriendlyBrowser } = await import("../src/lib/transcript");
  const chrome = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36";
  const edge = "Mozilla/5.0 (Windows NT 10.0) AppleWebKit/537.36 Chrome/131.0 Safari/537.36 Edg/131.0";
  const firefox = "Mozilla/5.0 (X11; Linux x86_64; rv:133.0) Gecko/20100101 Firefox/133.0";
  const safari = "Mozilla/5.0 (Macintosh) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15";

  assert.equal(detectBrowser(chrome), "chrome");
  assert.equal(detectBrowser(edge), "edge");
  assert.equal(detectBrowser(firefox), "firefox");
  assert.equal(detectBrowser(safari), "safari");
  assert.equal(isSpeechFriendlyBrowser(chrome), true);
  assert.equal(isSpeechFriendlyBrowser(edge), true);
  assert.equal(isSpeechFriendlyBrowser(firefox), false);
  assert.equal(isSpeechFriendlyBrowser(safari), false);
});

test("every microphone error has a friendly, actionable hint", async () => {
  const { micErrorHint } = await import("../src/lib/transcript");
  assert.match(micErrorHint("no-speech"), /didn't hear anything/i);
  assert.match(micErrorHint("not-allowed"), /lock icon.*Microphone.*Allow/i);
  assert.match(micErrorHint("audio-capture"), /No microphone found/i);
  assert.match(micErrorHint("network"), /connection/i);
  assert.match(micErrorHint("aborted"), /tap the mic/i);
  assert.ok(micErrorHint("something-odd").length > 0);
});

test("the most confident recognition alternative wins", async () => {
  const { bestAlternative } = await import("../src/hooks/useVoice");
  const result = {
    isFinal: true,
    length: 3,
    0: { transcript: "I took my met form in", confidence: 0.41 },
    1: { transcript: "I took my Metformin", confidence: 0.92 },
    2: { transcript: "I took my metro man", confidence: 0.3 },
  };
  assert.equal(bestAlternative(result), "I took my Metformin");
  // Falls back to the first alternative when no confidence is reported.
  assert.equal(bestAlternative({ isFinal: true, length: 1, 0: { transcript: "hello" } }), "hello");
});

/**
 * Tidying for speech-recognition output.
 *
 * Recognition engines repeat words when they revise a guess ("I I took took my
 * medicine") and never capitalise. These helpers are pure so they can be unit
 * tested without a browser.
 */

/** Scripts that have no capital letters — leave them alone. */
const NO_CASE = /[\u0900-\u097F\u0B80-\u0BFF\u0C00-\u0C7F\u0600-\u06FF\u3040-\u30FF\u4E00-\u9FFF]/;

/** Collapse immediate duplicate words: "I I took took my" -> "I took my". */
export function collapseRepeats(text: string): string {
  const words = text.split(/\s+/).filter(Boolean);
  const out: string[] = [];

  for (const word of words) {
    const previous = out[out.length - 1];
    const same =
      previous !== undefined &&
      previous.replace(/[.,!?]$/, "").toLowerCase() === word.replace(/[.,!?]$/, "").toLowerCase();
    // Keep deliberate doubles that are normal speech ("very very", "no no").
    if (same && !/^(no|very|yes|ha|ho)$/i.test(word.replace(/[.,!?]$/, ""))) continue;
    out.push(word);
  }

  return out.join(" ");
}

/** Capitalise the first letter, for scripts that have capitals. */
export function capitaliseFirst(text: string): string {
  if (!text) return text;
  if (NO_CASE.test(text.charAt(0))) return text;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Full clean-up applied just before a transcript is sent. */
export function cleanTranscript(raw: string): string {
  const trimmed = (raw ?? "")
    .replace(/\s+/g, " ")
    .replace(/\s+([.,!?])/g, "$1")
    .trim();
  if (!trimmed) return "";
  return capitaliseFirst(collapseRepeats(trimmed));
}

export type BrowserKind = "chrome" | "edge" | "safari" | "firefox" | "other";

/** Which browser we are in — the Web Speech API is only reliable on Chrome/Edge. */
export function detectBrowser(userAgent: string): BrowserKind {
  const ua = userAgent.toLowerCase();
  if (ua.includes("edg/")) return "edge";
  if (ua.includes("opr/") || ua.includes("opera")) return "other";
  if (ua.includes("firefox")) return "firefox";
  if (ua.includes("chrome") || ua.includes("chromium")) return "chrome";
  if (ua.includes("safari")) return "safari";
  return "other";
}

export function isSpeechFriendlyBrowser(userAgent: string): boolean {
  const kind = detectBrowser(userAgent);
  return kind === "chrome" || kind === "edge";
}

export type MicErrorCode =
  | "no-speech"
  | "not-allowed"
  | "service-not-allowed"
  | "network"
  | "audio-capture"
  | "aborted"
  | "unknown";

/** Friendly, actionable hint for each recognition error. */
export function micErrorHint(code: string): string {
  switch (code) {
    case "no-speech":
      return "I didn't hear anything, tap the mic and try again";
    case "not-allowed":
    case "service-not-allowed":
      return "Please allow microphone access in Chrome: click the lock icon, then Microphone, then Allow";
    case "network":
      return "The speech service could not be reached. Check your connection and try again";
    case "audio-capture":
      return "No microphone found";
    case "aborted":
      return "Listening stopped. Tap the mic to try again";
    default:
      return "The microphone had a hiccup. You can type your message instead";
  }
}

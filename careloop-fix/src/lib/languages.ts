/**
 * One canonical language list for the whole app.
 *
 * `code` is a BCP-47 tag (for example "hi-IN") and is THE single shared value:
 * the UI, the mic, the chat request and the /tts request all use it unchanged.
 * Nothing in the pipeline may truncate it to two letters — that is what used to
 * make "English (India)" and "English (US)" collapse into one language.
 */
export type LangCode =
  | "en-IN"
  | "en-US"
  | "hi-IN"
  | "ta-IN"
  | "te-IN"
  | "es-ES"
  | "fr-FR"
  | "de-DE"
  | "ar-AE"
  | "ja-JP";

export type Language = {
  code: LangCode;
  /** Shown in the dropdown, in the language's own script. */
  label: string;
  /** English name, used in the Bedrock system prompt. */
  englishName: string;
  /** Right-to-left script. */
  rtl: boolean;
  /**
   * Whether Amazon Polly has any voice for this language at all.
   * Tamil and Telugu have none, so they always use the browser voice.
   */
  pollySupported: boolean;
};

export const LANGUAGES: Language[] = [
  { code: "en-IN", label: "English (India)", englishName: "English", rtl: false, pollySupported: true },
  { code: "en-US", label: "English (US)", englishName: "English", rtl: false, pollySupported: true },
  { code: "hi-IN", label: "हिन्दी", englishName: "Hindi", rtl: false, pollySupported: true },
  { code: "ta-IN", label: "தமிழ்", englishName: "Tamil", rtl: false, pollySupported: false },
  { code: "te-IN", label: "తెలుగు", englishName: "Telugu", rtl: false, pollySupported: false },
  { code: "es-ES", label: "Español", englishName: "Spanish", rtl: false, pollySupported: true },
  { code: "fr-FR", label: "Français", englishName: "French", rtl: false, pollySupported: true },
  { code: "de-DE", label: "Deutsch", englishName: "German", rtl: false, pollySupported: true },
  { code: "ar-AE", label: "العربية", englishName: "Arabic", rtl: true, pollySupported: true },
  { code: "ja-JP", label: "日本語", englishName: "Japanese", rtl: false, pollySupported: true },
];

export const DEFAULT_LANG: LangCode = "en-US";

export const LANG_CODES = LANGUAGES.map((language) => language.code);

const BY_CODE = new Map(LANGUAGES.map((language) => [language.code.toLowerCase(), language]));

/**
 * Accept anything the caller sends and land on a supported language.
 * Exact tag wins; otherwise the first language sharing the base ("hi" -> hi-IN).
 */
export function resolveLang(value: unknown): Language {
  const raw = (value ?? "").toString().trim();
  if (!raw) return BY_CODE.get(DEFAULT_LANG.toLowerCase())!;

  const normalised = raw.replace("_", "-").toLowerCase();
  const exact = BY_CODE.get(normalised);
  if (exact) return exact;

  const base = normalised.split("-")[0];
  const sameBase = LANGUAGES.find((language) => language.code.toLowerCase().split("-")[0] === base);
  return sameBase ?? BY_CODE.get(DEFAULT_LANG.toLowerCase())!;
}

export function langCode(value: unknown): LangCode {
  return resolveLang(value).code;
}

/** The storage key the browser uses to remember the choice. */
export const LANG_STORAGE_KEY = "careloop.lang.v1";

import crypto from "node:crypto";
import { LANGUAGES, resolveLang, type LangCode } from "./languages";

/**
 * Amazon Polly access.
 *
 * Voices are never hardcoded: at startup we call DescribeVoices once and cache
 * the result, then pick the best *verified* voice for the requested language.
 * If we cannot verify a voice (no credentials, API down, or a language Polly
 * does not speak such as Tamil/Telugu) we say so and the browser voice is used.
 */

const SERVICE = "polly";

export type PollyVoice = {
  id: string;
  name: string;
  languageCode: string;
  languageName: string;
  gender: string;
  engines: string[];
};

export type ChosenVoice = {
  id: string;
  languageCode: string;
  engine: "neural" | "standard";
};

type DescribeVoicesResponse = {
  Voices?: {
    Id?: string;
    Name?: string;
    LanguageCode?: string;
    LanguageName?: string;
    Gender?: string;
    SupportedEngines?: string[];
  }[];
};

/**
 * Preferred voices per language. These only *rank* what DescribeVoices
 * actually returned — a name here is never used unless Polly confirms it.
 */
const PREFERRED: Record<LangCode, string[]> = {
  "en-IN": ["Kajal"],
  "en-US": ["Joanna", "Danielle", "Ruth", "Matthew"],
  "hi-IN": ["Kajal", "Aditi"],
  "ta-IN": [],
  "te-IN": [],
  "es-ES": ["Lucia", "Sergio", "Conchita"],
  "fr-FR": ["Lea", "Léa", "Remi", "Rémi"],
  "de-DE": ["Vicki", "Daniel", "Marlene"],
  "ar-AE": ["Hala", "Zayd"],
  "ja-JP": ["Tomoko", "Kazuha", "Takumi", "Mizuki"],
};

/** Languages Polly can serve from a neighbouring locale if the exact tag is absent. */
const LOCALE_ALIASES: Partial<Record<LangCode, string[]>> = {
  "es-ES": ["es-MX", "es-US"],
  "en-IN": ["en-GB", "en-US"],
  "ar-AE": ["arb"],
};

function region() {
  return process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
}

function credentials() {
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY;
  if (!accessKeyId || !secretAccessKey) return null;
  return { accessKeyId, secretAccessKey, sessionToken: process.env.AWS_SESSION_TOKEN };
}

/** Lets tests point the app at a mock Polly. */
function endpoint() {
  const override = process.env.AWS_ENDPOINT_URL_POLLY;
  if (override) return override.replace(/\/$/, "");
  return `https://polly.${region()}.amazonaws.com`;
}

function hmac(key: crypto.BinaryLike | Buffer, data: string) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256(data: string) {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

/** Minimal SigV4 for Polly. Returns the headers to send. */
function sign(method: "GET" | "POST", path: string, query: string, payload: string) {
  const creds = credentials();
  if (!creds) return null;

  const url = new URL(endpoint());
  const host = url.host;
  const now = new Date();
  const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
  const dateStamp = amzDate.slice(0, 8);
  const payloadHash = sha256(payload);

  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": amzDate,
  };
  if (method === "POST") headers["content-type"] = "application/json";
  if (creds.sessionToken) headers["x-amz-security-token"] = creds.sessionToken;

  const signedHeaders = Object.keys(headers).sort().join(";");
  const canonicalHeaders = Object.keys(headers)
    .sort()
    .map((key) => `${key}:${headers[key]}\n`)
    .join("");

  const canonicalRequest = [method, path, query, canonicalHeaders, signedHeaders, payloadHash].join("\n");
  const scope = `${dateStamp}/${region()}/${SERVICE}/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");

  const kDate = hmac(`AWS4${creds.secretAccessKey}`, dateStamp);
  const kRegion = hmac(kDate, region());
  const kService = hmac(kRegion, SERVICE);
  const kSigning = hmac(kService, "aws4_request");
  const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

  return {
    ...headers,
    authorization: `AWS4-HMAC-SHA256 Credential=${creds.accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  };
}

// ---------------------------------------------------------------- catalogue
type Catalogue = { voices: PollyVoice[]; fetchedAt: number; available: boolean; reason?: string };

const CACHE_TTL_MS = 10 * 60 * 1000;
let catalogue: Catalogue | null = null;
let inFlight: Promise<Catalogue> | null = null;

async function fetchCatalogue(): Promise<Catalogue> {
  if (!credentials()) {
    return { voices: [], fetchedAt: Date.now(), available: false, reason: "no-credentials" };
  }

  try {
    const headers = sign("GET", "/v1/voices", "", "");
    if (!headers) {
      return { voices: [], fetchedAt: Date.now(), available: false, reason: "no-credentials" };
    }

    const response = await fetch(`${endpoint()}/v1/voices`, { method: "GET", headers });
    if (!response.ok) {
      console.error("Polly DescribeVoices failed", response.status);
      return { voices: [], fetchedAt: Date.now(), available: false, reason: `describe-voices-${response.status}` };
    }

    const body = (await response.json()) as DescribeVoicesResponse;
    const voices: PollyVoice[] = (body.Voices ?? [])
      .filter((voice) => voice.Id && voice.LanguageCode)
      .map((voice) => ({
        id: String(voice.Id),
        name: String(voice.Name ?? voice.Id),
        languageCode: String(voice.LanguageCode),
        languageName: String(voice.LanguageName ?? voice.LanguageCode),
        gender: String(voice.Gender ?? ""),
        engines: Array.isArray(voice.SupportedEngines) ? voice.SupportedEngines.map(String) : ["standard"],
      }));

    return { voices, fetchedAt: Date.now(), available: true };
  } catch (error) {
    console.error("Polly DescribeVoices error", error);
    return { voices: [], fetchedAt: Date.now(), available: false, reason: "describe-voices-error" };
  }
}

/** Cached DescribeVoices. The first call warms the cache for everyone. */
export async function getCatalogue(force = false): Promise<Catalogue> {
  const fresh = catalogue && Date.now() - catalogue.fetchedAt < CACHE_TTL_MS;
  if (!force && fresh) return catalogue!;
  if (inFlight) return inFlight;

  inFlight = fetchCatalogue().then((result) => {
    catalogue = result;
    inFlight = null;
    return result;
  });
  return inFlight;
}

/** Test seam: drop the cache so the next call re-reads DescribeVoices. */
export function resetCatalogue() {
  catalogue = null;
  inFlight = null;
}

function rank(voice: PollyVoice, preferred: string[]) {
  const index = preferred.findIndex((name) => name.toLowerCase() === voice.id.toLowerCase());
  const byName = index === -1 ? preferred.length + 1 : index;
  const neural = voice.engines.includes("neural") ? 0 : 1;
  // Neural first, then our preference order.
  return neural * 100 + byName;
}

/** Every verified Polly voice for a language, best first. */
export async function voicesForLanguage(code: string): Promise<PollyVoice[]> {
  const language = resolveLang(code);
  if (!language.pollySupported) return [];

  const { voices } = await getCatalogue();
  if (voices.length === 0) return [];

  const wanted = [language.code, ...(LOCALE_ALIASES[language.code] ?? [])].map((tag) => tag.toLowerCase());
  const matches = voices.filter((voice) => wanted.includes(voice.languageCode.toLowerCase()));

  const preferred = PREFERRED[language.code] ?? [];
  return [...matches].sort((a, b) => {
    // Exact locale beats an alias.
    const aExact = a.languageCode.toLowerCase() === language.code.toLowerCase() ? 0 : 1;
    const bExact = b.languageCode.toLowerCase() === language.code.toLowerCase() ? 0 : 1;
    if (aExact !== bExact) return aExact - bExact;
    return rank(a, preferred) - rank(b, preferred);
  });
}

export type VoiceSelection =
  | { ok: true; voice: ChosenVoice }
  | { ok: false; reason: "language-unsupported" | "no-voice" | "catalogue-unavailable" };

/**
 * Pick the best verified voice for a language.
 * `requestedId` is honoured only if Polly confirms that voice exists.
 */
export async function selectVoice(code: string, requestedId?: string): Promise<VoiceSelection> {
  const language = resolveLang(code);
  if (!language.pollySupported) return { ok: false, reason: "language-unsupported" };

  const { available } = await getCatalogue();
  if (!available) return { ok: false, reason: "catalogue-unavailable" };

  const options = await voicesForLanguage(language.code);
  if (options.length === 0) return { ok: false, reason: "no-voice" };

  const requested = requestedId
    ? options.find((voice) => voice.id.toLowerCase() === requestedId.toLowerCase())
    : undefined;
  const chosen = requested ?? options[0];

  return {
    ok: true,
    voice: {
      id: chosen.id,
      languageCode: chosen.languageCode,
      engine: chosen.engines.includes("neural") ? "neural" : "standard",
    },
  };
}

/** SynthesizeSpeech. Returns null when Polly could not produce audio. */
export async function synthesize(ssml: string, voice: ChosenVoice): Promise<Buffer | null> {
  const payload = JSON.stringify({
    Engine: voice.engine,
    OutputFormat: "mp3",
    TextType: "ssml",
    Text: ssml,
    VoiceId: voice.id,
    LanguageCode: voice.languageCode,
  });

  const headers = sign("POST", "/v1/speech", "", payload);
  if (!headers) return null;

  try {
    const response = await fetch(`${endpoint()}/v1/speech`, { method: "POST", headers, body: payload });
    if (!response.ok) {
      console.error("Polly synthesis failed", response.status, await response.text().catch(() => ""));
      return null;
    }
    return Buffer.from(await response.arrayBuffer());
  } catch (error) {
    console.error("Polly synthesis error", error);
    return null;
  }
}

/** Languages we can definitely speak with Polly right now (used by the UI). */
export async function speakableLanguages(): Promise<Record<string, boolean>> {
  const entries = await Promise.all(
    LANGUAGES.map(async (language) => {
      const options = await voicesForLanguage(language.code);
      return [language.code, options.length > 0] as const;
    }),
  );
  return Object.fromEntries(entries);
}

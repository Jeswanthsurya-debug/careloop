import { NextResponse } from "next/server";
import { LANGUAGES, resolveLang } from "@/lib/languages";
import { getCatalogue, voicesForLanguage } from "@/lib/polly";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * GET /tts/voices?lang=hi-IN
 *
 * Verified Polly voices for one language (empty when Polly cannot speak it).
 * The UI merges these with the browser's own voices for the same language.
 */
export async function GET(request: Request) {
  try {
    const url = new URL(request.url);
    const requested = url.searchParams.get("lang");
    const catalogue = await getCatalogue();

    if (!requested) {
      return NextResponse.json({
        catalogueAvailable: catalogue.available,
        reason: catalogue.reason,
        languages: LANGUAGES.map((language) => ({ code: language.code, label: language.label })),
      });
    }

    const language = resolveLang(requested);
    const voices = await voicesForLanguage(language.code);

    return NextResponse.json({
      lang: language.code,
      label: language.label,
      pollySupported: language.pollySupported,
      catalogueAvailable: catalogue.available,
      reason: catalogue.reason,
      voices: voices.map((voice) => ({
        id: voice.id,
        label: `${voice.name} · ${voice.languageName}`,
        languageCode: voice.languageCode,
        engine: voice.engines.includes("neural") ? "neural" : "standard",
      })),
    });
  } catch (error) {
    console.error("voices route failed", error);
    return NextResponse.json({ voices: [], catalogueAvailable: false, reason: "error" }, { status: 200 });
  }
}

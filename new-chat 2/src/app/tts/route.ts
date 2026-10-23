import { NextResponse } from "next/server";
import { resolveLang } from "@/lib/languages";
import { selectVoice, synthesize } from "@/lib/polly";
import { buildSsml } from "@/lib/ssml";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 30;

/**
 * POST /tts  { text, lang, voice?, rate? }
 *
 * Returns audio/mpeg when Polly can speak the language with a *verified*
 * voice, otherwise a JSON instruction for the browser to speak instead.
 */
export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      text?: string;
      lang?: string;
      /** Older clients sent `language`; still accepted. */
      language?: string;
      voice?: string;
      rate?: number;
    };

    const text = (body.text ?? "").toString().slice(0, 1200).trim();
    if (!text) {
      return NextResponse.json({ error: "Text is required." }, { status: 400 });
    }

    const language = resolveLang(body.lang ?? body.language);
    const requestedRate = Number(body.rate);
    const ratePercent = Number.isFinite(requestedRate) ? requestedRate * 100 : 90;

    const selection = await selectVoice(language.code, body.voice?.toString());

    if (!selection.ok) {
      // Tamil/Telugu (Polly has no voice) and every failure land here.
      return NextResponse.json(
        {
          fallback: "browser",
          lang: language.code,
          reason: selection.reason,
          pollySupported: language.pollySupported,
        },
        { status: 200, headers: { "x-careloop-lang": language.code, "x-careloop-fallback": selection.reason } },
      );
    }

    const ssml = buildSsml(text, ratePercent, language.code);
    const audio = await synthesize(ssml, selection.voice);

    if (!audio) {
      return NextResponse.json(
        { fallback: "browser", lang: language.code, reason: "synthesis-failed", pollySupported: true },
        { status: 200, headers: { "x-careloop-lang": language.code, "x-careloop-fallback": "synthesis-failed" } },
      );
    }

    return new NextResponse(new Uint8Array(audio), {
      status: 200,
      headers: {
        "content-type": "audio/mpeg",
        "cache-control": "no-store",
        "x-careloop-lang": language.code,
        "x-careloop-voice": selection.voice.id,
        "x-careloop-voice-lang": selection.voice.languageCode,
        "x-careloop-engine": selection.voice.engine,
      },
    });
  } catch (error) {
    console.error("tts route failed", error);
    return NextResponse.json({ fallback: "browser", reason: "tts-error" }, { status: 200 });
  }
}

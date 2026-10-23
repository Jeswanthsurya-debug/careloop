const XML_ESCAPES: Record<string, string> = {
  "&": "&amp;",
  "<": "&lt;",
  ">": "&gt;",
  '"': "&quot;",
  "'": "&apos;",
};

function escapeXml(value: string) {
  return value.replace(/[&<>"']/g, (char) => XML_ESCAPES[char]);
}

/**
 * Wrap a reply in SSML: slowed down, lifted volume, and a short breath
 * between sentences so older ears can follow every word.
 * `prosody` rate/volume and `break` are all supported by the neural engine.
 */
export function buildSsml(text: string, ratePercent: number, lang?: string) {
  const rate = Math.round(Math.min(120, Math.max(70, ratePercent)));

  // Sentence terminators across the supported scripts: Latin, Devanagari (।),
  // Arabic (؟ ۔) and Japanese (。！？), which need no following space.
  const spaced = text.split(/(?<=[.!?\u0964\u061F\u06D4])\s+/);
  const sentences = spaced
    .flatMap((part) => part.split(/(?<=[\u3002\uFF01\uFF1F])/))
    .map((sentence) => sentence.trim())
    .filter(Boolean)
    .map(escapeXml);

  const body = sentences.length > 0 ? sentences.join(' <break time="250ms"/> ') : escapeXml(text);
  // `lang` is accepted so callers can pass the selected language through;
  // Polly already gets the locale via the request's LanguageCode field.
  void lang;
  return `<speak><prosody rate="${rate}%" volume="+6dB">${body}</prosody></speak>`;
}


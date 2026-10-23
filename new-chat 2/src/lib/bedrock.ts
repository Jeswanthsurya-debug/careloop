import crypto from "node:crypto";
import { resolveLang } from "./languages";

/**
 * Optional Bedrock phrasing.
 *
 * CareLoop works fully without AWS ("mock mode"): the translated templates in
 * ./replies are used. When BEDROCK_MODEL_ID and credentials are present we ask
 * the model to re-phrase the same answer, pinned to the selected language.
 */

/** Mock replies are the default; set USE_MOCK_LLM=false to call Bedrock. */
export function isMockLlm() {
  return process.env.USE_MOCK_LLM !== "false";
}

export function bedrockEnabled() {
  if (isMockLlm()) return false;
  return Boolean(
    process.env.BEDROCK_MODEL_ID && process.env.AWS_ACCESS_KEY_ID && process.env.AWS_SECRET_ACCESS_KEY,
  );
}

/** The language instruction the task asks for, in one place so it can be tested. */
export function buildSystemPrompt(lang: string): string {
  const language = resolveLang(lang);
  return [
    "You are CareLoop, a warm voice companion for an older person.",
    `Reply only in ${language.englishName}, in 1-2 short simple sentences, warm tone.`,
    "Never invent medical advice. Never read out raw numbers or percentages.",
  ].join(" ");
}

function hmac(key: crypto.BinaryLike | Buffer, data: string) {
  return crypto.createHmac("sha256", key).update(data, "utf8").digest();
}

function sha256(data: string) {
  return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

/**
 * Ask Bedrock to say `draft` in the selected language.
 * Returns null on any problem so the caller keeps the template wording.
 */
export async function phraseWithBedrock(draft: string, lang: string, userText: string): Promise<string | null> {
  if (!bedrockEnabled()) return null;

  const region = process.env.AWS_REGION || process.env.AWS_DEFAULT_REGION || "us-east-1";
  const modelId = process.env.BEDROCK_MODEL_ID!;
  const accessKeyId = process.env.AWS_ACCESS_KEY_ID!;
  const secretAccessKey = process.env.AWS_SECRET_ACCESS_KEY!;
  const sessionToken = process.env.AWS_SESSION_TOKEN;

  const host = `bedrock-runtime.${region}.amazonaws.com`;
  const path = `/model/${encodeURIComponent(modelId)}/converse`;

  const payload = JSON.stringify({
    system: [{ text: buildSystemPrompt(lang) }],
    messages: [
      {
        role: "user",
        content: [{ text: `The person said: "${userText}".\nSay this back to them: "${draft}"` }],
      },
    ],
    inferenceConfig: { maxTokens: 160, temperature: 0.3 },
  });

  try {
    const now = new Date();
    const amzDate = now.toISOString().replace(/[:-]|\.\d{3}/g, "");
    const dateStamp = amzDate.slice(0, 8);
    const payloadHash = sha256(payload);

    const headers: Record<string, string> = {
      "content-type": "application/json",
      host,
      "x-amz-content-sha256": payloadHash,
      "x-amz-date": amzDate,
    };
    if (sessionToken) headers["x-amz-security-token"] = sessionToken;

    const signedHeaders = Object.keys(headers).sort().join(";");
    const canonicalHeaders = Object.keys(headers)
      .sort()
      .map((key) => `${key}:${headers[key]}\n`)
      .join("");
    const canonicalRequest = ["POST", path, "", canonicalHeaders, signedHeaders, payloadHash].join("\n");
    const scope = `${dateStamp}/${region}/bedrock/aws4_request`;
    const stringToSign = ["AWS4-HMAC-SHA256", amzDate, scope, sha256(canonicalRequest)].join("\n");

    const kDate = hmac(`AWS4${secretAccessKey}`, dateStamp);
    const kRegion = hmac(kDate, region);
    const kService = hmac(kRegion, "bedrock");
    const kSigning = hmac(kService, "aws4_request");
    const signature = crypto.createHmac("sha256", kSigning).update(stringToSign, "utf8").digest("hex");

    const response = await fetch(`https://${host}${path}`, {
      method: "POST",
      headers: {
        ...headers,
        authorization: `AWS4-HMAC-SHA256 Credential=${accessKeyId}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
      },
      body: payload,
      signal: AbortSignal.timeout(6000),
    });

    if (!response.ok) {
      console.error("Bedrock converse failed", response.status);
      return null;
    }

    const body = (await response.json()) as {
      output?: { message?: { content?: { text?: string }[] } };
    };
    const text = body.output?.message?.content?.[0]?.text?.trim();
    return text && text.length > 0 ? text : null;
  } catch (error) {
    console.error("Bedrock error", error);
    return null;
  }
}

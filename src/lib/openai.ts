import OpenAI from "openai";
import type { ChatCompletionCreateParams } from "openai/resources/chat/completions";

const JSON_RESPONSE_FORMAT: ChatCompletionCreateParams["response_format"] = {
  type: "json_object",
};

export function getOpenAI() {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error("Missing OPENAI_API_KEY env var");
  }
  return new OpenAI({ apiKey });
}

export type NewsSentiment = {
  overall: "bullish" | "bearish" | "neutral";
  confidence: number; // 0-1
  reasons: string[];
};

export async function analyzeNewsSentiment(params: {
  symbol: string; // e.g., BTCUSDT or BTC
  timeframe: string; // e.g., 1h, 4h, 1d
  headlines: string[];
}): Promise<NewsSentiment> {
  const { symbol, timeframe, headlines } = params;
  const client = getOpenAI();

  const systemPrompt = `You are a careful crypto market analyst. Given recent headlines, classify sentiment as bullish, bearish, or neutral for the specified symbol and timeframe. Avoid hype. Be conservative; if mixed, choose neutral.`;
  const userPrompt = [
    `Symbol: ${symbol}`,
    `Timeframe: ${timeframe}`,
    `Headlines (most recent first):`,
    ...headlines.map((h, i) => `${i + 1}. ${h}`),
    `\nRespond in JSON with keys: overall (bullish|bearish|neutral), confidence (0..1), reasons (array).`,
  ].join("\n");

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.2,
    max_tokens: 300,
    response_format: JSON_RESPONSE_FORMAT,
  });

  const content = completion.choices[0]?.message?.content?.trim() || "{}";
  try {
    const parsed = JSON.parse(content);
    const overall = parsed.overall as NewsSentiment["overall"];
    const confidence = Number(parsed.confidence) || 0;
    const reasons = Array.isArray(parsed.reasons)
      ? parsed.reasons.slice(0, 5)
      : [];
    if (
      overall === "bullish" ||
      overall === "bearish" ||
      overall === "neutral"
    ) {
      return {
        overall,
        confidence: Math.max(0, Math.min(1, confidence)),
        reasons,
      };
    }
  } catch {
    // ignore
  }
  return {
    overall: "neutral",
    confidence: 0.3,
    reasons: ["Failed to parse sentiment"],
  };
}

export type FinalSignal = {
  direction: "long" | "short" | "neutral";
  strength: number; // 0..100
  rationale: string[];
};

export async function synthesizeSignal(params: {
  symbol: string;
  timeframe: string;
  taSnapshot: unknown;
  taScore: number; // -100..100
  taReasons: string[];
  newsSentiment: NewsSentiment;
}): Promise<FinalSignal> {
  const { symbol, timeframe, taSnapshot, taScore, taReasons, newsSentiment } =
    params;
  const client = getOpenAI();

  const system = `You are a disciplined quant analyst. Combine TA and news sentiment into a single actionable signal for the given timeframe. Be concise and avoid overfitting.`;
  const user = `Symbol: ${symbol}\nTimeframe: ${timeframe}\n\nTA snapshot: ${JSON.stringify(
    taSnapshot
  )}\nTA score: ${taScore}\nTA reasons: ${taReasons.join(
    "; "
  )}\n\nNews sentiment: ${JSON.stringify(
    newsSentiment
  )}\n\nReturn JSON with keys: direction (long|short|neutral), strength (0..100), rationale (array of concise bullet points).`;

  const completion = await client.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      { role: "system", content: system },
      { role: "user", content: user },
    ],
    temperature: 0.2,
    max_tokens: 400,
    response_format: JSON_RESPONSE_FORMAT,
  });

  const content = completion.choices[0]?.message?.content?.trim() || "{}";
  try {
    const parsed = JSON.parse(content);
    const direction = parsed.direction as FinalSignal["direction"];
    const strength = Math.max(0, Math.min(100, Number(parsed.strength) || 0));
    const rationale = Array.isArray(parsed.rationale)
      ? parsed.rationale.slice(0, 8)
      : [];
    if (
      direction === "long" ||
      direction === "short" ||
      direction === "neutral"
    ) {
      return { direction, strength, rationale };
    }
  } catch {
    // ignore
  }

  // Fallback heuristic
  let direction: FinalSignal["direction"] = "neutral";
  if (taScore > 10 && newsSentiment.overall === "bullish") direction = "long";
  if (taScore < -10 && newsSentiment.overall === "bearish") direction = "short";
  const strength = Math.round(
    Math.min(
      100,
      Math.max(0, Math.abs(taScore) * 0.6 + newsSentiment.confidence * 40)
    )
  );
  return {
    direction,
    strength,
    rationale: [
      `Heuristic fallback: TA ${taScore}, news ${
        newsSentiment.overall
      } (${Math.round(newsSentiment.confidence * 100)}%)`,
    ],
  };
}

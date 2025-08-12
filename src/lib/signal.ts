import type { IndicatorSnapshot, TARecommendation } from "./indicators";
import type { NewsSentiment } from "./openai";

export type DeterministicSignal = {
  direction: "long" | "short" | "neutral";
  strength: number; // 0..100
  rationale: string[];
  entryHint: "breakout" | "pullback" | "either";
  stopMultiple: number;
  targetMultiple: number;
  positionSizePct: number; // 0..1
};

function clamp01(x: number): number {
  return Math.max(0, Math.min(1, x));
}

function computeBaseStrength(combinedTaScore: number, gatesFraction: number, news: NewsSentiment, dir: "long"|"short"|"neutral") {
  const taMag = clamp01(Math.abs(combinedTaScore) / 50); // ~[-50..50] → [0..1]
  const newsSign = news.overall === "bullish" ? 1 : news.overall === "bearish" ? -1 : 0;
  const dirSign = dir === "long" ? 1 : dir === "short" ? -1 : 0;
  const newsAlign = dirSign !== 0 ? (dirSign === newsSign ? 1 : newsSign === 0 ? 0.3 : -1) : 0;
  const newsComponent = news.confidence * newsAlign; // [-1..1]
  const blended = 0.5 * taMag + 0.35 * gatesFraction + 0.15 * (0.5 + 0.5 * newsComponent);
  return Math.round(100 * clamp01(blended));
}

export function buildDeterministicSignal(params: {
  snapshot: IndicatorSnapshot;
  taPrimary: TARecommendation;
  snapshotHTF: IndicatorSnapshot;
  taConfirm: TARecommendation;
  combinedTaScore: number;
  news: NewsSentiment;
}): DeterministicSignal {
  const { snapshot, taConfirm, combinedTaScore, news } = params;

  const emaBull = snapshot.ema20 !== undefined && snapshot.ema50 !== undefined && snapshot.ema20 > snapshot.ema50;
  const emaBear = snapshot.ema20 !== undefined && snapshot.ema50 !== undefined && snapshot.ema20 < snapshot.ema50;
  const adxStrong = (snapshot.adx14 ?? 0) >= 25;
  const macdUp = (snapshot.macd?.histogram ?? 0) > 0;
  const macdDown = (snapshot.macd?.histogram ?? 0) < 0;
  const stochUp = (snapshot.stoch?.k ?? 0) > (snapshot.stoch?.d ?? 0);
  const stochDown = (snapshot.stoch?.k ?? 0) < (snapshot.stoch?.d ?? 0);
  const mtfBull = taConfirm.score > 10;
  const mtfBear = taConfirm.score < -10;
  const bbp = snapshot.bb20?.percentB;

  const longGates = [emaBull, adxStrong, macdUp, stochUp, mtfBull];
  const shortGates = [emaBear, adxStrong, macdDown, stochDown, mtfBear];
  const longHits = longGates.filter(Boolean).length;
  const shortHits = shortGates.filter(Boolean).length;
  const longFraction = longHits / longGates.length;
  const shortFraction = shortHits / shortGates.length;

  let direction: DeterministicSignal["direction"] = "neutral";
  const reasons: string[] = [];

  if (longHits >= 4 && combinedTaScore > 15) {
    direction = "long";
  } else if (shortHits >= 4 && combinedTaScore < -15) {
    direction = "short";
  } else {
    direction = "neutral";
  }

  if (direction === "long") {
    reasons.push("EMA20 above EMA50", "ADX strong", "Momentum up (MACD/Stoch)");
    if (mtfBull) reasons.push("Higher timeframe confirms uptrend");
  } else if (direction === "short") {
    reasons.push("EMA20 below EMA50", "ADX strong", "Momentum down (MACD/Stoch)");
    if (mtfBear) reasons.push("Higher timeframe confirms downtrend");
  } else {
    reasons.push("Mixed conditions");
  }

  // Entry hint
  let entryHint: DeterministicSignal["entryHint"] = "either";
  if (direction === "long") {
    if (bbp !== undefined && bbp <= 0.35) entryHint = "pullback";
    else entryHint = "breakout";
  } else if (direction === "short") {
    if (bbp !== undefined && bbp >= 0.65) entryHint = "pullback"; // pullback up in downtrend
    else entryHint = "breakout";
  }

  // Risk multiples by regime
  const adx = snapshot.adx14 ?? 0;
  const stopMultiple = adx >= 30 ? 1.7 : adx >= 20 ? 1.5 : 1.2;
  const targetMultiple = adx >= 30 ? 3.0 : adx >= 20 ? 2.5 : 2.0;

  // Strength
  const gatesFraction = direction === "long" ? longFraction : direction === "short" ? shortFraction : 0;
  let strength = direction === "neutral" ? 50 : computeBaseStrength(combinedTaScore, gatesFraction, news, direction);

  // Apply news gating: strong opposite news reduces strength sharply
  if (direction === "long" && news.overall === "bearish" && news.confidence >= 0.6) {
    strength = Math.max(15, Math.round(strength * 0.6));
    reasons.push("Reduced by bearish news");
  }
  if (direction === "short" && news.overall === "bullish" && news.confidence >= 0.6) {
    strength = Math.max(15, Math.round(strength * 0.6));
    reasons.push("Reduced by bullish news");
  }

  // Position size suggestion
  const positionSizePct = clamp01(strength / 100) * 0.5; // cap at 50%

  return { direction, strength, rationale: reasons, entryHint, stopMultiple, targetMultiple, positionSizePct };
}



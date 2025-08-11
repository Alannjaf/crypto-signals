import { RSI, EMA, MACD, Stochastic } from "technicalindicators";

export type IndicatorInputs = {
  closes: number[];
  highs: number[];
  lows: number[];
  volumes?: number[];
};

export type IndicatorSnapshot = {
  rsi14?: number;
  ema20?: number;
  ema50?: number;
  macd?: { macd: number; signal: number; histogram: number };
  stoch?: { k: number; d: number };
};

export function computeIndicators({
  closes,
  highs,
  lows,
}: IndicatorInputs): IndicatorSnapshot {
  const rsiSeries = RSI.calculate({ values: closes, period: 14 });
  const ema20Series = EMA.calculate({ values: closes, period: 20 });
  const ema50Series = EMA.calculate({ values: closes, period: 50 });
  const macdSeries = MACD.calculate({
    values: closes,
    fastPeriod: 12,
    slowPeriod: 26,
    signalPeriod: 9,
    SimpleMAOscillator: false,
    SimpleMASignal: false,
  });
  const stochSeries = Stochastic.calculate({
    high: highs,
    low: lows,
    close: closes,
    period: 14,
    signalPeriod: 3,
  });

  const rsi14 = rsiSeries.at(-1);
  const ema20 = ema20Series.at(-1);
  const ema50 = ema50Series.at(-1);
  const macd = macdSeries.at(-1);
  const stoch = stochSeries.at(-1);

  return {
    rsi14,
    ema20,
    ema50,
    macd: macd
      ? {
          macd: macd.MACD ?? 0,
          signal: macd.signal ?? 0,
          histogram: macd.histogram ?? 0,
        }
      : undefined,
    stoch: stoch
      ? { k: (stoch.k as number) ?? 0, d: (stoch.d as number) ?? 0 }
      : undefined,
  };
}

export type TARecommendation = {
  score: number; // -100 (strong short) ... 0 (neutral) ... +100 (strong long)
  reasons: string[];
};

export function heuristicTaRecommendation(
  snapshot: IndicatorSnapshot
): TARecommendation {
  let score = 0;
  const reasons: string[] = [];

  if (snapshot.rsi14 !== undefined) {
    if (snapshot.rsi14 < 30) {
      score += 20;
      reasons.push("RSI oversold (<30)");
    } else if (snapshot.rsi14 > 70) {
      score -= 20;
      reasons.push("RSI overbought (>70)");
    }
  }

  if (snapshot.ema20 !== undefined && snapshot.ema50 !== undefined) {
    const emaSpread = snapshot.ema20 - snapshot.ema50;
    const magnitude = Math.min(
      1,
      Math.abs(emaSpread) / (Math.abs(snapshot.ema50) * 0.01 + 1e-6)
    );
    if (emaSpread > 0) {
      score += 10 + Math.round(10 * magnitude); // 10..20
      reasons.push("EMA20 above EMA50 (bullish)");
    } else {
      score -= 10 + Math.round(10 * magnitude); // -10..-20
      reasons.push("EMA20 below EMA50 (bearish)");
    }
  }

  if (snapshot.macd) {
    const h = snapshot.macd.histogram;
    const ref = Math.abs(snapshot.ema50 ?? snapshot.ema20 ?? 1);
    const mag = Math.min(1, Math.abs(h) / (ref * 0.002 + 1e-6));
    if (h > 0) {
      score += 5 + Math.round(5 * mag);
      reasons.push("MACD histogram positive");
    } else if (h < 0) {
      score -= 5 + Math.round(5 * mag);
      reasons.push("MACD histogram negative");
    }
  }

  if (snapshot.stoch) {
    const delta = (snapshot.stoch.k ?? 0) - (snapshot.stoch.d ?? 0);
    const mag = Math.min(1, Math.abs(delta) / 20);
    if (delta > 0) {
      score += 3 + Math.round(4 * mag);
      reasons.push("Stochastic K above D");
    } else if (delta < 0) {
      score -= 3 + Math.round(4 * mag);
      reasons.push("Stochastic K below D");
    }
  }

  // Clamp score
  if (score > 100) score = 100;
  if (score < -100) score = -100;
  return { score, reasons };
}

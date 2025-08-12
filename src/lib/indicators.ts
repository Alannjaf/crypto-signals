import { RSI, EMA, MACD, Stochastic, ADX, ATR, BollingerBands, OBV, SMA, MFI } from "technicalindicators";

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
  adx14?: number;
  atr14?: number;
  bb20?: { middle: number; upper: number; lower: number; bandwidth: number; percentB: number };
  obv?: number;
  sma200?: number;
  mfi14?: number;
  volume?: number;
  volSma20?: number;
  obvSma21?: number;
};

export function computeIndicators({ closes, highs, lows, volumes }: IndicatorInputs): IndicatorSnapshot {
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
  const adxSeries = ADX.calculate({ high: highs, low: lows, close: closes, period: 14 });
  const atrSeries = ATR.calculate({ high: highs, low: lows, close: closes, period: 14 });
  const bbSeries = BollingerBands.calculate({ period: 20, values: closes, stdDev: 2 });
  const sma200Series = SMA.calculate({ period: 200, values: closes });
  const obvSeries = volumes ? OBV.calculate({ close: closes, volume: volumes }) : [];
  const mfiSeries = volumes ? MFI.calculate({ high: highs, low: lows, close: closes, volume: volumes, period: 14 }) : [];
  const volSma20Series = volumes ? SMA.calculate({ period: 20, values: volumes }) : [];
  const obvSma21Series = obvSeries.length ? SMA.calculate({ period: 21, values: obvSeries }) : [];

  const rsi14 = rsiSeries.at(-1);
  const ema20 = ema20Series.at(-1);
  const ema50 = ema50Series.at(-1);
  const macd = macdSeries.at(-1);
  const stoch = stochSeries.at(-1);
  const adx = adxSeries.at(-1);
  const atr = atrSeries.at(-1);
  const bb = bbSeries.at(-1);
  const sma200 = sma200Series.at(-1);
  const obv = obvSeries.at(-1);
  const mfi14 = mfiSeries.at(-1);
  const volSma20 = volSma20Series.at(-1);
  const obvSma21 = obvSma21Series.at(-1);

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
    adx14: adx?.adx,
    atr14: atr,
    bb20: bb
      ? {
          middle: bb.middle,
          upper: bb.upper,
          lower: bb.lower,
          bandwidth: (bb.upper - bb.lower) / (bb.middle || 1),
          percentB: (closes.at(-1)! - bb.lower) / ((bb.upper - bb.lower) || 1),
        }
      : undefined,
    obv,
    sma200,
    mfi14,
    volume: volumes?.at(-1),
    volSma20,
    obvSma21,
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

  // ADX trend filter: boost aligned signals in trending markets, penalize in chop
  if (snapshot.adx14 !== undefined) {
    const adx = snapshot.adx14;
    if (adx >= 25) {
      reasons.push("Strong trend (ADX>=25)");
      // amplify existing score by up to 20%
      score += Math.sign(score) * Math.min(10, Math.round(Math.abs(score) * 0.2));
    } else if (adx < 15) {
      reasons.push("Weak trend (ADX<15)");
      score -= Math.sign(score) * Math.min(8, Math.round(Math.abs(score) * 0.15));
    }
  }

  // Bollinger percentB extremes
  if (snapshot.bb20) {
    if (snapshot.bb20.percentB > 1.05) { score -= 5; reasons.push("Price extended above BB"); }
    if (snapshot.bb20.percentB < -0.05) { score += 5; reasons.push("Price extended below BB"); }
  }

  // 200SMA trend bias
  if (snapshot.sma200 !== undefined && snapshot.ema50 !== undefined) {
    if (snapshot.ema50 > snapshot.sma200) score += 3;
    if (snapshot.ema50 < snapshot.sma200) score -= 3;
  }

  // MFI extremes
  if (snapshot.mfi14 !== undefined) {
    if (snapshot.mfi14 > 80) { score -= 8; reasons.push("MFI overbought (>80)"); }
    else if (snapshot.mfi14 < 20) { score += 8; reasons.push("MFI oversold (<20)"); }
  }

  // Volume confirmation (relative to 20SMA)
  if (snapshot.volume !== undefined && snapshot.volSma20) {
    const volRatio = snapshot.volSma20 ? snapshot.volume / (snapshot.volSma20 || 1) : 1;
    if (volRatio >= 1.3) {
      // boost in the direction suggested by EMAs / MACD
      const sign = (snapshot.ema20 && snapshot.ema50 && snapshot.ema20 > snapshot.ema50 ? 1 : -1) + (snapshot.macd?.histogram ?? 0 > 0 ? 1 : -1);
      score += Math.sign(sign) * 5;
      reasons.push("High volume vs avg");
    }
  }

  // OBV trend filter
  if (snapshot.obv !== undefined && snapshot.obvSma21 !== undefined) {
    if (snapshot.obv > snapshot.obvSma21) { score += 4; reasons.push("OBV rising"); }
    else if (snapshot.obv < snapshot.obvSma21) { score -= 4; reasons.push("OBV falling"); }
  }

  // Clamp score
  if (score > 100) score = 100;
  if (score < -100) score = -100;
  return { score, reasons };
}

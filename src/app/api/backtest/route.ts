import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { fetchKlines, extractCloses, extractHighs, extractLows, extractVolumes, BinanceIntervalSchema } from "@/lib/binance";
import { computeIndicators, heuristicTaRecommendation } from "@/lib/indicators";

const Query = z.object({
  symbol: z.string().min(3).transform((s) => s.toUpperCase()),
  interval: BinanceIntervalSchema.default("4h"),
  lookback: z.coerce.number().min(200).max(1000).default(500),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = Query.safeParse({
      symbol: searchParams.get("symbol") ?? "BTCUSDT",
      interval: searchParams.get("interval") ?? "4h",
      lookback: searchParams.get("lookback") ?? "500",
    });
    if (!parsed.success) {
      return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    }

    const { symbol, interval, lookback } = parsed.data;
    const klines = await fetchKlines({ symbol, interval, limit: lookback });
    const closes = extractCloses(klines);
    const highs = extractHighs(klines);
    const lows = extractLows(klines);
    const volumes = extractVolumes(klines);

    // walk forward
    let wins = 0, losses = 0, draws = 0;
    let pnl = 0;
    const trades: { idx: number; direction: 'long'|'short'; entry: number; exit: number; result: number }[] = [];

    for (let i = 60; i < closes.length - 1; i++) {
      const slice = {
        closes: closes.slice(0, i + 1),
        highs: highs.slice(0, i + 1),
        lows: lows.slice(0, i + 1),
        volumes: volumes.slice(0, i + 1),
      };
      const snap = computeIndicators(slice);
      const ta = heuristicTaRecommendation(snap);

      const atr = snap.atr14 ?? 0;
      const entry = closes[i];
      const stop = 1.5 * atr;
      const target = 2.5 * atr;
      let direction: 'long'|'short'|'neutral' = 'neutral';
      if (ta.score > 8) direction = 'long';
      if (ta.score < -8) direction = 'short';
      if (direction === 'neutral' || atr === 0) continue;

      // simulate next bar exit
      const nextHigh = highs[i + 1];
      const nextLow = lows[i + 1];
      let exit = closes[i + 1];
      let result = 0;
      if (direction === 'long') {
        const sl = entry - stop;
        const tp = entry + target;
        if (nextLow <= sl) { exit = sl; result = -stop; }
        else if (nextHigh >= tp) { exit = tp; result = target; }
        else { result = exit - entry; }
      } else {
        const sl = entry + stop;
        const tp = entry - target;
        if (nextHigh >= sl) { exit = sl; result = -stop; }
        else if (nextLow <= tp) { exit = tp; result = target; }
        else { result = entry - exit; }
      }
      pnl += result;
      if (result > 0) wins++; else if (result < 0) losses++; else draws++;
      trades.push({ idx: i, direction, entry, exit, result });
    }

    return NextResponse.json({
      symbol,
      interval,
      lookback,
      stats: {
        trades: trades.length,
        wins, losses, draws,
        winRate: trades.length ? wins / trades.length : 0,
        avgPnL: trades.length ? pnl / trades.length : 0,
        totalPnL: pnl,
      },
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}



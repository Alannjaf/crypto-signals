import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import {
  fetchKlines,
  extractCloses,
  extractHighs,
  extractLows,
  extractVolumes,
  BinanceIntervalSchema,
} from "@/lib/binance";
import { computeIndicators, heuristicTaRecommendation } from "@/lib/indicators";
import { fetchCryptoNews } from "@/lib/news";
import { analyzeNewsSentiment, synthesizeSignal } from "@/lib/openai";

const QuerySchema = z.object({
  symbol: z
    .string()
    .min(3)
    .transform((s) => s.toUpperCase()),
  interval: BinanceIntervalSchema.default("4h"),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      symbol: searchParams.get("symbol") ?? "BTCUSDT",
      interval: searchParams.get("interval") ?? "4h",
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { symbol, interval } = parsed.data;

    // 1) Price data
    const klines = await fetchKlines({ symbol, interval, limit: 500 });
    if (klines.length < 60) {
      return NextResponse.json(
        { error: "Insufficient data from exchange" },
        { status: 502 }
      );
    }

    const closes = extractCloses(klines);
    const highs = extractHighs(klines);
    const lows = extractLows(klines);
    const volumes = extractVolumes(klines);

    // 2) Indicators and TA heuristic
    const snapshot = computeIndicators({ closes, highs, lows, volumes });
    const ta = heuristicTaRecommendation(snapshot);

    // 3) News sentiment via OpenAI
    const news = await fetchCryptoNews(20);
    const symbolKey = symbol.replace(
      /USDT|USD|USDC|BUSD|PERP|EUR|GBP|JPY|USDP|DAI/g,
      ""
    );
    const related = news
      .filter((n) =>
        (n.title + " " + (n.contentSnippet ?? ""))
          .toUpperCase()
          .includes(symbolKey)
      )
      .slice(0, 10);
    const headlines =
      related.length > 0
        ? related.map((n) => n.title)
        : news.slice(0, 10).map((n) => n.title);
    const sentiment = await analyzeNewsSentiment({
      symbol: symbolKey,
      timeframe: interval,
      headlines,
    });

    // 4) Synthesize final signal
    const finalSignal = await synthesizeSignal({
      symbol: symbolKey,
      timeframe: interval,
      taSnapshot: snapshot,
      taScore: ta.score,
      taReasons: ta.reasons,
      newsSentiment: sentiment,
    });

    // ATR-based stop/target and position sizing
    const atr = snapshot.atr14 ?? 0;
    const lastClose = closes.at(-1)!;
    const stopMultiple = 1.5;
    const targetMultiple = 2.5;
    const stopLoss =
      finalSignal.direction === "long"
        ? lastClose - stopMultiple * atr
        : finalSignal.direction === "short"
        ? lastClose + stopMultiple * atr
        : undefined;
    const takeProfit =
      finalSignal.direction === "long"
        ? lastClose + targetMultiple * atr
        : finalSignal.direction === "short"
        ? lastClose - targetMultiple * atr
        : undefined;
    const positionSizePct = Math.max(0, Math.min(1, finalSignal.strength / 100)) * 0.5;

    return NextResponse.json({
      symbol,
      interval,
      indicators: snapshot,
      ta,
      news: { headlines, sentiment },
      signal: { ...finalSignal, stopLoss, takeProfit, positionSizePct },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/signals error", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

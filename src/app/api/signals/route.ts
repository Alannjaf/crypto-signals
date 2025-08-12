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
import { buildDeterministicSignal } from "@/lib/signal";

const QuerySchema = z.object({
  symbol: z
    .string()
    .min(3)
    .transform((s) => s.toUpperCase()),
  interval: BinanceIntervalSchema.default("4h"),
  confirmInterval: BinanceIntervalSchema.optional(),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = QuerySchema.safeParse({
      symbol: searchParams.get("symbol") ?? "BTCUSDT",
      interval: searchParams.get("interval") ?? "4h",
      confirmInterval: searchParams.get("confirmInterval") ?? undefined,
    });
    if (!parsed.success) {
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    }

    const { symbol, interval } = parsed.data;
    const defaultConfirm = (i: string): string => {
      switch (i) {
        case "15m":
          return "1h";
        case "1h":
          return "4h";
        case "4h":
          return "1d";
        default:
          return "1d";
      }
    };
    const confirmInterval = parsed.data.confirmInterval ?? (defaultConfirm(interval) as typeof interval);

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

    // 2) Indicators and TA heuristic (primary)
    const snapshot = computeIndicators({ closes, highs, lows, volumes });
    const ta = heuristicTaRecommendation(snapshot);

    // 2b) Higher timeframe confirmation
    const klinesHTF = await fetchKlines({ symbol, interval: confirmInterval, limit: 500 });
    const closesHTF = extractCloses(klinesHTF);
    const highsHTF = extractHighs(klinesHTF);
    const lowsHTF = extractLows(klinesHTF);
    const volumesHTF = extractVolumes(klinesHTF);
    const snapshotHTF = computeIndicators({ closes: closesHTF, highs: highsHTF, lows: lowsHTF, volumes: volumesHTF });
    const taHTF = heuristicTaRecommendation(snapshotHTF);
    let combinedTaScore = Math.round(0.7 * ta.score + 0.3 * taHTF.score);
    const disagree = (ta.score > 0 && taHTF.score < 0) || (ta.score < 0 && taHTF.score > 0);
    if (disagree) combinedTaScore = Math.round(combinedTaScore * 0.5);

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
    const finalSignalLLM = await synthesizeSignal({
      symbol: symbolKey,
      timeframe: interval,
      taSnapshot: snapshot,
      taScore: combinedTaScore,
      taReasons: ta.reasons,
      newsSentiment: sentiment,
    });

    // ATR-based stop/target and position sizing
    const atr = snapshot.atr14 ?? 0;
    const lastClose = closes.at(-1)!;
    // Deterministic gate-based signal
    const det = buildDeterministicSignal({ snapshot, taPrimary: ta, snapshotHTF, taConfirm: taHTF, combinedTaScore, news: sentiment });
    const stopMultiple = det.stopMultiple;
    const targetMultiple = det.targetMultiple;
    const stopLoss =
      det.direction === "long"
        ? lastClose - stopMultiple * atr
        : det.direction === "short"
        ? lastClose + stopMultiple * atr
        : undefined;
    const takeProfit =
      det.direction === "long"
        ? lastClose + targetMultiple * atr
        : det.direction === "short"
        ? lastClose - targetMultiple * atr
        : undefined;
    const positionSizePct = det.positionSizePct;

    return NextResponse.json({
      symbol,
      interval,
      confirmInterval,
      indicators: snapshot,
      ta,
      mtf: { confirmInterval, taPrimary: ta, taConfirm: taHTF, combinedScore: combinedTaScore },
      news: { headlines, sentiment },
      signal: {
        // prefer deterministic gates for direction/strength, but include LLM rationale
        direction: det.direction !== "neutral" ? det.direction : finalSignalLLM.direction,
        strength: det.strength,
        rationale: [
          ...det.rationale,
          ...(finalSignalLLM.rationale || []).slice(0, 3),
        ],
        stopLoss,
        takeProfit,
        positionSizePct,
        entryHint: det.entryHint,
      },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Unknown error";
    console.error("/api/signals error", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

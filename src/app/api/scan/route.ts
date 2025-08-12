import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { toErrorResponse } from "@/lib/errors";
import { computeIndicators, heuristicTaRecommendation } from "@/lib/indicators";
import { fetchCandles } from "@/lib/candles";
import {
  extractCloses,
  extractHighs,
  extractLows,
  extractVolumes,
  BinanceIntervalSchema,
} from "@/lib/binance";
import { buildDeterministicSignal } from "@/lib/signal";
import pLimit from "p-limit";

const Q = z.object({
  interval: BinanceIntervalSchema.default("4h"),
});

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const q = Q.safeParse({ interval: searchParams.get("interval") ?? "4h" });
    if (!q.success)
      return NextResponse.json(
        toErrorResponse("BAD_REQUEST", "Invalid query", q.error.flatten()),
        { status: 400 }
      );
    const interval = q.data.interval;

    // Get top coins (server-side) to scan
    const origin = new URL(req.url).origin;
    const top = await fetch(`${origin}/api/top-cryptos`, {
      next: { revalidate: 300 },
    })
      .then(
        (r) => r.json() as Promise<{ coins: Array<{ binanceSymbol: string }> }>
      )
      .catch(() => ({ coins: [] as Array<{ binanceSymbol: string }> }));
    const coins: string[] = (top.coins ?? [])
      .map((c) => c.binanceSymbol)
      .slice(0, 100);
    if (coins.length === 0)
      return NextResponse.json(
        toErrorResponse("NO_COINS", "No coins available to scan"),
        { status: 502 }
      );

    const results: Array<{
      symbol: string;
      interval: string;
      strength: number;
      direction: "long" | "short" | "neutral";
      score: number;
    }> = [];

    const limit = pLimit(6); // avoid function timeouts by limiting parallel fetches
    await Promise.all(
      coins.map((symbol) =>
        limit(async () => {
          try {
            const candles = await fetchCandles({ symbol, interval, limit: 400 });
            if (candles.length < 60) return;
            const closes = extractCloses(candles);
            const highs = extractHighs(candles);
            const lows = extractLows(candles);
            const volumes = extractVolumes(candles);
            const snap = computeIndicators({ closes, highs, lows, volumes });
            const ta = heuristicTaRecommendation(snap);
            const newsSent = { overall: "neutral" as const, confidence: 0.4, reasons: ["Skipped per-coin for speed"] };
            const det = buildDeterministicSignal({ snapshot: snap, taPrimary: ta, snapshotHTF: snap, taConfirm: ta, combinedTaScore: ta.score, news: newsSent });
            results.push({ symbol, interval, strength: det.strength, direction: det.direction, score: ta.score });
          } catch {
            // skip on error
          }
        })
      )
    );

    // Rank strongest
    results.sort((a, b) => b.strength - a.strength);
    const topLongs = results.filter((r) => r.direction === "long").slice(0, 10);
    const topShorts = results
      .filter((r) => r.direction === "short")
      .slice(0, 10);
    return NextResponse.json({
      interval,
      scanned: results.length,
      topLongs,
      topShorts,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json(toErrorResponse("INTERNAL", message), {
      status: 500,
    });
  }
}

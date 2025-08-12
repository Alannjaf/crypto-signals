"use client";
import { useEffect, useState } from "react";
import type { IndicatorSnapshot } from "@/lib/indicators";
import type { NewsSentiment } from "@/lib/openai";
import { useBinanceTicker, formatPriceForDisplay } from "@/lib/useTicker";

type ApiResponse = {
  symbol: string;
  interval: string;
  indicators: IndicatorSnapshot;
  ta: { score: number; reasons: string[] };
  news: { headlines: string[]; sentiment: NewsSentiment };
  signal: {
    direction: string;
    strength: number;
    rationale: string[];
    stopLoss?: number;
    takeProfit?: number;
    positionSizePct?: number;
  };
  mtf?: {
    confirmInterval: string;
    taPrimary: { score: number; reasons: string[] };
    taConfirm: { score: number; reasons: string[] };
    combinedScore: number;
  };
};

const DEFAULT_SYMBOLS = [
  "BTCUSDT",
  "ETHUSDT",
  "SOLUSDT",
  "BNBUSDT",
  "XRPUSDT",
  "ADAUSDT",
];
const INTERVALS = ["15m", "1h", "4h", "1d"];
const CONFIRM_INTERVALS = ["1h", "4h", "1d"];

export default function Home() {
  const [symbol, setSymbol] = useState("BTCUSDT");
  const [interval, setInterval] = useState("4h");
  const [confirmInterval, setConfirmInterval] = useState("1d");
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<ApiResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [top, setTop] = useState<
    { symbol: string; name: string; binanceSymbol: string }[]
  >([]);
  const [btLoading, setBtLoading] = useState(false);
  const [btError, setBtError] = useState<string | null>(null);
  const [btData, setBtData] = useState<{
    symbol: string;
    interval: string;
    lookback: number;
    stats: {
      trades: number;
      wins: number;
      losses: number;
      draws: number;
      winRate: number;
      avgPnL: number;
      totalPnL: number;
    };
  } | null>(null);

  const ticker = useBinanceTicker(symbol);
  const [scanLoading, setScanLoading] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [scanData, setScanData] = useState<null | { interval: string; scanned: number; topLongs: { symbol: string; strength: number }[]; topShorts: { symbol: string; strength: number }[] }>(null);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch("/api/top-cryptos");
        if (res.ok) {
          const json = await res.json();
          setTop(json.coins ?? []);
        }
      } catch {}
    })();
  }, []);

  useEffect(() => {
    const map = (i: string) => (i === "15m" ? "1h" : i === "1h" ? "4h" : "1d");
    setConfirmInterval(map(interval));
  }, [interval]);

  async function generate() {
    try {
      setLoading(true);
      setError(null);
      setData(null);
      const res = await fetch(
        `/api/signals?symbol=${encodeURIComponent(
          symbol
        )}&interval=${encodeURIComponent(
          interval
        )}&confirmInterval=${encodeURIComponent(confirmInterval)}`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Request failed: ${res.status}`);
      }
      const json = (await res.json()) as ApiResponse;
      setData(json);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setError(message);
    } finally {
      setLoading(false);
    }
  }

  async function runBacktest() {
    try {
      setBtLoading(true);
      setBtError(null);
      setBtData(null);
      const res = await fetch(
        `/api/backtest?symbol=${encodeURIComponent(
          symbol
        )}&interval=${encodeURIComponent(interval)}&lookback=500`
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `Backtest failed: ${res.status}`);
      }
      const json = await res.json();
      setBtData(json);
    } catch (e: unknown) {
      const message = e instanceof Error ? e.message : "Unknown error";
      setBtError(message);
    } finally {
      setBtLoading(false);
    }
  }

  return (
    <div className="bg-gradient-to-b from-white to-gray-50 min-h-screen text-gray-800">
      <div className="mx-auto max-w-5xl px-6 py-10">
        <div className="mx-auto max-w-3xl">
          <h1 className="text-4xl font-semibold tracking-tight text-gray-900">
            Crypto AI Signals
          </h1>
          <p className="mt-3 text-gray-700">
            Long/short signals with strength based on technical indicators and
            crypto news sentiment. Choose a symbol and timeframe.
          </p>

          <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-4">
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Symbol
              </label>
              <select
                value={symbol}
                onChange={(e) => setSymbol(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none"
              >
                {[
                  ...new Set([
                    ...top.map((c) => c.binanceSymbol),
                    ...DEFAULT_SYMBOLS,
                    symbol,
                  ]),
                ]
                  .filter(Boolean)
                  .map((s) => (
                    <option key={s} value={s}>
                      {s}
                    </option>
                  ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Confirm TF
              </label>
              <select
                value={confirmInterval}
                onChange={(e) => setConfirmInterval(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none"
              >
                {CONFIRM_INTERVALS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
        </div>
            <div>
              <label className="block text-sm font-medium text-gray-700">
                Timeframe
              </label>
              <select
                value={interval}
                onChange={(e) => setInterval(e.target.value)}
                className="mt-1 w-full rounded-md border border-gray-300 bg-white px-3 py-2 shadow-sm focus:border-gray-900 focus:outline-none"
              >
                {INTERVALS.map((i) => (
                  <option key={i} value={i}>
                    {i}
                  </option>
                ))}
              </select>
            </div>
            <div className="flex items-end">
              <button
                onClick={generate}
                disabled={loading}
                className="inline-flex w-full items-center justify-center rounded-md bg-gray-900 px-4 py-2 text-white hover:bg-black disabled:opacity-50"
              >
                {loading ? "Generating..." : "Generate Signal"}
              </button>
            </div>
          </div>

          {error && (
            <div className="mt-6 rounded-md bg-red-50 p-4 text-sm text-red-700">
              {error}
            </div>
          )}

          {data && (
            <div className="mt-8 space-y-6">
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <h2 className="text-xl font-semibold">Signal</h2>
                    <p className="text-sm text-gray-600">
                      {data.symbol} · {data.interval}
                    </p>
                  </div>
                  <div className="text-right space-y-1">
                    <div className="text-sm text-gray-500">
                      Live: {formatPriceForDisplay(ticker.price)}
                      {typeof ticker.changePct === "number" && (
                        <span className={ticker.changePct >= 0 ? "text-green-600" : "text-red-600"}>
                          {" "}({ticker.changePct.toFixed(2)}%)
                        </span>
                      )}
                    </div>
                    <div className="text-2xl font-bold capitalize">
                      {data.signal.direction}
                    </div>
                    <div className="text-sm text-gray-600">
                      Strength: {data.signal.strength}/100
                    </div>
                    {"entryHint" in (data.signal as unknown as Record<string, unknown>) && (
                      <div className="text-xs text-gray-500">Entry: {(data.signal as unknown as { entryHint?: string }).entryHint}</div>
                    )}
                  </div>
                </div>
                {data.signal.rationale.length > 0 && (
                  <ul className="mt-4 list-disc space-y-1 pl-6 text-sm text-gray-800">
                    {data.signal.rationale.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                )}
              </div>

              <div className="grid grid-cols-1 gap-6 md:grid-cols-2">
                <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold">Technical Analysis</h3>
                  <div className="mt-2 text-sm text-gray-700">
                    Score: {data.ta.score}
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-gray-800">
                    {data.ta.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                  <div className="mt-4 text-xs text-gray-500 space-y-1">
                    <div>
                      RSI14: {data.indicators.rsi14?.toFixed?.(2) ?? "-"} ·
                      EMA20: {data.indicators.ema20?.toFixed?.(2) ?? "-"} ·
                      EMA50: {data.indicators.ema50?.toFixed?.(2) ?? "-"}
                    </div>
                    <div>
                      ADX14: {data.indicators.adx14?.toFixed?.(2) ?? "-"} ·
                      ATR14: {data.indicators.atr14?.toFixed?.(4) ?? "-"}
                    </div>
                    {data.indicators.bb20 && (
                      <div>
                        BB%: {data.indicators.bb20.percentB.toFixed(2)} · BB
                        width: {data.indicators.bb20.bandwidth.toFixed(4)}
                      </div>
                    )}
                    <div>
                      SMA200: {data.indicators.sma200?.toFixed?.(2) ?? "-"}
                    </div>
                  </div>
                </div>
                <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold">News Sentiment</h3>
                  <div className="mt-2 text-sm text-gray-700 capitalize">
                    Overall: {data.news.sentiment.overall} (
                    {Math.round(data.news.sentiment.confidence * 100)}%)
                  </div>
                  <ul className="mt-2 list-disc space-y-1 pl-6 text-sm text-gray-800">
                    {data.news.sentiment.reasons.map((r, i) => (
                      <li key={i}>{r}</li>
                    ))}
                  </ul>
                  <div className="mt-3">
                    <h4 className="text-sm font-medium text-gray-600">
                      Recent Headlines
                    </h4>
                    <ul className="mt-1 list-disc space-y-1 pl-6 text-xs text-gray-700">
                      {data.news.headlines.map((h, i) => (
                        <li key={i}>{h}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>
              {data.mtf && (
                <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                  <h3 className="text-lg font-semibold">
                    Multi‑Timeframe Confirmation
                  </h3>
                  <div className="mt-2 text-sm text-gray-700">
                    Confirm TF: {data.mtf.confirmInterval}
                  </div>
                  <div className="mt-1 text-sm text-gray-700">
                    Primary score: {data.mtf.taPrimary.score} · Confirm score:{" "}
                    {data.mtf.taConfirm.score} · Combined:{" "}
                    {data.mtf.combinedScore}
                  </div>
                </div>
              )}
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">
                    Backtest (last 500 bars)
                  </h3>
                  <button
                    onClick={runBacktest}
                    disabled={btLoading}
                    className="rounded-md bg-gray-900 px-3 py-1.5 text-white hover:bg-black disabled:opacity-50"
                  >
                    {btLoading ? "Running..." : "Run Backtest"}
                  </button>
                </div>
                {btError && (
                  <div className="mt-2 text-sm text-red-600">{btError}</div>
                )}
                {btData && (
                  <div className="mt-3 text-sm text-gray-700">
                    <div>
                      Trades: {btData.stats.trades} · Win rate:{" "}
                      {(btData.stats.winRate * 100).toFixed(1)}%
                    </div>
                    <div>
                      Total PnL (price units):{" "}
                      {btData.stats.totalPnL.toFixed(4)} · Avg/Trade:{" "}
                      {btData.stats.avgPnL.toFixed(4)}
                    </div>
                    <div>
                      Wins: {btData.stats.wins} · Losses: {btData.stats.losses}{" "}
                      · Draws: {btData.stats.draws}
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between">
                  <h3 className="text-lg font-semibold">Scan Top 100</h3>
                  <button
                    onClick={async () => {
                      try {
                        setScanLoading(true); setScanError(null); setScanData(null);
                        const res = await fetch(`/api/scan?interval=${encodeURIComponent(interval)}`);
                        if (!res.ok) {
                          const err = await res.json().catch(() => ({}));
                          throw new Error(err.message || `Scan failed: ${res.status}`);
                        }
                        const json = await res.json();
                        setScanData(json);
                      } catch (e: unknown) {
                        const msg = e instanceof Error ? e.message : 'Unknown error';
                        setScanError(msg);
                      } finally {
                        setScanLoading(false);
                      }
                    }}
                    disabled={scanLoading}
                    className="rounded-md bg-gray-900 px-3 py-1.5 text-white hover:bg-black disabled:opacity-50"
                  >
                    {scanLoading ? "Scanning..." : "Scan Top 100"}
                  </button>
                </div>
                {scanError && <div className="mt-2 text-sm text-red-600">{scanError}</div>}
                {scanData && (
                  <div className="mt-3 text-sm text-gray-700">
                    <div className="text-gray-600 mb-2">Scanned: {scanData.scanned} · Interval: {scanData.interval}</div>
                    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
                      <div>
                        <div className="font-semibold mb-1">Top Longs</div>
                        <ul className="space-y-1">
                          {scanData.topLongs.map((r) => (
                            <li key={r.symbol} className="flex justify-between"><span>{r.symbol}</span><span>{r.strength}</span></li>
                          ))}
                        </ul>
                      </div>
                      <div>
                        <div className="font-semibold mb-1">Top Shorts</div>
                        <ul className="space-y-1">
                          {scanData.topShorts.map((r) => (
                            <li key={r.symbol} className="flex justify-between"><span>{r.symbol}</span><span>{r.strength}</span></li>
                          ))}
                        </ul>
                      </div>
                    </div>
                  </div>
                )}
              </div>
              <div className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
                <h3 className="text-lg font-semibold">Risk & Trade Hints</h3>
                <div className="mt-2 text-sm text-gray-700">
                  {typeof data.signal.positionSizePct === "number" && (
                    <div>
                      Suggested position:{" "}
                      {(data.signal.positionSizePct * 100).toFixed(0)}%
                    </div>
                  )}
                  {typeof data.signal.stopLoss === "number" &&
                    typeof data.signal.takeProfit === "number" && (
                      <div>
                        SL: {data.signal.stopLoss.toFixed(4)} · TP:{" "}
                        {data.signal.takeProfit.toFixed(4)}
                      </div>
                    )}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

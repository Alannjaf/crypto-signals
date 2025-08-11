import { z } from "zod";

export type Candlestick = {
  openTime: number; // ms
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number; // ms
};

export const BinanceIntervalSchema = z.enum([
  "1m",
  "3m",
  "5m",
  "15m",
  "30m",
  "1h",
  "2h",
  "4h",
  "6h",
  "8h",
  "12h",
  "1d",
  "3d",
  "1w",
  "1M",
]);

export type BinanceInterval = z.infer<typeof BinanceIntervalSchema>;

const BASE_URL = "https://api.binance.com/api/v3/klines";

export async function fetchKlines(params: {
  symbol: string; // e.g., "BTCUSDT"
  interval: BinanceInterval;
  limit?: number; // max 1000
}): Promise<Candlestick[]> {
  const { symbol, interval, limit = 500 } = params;
  const url = new URL(BASE_URL);
  url.searchParams.set("symbol", symbol.toUpperCase());
  url.searchParams.set("interval", interval);
  url.searchParams.set("limit", String(Math.min(Math.max(limit, 10), 1000)));

  const res = await fetch(url.toString(), { next: { revalidate: 60 } });
  if (!res.ok) {
    throw new Error(`Binance klines error ${res.status}: ${await res.text()}`);
  }
  const raw = (await res.json()) as unknown as (readonly [
    number, // open time
    string, // open
    string, // high
    string, // low
    string, // close
    string, // volume
    number, // close time
    ...unknown[]
  ])[];
  // https://binance-docs.github.io/apidocs/spot/en/#kline-candlestick-data
  const candles: Candlestick[] = raw.map((k) => ({
    openTime: k[0],
    open: Number(k[1]),
    high: Number(k[2]),
    low: Number(k[3]),
    close: Number(k[4]),
    volume: Number(k[5]),
    closeTime: k[6],
  }));
  return candles;
}

export function extractCloses(klines: Candlestick[]): number[] {
  return klines.map((k) => k.close);
}

export function extractHighs(klines: Candlestick[]): number[] {
  return klines.map((k) => k.high);
}

export function extractLows(klines: Candlestick[]): number[] {
  return klines.map((k) => k.low);
}

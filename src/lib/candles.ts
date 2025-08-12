import { type Candlestick, BinanceInterval, fetchKlines as fetchBinance } from "./binance";

function parseSymbol(sym: string): { base: string; quote: string } {
  const m = sym.toUpperCase().match(/^(.*?)(USDT|USD|USDC|BUSD|EUR|GBP|JPY|AUD|CAD)$/);
  if (m) return { base: m[1], quote: m[2] };
  // default to USD if cannot parse
  return { base: sym.toUpperCase(), quote: "USD" };
}

function coinbaseProduct(sym: string): string {
  const { base, quote } = parseSymbol(sym);
  const q = quote === "USDT" ? "USD" : quote;
  return `${base}-${q}`;
}

function coinbaseGranularity(interval: BinanceInterval): number | null {
  switch (interval) {
    case "15m": return 900;
    case "1h": return 3600;
    case "4h": return 14400;
    case "1d": return 86400;
    default: return null;
  }
}

async function fetchCoinbase(sym: string, interval: BinanceInterval, limit: number): Promise<Candlestick[]> {
  const product = coinbaseProduct(sym);
  const gran = coinbaseGranularity(interval);
  if (!gran) throw new Error("coinbase: unsupported interval");
  const url = new URL(`https://api.exchange.coinbase.com/products/${product}/candles`);
  url.searchParams.set("granularity", String(gran));
  url.searchParams.set("limit", String(Math.min(300, Math.max(10, limit))));
  const res = await fetch(url.toString(), { headers: { 'Accept': 'application/json' }, next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`coinbase ${res.status}`);
  const raw = (await res.json()) as Array<[number, number, number, number, number, number]>;
  // coinbase: [ time, low, high, open, close, volume ]
  const items: Candlestick[] = raw.map(r => ({
    openTime: r[0] * 1000,
    open: r[3],
    high: r[2],
    low: r[1],
    close: r[4],
    volume: r[5],
    closeTime: r[0] * 1000,
  })).sort((a,b) => a.openTime - b.openTime);
  return items;
}

async function fetchCryptoCompare(sym: string, interval: BinanceInterval, limit: number): Promise<Candlestick[]> {
  const { base, quote } = parseSymbol(sym);
  let path = ""; let aggregate = 1;
  switch (interval) {
    case "15m": path = "histominute"; aggregate = 15; break;
    case "1h": path = "histohour"; aggregate = 1; break;
    case "4h": path = "histohour"; aggregate = 4; break;
    case "1d": path = "histoday"; aggregate = 1; break;
    default: path = "histohour"; aggregate = 1; break;
  }
  const url = new URL(`https://min-api.cryptocompare.com/data/v2/${path}`);
  url.searchParams.set("fsym", base);
  url.searchParams.set("tsym", quote === "USDT" ? "USD" : quote);
  url.searchParams.set("limit", String(Math.min(2000, Math.max(10, limit))));
  url.searchParams.set("aggregate", String(aggregate));
  const headers: Record<string,string> = { 'Accept': 'application/json' };
  const key = process.env.CRYPTOCOMPARE_API_KEY;
  if (key) headers['Authorization'] = `Apikey ${key}`;
  const res = await fetch(url.toString(), { headers, next: { revalidate: 30 } });
  if (!res.ok) throw new Error(`cryptocompare ${res.status}`);
  const json = await res.json();
  if (json.Response !== 'Success') throw new Error(`cryptocompare: ${json.Message || 'error'}`);
  const data = json.Data.Data as Array<{ time: number; open: number; high: number; low: number; close: number; volumefrom: number }>;
  return data.map(d => ({
    openTime: d.time * 1000,
    open: d.open,
    high: d.high,
    low: d.low,
    close: d.close,
    volume: d.volumefrom,
    closeTime: d.time * 1000,
  }));
}

export async function fetchCandles(params: { symbol: string; interval: BinanceInterval; limit?: number }): Promise<Candlestick[]> {
  const { symbol, interval } = params;
  const limit = params.limit ?? 500;
  // 1) Try Binance
  try {
    return await fetchBinance({ symbol, interval, limit });
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    // 451 or eligibility issues → fallback
    if (!/451|Eligibility|restricted location/i.test(msg)) {
      // Non-regional error; still try fallbacks
    }
  }
  // 2) Try Coinbase
  try {
    return await fetchCoinbase(symbol, interval, limit);
  } catch {}
  // 3) Try CryptoCompare
  return await fetchCryptoCompare(symbol, interval, limit);
}

export { parseSymbol };



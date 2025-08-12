import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { parseSymbol } from "@/lib/candles";

const Q = z.object({ symbol: z.string().min(3) });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = Q.safeParse({
      symbol: searchParams.get("symbol") ?? "BTCUSDT",
    });
    if (!parsed.success)
      return NextResponse.json(
        { error: parsed.error.flatten() },
        { status: 400 }
      );
    const symbol = parsed.data.symbol.toUpperCase();
    // 1) Binance
    try {
      const url = new URL("https://api.binance.com/api/v3/ticker/price");
      url.searchParams.set("symbol", symbol);
      const res = await fetch(url.toString(), { next: { revalidate: 5 } });
      if (res.ok) {
        const json = await res.json();
        return NextResponse.json({ symbol, price: Number(json.price) });
      }
    } catch {}

    // 2) Coinbase
    try {
      const { base, quote } = parseSymbol(symbol);
      const product = `${base}-${quote === "USDT" ? "USD" : quote}`;
      const res = await fetch(
        `https://api.exchange.coinbase.com/products/${product}/ticker`,
        { headers: { Accept: "application/json" }, next: { revalidate: 5 } }
      );
      if (res.ok) {
        const json = await res.json();
        return NextResponse.json({ symbol, price: Number(json.price) });
      }
    } catch {}

    // 3) CryptoCompare
    try {
      const { base, quote } = parseSymbol(symbol);
      const url = new URL("https://min-api.cryptocompare.com/data/price");
      url.searchParams.set("fsym", base);
      url.searchParams.set("tsyms", quote === "USDT" ? "USD" : quote);
      const headers: Record<string, string> = { Accept: "application/json" };
      const key = process.env.CRYPTOCOMPARE_API_KEY;
      if (key) headers["Authorization"] = `Apikey ${key}`;
      const res = await fetch(url.toString(), {
        headers,
        next: { revalidate: 5 },
      });
      if (res.ok) {
        const json = await res.json();
        const val = json[quote === "USDT" ? "USD" : quote];
        if (typeof val === "number")
          return NextResponse.json({ symbol, price: val });
      }
    } catch {}

    return NextResponse.json({ error: "price unavailable" }, { status: 502 });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

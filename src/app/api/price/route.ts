import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";

const Q = z.object({ symbol: z.string().min(3) });

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const parsed = Q.safeParse({ symbol: searchParams.get("symbol") ?? "BTCUSDT" });
    if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
    const symbol = parsed.data.symbol.toUpperCase();
    const url = new URL("https://api.binance.com/api/v3/ticker/price");
    url.searchParams.set("symbol", symbol);
    const res = await fetch(url.toString(), { next: { revalidate: 5 } });
    if (!res.ok) return NextResponse.json({ error: `binance ${res.status}` }, { status: 502 });
    const json = await res.json();
    return NextResponse.json({ symbol, price: Number(json.price) });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}



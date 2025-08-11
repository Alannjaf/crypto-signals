import { NextResponse } from "next/server";

type CoinGeckoMarket = {
  id: string;
  symbol: string; // lowercase
  name: string;
  market_cap_rank: number;
};

const STABLES = new Set([
  "usdt",
  "usdc",
  "dai",
  "tusd",
  "busd",
  "fdusd",
  "usde",
  "usdp",
  "usdd",
]);

export async function GET() {
  try {
    const url = new URL("https://api.coingecko.com/api/v3/coins/markets");
    url.searchParams.set("vs_currency", "usd");
    url.searchParams.set("order", "market_cap_desc");
    url.searchParams.set("per_page", "15"); // fetch extra to filter out stables
    url.searchParams.set("page", "1");
    url.searchParams.set("sparkline", "false");

    const res = await fetch(url.toString(), { next: { revalidate: 600 } });
    if (!res.ok) {
      return NextResponse.json({ error: `coingecko ${res.status}` }, { status: 502 });
    }
    const data = (await res.json()) as CoinGeckoMarket[];
    const filtered = data.filter((c) => !STABLES.has(c.symbol.toLowerCase())).slice(0, 10);
    const mapped = filtered.map((c) => ({
      id: c.id,
      symbol: c.symbol.toUpperCase(),
      name: c.name,
      market_cap_rank: c.market_cap_rank,
      binanceSymbol: `${c.symbol.toUpperCase()}USDT`,
    }));
    return NextResponse.json({ coins: mapped });
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}



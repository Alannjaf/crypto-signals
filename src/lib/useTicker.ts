'use client';

import { useEffect, useState } from 'react';

export type Ticker = {
  price: number | null;
  changePct: number | null; // 24h percent change
  high: number | null;
  low: number | null;
  connected: boolean;
};

export function useBinanceTicker(symbol: string): Ticker {
  const [price, setPrice] = useState<number | null>(null);
  const [changePct, setChangePct] = useState<number | null>(null);
  const [high, setHigh] = useState<number | null>(null);
  const [low, setLow] = useState<number | null>(null);
  const [connected, setConnected] = useState(false);

  useEffect(() => {
    if (!symbol) return;
    let ws: WebSocket | null = null;
    let cancelled = false;

    async function bootstrap() {
      try {
        // Prime with REST price to avoid initial null until WS ticks
        const res = await fetch(`/api/price?symbol=${encodeURIComponent(symbol)}`);
        if (res.ok) {
          const json = await res.json();
          if (typeof json.price === 'number') setPrice(json.price);
        }
      } catch {}

      const stream = `${symbol.toLowerCase()}@ticker`;
      ws = new WebSocket(`wss://stream.binance.com:9443/ws/${stream}`);
      ws.onopen = () => !cancelled && setConnected(true);
      ws.onclose = () => !cancelled && setConnected(false);
      ws.onerror = () => !cancelled && setConnected(false);
      ws.onmessage = (evt) => {
        try {
          const data = JSON.parse(evt.data);
          if (data && typeof data.c !== 'undefined') {
            setPrice(Number(data.c));
            if (typeof data.P !== 'undefined') setChangePct(Number(data.P));
            if (typeof data.h !== 'undefined') setHigh(Number(data.h));
            if (typeof data.l !== 'undefined') setLow(Number(data.l));
          }
        } catch {}
      };
    }

    bootstrap();
    return () => {
      cancelled = true;
      try {
        if (ws && ws.readyState === WebSocket.OPEN) ws.close();
      } catch {}
    };
  }, [symbol]);

  return { price, changePct, high, low, connected };
}

export function formatPriceForDisplay(value: number | null): string {
  if (value === null || Number.isNaN(value)) return '-';
  const abs = Math.abs(value);
  const decimals = abs >= 1000 ? 2 : abs >= 1 ? 2 : 6;
  return value.toFixed(decimals);
}



Crypto AI Signals: Next.js app that fetches Binance candles and crypto RSS headlines, computes indicators (RSI, EMA, MACD, Stochastic), analyzes news with OpenAI, and returns long/short signals with strength for a chosen timeframe.

## Getting Started

First, add your OpenAI API key to `.env.local`:

```
OPENAI_API_KEY=sk-...
```

Then run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser.

Use the UI to choose symbol (e.g., `BTCUSDT`) and timeframe (e.g., `4h`) and click Generate Signal.

API:

`GET /api/signals?symbol=BTCUSDT&interval=4h`

- Free price data via Binance public API
- Free crypto news headlines via public RSS feeds
- Uses your OpenAI API key to analyze sentiment and synthesize final signal

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy

This app is a standard Next.js project. Set `OPENAI_API_KEY` in your host and deploy.

import Parser from "rss-parser";

export type NewsItem = {
  title: string;
  link?: string;
  isoDate?: string;
  contentSnippet?: string;
};

const parser = new Parser();

// Free RSS sources related to crypto
const FEEDS = [
  "https://www.coindesk.com/arc/outboundfeeds/rss/?outputType=xml",
  "https://cointelegraph.com/rss",
  "https://decrypt.co/feed",
];

export async function fetchCryptoNews(limit: number = 30): Promise<NewsItem[]> {
  const results = await Promise.allSettled(
    FEEDS.map((u) => parser.parseURL(u))
  );
  const items: NewsItem[] = [];
  for (const res of results) {
    if (res.status === "fulfilled") {
      const feed = res.value;
      for (const item of feed.items) {
        items.push({
          title: item.title ?? "",
          link: item.link,
          isoDate: item.isoDate,
          contentSnippet: item.contentSnippet,
        });
      }
    }
  }
  items.sort(
    (a, b) =>
      new Date(b.isoDate ?? 0).getTime() - new Date(a.isoDate ?? 0).getTime()
  );
  return items.slice(0, limit);
}

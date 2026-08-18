type BraveWebResult = {
  title?: string;
  url?: string;
  description?: string;
  profile?: { long_name?: string };
};

type BraveResponse = {
  web?: { results?: BraveWebResult[] };
};

export async function braveWebSearch(query: string, count = 10) {
  const apiKey = process.env.BRAVE_SEARCH_API_KEY;
  if (!apiKey) throw new Error("BRAVE_SEARCH_API_KEY is not configured");

  const params = new URLSearchParams({
    q: query,
    count: String(Math.min(Math.max(count, 1), 20)),
    country: "MX",
    search_lang: "es",
  });

  const response = await fetch(`https://api.search.brave.com/res/v1/web/search?${params.toString()}`, {
    headers: {
      Accept: "application/json",
      "X-Subscription-Token": apiKey,
    },
  });

  const body = await response.json().catch(() => ({})) as BraveResponse & any;
  if (!response.ok) throw new Error(body?.message || `Brave Search API ${response.status}`);
  return body.web?.results || [];
}

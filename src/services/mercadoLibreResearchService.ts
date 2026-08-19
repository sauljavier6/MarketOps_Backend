import MarketSnapshot from "../models/MarketSnapshot";
import RadarCandidate from "../models/RadarCandidate";
import { calculateMarketScore, getCandidateStatus } from "./marketRadarService";
import { getActiveAccount, getValidAccessToken } from "./mercadoLibreService";

const API_BASE = "https://api.mercadolibre.com";
const SITE_ID = "MLM";

type Trend = { keyword: string; url?: string };
type SearchResult = {
  id?: string;
  title?: string;
  price?: number;
  seller?: { id?: number };
  category_id?: string;
};

function buildMercadoLibreError(path: string, status: number, body: any) {
  const details = {
    path,
    status,
    error: body?.error || null,
    message: body?.message || null,
    code: body?.code || body?.error_code || null,
    cause: body?.cause || body?.causes || null,
  };

  console.error("[MELI RESEARCH] request failed", details);

  const readable = [
    `Mercado Libre ${status}`,
    `path=${path}`,
    details.error ? `error=${details.error}` : null,
    details.code ? `code=${details.code}` : null,
    details.message ? `message=${details.message}` : null,
  ].filter(Boolean).join(" | ");

  return new Error(readable);
}

async function authorizedGet<T>(path: string): Promise<T> {
  const account = await getActiveAccount();
  const token = await getValidAccessToken(account);

  const response = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}`, accept: "application/json" },
  });

  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok) throw buildMercadoLibreError(path, response.status, body);
  return body as T;
}

export async function getMexicoTrends(categoryId?: string): Promise<Trend[]> {
  const path = categoryId ? `/trends/${SITE_ID}/${encodeURIComponent(categoryId)}` : `/trends/${SITE_ID}`;
  return authorizedGet<Trend[]>(path);
}

export async function predictCategory(title: string) {
  const params = new URLSearchParams({ q: title, limit: "1" });
  const path = `/sites/${SITE_ID}/domain_discovery/search?${params.toString()}`;
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { accept: "application/json" },
  });
  const body = await response.json().catch(() => []) as any;
  if (!response.ok) throw buildMercadoLibreError(path, response.status, body);
  return Array.isArray(body) ? body[0] || null : null;
}

export async function searchMarketplace(keyword: string, limit = 30) {
  const params = new URLSearchParams({ q: keyword, limit: String(Math.min(Math.max(limit, 1), 50)) });
  const payload = await authorizedGet<any>(`/sites/${SITE_ID}/search?${params.toString()}`);
  return {
    paging: payload?.paging || {},
    results: Array.isArray(payload?.results) ? payload.results as SearchResult[] : [],
  };
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export async function analyzeKeyword(keyword: string, trendRank: number, totalTrends: number) {
  const predicted = await predictCategory(keyword).catch((error) => {
    console.warn("[MELI RESEARCH] category prediction failed", { keyword, error: error instanceof Error ? error.message : String(error) });
    return null;
  });
  const search = await searchMarketplace(keyword, 30);

  const prices = search.results
    .map((row) => Number(row.price))
    .filter((value) => Number.isFinite(value) && value > 0);

  const activeListings = Number(search.paging?.total || search.results.length || 0);
  const observedSellerIds = new Set(search.results.map((r) => r.seller?.id).filter(Boolean)).size;

  // DemandScore is a signal derived from the official weekly trend rank.
  // It is not presented as units sold.
  const rankRatio = totalTrends > 1 ? trendRank / (totalTrends - 1) : 0;
  const demandScore = Math.round(95 - (rankRatio * 40));

  // Competition is based on active result volume + seller diversity, capped.
  const listingComponent = Math.min(100, Math.log10(Math.max(activeListings, 1)) * 25);
  const sellerComponent = Math.min(100, observedSellerIds * 4);
  const competitionScore = Math.round((listingComponent * 0.7) + (sellerComponent * 0.3));

  const snapshot = await MarketSnapshot.create({
    Source: "MERCADOLIBRE_OFFICIAL_API",
    Keyword: keyword,
    CategoryId: predicted?.category_id || search.results[0]?.category_id || null,
    ActiveListings: activeListings,
    MinPrice: prices.length ? Math.min(...prices) : null,
    MedianPrice: prices.length ? Number(median(prices).toFixed(2)) : null,
    MaxPrice: prices.length ? Math.max(...prices) : null,
    CompetitionScore: competitionScore,
    DemandScore: demandScore,
    RawSummary: {
      trendRank: trendRank + 1,
      trendsCount: totalTrends,
      observedResults: search.results.length,
      observedSellers: observedSellerIds,
      priceSampleCount: prices.length,
      note: "Demand uses official trend position; public inventory is not treated as sales.",
    },
  });

  return {
    snapshot,
    predictedCategory: predicted,
    estimatedSalePrice: Number(snapshot.MedianPrice || 0),
    demandScore,
    competitionScore,
  };
}

export async function createCandidateFromTrend(keyword: string, rank: number, total: number) {
  const market = await analyzeKeyword(keyword, rank, total);

  if (!market.estimatedSalePrice) return null;

  // Seasonal/trend are intentionally conservative until the historical snapshot engine
  // has enough observations to calculate acceleration.
  const seasonalScore = 60;
  const trendScore = Math.max(55, market.demandScore);

  const marketScore = calculateMarketScore({
    title: keyword,
    estimatedSalePrice: market.estimatedSalePrice,
    demandScore: market.demandScore,
    competitionScore: market.competitionScore,
    seasonalScore,
    trendScore,
  });

  const existing = await RadarCandidate.findOne({ where: { Title: keyword } });

  const payload = {
    Title: keyword,
    Season: null,
    EstimatedSalePrice: market.estimatedSalePrice,
    EstimatedMarketplaceFee: 0,
    EstimatedShippingCost: 0,
    PackagingCost: 0,
    DemandScore: market.demandScore,
    CompetitionScore: market.competitionScore,
    SeasonalScore: seasonalScore,
    TrendScore: trendScore,
    MarketScore: marketScore,
    Status: getCandidateStatus(marketScore),
  };

  if (existing) {
    await existing.update(payload);
    return existing;
  }
  return RadarCandidate.create(payload);
}

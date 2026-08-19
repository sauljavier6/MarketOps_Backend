import MarketSnapshot from "../models/MarketSnapshot";
import RadarCandidate from "../models/RadarCandidate";
import { calculateMarketScore, getCandidateStatus } from "./marketRadarService";
import { getActiveAccount, getValidAccessToken } from "./mercadoLibreService";

const API_BASE = "https://api.mercadolibre.com";
const SITE_ID = "MLM";

type Trend = { keyword: string; url?: string };
type CatalogSearchResult = { id?: string; name?: string; status?: string; domain_id?: string };
type CatalogProductDetail = {
  id?: string;
  name?: string;
  status?: string;
  domain_id?: string;
  sold_quantity?: number;
  buy_box_winner?: {
    item_id?: string;
    seller_id?: number;
    price?: number;
    currency_id?: string;
    available_quantity?: number;
    shipping?: { free_shipping?: boolean; mode?: string };
  };
};

function buildMercadoLibreError(path: string, status: number, body: any) {
  const details = [
    `Mercado Libre ${status}`,
    `path=${path}`,
    body?.error ? `error=${body.error}` : null,
    body?.message ? `message=${body.message}` : null,
    body?.code ? `code=${body.code}` : null,
  ].filter(Boolean).join(" | ");
  return new Error(details);
}

async function authorizedGet<T>(path: string): Promise<T> {
  const account = await getActiveAccount();
  const token = await getValidAccessToken(account);
  const response = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}`, accept: "application/json" } });
  const body = await response.json().catch(() => ({})) as any;

  if (!response.ok) {
    console.error("[MELI RESEARCH] request failed", {
      path,
      status: response.status,
      error: body?.error || null,
      message: body?.message || null,
      code: body?.code || null,
      cause: body?.cause || [],
    });
    throw buildMercadoLibreError(path, response.status, body);
  }

  return body as T;
}

export async function getMexicoTrends(categoryId?: string): Promise<Trend[]> {
  const path = categoryId ? `/trends/${SITE_ID}/${encodeURIComponent(categoryId)}` : `/trends/${SITE_ID}`;
  return authorizedGet<Trend[]>(path);
}

export async function predictCategory(title: string) {
  const params = new URLSearchParams({ q: title, limit: "1" });
  const response = await fetch(`${API_BASE}/sites/${SITE_ID}/domain_discovery/search?${params.toString()}`, { headers: { accept: "application/json" } });
  const body = await response.json().catch(() => []) as any;
  if (!response.ok) throw new Error(body?.message || `Category discovery ${response.status}`);
  return Array.isArray(body) ? body[0] || null : null;
}

export async function searchCatalogProducts(keyword: string, limit = 10, domainId?: string) {
  const params = new URLSearchParams({ status: "active", site_id: SITE_ID, q: keyword, limit: String(Math.min(Math.max(limit, 1), 20)) });
  if (domainId) params.set("domain_id", domainId);
  const payload = await authorizedGet<any>(`/products/search?${params.toString()}`);
  return {
    paging: payload?.paging || {},
    results: Array.isArray(payload?.results) ? payload.results as CatalogSearchResult[] : [],
  };
}

export async function getCatalogProduct(productId: string) {
  return authorizedGet<CatalogProductDetail>(`/products/${encodeURIComponent(productId)}`);
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

export async function analyzeKeyword(keyword: string, trendRank: number, totalTrends: number) {
  const predicted = await predictCategory(keyword).catch(() => null);
  const catalog = await searchCatalogProducts(keyword, 10, predicted?.domain_id).catch(async (error) => {
    if (predicted?.domain_id) return searchCatalogProducts(keyword, 10);
    throw error;
  });

  const details = (await Promise.all(
    catalog.results.slice(0, 8).map(async (product) => {
      if (!product.id) return null;
      try { return await getCatalogProduct(product.id); } catch { return null; }
    }),
  )).filter(Boolean) as CatalogProductDetail[];

  const winnerPrices = details.map((row) => Number(row.buy_box_winner?.price)).filter((value) => Number.isFinite(value) && value > 0);
  const soldQuantities = details.map((row) => Number(row.sold_quantity)).filter((value) => Number.isFinite(value) && value >= 0);
  const winnerSellerIds = new Set(details.map((row) => row.buy_box_winner?.seller_id).filter(Boolean)).size;
  const catalogMatchCount = Number(catalog.paging?.total || catalog.results.length || 0);

  const rankRatio = totalTrends > 1 ? trendRank / (totalTrends - 1) : 0;
  const demandScore = Math.round(95 - (rankRatio * 40));

  // Competition is INFERRED from catalog breadth and sampled winner diversity.
  // It is deliberately not labeled as listing count because general item search is not available to this integration.
  const catalogBreadth = Math.min(100, Math.log10(Math.max(catalogMatchCount, 1)) * 35);
  const winnerDiversity = Math.min(100, winnerSellerIds * 12);
  const competitionScore = Math.round((catalogBreadth * 0.7) + (winnerDiversity * 0.3));

  const snapshot = await MarketSnapshot.create({
    Source: "MERCADOLIBRE_CATALOG_API",
    Keyword: keyword,
    CategoryId: predicted?.category_id || details[0]?.domain_id || catalog.results[0]?.domain_id || null,
    ActiveListings: 0,
    MinPrice: winnerPrices.length ? Math.min(...winnerPrices) : null,
    MedianPrice: winnerPrices.length ? Number(median(winnerPrices).toFixed(2)) : null,
    MaxPrice: winnerPrices.length ? Math.max(...winnerPrices) : null,
    CompetitionScore: competitionScore,
    DemandScore: demandScore,
    RawSummary: {
      evidenceVersion: 2,
      keyword,
      trendRank: trendRank + 1,
      trendsCount: totalTrends,
      catalogMatchCount,
      catalogProductsSampled: details.length,
      winnerPriceSampleCount: winnerPrices.length,
      winnerSellerCount: winnerSellerIds,
      soldQuantitySampleTotal: soldQuantities.reduce((sum, value) => sum + value, 0),
      dataClassification: {
        trendKeyword: "REAL_DATA",
        trendRank: "REAL_DATA",
        catalogProducts: "REAL_DATA",
        winnerPrices: "REAL_DATA",
        soldQuantity: "REAL_DATA_PERIOD_UNSPECIFIED",
        activeListings: "UNAVAILABLE_DATA",
        demandScore: "INFERRED_DATA",
        competitionScore: "INFERRED_DATA",
      },
      notes: [
        "General /sites/MLM/search?q keyword search is not used because the integration receives HTTP 403.",
        "Sale price is estimated from current buy-box winner prices returned by catalog product detail.",
        "sold_quantity is preserved as a real Mercado Libre signal but is not treated as weekly sales because its period is not provided here.",
        "CompetitionScore is an inference from catalog breadth and sampled winner diversity, not a count of active listings.",
      ],
    },
  });

  return {
    snapshot,
    predictedCategory: predicted,
    estimatedSalePrice: Number(snapshot.MedianPrice || 0),
    demandScore,
    competitionScore,
    evidenceConfidence: winnerPrices.length >= 5 ? 80 : winnerPrices.length >= 2 ? 65 : winnerPrices.length === 1 ? 50 : 30,
  };
}

export async function createCandidateFromTrend(keyword: string, rank: number, total: number) {
  const market = await analyzeKeyword(keyword, rank, total);
  if (!market.estimatedSalePrice) return null;

  // Seasonality is neutral until the dedicated Mexico season engine supplies evidence.
  const seasonalScore = 50;
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

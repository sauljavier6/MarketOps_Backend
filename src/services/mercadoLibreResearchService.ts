import MarketSnapshot from "../models/MarketSnapshot";
import RadarCandidate from "../models/RadarCandidate";
import { braveWebSearch } from "./braveSearchService";
import { calculateMarketScore, getCandidateStatus } from "./marketRadarService";
import { getActiveAccount, getValidAccessToken } from "./mercadoLibreService";

const API_BASE = "https://api.mercadolibre.com";
const SITE_ID = "MLM";

type Trend = { keyword: string; url?: string };
type BraveMarketResult = { title?: string; url?: string; description?: string };
type CatalogSearchResult = { id?: string; name?: string; status?: string; domain_id?: string };
type CatalogProductDetail = { id?: string; name?: string; status?: string; domain_id?: string; sold_quantity?: number; buy_box_winner?: { item_id?: string; seller_id?: number; price?: number; currency_id?: string; available_quantity?: number; shipping?: { free_shipping?: boolean; mode?: string } } };

function buildMercadoLibreError(path: string, status: number, body: any) {
  const details = [`Mercado Libre ${status}`, `path=${path}`, body?.error ? `error=${body.error}` : null, body?.message ? `message=${body.message}` : null, body?.code ? `code=${body.code}` : null].filter(Boolean).join(" | ");
  return new Error(details);
}

async function authorizedGet<T>(path: string): Promise<T> {
  const account = await getActiveAccount();
  const token = await getValidAccessToken(account);
  const response = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}`, accept: "application/json" } });
  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    console.error("[MELI RESEARCH] request failed", { path, status: response.status, error: body?.error || null, message: body?.message || null, code: body?.code || null, cause: body?.cause || [] });
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
  return { paging: payload?.paging || {}, results: Array.isArray(payload?.results) ? payload.results as CatalogSearchResult[] : [] };
}

export async function getCatalogProduct(productId: string) { return authorizedGet<CatalogProductDetail>(`/products/${encodeURIComponent(productId)}`); }

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function extractMxnPrices(text: string) {
  const normalized = text.replace(/,/g, "");
  const matches = [...normalized.matchAll(/(?:MXN|MX\$|\$)\s*([0-9]{2,6}(?:\.[0-9]{1,2})?)/gi)];
  return matches.map((match) => Number(match[1])).filter((value) => Number.isFinite(value) && value >= 50 && value <= 500000);
}

async function braveMarketFallback(keyword: string) {
  if (!process.env.BRAVE_SEARCH_API_KEY) return { results: [], prices: [], estimatedPrice: null, error: "BRAVE_SEARCH_API_KEY_NOT_CONFIGURED" };
  try {
    const results = await braveWebSearch(`site:mercadolibre.com.mx ${keyword} precio`, 10) as BraveMarketResult[];
    const prices = results.flatMap((row: BraveMarketResult) => extractMxnPrices(`${row.title || ""} ${row.description || ""}`));
    return {
      results: results.slice(0, 8).map((row: BraveMarketResult) => ({ title: row.title || null, url: row.url || null, description: row.description || null })),
      prices,
      estimatedPrice: prices.length ? Number(median(prices).toFixed(2)) : null,
      error: null,
    };
  } catch (error: any) {
    console.warn("[BRAVE RESEARCH] fallback failed", keyword, error?.message || error);
    return { results: [], prices: [], estimatedPrice: null, error: error?.message || "BRAVE_SEARCH_FAILED" };
  }
}

export async function analyzeKeyword(keyword: string, trendRank: number, totalTrends: number) {
  const predicted = await predictCategory(keyword).catch(() => null);
  const catalog = await searchCatalogProducts(keyword, 10, predicted?.domain_id).catch(async (error) => {
    if (predicted?.domain_id) return searchCatalogProducts(keyword, 10);
    throw error;
  });
  const details = (await Promise.all(catalog.results.slice(0, 8).map(async (product) => product.id ? getCatalogProduct(product.id).catch(() => null) : null))).filter(Boolean) as CatalogProductDetail[];
  const winnerPrices = details.map((row) => Number(row.buy_box_winner?.price)).filter((value) => Number.isFinite(value) && value > 0);
  const soldQuantities = details.map((row) => Number(row.sold_quantity)).filter((value) => Number.isFinite(value) && value >= 0);
  const winnerSellerIds = new Set(details.map((row) => row.buy_box_winner?.seller_id).filter(Boolean)).size;
  const catalogMatchCount = Number(catalog.paging?.total || catalog.results.length || 0);
  const brave = winnerPrices.length ? { results: [], prices: [], estimatedPrice: null, error: null } : await braveMarketFallback(keyword);
  const rankRatio = totalTrends > 1 ? trendRank / (totalTrends - 1) : 0;
  const demandScore = Math.round(95 - (rankRatio * 40));
  const catalogBreadth = Math.min(100, Math.log10(Math.max(catalogMatchCount, 1)) * 35);
  const winnerDiversity = Math.min(100, winnerSellerIds * 12);
  const competitionScore = Math.round((catalogBreadth * 0.7) + (winnerDiversity * 0.3));
  const mlPrice = winnerPrices.length ? Number(median(winnerPrices).toFixed(2)) : null;
  const estimatedSalePrice = mlPrice ?? brave.estimatedPrice;
  const priceSource = mlPrice ? "MERCADOLIBRE_BUY_BOX" : brave.estimatedPrice ? "BRAVE_OBSERVED_WEB" : null;
  const evidenceConfidence = mlPrice ? (winnerPrices.length >= 5 ? 80 : winnerPrices.length >= 2 ? 65 : 50) : brave.prices.length >= 3 ? 50 : brave.prices.length ? 40 : catalogMatchCount > 0 ? 35 : 25;
  const missingReason = estimatedSalePrice ? null : catalogMatchCount > 0 ? "NO_MARKET_PRICE" : "NO_CATALOG_OR_WEB_PRICE";

  const evidence = {
    evidenceVersion: 4, keyword, trendRank: trendRank + 1, trendsCount: totalTrends,
    categoryId: predicted?.category_id || null, domainId: predicted?.domain_id || details[0]?.domain_id || catalog.results[0]?.domain_id || null,
    catalogMatchCount, catalogProductsSampled: details.length, winnerPriceSampleCount: winnerPrices.length, winnerSellerCount: winnerSellerIds,
    soldQuantitySampleTotal: soldQuantities.reduce((sum, value) => sum + value, 0),
    braveResultCount: brave.results.length, bravePriceSampleCount: brave.prices.length, braveResults: brave.results, braveError: brave.error,
    priceSource, result: estimatedSalePrice ? (mlPrice ? "RESEARCHED_WITH_ML_PRICE" : "RESEARCHED_WITH_BRAVE_PRICE") : "DISCOVERED_INCOMPLETE", missingReason,
    dataClassification: { trendKeyword: "REAL_DATA", trendRank: "REAL_DATA", catalogProducts: "REAL_DATA", winnerPrices: winnerPrices.length ? "REAL_DATA" : "UNAVAILABLE_DATA", braveSearchResults: brave.results.length ? "REAL_DATA" : "UNAVAILABLE_DATA", braveObservedPrices: brave.prices.length ? "ESTIMATED_DATA" : "UNAVAILABLE_DATA", estimatedSalePrice: mlPrice ? "REAL_DATA" : brave.estimatedPrice ? "ESTIMATED_DATA" : "UNAVAILABLE_DATA", soldQuantity: soldQuantities.length ? "REAL_DATA_PERIOD_UNSPECIFIED" : "UNAVAILABLE_DATA", demandScore: "INFERRED_DATA", competitionScore: "INFERRED_DATA" },
  };

  const snapshot = await MarketSnapshot.create({ Source: mlPrice ? "MERCADOLIBRE_CATALOG_API" : brave.estimatedPrice ? "MERCADOLIBRE_BRAVE_RESEARCH" : "MERCADOLIBRE_CATALOG_API", Keyword: keyword, CategoryId: evidence.domainId, ActiveListings: 0, MinPrice: winnerPrices.length ? Math.min(...winnerPrices) : brave.prices.length ? Math.min(...brave.prices) : null, MedianPrice: estimatedSalePrice, MaxPrice: winnerPrices.length ? Math.max(...winnerPrices) : brave.prices.length ? Math.max(...brave.prices) : null, CompetitionScore: competitionScore, DemandScore: demandScore, RawSummary: evidence });
  return { snapshot, predictedCategory: predicted, estimatedSalePrice, demandScore, competitionScore, evidenceConfidence, evidence };
}

export async function createCandidateFromTrend(keyword: string, rank: number, total: number) {
  const market = await analyzeKeyword(keyword, rank, total);
  const seasonalScore = 50;
  const trendScore = Math.max(55, market.demandScore);
  const marketScore = calculateMarketScore({ demandScore: market.demandScore, competitionScore: market.competitionScore, seasonalScore, trendScore });
  const researched = market.estimatedSalePrice != null;
  const status = researched ? getCandidateStatus(marketScore) : "DISCOVERED";
  const payload = { Title: keyword, Season: null, EstimatedSalePrice: market.estimatedSalePrice, EstimatedMarketplaceFee: 0, EstimatedShippingCost: 0, PackagingCost: 0, DemandScore: market.demandScore, CompetitionScore: market.competitionScore, SeasonalScore: seasonalScore, TrendScore: trendScore, MarketScore: marketScore, ConfidenceScore: market.evidenceConfidence, Status: status, Evidence: market.evidence };
  const existing = await RadarCandidate.findOne({ where: { Title: keyword } });
  const candidate = existing ? await existing.update(payload) : await RadarCandidate.create(payload);
  return { candidate, research: { keyword, status, catalogMatchCount: market.evidence.catalogMatchCount, winnerPriceSampleCount: market.evidence.winnerPriceSampleCount, bravePriceSampleCount: market.evidence.bravePriceSampleCount, priceSource: market.evidence.priceSource, estimatedSalePrice: market.estimatedSalePrice, confidenceScore: market.evidenceConfidence, result: market.evidence.result, missingReason: market.evidence.missingReason } };
}

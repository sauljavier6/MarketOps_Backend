import MarketSnapshot from "../models/MarketSnapshot";
import RadarCandidate from "../models/RadarCandidate";
import { calculateMarketScore, getCandidateStatus } from "./marketRadarService";
import { getActiveAccount, getValidAccessToken } from "./mercadoLibreService";
import { evaluateMexicoSeason } from "./seasonEngine";

const API_BASE = "https://api.mercadolibre.com";
const SITE_ID = "MLM";
const STRONG_MARKET_PRICE_SAMPLES = 3;
const STRONG_MARKET_CONFIDENCE = 70;

const GENERIC_DISCOVERY_TERMS = new Set([
  "de", "del", "la", "el", "los", "las", "para", "con", "sin", "por", "una", "uno",
  "color", "grande", "pequeno", "pequena", "exterior", "interior", "hogar", "fiesta",
  "decoracion", "decorativa", "decorativo", "artificial", "kit", "set", "pack", "pieza", "piezas",
  "luces", "luz", "led", "bluetooth", "usb", "portatil", "recargable", "impermeable", "escolar",
  "termica", "infantil", "hombre", "mujer", "auto", "casa", "nuevo", "nueva"
]);

type Trend = { keyword: string; url?: string };
type CatalogSearchResult = { id?: string; name?: string; status?: string; domain_id?: string };
type CatalogProductDetail = {
  id?: string;
  name?: string;
  status?: string;
  domain_id?: string;
  category_id?: string;
  sold_quantity?: number;
  children_ids?: string[];
  buy_box_winner?: { item_id?: string; seller_id?: number; price?: number; currency_id?: string; available_quantity?: number } | null;
};
type CatalogItem = { item_id?: string; seller_id?: number; price?: number; currency_id?: string; available_quantity?: number; condition?: string };
type CatalogItemsResponse = { paging?: { total?: number; offset?: number; limit?: number }; results?: CatalogItem[] };
type ListingPrice = { listing_type_id?: string; listing_type_name?: string; sale_fee_amount?: number; sale_fee_details?: { percentage_fee?: number; meli_percentage_fee?: number; fixed_fee?: number } };

export type DiscoveredProduct = {
  productId: string;
  title: string;
  domainId?: string | null;
  sourceTrend: string;
  sourceType?: "MELI_TREND" | "SEASONAL_SEED";
  sourceSeason?: string | null;
  sourceScore?: number | null;
  relevanceScore?: number | null;
};

async function apiGet<T>(path: string, quietStatuses: number[] = []): Promise<T> {
  const account = await getActiveAccount();
  const token = await getValidAccessToken(account);
  const response = await fetch(`${API_BASE}${path}`, { headers: { Authorization: `Bearer ${token}`, accept: "application/json" } });
  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    if (!quietStatuses.includes(response.status)) console.error("[MELI RESEARCH] request failed", { path, status: response.status, error: body?.error || null, message: body?.message || null, code: body?.code || null });
    const error: any = new Error(`Mercado Libre ${response.status} | path=${path} | ${body?.message || body?.error || "request failed"}`);
    error.status = response.status;
    throw error;
  }
  return body as T;
}

export async function getMexicoTrends(categoryId?: string): Promise<Trend[]> {
  const path = categoryId ? `/trends/${SITE_ID}/${encodeURIComponent(categoryId)}` : `/trends/${SITE_ID}`;
  return apiGet<Trend[]>(path);
}

export async function predictCategory(title: string) {
  const params = new URLSearchParams({ q: title, limit: "1" });
  const response = await fetch(`${API_BASE}/sites/${SITE_ID}/domain_discovery/search?${params.toString()}`, { headers: { accept: "application/json" } });
  const body = await response.json().catch(() => []) as any;
  if (!response.ok) throw new Error(body?.message || `Category discovery ${response.status}`);
  return Array.isArray(body) ? body[0] || null : null;
}

export async function searchCatalogProducts(keyword: string, limit = 12, domainId?: string) {
  const params = new URLSearchParams({ status: "active", site_id: SITE_ID, q: keyword, limit: String(Math.min(Math.max(limit, 1), 20)) });
  if (domainId) params.set("domain_id", domainId);
  const payload = await apiGet<any>(`/products/search?${params.toString()}`);
  return { paging: payload?.paging || {}, results: Array.isArray(payload?.results) ? payload.results as CatalogSearchResult[] : [] };
}

async function getCatalogProduct(productId: string) {
  return apiGet<CatalogProductDetail>(`/products/${encodeURIComponent(productId)}`);
}

async function getCatalogProductItems(productId: string) {
  try {
    return await apiGet<CatalogItemsResponse>(`/products/${encodeURIComponent(productId)}/items`, [404]);
  } catch (error: any) {
    if (error?.status === 404) return { paging: { total: 0 }, results: [] } as CatalogItemsResponse;
    throw error;
  }
}

async function getListingFee(price: number, categoryId?: string | null) {
  if (!categoryId || !price) return null;
  const params = new URLSearchParams({ price: String(price), category_id: categoryId, currency_id: "MXN", listing_type_id: "gold_special" });
  try {
    const payload = await apiGet<ListingPrice | ListingPrice[]>(`/sites/${SITE_ID}/listing_prices?${params.toString()}`);
    const rows = Array.isArray(payload) ? payload : [payload];
    const selected = rows.find((row) => row.listing_type_id === "gold_special") || rows[0];
    if (!selected || !Number.isFinite(Number(selected.sale_fee_amount))) return null;
    return {
      listingTypeId: selected.listing_type_id || "gold_special",
      listingTypeName: selected.listing_type_name || "Clásica",
      saleFeeAmount: Number(selected.sale_fee_amount),
      percentageFee: Number(selected.sale_fee_details?.percentage_fee ?? selected.sale_fee_details?.meli_percentage_fee ?? 0),
      fixedFee: Number(selected.sale_fee_details?.fixed_fee ?? 0),
    };
  } catch (error: any) {
    console.warn("[MELI RESEARCH] listing fee unavailable", { categoryId, price, message: error?.message || String(error) });
    return null;
  }
}

async function resolveTerminalProducts(detail: CatalogProductDetail, depth = 0): Promise<CatalogProductDetail[]> {
  if (depth >= 3 || !Array.isArray(detail.children_ids) || !detail.children_ids.length) return [detail];
  const children = (await Promise.all(detail.children_ids.slice(0, 10).map((id) => getCatalogProduct(id).catch(() => null)))).filter(Boolean) as CatalogProductDetail[];
  if (!children.length) return [detail];
  return (await Promise.all(children.map((child) => resolveTerminalProducts(child, depth + 1)))).flat();
}

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function percentile(values: number[], ratio: number) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.floor((sorted.length - 1) * ratio)))];
}

function removePriceOutliers(values: number[]) {
  if (values.length < 4) return values;
  const med = median(values);
  return values.filter((value) => value >= med * 0.55 && value <= med * 1.8);
}

function normalizeText(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function meaningfulTerms(value: string) {
  return normalizeText(value).split(" ").filter((term) => term.length >= 4 && !GENERIC_DISCOVERY_TERMS.has(term));
}

function calculateProductRelevance(title: string, keyword: string) {
  const titleTerms = new Set(meaningfulTerms(title));
  const queryTerms = [...new Set(meaningfulTerms(keyword))];
  const fallbackQueryTerms = [...new Set(normalizeText(keyword).split(" ").filter((term) => term.length >= 4 && !["para", "con", "del"].includes(term)))];
  const terms = queryTerms.length ? queryTerms : fallbackQueryTerms;
  const matched = terms.filter((term) => titleTerms.has(term));
  const coverage = terms.length ? matched.length / terms.length : 0;
  const score = Math.round(Math.min(100, coverage * 80 + Math.min(20, matched.length * 10)));
  return { score, matchedTerms: matched, queryTerms: terms };
}

function cleanTitle(value: string) {
  const rawWords = value.replace(/\|\s*0\s*$/i, "").replace(/[,_]+/g, " ").replace(/\s+/g, " ").trim().split(" ");
  const seen = new Map<string, number>();
  const words = rawWords.filter((word) => {
    const key = word.toLowerCase().replace(/[^a-záéíóúüñ0-9]/gi, "");
    if (key.length < 4) return true;
    const count = seen.get(key) || 0;
    seen.set(key, count + 1);
    return count < 1;
  });
  return words.join(" ").trim().slice(0, 110);
}

function isAllowedProduct(title: string, keyword: string) {
  const text = normalizeText(title);
  const blocked = ["buchanans", "whisky", "whiskey", "tequila", "vodka", "cerveza", "licor", "50ml", "750 ml alcohol"];
  if (blocked.some((term) => text.includes(normalizeText(term)))) return false;
  const words = title.match(/\S+/g) || [];
  if (words.length < 3 || title.length < 10) return false;
  const relevance = calculateProductRelevance(title, keyword);
  if (!relevance.queryTerms.length) return true;
  if (!relevance.matchedTerms.length) return false;
  if (relevance.queryTerms.length >= 3 && relevance.matchedTerms.length < 2) return false;
  return relevance.score >= 35;
}

function soldDemandScore(totalSold: number | null) {
  if (totalSold == null) return null;
  return Math.min(100, Math.round(Math.log10(Math.max(totalSold, 0) + 1) * 32));
}

export async function discoverConcreteProducts(keyword: string, meta?: { sourceType?: "MELI_TREND" | "SEASONAL_SEED"; sourceSeason?: string | null; sourceScore?: number | null }): Promise<DiscoveredProduct[]> {
  const predicted = await predictCategory(keyword).catch(() => null);
  const catalog = await searchCatalogProducts(keyword, 20, predicted?.domain_id).catch(async () => searchCatalogProducts(keyword, 20).catch(() => ({ paging: {}, results: [] as CatalogSearchResult[] })));
  const seen = new Set<string>();
  const products: DiscoveredProduct[] = [];

  for (const row of catalog.results) {
    if (!row.id || !row.name) continue;
    const title = cleanTitle(row.name);
    if (!isAllowedProduct(title, keyword)) continue;
    const key = normalizeText(title);
    if (seen.has(key)) continue;
    seen.add(key);
    const relevance = calculateProductRelevance(title, keyword);
    products.push({ productId: row.id, title, domainId: row.domain_id || null, sourceTrend: keyword, sourceType: meta?.sourceType || "MELI_TREND", sourceSeason: meta?.sourceSeason || null, sourceScore: meta?.sourceScore ?? null, relevanceScore: relevance.score });
    if (products.length >= 10) break;
  }
  return products.sort((a, b) => Number(b.relevanceScore || 0) - Number(a.relevanceScore || 0));
}

export async function analyzeDiscoveredProduct(product: DiscoveredProduct, trendRank: number, totalTrends: number) {
  const root = await getCatalogProduct(product.productId);
  const terminalDetails = (await resolveTerminalProducts(root)).filter((row) => row.id).slice(0, 18);

  const winnerRows = terminalDetails.map((row) => row.buy_box_winner).filter(Boolean) as NonNullable<CatalogProductDetail["buy_box_winner"]>[];
  const winnerPrices = winnerRows.map((row) => Number(row.price)).filter((value) => Number.isFinite(value) && value > 0);

  const pdpResponses = await Promise.all(terminalDetails.slice(0, 10).map(async (detail) => ({ productId: detail.id!, response: await getCatalogProductItems(detail.id!) })));
  const items = pdpResponses.flatMap(({ productId, response }) => (response.results || []).map((item) => ({ ...item, productId })));
  const uniqueItems = [...new Map(items.filter((item) => item.item_id).map((item) => [item.item_id!, item])).values()];
  const pdpPrices = uniqueItems.map((item) => Number(item.price)).filter((value) => Number.isFinite(value) && value > 0 && value < 1_000_000);
  const allPrices = removePriceOutliers([...winnerPrices, ...pdpPrices]);

  const estimatedSalePrice = allPrices.length ? Number(median(allPrices).toFixed(2)) : null;
  const totalCompetingListings = pdpResponses.reduce((sum, row) => sum + Number(row.response.paging?.total || row.response.results?.length || 0), 0);
  const sellerCount = new Set([...winnerRows.map((row) => row.seller_id), ...uniqueItems.map((row) => row.seller_id)].filter(Boolean)).size;
  const soldValues = terminalDetails.map((row) => Number(row.sold_quantity)).filter((value) => Number.isFinite(value) && value >= 0);
  const totalSold = soldValues.length ? soldValues.reduce((sum, value) => sum + value, 0) : null;

  const rankRatio = totalTrends > 1 ? trendRank / (totalTrends - 1) : 0;
  const trendScore = product.sourceType === "SEASONAL_SEED" ? Number(product.sourceScore || 65) : Math.round(96 - rankRatio * 42);
  const soldScore = soldDemandScore(totalSold);
  const demandScore = soldScore == null ? Math.round(trendScore * 0.72) : Math.round(trendScore * 0.55 + soldScore * 0.45);
  const competitionScore = totalCompetingListings > 0
    ? Math.min(100, Math.round(Math.log10(totalCompetingListings + 1) * 35 + Math.min(30, sellerCount * 3)))
    : 50;

  const season = evaluateMexicoSeason(`${product.sourceSeason || ""} ${product.sourceTrend} ${product.title}`);
  let confidence = 20;
  if (allPrices.length >= 8) confidence += 45;
  else if (allPrices.length >= 5) confidence += 40;
  else if (allPrices.length >= 3) confidence += 32;
  else if (allPrices.length >= 2) confidence += 22;
  else if (allPrices.length === 1) confidence += 12;
  if (totalCompetingListings >= 3) confidence += 12;
  else if (totalCompetingListings > 0) confidence += 6;
  if (sellerCount >= 2) confidence += 8;
  if (totalSold != null) confidence += 8;
  if (root.id) confidence += 5;
  confidence = Math.min(95, confidence);

  const categoryId = root.category_id || (await predictCategory(product.title).catch(() => null))?.category_id || null;
  const fee = estimatedSalePrice ? await getListingFee(estimatedSalePrice, categoryId) : null;
  const marketScore = calculateMarketScore({ demandScore, competitionScore, seasonalScore: season.score, trendScore, confidenceScore: confidence });
  const marketValidated = Boolean(estimatedSalePrice);
  const evidenceStrength = !estimatedSalePrice ? "NONE" : allPrices.length >= STRONG_MARKET_PRICE_SAMPLES && confidence >= STRONG_MARKET_CONFIDENCE ? "STRONG" : allPrices.length >= 2 ? "MEDIUM" : "LOW";
  const missingReason = estimatedSalePrice ? null : "NO_ACTIVE_MARKET_PRICE";

  const evidence = {
    evidenceVersion: 12,
    sourceTrend: product.sourceTrend,
    sourceType: product.sourceType || "MELI_TREND",
    sourceSeason: product.sourceSeason || null,
    sourceRelevanceScore: product.relevanceScore ?? null,
    trendRank: product.sourceType === "MELI_TREND" ? trendRank + 1 : null,
    catalogProductId: product.productId,
    domainId: root.domain_id || product.domainId || null,
    categoryId,
    terminalProductsSampled: terminalDetails.length,
    competingListings: totalCompetingListings,
    uniqueSellerCount: sellerCount,
    soldQuantitySampleTotal: totalSold,
    marketPriceSamples: allPrices.length,
    evidenceStrength,
    validationRules: { oneRealMlPriceEnoughToEnterRadar: true, strongEvidenceSamples: STRONG_MARKET_PRICE_SAMPLES, strongConfidence: STRONG_MARKET_CONFIDENCE },
    priceSource: allPrices.length ? "MERCADOLIBRE_CATALOG_WINNER_AND_PDP" : null,
    priceRange: allPrices.length ? { min: Math.min(...allPrices), p25: percentile(allPrices, 0.25), median: median(allPrices), p75: percentile(allPrices, 0.75), max: Math.max(...allPrices), samples: allPrices.length } : null,
    fee,
    season,
    result: estimatedSalePrice ? `MARKET_PRICE_FOUND_${evidenceStrength}_EVIDENCE` : "RESEARCH_INCOMPLETE",
    missingReason,
    dataClassification: {
      marketPrices: allPrices.length ? "REAL_DATA" : "UNAVAILABLE_DATA",
      competingListings: totalCompetingListings > 0 ? "REAL_DATA" : "UNAVAILABLE_DATA",
      soldQuantity: totalSold != null ? "REAL_DATA_PERIOD_UNSPECIFIED" : "UNAVAILABLE_DATA",
      listingFee: fee ? "REAL_DATA" : "UNAVAILABLE_DATA",
      demandScore: "INFERRED_FROM_DISCOVERY_AND_SALES_SIGNAL",
      competitionScore: totalCompetingListings > 0 ? "INFERRED_FROM_REAL_LISTINGS" : "NEUTRAL_DATA",
      seasonalScore: season.classification,
      supplierPrice: "PENDING_BRAVE_SUPPLIER_RESEARCH",
    },
  };

  await MarketSnapshot.create({ Source: "MERCADOLIBRE_CATALOG_RESEARCH", Keyword: product.title, CategoryId: root.domain_id || product.domainId || null, ActiveListings: totalCompetingListings, MinPrice: allPrices.length ? Math.min(...allPrices) : null, MedianPrice: estimatedSalePrice, MaxPrice: allPrices.length ? Math.max(...allPrices) : null, CompetitionScore: competitionScore, DemandScore: demandScore, RawSummary: evidence });

  return { product, estimatedSalePrice, demandScore, competitionScore, trendScore, seasonalScore: season.score, season, confidence, marketScore, fee, evidence, marketValidated };
}

export async function createCandidateFromDiscoveredProduct(product: DiscoveredProduct, rank: number, total: number) {
  const market = await analyzeDiscoveredProduct(product, rank, total);
  if (!market.marketValidated) {
    return { candidate: null, research: { keyword: product.title, sourceTrend: product.sourceTrend, sourceType: product.sourceType, sourceSeason: product.sourceSeason, status: "RESEARCHING", estimatedSalePrice: market.estimatedSalePrice, marketPriceSamples: market.evidence.marketPriceSamples, confidenceScore: market.confidence, marketScore: market.marketScore, result: market.evidence.result, missingReason: market.evidence.missingReason } };
  }

  const status = getCandidateStatus(market.marketScore, market.confidence, true);
  const payload = {
    Title: product.title,
    Season: market.season.name,
    EstimatedSalePrice: market.estimatedSalePrice,
    EstimatedMarketplaceFee: Number(market.fee?.saleFeeAmount || 0),
    EstimatedShippingCost: 0,
    PackagingCost: 0,
    DemandScore: market.demandScore,
    CompetitionScore: market.competitionScore,
    SeasonalScore: market.seasonalScore,
    TrendScore: market.trendScore,
    MarketScore: market.marketScore,
    ConfidenceScore: market.confidence,
    Status: status,
    Evidence: market.evidence,
  };

  const existing = await RadarCandidate.findOne({ where: { Title: product.title } });
  const candidate = existing ? await existing.update(payload) : await RadarCandidate.create(payload);
  return { candidate, research: { keyword: product.title, sourceTrend: product.sourceTrend, sourceType: product.sourceType, sourceSeason: product.sourceSeason, status, estimatedSalePrice: market.estimatedSalePrice, marketPriceSamples: market.evidence.marketPriceSamples, confidenceScore: market.confidence, marketScore: market.marketScore, result: market.evidence.result, missingReason: null } };
}

export async function createCandidateFromTrend(keyword: string, rank: number, total: number) {
  const products = await discoverConcreteProducts(keyword);
  if (!products.length) return { candidate: null, research: { keyword, sourceTrend: keyword, status: "SKIPPED", result: "NO_CONCRETE_PRODUCT_FOUND", missingReason: "NO_CONCRETE_PRODUCT_FOUND" } };
  return createCandidateFromDiscoveredProduct(products[0], rank, total);
}

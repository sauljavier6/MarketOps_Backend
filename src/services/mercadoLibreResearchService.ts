import MarketSnapshot from "../models/MarketSnapshot";
import RadarCandidate from "../models/RadarCandidate";
import { calculateMarketScore, getCandidateStatus } from "./marketRadarService";
import { getActiveAccount, getValidAccessToken } from "./mercadoLibreService";

const API_BASE = "https://api.mercadolibre.com";
const SITE_ID = "MLM";

type Trend = { keyword: string; url?: string };
type CatalogSearchResult = { id?: string; name?: string; status?: string; domain_id?: string };
type CatalogProductDetail = { id?: string; name?: string; status?: string; domain_id?: string; sold_quantity?: number; children_ids?: string[]; buy_box_winner?: { item_id?: string; seller_id?: number; price?: number; currency_id?: string; available_quantity?: number } | null };
type CatalogItem = { item_id?: string; seller_id?: number; price?: number; currency_id?: string; available_quantity?: number; condition?: string };
type CatalogItemsResponse = { paging?: { total?: number; offset?: number; limit?: number }; results?: CatalogItem[] };
type SalePrice = { price_id?: string; amount?: number; regular_amount?: number | null; currency_id?: string; reference_date?: string };

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

export async function getCatalogProduct(productId: string) {
  return authorizedGet<CatalogProductDetail>(`/products/${encodeURIComponent(productId)}`);
}

export async function getCatalogProductItems(productId: string) {
  return authorizedGet<CatalogItemsResponse>(`/products/${encodeURIComponent(productId)}/items`);
}

export async function getItemSalePrice(itemId: string) {
  return authorizedGet<SalePrice>(`/items/${encodeURIComponent(itemId)}/sale_price?context=channel_marketplace`);
}

async function resolveTerminalProducts(detail: CatalogProductDetail, depth = 0): Promise<CatalogProductDetail[]> {
  if (depth >= 3 || !Array.isArray(detail.children_ids) || !detail.children_ids.length) return [detail];
  const children = (await Promise.all(detail.children_ids.slice(0, 10).map((id) => getCatalogProduct(id).catch(() => null)))).filter(Boolean) as CatalogProductDetail[];
  if (!children.length) return [detail];
  const resolved = (await Promise.all(children.map((child) => resolveTerminalProducts(child, depth + 1)))).flat();
  return resolved.length ? resolved : [detail];
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

function cleanTitle(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function isConcreteProductTitle(title: string, keyword: string) {
  const words = title.match(/\S+/g) || [];
  if (words.length < 3 || title.length < 12 || title.length > 120) return false;
  const keywordParts = keyword.toLowerCase().split(/\s+/).filter((part) => part.length >= 4);
  if (keywordParts.length && !keywordParts.some((part) => title.toLowerCase().includes(part))) return false;
  return !/mercado libre méxico|listado de|resultados para|categoría/i.test(title);
}

function removePriceOutliers(values: number[]) {
  if (values.length < 4) return values;
  const med = median(values);
  return values.filter((value) => value >= med * 0.5 && value <= med * 2);
}

export async function discoverConcreteProducts(keyword: string) {
  const predicted = await predictCategory(keyword).catch(() => null);
  const catalog = await searchCatalogProducts(keyword, 12, predicted?.domain_id).catch(async () => searchCatalogProducts(keyword, 12).catch(() => ({ paging: {}, results: [] as CatalogSearchResult[] })));
  const titles = catalog.results.map((row) => cleanTitle(row.name || "")).filter((title) => isConcreteProductTitle(title, keyword));
  return [...new Set(titles)].slice(0, 2);
}

export async function analyzeKeyword(keyword: string, trendRank: number, totalTrends: number) {
  const predicted = await predictCategory(keyword).catch(() => null);
  const catalog = await searchCatalogProducts(keyword, 12, predicted?.domain_id).catch(async (error) => {
    if (predicted?.domain_id) return searchCatalogProducts(keyword, 12);
    throw error;
  });

  const rootDetails = (await Promise.all(catalog.results.slice(0, 8).map(async (product) => product.id ? getCatalogProduct(product.id).catch(() => null) : null))).filter(Boolean) as CatalogProductDetail[];
  const terminalDetails = (await Promise.all(rootDetails.map((detail) => resolveTerminalProducts(detail)))).flat().filter((detail) => detail.id).slice(0, 24);

  const pdpResponses = (await Promise.all(terminalDetails.slice(0, 16).map(async (detail) => {
    try {
      const response = await getCatalogProductItems(detail.id!);
      return { productId: detail.id!, response };
    } catch (error: any) {
      console.warn("[MELI RESEARCH] product items unavailable", { productId: detail.id, message: error?.message || String(error) });
      return null;
    }
  }))).filter(Boolean) as Array<{ productId: string; response: CatalogItemsResponse }>;

  const catalogItems = pdpResponses.flatMap(({ productId, response }) => (response.results || []).map((item) => ({ ...item, productId })));
  const uniqueItems = [...new Map(catalogItems.filter((item) => item.item_id).map((item) => [item.item_id!, item])).values()];
  const totalCompetingListings = pdpResponses.reduce((sum, row) => sum + Number(row.response.paging?.total || row.response.results?.length || 0), 0);

  const salePrices = (await Promise.all(uniqueItems.slice(0, 20).map(async (item) => {
    const fallbackAmount = Number(item.price);
    try {
      const price = await getItemSalePrice(item.item_id!);
      const amount = Number(price.amount);
      if (Number.isFinite(amount) && amount > 0 && price.currency_id === "MXN") {
        return { itemId: item.item_id!, productId: item.productId, sellerId: item.seller_id ?? null, amount, regularAmount: price.regular_amount ?? null, referenceDate: price.reference_date ?? null, source: "SALE_PRICE_API" };
      }
    } catch (error: any) {
      console.warn("[MELI RESEARCH] sale price unavailable", { itemId: item.item_id, message: error?.message || String(error) });
    }
    return Number.isFinite(fallbackAmount) && fallbackAmount > 0 && item.currency_id === "MXN"
      ? { itemId: item.item_id!, productId: item.productId, sellerId: item.seller_id ?? null, amount: fallbackAmount, regularAmount: null, referenceDate: null, source: "PDP_ITEMS_API" }
      : null;
  }))).filter(Boolean) as Array<{ itemId: string; productId: string; sellerId: number | null; amount: number; regularAmount: number | null; referenceDate: string | null; source: string }>;

  const officialPrices = removePriceOutliers(salePrices.map((row) => row.amount));
  const sellerIds = new Set(uniqueItems.map((row) => row.seller_id).filter(Boolean)).size;
  const catalogMatchCount = Number(catalog.paging?.total || catalog.results.length || 0);
  const rankRatio = totalTrends > 1 ? trendRank / (totalTrends - 1) : 0;
  const demandScore = Math.round(95 - (rankRatio * 40));
  const listingBreadth = Math.min(100, Math.log10(Math.max(totalCompetingListings, 1)) * 38);
  const sellerDiversity = Math.min(100, sellerIds * 8);
  const competitionScore = Math.round((listingBreadth * 0.75) + (sellerDiversity * 0.25));
  const estimatedSalePrice = officialPrices.length ? Number(median(officialPrices).toFixed(2)) : null;
  const salePriceApiCount = salePrices.filter((row) => row.source === "SALE_PRICE_API").length;
  const evidenceConfidence = officialPrices.length >= 8 ? 95 : officialPrices.length >= 5 ? 90 : officialPrices.length >= 3 ? 82 : officialPrices.length >= 2 ? 72 : officialPrices.length === 1 ? 58 : totalCompetingListings > 0 ? 40 : catalogMatchCount > 0 ? 30 : 20;
  const missingReason = estimatedSalePrice ? null : totalCompetingListings > 0 ? "PDP_LISTINGS_WITHOUT_PRICE" : terminalDetails.length ? "NO_PDP_LISTINGS" : catalogMatchCount > 0 ? "NO_TERMINAL_CATALOG_PRODUCT" : "NO_CATALOG_MATCH";

  const evidence = {
    evidenceVersion: 9,
    keyword,
    trendRank: trendRank + 1,
    trendsCount: totalTrends,
    categoryId: predicted?.category_id || null,
    domainId: predicted?.domain_id || terminalDetails[0]?.domain_id || catalog.results[0]?.domain_id || null,
    catalogMatchCount,
    catalogRootProductsSampled: rootDetails.length,
    terminalProductsSampled: terminalDetails.length,
    pdpProductsWithListings: pdpResponses.filter((row) => Number(row.response.paging?.total || row.response.results?.length || 0) > 0).length,
    competingListings: totalCompetingListings,
    uniqueItemsSampled: uniqueItems.length,
    uniqueSellerCount: sellerIds,
    salePriceSampleCount: officialPrices.length,
    salePriceApiCount,
    pdpItemPriceCount: salePrices.length - salePriceApiCount,
    salePriceEvidence: salePrices.slice(0, 12),
    priceSource: estimatedSalePrice ? (salePriceApiCount ? "MERCADOLIBRE_SALE_PRICE_API" : "MERCADOLIBRE_PDP_ITEMS_API") : null,
    priceRange: officialPrices.length ? { min: Math.min(...officialPrices), p25: percentile(officialPrices, 0.25), median: median(officialPrices), p75: percentile(officialPrices, 0.75), max: Math.max(...officialPrices), samples: officialPrices.length } : null,
    result: estimatedSalePrice ? "RESEARCHED_WITH_OFFICIAL_ML_MARKET_PRICES" : "DISCOVERED_INCOMPLETE",
    missingReason,
    dataClassification: { estimatedSalePrice: estimatedSalePrice ? "REAL_DATA" : "UNAVAILABLE_DATA", competingListings: totalCompetingListings ? "REAL_DATA" : "UNAVAILABLE_DATA", demandScore: "INFERRED_DATA", competitionScore: "INFERRED_FROM_REAL_LISTINGS", supplierPrice: "PENDING_BRAVE_SUPPLIER_RESEARCH" },
  };

  const snapshot = await MarketSnapshot.create({ Source: evidence.priceSource || "MERCADOLIBRE_CATALOG_API", Keyword: keyword, CategoryId: evidence.domainId, ActiveListings: totalCompetingListings, MinPrice: officialPrices.length ? Math.min(...officialPrices) : null, MedianPrice: estimatedSalePrice, MaxPrice: officialPrices.length ? Math.max(...officialPrices) : null, CompetitionScore: competitionScore, DemandScore: demandScore, RawSummary: evidence });
  return { snapshot, predictedCategory: predicted, estimatedSalePrice, demandScore, competitionScore, evidenceConfidence, evidence };
}

export async function createCandidateFromTrend(keyword: string, rank: number, total: number) {
  const market = await analyzeKeyword(keyword, rank, total);
  const seasonalScore = 50;
  const trendScore = Math.max(55, market.demandScore);
  const marketScore = calculateMarketScore({ demandScore: market.demandScore, competitionScore: market.competitionScore, seasonalScore, trendScore });
  const status = market.estimatedSalePrice != null && market.evidenceConfidence >= 55 ? getCandidateStatus(marketScore) : "DISCOVERED";
  const payload = { Title: keyword, Season: null, EstimatedSalePrice: market.estimatedSalePrice, EstimatedMarketplaceFee: 0, EstimatedShippingCost: 0, PackagingCost: 0, DemandScore: market.demandScore, CompetitionScore: market.competitionScore, SeasonalScore: seasonalScore, TrendScore: trendScore, MarketScore: marketScore, ConfidenceScore: market.evidenceConfidence, Status: status, Evidence: market.evidence };
  const existing = await RadarCandidate.findOne({ where: { Title: keyword } });
  const candidate = existing ? await existing.update(payload) : await RadarCandidate.create(payload);
  return { candidate, research: { keyword, status, catalogMatchCount: market.evidence.catalogMatchCount, salePriceSampleCount: market.evidence.salePriceSampleCount, priceSource: market.evidence.priceSource, estimatedSalePrice: market.estimatedSalePrice, confidenceScore: market.evidenceConfidence, result: market.evidence.result, missingReason: market.evidence.missingReason } };
}

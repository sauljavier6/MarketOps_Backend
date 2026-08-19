import { Op } from "sequelize";
import CapitalAccount from "../models/CapitalAccount";
import DiscoveryRun from "../models/DiscoveryRun";
import RadarCandidate from "../models/RadarCandidate";
import SupplierOffer from "../models/SupplierOffer";
import { calculateTiming, EVERGREEN_HYPOTHESES, getCommercialCalendar, getSeasonDiscoveryPlan, type CommercialOpportunity } from "./commercialCalendarService";
import { analyzeDiscoveredProduct, discoverConcreteProducts, getMexicoTrends } from "./mercadoLibreResearchService";
import { calculateUnitEconomics, evaluateInvestment } from "./seasonFirstDecisionService";
import { discoverSupplierLeads } from "./supplierAutoDiscoveryService";

const STRATEGY = {
  seasonalWeight: 0.70,
  evergreenWeight: 0.30,
  horizonDays: 120,
  maxSeasons: 5,
  productsPerSeason: 5,
  evergreenProducts: 10,
  sourcingCandidates: 6,
  maxUnitCostPercentOfCapital: 0.30,
  minimumReservePercent: 0.30,
  maxAllocationPerProduct: 0.25,
  minimumExpectedMargin: 18,
  minimumROI: 25,
  preparationDays: 3,
  safetyBufferDays: 7,
};

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function normalize(value: string) {
  return value.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[^a-z0-9 ]/g, " ").replace(/\s+/g, " ").trim();
}

function trendEvidence(title: string, hypothesis: string, trends: Array<{ keyword: string }>) {
  const text = normalize(`${title} ${hypothesis}`);
  const words = new Set(text.split(" ").filter((word) => word.length >= 4));
  const matches = trends.map((trend, index) => ({ keyword: trend.keyword, index, overlap: normalize(trend.keyword).split(" ").filter((word) => word.length >= 4 && words.has(word)).length })).filter((row) => row.overlap > 0).sort((a, b) => b.overlap - a.overlap || a.index - b.index);
  const best = matches[0];
  const score = best ? Math.max(50, 95 - best.index) : 45;
  return { matched: Boolean(best), matchedTrend: best?.keyword || null, trendRank: best ? best.index + 1 : null, score, classification: best ? "REAL_ML_TREND_SIGNAL" : "NO_DIRECT_TREND_MATCH" };
}

function timingPriority(stage: string) {
  if (stage === "BUY_NOW") return 95;
  if (stage === "SOURCE_NOW") return 82;
  if (stage === "RESEARCH_NOW") return 70;
  if (stage === "SELL_NOW") return 55;
  return 40;
}

async function persistCandidate(product: any, market: any, opportunity: CommercialOpportunity | null, trend: any, sourceStrategy: "SEASONAL" | "EVERGREEN") {
  const previous = await RadarCandidate.findOne({ where: { Title: product.title } });
  const previousEvidence: any = previous?.Evidence || {};
  const evidence: any = market.evidence || {};
  evidence.sourceStrategy = sourceStrategy;
  evidence.commercialOpportunity = opportunity;
  evidence.trendValidation = trend;
  evidence.stage = market.estimatedSalePrice ? "MARKET_VALIDATED" : "MARKET_RESEARCH";
  evidence.decision = "RESEARCH";
  if (previousEvidence.sellingCosts) evidence.sellingCosts = previousEvidence.sellingCosts;
  evidence.scoring = {
    SeasonScore: opportunity ? timingPriority(opportunity.stage) : 50,
    TimingScore: opportunity ? timingPriority(opportunity.stage) : 70,
    DiscoveryScore: trend.score,
    DemandScore: market.demandScore,
    MarketScore: market.marketScore,
    CompetitionScore: market.competitionScore,
    SupplierScore: null,
    MarginScore: null,
    CapitalFitScore: null,
    RiskScore: null,
    DataConfidence: market.confidence,
    InvestmentScore: null,
  };
  evidence.qualityGates = { concreteProduct: true, marketPriceVerified: Boolean(market.estimatedSalePrice), supplierVerified: false, economicsReady: false, timingReady: false, capitalFit: false, minimumMargin: false, minimumROI: false, acceptableRisk: false, minimumConfidence: market.confidence >= 40 };

  const payload = {
    Title: product.title,
    Season: opportunity?.name || null,
    EstimatedSalePrice: market.estimatedSalePrice,
    EstimatedMarketplaceFee: Number(market.fee?.saleFeeAmount || 0),
    EstimatedShippingCost: previousEvidence.sellingCosts?.marketplaceShipping ?? 0,
    PackagingCost: previousEvidence.sellingCosts?.packagingCost ?? 0,
    DemandScore: market.demandScore,
    CompetitionScore: market.competitionScore,
    SeasonalScore: opportunity ? timingPriority(opportunity.stage) : 50,
    TrendScore: trend.score,
    MarketScore: market.marketScore,
    ConfidenceScore: market.confidence,
    Status: market.estimatedSalePrice ? "MARKET_VALIDATED" : "MARKET_RESEARCH",
    Evidence: evidence,
  };

  return previous ? previous.update(payload) : RadarCandidate.create(payload);
}

async function discoverSeasonProducts(opportunity: CommercialOpportunity, trends: Array<{ keyword: string }>, researchedIds: Set<string>, results: any[]) {
  const candidates: RadarCandidate[] = [];
  let found = 0;
  for (const hypothesis of opportunity.hypotheses) {
    if (found >= STRATEGY.productsPerSeason) break;
    const products = await discoverConcreteProducts(hypothesis, { sourceType: "SEASONAL_SEED", sourceSeason: opportunity.name, sourceScore: timingPriority(opportunity.stage) }).catch(() => []);
    for (const product of products) {
      if (found >= STRATEGY.productsPerSeason) break;
      if (researchedIds.has(product.productId)) continue;
      researchedIds.add(product.productId);
      found += 1;
      try {
        const market = await analyzeDiscoveredProduct(product, 0, 1);
        const trend = trendEvidence(product.title, hypothesis, trends);
        const candidate = await persistCandidate(product, market, opportunity, trend, "SEASONAL");
        candidates.push(candidate);
        results.push({ title: product.title, hypothesis, season: opportunity.name, sourceStrategy: "SEASONAL", salePrice: market.estimatedSalePrice, confidence: market.confidence, marketScore: market.marketScore, trendValidation: trend });
      } catch (error: any) {
        results.push({ title: product.title, hypothesis, season: opportunity.name, sourceStrategy: "SEASONAL", status: "FAILED", error: error?.message || "RESEARCH_FAILED" });
      }
    }
  }
  return { candidates, found };
}

async function discoverEvergreenProducts(trends: Array<{ keyword: string }>, researchedIds: Set<string>, results: any[]) {
  const candidates: RadarCandidate[] = [];
  let found = 0;
  const evergreenQueries = [...EVERGREEN_HYPOTHESES];
  for (const trend of trends.slice(0, 8)) if (!evergreenQueries.some((q) => normalize(q) === normalize(trend.keyword))) evergreenQueries.push(trend.keyword);

  for (const hypothesis of evergreenQueries) {
    if (found >= STRATEGY.evergreenProducts) break;
    const products = await discoverConcreteProducts(hypothesis, { sourceType: "MELI_TREND", sourceSeason: null, sourceScore: 60 }).catch(() => []);
    for (const product of products) {
      if (found >= STRATEGY.evergreenProducts) break;
      if (researchedIds.has(product.productId)) continue;
      researchedIds.add(product.productId);
      found += 1;
      try {
        const market = await analyzeDiscoveredProduct(product, 0, 1);
        const trend = trendEvidence(product.title, hypothesis, trends);
        const candidate = await persistCandidate(product, market, null, trend, "EVERGREEN");
        candidates.push(candidate);
        results.push({ title: product.title, hypothesis, sourceStrategy: "EVERGREEN", salePrice: market.estimatedSalePrice, confidence: market.confidence, marketScore: market.marketScore, trendValidation: trend });
      } catch (error: any) {
        results.push({ title: product.title, hypothesis, sourceStrategy: "EVERGREEN", status: "FAILED", error: error?.message || "RESEARCH_FAILED" });
      }
    }
  }
  return { candidates, found };
}

async function enrichCandidate(candidate: RadarCandidate, availableCapital: number) {
  const evidence: any = candidate.Evidence || {};
  const opportunity = (evidence.commercialOpportunity || null) as CommercialOpportunity | null;
  const salePrice = Number(candidate.EstimatedSalePrice || 0) || null;
  if (!salePrice) return { candidateId: candidate.ID_RadarCandidate, decision: "RESEARCH", reason: "NO_ACTIVE_MARKET_PRICE" };

  const brave = await discoverSupplierLeads(candidate.Title, 6).catch(() => ({ leads: [] as any[] }));
  const plausible = brave.leads.filter((lead: any) => lead.PriceHint != null).map((lead: any) => ({ lead, price: Number(lead.PriceHint) })).filter((row: any) => Number.isFinite(row.price) && row.price > salePrice * 0.05 && row.price < salePrice * 0.82).sort((a: any, b: any) => Number(b.lead.LeadScore) - Number(a.lead.LeadScore));
  const estimatedPurchasePrice = plausible.length ? Number(median(plausible.map((row: any) => row.price)).toFixed(2)) : null;

  const verifiedOffer = await SupplierOffer.findOne({ where: { ProductQuery: candidate.Title, State: true }, order: [["updatedAt", "DESC"]] });
  const supplierVerified = Boolean(verifiedOffer);
  const supplierPrice = verifiedOffer ? Number(verifiedOffer.UnitPrice) : estimatedPurchasePrice;
  const supplierLeadTime = verifiedOffer?.DeliveryDays == null ? null : Number(verifiedOffer.DeliveryDays);
  const supplierScore = verifiedOffer ? Math.max(0, Math.min(100, Math.round(Number(verifiedOffer.ReliabilityScore || 50) * 0.7 + (supplierLeadTime == null ? 40 : Math.max(0, 100 - supplierLeadTime * 2)) * 0.3))) : plausible.length ? Math.round(plausible.slice(0, 3).reduce((sum: number, row: any) => sum + Number(row.lead.LeadScore || 0), 0) / Math.min(3, plausible.length)) : null;

  const timing = calculateTiming(opportunity, supplierLeadTime, STRATEGY.preparationDays, STRATEGY.safetyBufferDays);
  const preliminaryProfit = supplierPrice == null ? null : Number((salePrice - supplierPrice - Number(candidate.EstimatedMarketplaceFee || 0)).toFixed(2));
  const preliminaryMargin = preliminaryProfit == null ? null : Number((preliminaryProfit / salePrice * 100).toFixed(2));
  const sellingCosts = evidence.sellingCosts || null;

  const economics = calculateUnitEconomics({ salePrice, supplierPrice: verifiedOffer ? supplierPrice : null, purchaseShippingPerUnit: verifiedOffer ? Number(verifiedOffer.ShippingCost || 0) / Math.max(1, Number(verifiedOffer.MOQ || 1)) : null, otherPurchaseCostsPerUnit: verifiedOffer ? Number(verifiedOffer.ImportCost || 0) / Math.max(1, Number(verifiedOffer.MOQ || 1)) : null, mercadoLibreFee: Number(candidate.EstimatedMarketplaceFee || 0), mercadoLibreShipping: sellingCosts?.verified ? Number(sellingCosts.marketplaceShipping || 0) : null, packagingCost: sellingCosts?.verified ? Number(sellingCosts.packagingCost || 0) : null, otherSellingCosts: sellingCosts?.verified ? Number(sellingCosts.otherSellingCosts || 0) : null });
  const decision = evaluateInvestment({ opportunity, marketScore: Number(candidate.MarketScore || 0), demandScore: Number(candidate.DemandScore || 0), competitionScore: Number(candidate.CompetitionScore || 0), dataConfidence: Number(candidate.ConfidenceScore || 0), supplierScore, timingScore: timing.timingScore, timingStatus: timing.timingStatus, economics, capital: availableCapital, supplierVerified, marketPriceVerified: Boolean(salePrice), maxUnitCostPercentOfCapital: STRATEGY.maxUnitCostPercentOfCapital, minimumExpectedMargin: STRATEGY.minimumExpectedMargin, minimumROI: STRATEGY.minimumROI });

  const maxProductBudget = availableCapital * STRATEGY.maxAllocationPerProduct;
  const recommendedQuantity = economics.ready && economics.landedCost ? Math.max(0, Math.floor(maxProductBudget / economics.landedCost)) : 0;
  const recommendedInvestment = economics.ready && economics.landedCost ? Number((recommendedQuantity * economics.landedCost).toFixed(2)) : 0;

  evidence.sourcing = { provider: "BRAVE_SEARCH", leadsFound: brave.leads.length, estimatedPurchasePrice, supplierVerified, verifiedSupplier: verifiedOffer ? { name: verifiedOffer.SupplierName, unitPrice: Number(verifiedOffer.UnitPrice), moq: Number(verifiedOffer.MOQ), shippingCost: Number(verifiedOffer.ShippingCost), importCost: Number(verifiedOffer.ImportCost), deliveryDays: verifiedOffer.DeliveryDays, reliabilityScore: Number(verifiedOffer.ReliabilityScore) } : null, supplierLeads: plausible.slice(0, 5).map((row: any) => ({ name: row.lead.Name, domain: row.lead.Domain, url: row.lead.Url, leadScore: row.lead.LeadScore, priceHint: row.price })) };
  evidence.timing = timing;
  evidence.economics = { ...economics, preliminaryProfitBeforeUnknownSellingCosts: preliminaryProfit, preliminaryMarginBeforeUnknownSellingCosts: preliminaryMargin, note: economics.ready ? null : "No se inventan envío ML, empaque ni otros costos desconocidos; BUY queda bloqueado hasta completar costos verificados." };
  evidence.scoring = { ...(evidence.scoring || {}), SupplierScore: supplierScore, TimingScore: timing.timingScore, MarginScore: decision.marginScore, CapitalFitScore: decision.capitalFitScore, RiskScore: decision.riskScore, DataConfidence: Number(candidate.ConfidenceScore || 0), InvestmentScore: decision.investmentScore };
  evidence.qualityGates = decision.qualityGates;
  evidence.decision = decision.decision;
  evidence.decisionReason = decision.reason;
  evidence.recommendation = { quantity: recommendedQuantity, investment: recommendedInvestment, availableCapital, reserveTarget: Number((availableCapital * STRATEGY.minimumReservePercent).toFixed(2)) };
  evidence.stage = supplierVerified ? (economics.ready ? "DECISION" : "ECONOMICS") : "SOURCING";

  await candidate.update({ Evidence: evidence, Status: evidence.stage });
  return { candidateId: candidate.ID_RadarCandidate, title: candidate.Title, decision: decision.decision, investmentScore: decision.investmentScore, supplierVerified, estimatedPurchasePrice, preliminaryMargin, timingStatus: timing.timingStatus };
}

export async function runMercadoLibreDiscovery(categoryId?: string, _maxTrends = 20) {
  const now = new Date();
  const run = await DiscoveryRun.create({ Source: "SEASON_FIRST", Status: "RUNNING", CategoryId: categoryId || null, StartedAt: now });
  try {
    await RadarCandidate.update({ Status: "ARCHIVED" }, { where: { Evidence: { [Op.not]: null } } });
    const capitalAccount = await CapitalAccount.findOne({ order: [["ID_CapitalAccount", "ASC"]] });
    const availableCapital = capitalAccount ? Number(capitalAccount.CurrentCash || 0) : 0;
    const trends = await getMexicoTrends(categoryId);
    const calendar = getCommercialCalendar(now, STRATEGY.horizonDays);
    const seasonPlan = getSeasonDiscoveryPlan(now, { horizonDays: STRATEGY.horizonDays, maxSeasons: STRATEGY.maxSeasons, hypothesesPerSeason: 8 });
    const researchedIds = new Set<string>();
    const results: any[] = [];
    const allCandidates: RadarCandidate[] = [];
    let seasonalProducts = 0;

    for (const opportunity of seasonPlan) {
      const seasonResult = await discoverSeasonProducts(opportunity, trends, researchedIds, results);
      seasonalProducts += seasonResult.found;
      allCandidates.push(...seasonResult.candidates);
    }

    const evergreenResult = await discoverEvergreenProducts(trends, researchedIds, results);
    allCandidates.push(...evergreenResult.candidates);

    const withPrice = allCandidates.filter((candidate) => Number(candidate.EstimatedSalePrice || 0) > 0);
    const withoutPrice = allCandidates.length - withPrice.length;
    const rankingBase = [...withPrice].sort((a, b) => Number(b.MarketScore) - Number(a.MarketScore) || Number(b.ConfidenceScore) - Number(a.ConfidenceScore));
    const sourcingShortlist = rankingBase.slice(0, Math.min(STRATEGY.sourcingCandidates, rankingBase.length));
    const sourcingResults = [];
    for (const candidate of sourcingShortlist) sourcingResults.push(await enrichCandidate(candidate, availableCapital));

    const refreshed = await RadarCandidate.findAll({ where: { Status: { [Op.notIn]: ["ARCHIVED"] } } });
    const ranked = refreshed.sort((a, b) => Number((b.Evidence as any)?.scoring?.InvestmentScore || b.MarketScore || 0) - Number((a.Evidence as any)?.scoring?.InvestmentScore || a.MarketScore || 0));
    const buyCount = ranked.filter((candidate) => (candidate.Evidence as any)?.decision === "BUY").length;
    const targetSeasonal = STRATEGY.maxSeasons * STRATEGY.productsPerSeason;
    const targetTotal = targetSeasonal + STRATEGY.evergreenProducts;

    const summary = {
      strategy: { ...STRATEGY, targetSeasonalProducts: targetSeasonal, targetEvergreenProducts: STRATEGY.evergreenProducts, targetSeasonalPct: Number((targetSeasonal / targetTotal * 100).toFixed(1)), targetEvergreenPct: Number((STRATEGY.evergreenProducts / targetTotal * 100).toFixed(1)) },
      runDate: now.toISOString(),
      availableCapital,
      commercialCalendar: calendar,
      seasonPlan: seasonPlan.map((season) => ({ id: season.id, name: season.name, type: season.type, stage: season.stage, daysUntilDemand: season.daysUntilDemand, daysUntilPeak: season.daysUntilPeak, hypotheses: season.hypotheses.length })),
      trendsFound: trends.length,
      seasonalProductsFound: seasonalProducts,
      evergreenProductsFound: evergreenResult.found,
      concreteProductsFound: allCandidates.length,
      productsResearched: allCandidates.length,
      productsWithMlPrice: withPrice.length,
      withoutMlPrice: withoutPrice,
      sourcingShortlist: sourcingShortlist.length,
      buyOpportunities: buyCount,
      failed: results.filter((row) => row.status === "FAILED").length,
      topOpportunities: ranked.slice(0, 10).map((candidate, rank) => ({ rank: rank + 1, candidateId: candidate.ID_RadarCandidate, title: candidate.Title, season: candidate.Season || null, sourceStrategy: (candidate.Evidence as any)?.sourceStrategy, stage: (candidate.Evidence as any)?.stage, decision: (candidate.Evidence as any)?.decision, salePrice: Number(candidate.EstimatedSalePrice || 0), marketScore: Number(candidate.MarketScore || 0), investmentScore: Number((candidate.Evidence as any)?.scoring?.InvestmentScore || 0), confidence: Number(candidate.ConfidenceScore || 0), estimatedPurchasePrice: (candidate.Evidence as any)?.sourcing?.estimatedPurchasePrice || null, timingStatus: (candidate.Evidence as any)?.timing?.timingStatus || null })),
      results,
      sourcingResults,
    };

    await run.update({ Status: "COMPLETED", TrendsFound: trends.length, TrendsAnalyzed: seasonPlan.length + 1, CatalogMatches: allCandidates.length, WithMarketPrice: withPrice.length, CandidatesCreated: allCandidates.length, CandidatesWithoutPrice: withoutPrice, Summary: summary, FinishedAt: new Date() });
    return { run, summary };
  } catch (error: any) {
    await run.update({ Status: "FAILED", ErrorMessage: error?.message || "Season-first discovery failed", FinishedAt: new Date() });
    throw error;
  }
}

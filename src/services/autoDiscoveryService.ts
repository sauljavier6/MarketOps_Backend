import { Op } from "sequelize";
import CapitalAccount from "../models/CapitalAccount";
import DiscoveryRun from "../models/DiscoveryRun";
import RadarCandidate from "../models/RadarCandidate";
import { analyzeDiscoveredProduct, discoverConcreteProducts, getMexicoTrends } from "./mercadoLibreResearchService";
import { getMexicoSeasonDiscoverySeeds } from "./seasonEngine";
import { discoverSupplierLeads } from "./supplierAutoDiscoveryService";

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function clampScore(value: number) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

async function createTrendingCandidate(product: any, index: number, total: number) {
  const market = await analyzeDiscoveredProduct(product, index, total);

  if (!market.estimatedSalePrice) {
    return {
      candidate: null,
      research: {
        keyword: product.title,
        sourceTrend: product.sourceTrend,
        sourceType: product.sourceType,
        sourceSeason: product.sourceSeason,
        status: "NO_MARKET_PRICE",
        estimatedSalePrice: null,
        marketPriceSamples: market.evidence?.marketPriceSamples || 0,
        confidenceScore: market.confidence,
        marketScore: market.marketScore,
        missingReason: "NO_ML_MARKET_PRICE",
      },
    };
  }

  const evidence: any = market.evidence || {};
  evidence.marketValidation = {
    usableForRanking: true,
    minimumPriceSamples: 1,
    note: "Un precio oficial de Mercado Libre es suficiente para mostrar el producto. Más muestras aumentan la confianza, pero no ocultan la oportunidad.",
  };

  const payload = {
    Title: product.title,
    Season: market.season?.name || product.sourceSeason || null,
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
    Status: "TRENDING",
    Evidence: evidence,
  };

  const existing = await RadarCandidate.findOne({ where: { Title: product.title } });
  const candidate = existing ? await existing.update(payload) : await RadarCandidate.create(payload);

  return {
    candidate,
    research: {
      keyword: product.title,
      sourceTrend: product.sourceTrend,
      sourceType: product.sourceType,
      sourceSeason: product.sourceSeason,
      status: "TRENDING",
      estimatedSalePrice: market.estimatedSalePrice,
      marketPriceSamples: market.evidence?.marketPriceSamples || 0,
      confidenceScore: market.confidence,
      marketScore: market.marketScore,
      missingReason: null,
    },
  };
}

async function enrichWithSupplierResearch(candidate: RadarCandidate, availableCapital: number) {
  try {
    const result = await discoverSupplierLeads(candidate.Title, 6);
    const salePrice = Number(candidate.EstimatedSalePrice || 0);
    const plausible = result.leads
      .filter((lead) => lead.PriceHint != null)
      .map((lead) => ({ lead, price: Number(lead.PriceHint) }))
      .filter((row) => Number.isFinite(row.price) && row.price > salePrice * 0.05 && row.price < salePrice * 0.82)
      .sort((a, b) => Number(b.lead.LeadScore) - Number(a.lead.LeadScore));

    const priceHints = plausible.map((row) => row.price);
    const estimatedPurchasePrice = priceHints.length ? Number(median(priceHints).toFixed(2)) : null;
    const fee = Number(candidate.EstimatedMarketplaceFee || 0);
    const preliminaryProfitBeforeShipping = estimatedPurchasePrice == null ? null : Number((salePrice - estimatedPurchasePrice - fee).toFixed(2));
    const preliminaryMarginBeforeShipping = preliminaryProfitBeforeShipping == null || !salePrice ? null : Number((preliminaryProfitBeforeShipping / salePrice * 100).toFixed(2));
    const testCapital = Math.max(0, availableCapital * 0.25);
    const suggestedTestUnits = estimatedPurchasePrice && estimatedPurchasePrice > 0 ? Math.max(0, Math.floor(testCapital / estimatedPurchasePrice)) : 0;

    const marginScore = preliminaryMarginBeforeShipping == null ? 50 : clampScore((preliminaryMarginBeforeShipping / 40) * 100);
    const investmentScore = clampScore(Number(candidate.MarketScore || 0) * 0.7 + marginScore * 0.3);

    const evidence: any = candidate.Evidence || {};
    evidence.sourcing = {
      provider: "BRAVE_SEARCH",
      leadsFound: result.leads.length,
      plausiblePriceHints: priceHints.length,
      estimatedPurchasePrice,
      priceClassification: estimatedPurchasePrice != null ? "ESTIMATED_FROM_UNVERIFIED_SUPPLIER_LEADS" : "UNAVAILABLE_DATA",
      supplierLeads: plausible.slice(0, 5).map(({ lead, price }) => ({ name: lead.Name, domain: lead.Domain, url: lead.Url, leadScore: lead.LeadScore, priceHint: price })),
      preliminaryEconomics: {
        salePrice,
        marketplaceFee: fee || null,
        shippingCost: null,
        packagingCost: null,
        preliminaryProfitBeforeShipping,
        preliminaryMarginBeforeShipping,
        suggestedTestCapital: Number(testCapital.toFixed(2)),
        suggestedTestUnits,
        finalRecommendationReady: false,
        blockingReason: "VERIFY_SUPPLIER_PRICE_AND_LOGISTICS",
      },
      investmentScore,
      investmentScoreClassification: "PRELIMINARY_MARKET_PLUS_ESTIMATED_SUPPLIER_COST",
    };

    await candidate.update({ Evidence: evidence, MarketScore: investmentScore, Status: "SOURCING" });
    return { leadsFound: result.leads.length, estimatedPurchasePrice, preliminaryMarginBeforeShipping, investmentScore };
  } catch (error: any) {
    console.warn("[AUTO DISCOVERY] supplier enrichment failed", candidate.Title, error?.message || error);
    return { leadsFound: 0, estimatedPurchasePrice: null, preliminaryMarginBeforeShipping: null, investmentScore: Number(candidate.MarketScore || 0) };
  }
}

export async function runMercadoLibreDiscovery(categoryId?: string, maxTrends = 20) {
  const run = await DiscoveryRun.create({ Source: "MERCADOLIBRE", Status: "RUNNING", CategoryId: categoryId || null, StartedAt: new Date() });

  try {
    await RadarCandidate.update({ Status: "ARCHIVED" }, { where: { Evidence: { [Op.not]: null } } });

    const capitalAccount = await CapitalAccount.findOne({ order: [["ID_CapitalAccount", "ASC"]] });
    const availableCapital = capitalAccount ? Number(capitalAccount.CurrentCash || 0) : 0;
    const trends = await getMexicoTrends(categoryId);
    const totalDiscoveryBudget = Math.min(Math.max(maxTrends, 8), 30);
    const seasonalSeeds = getMexicoSeasonDiscoverySeeds(new Date(), Math.min(8, Math.max(4, Math.floor(totalDiscoveryBudget * 0.4))));
    const trendBudget = Math.max(4, totalDiscoveryBudget - seasonalSeeds.length);
    const selectedTrends = trends.slice(0, trendBudget);

    const discoveryInputs = [
      ...seasonalSeeds.map((seed) => ({ keyword: seed.query, sourceType: "SEASONAL_SEED" as const, sourceSeason: seed.season, sourceScore: seed.score, daysToPeak: seed.daysToPeak })),
      ...selectedTrends.map((trend) => ({ keyword: trend.keyword, sourceType: "MELI_TREND" as const, sourceSeason: null, sourceScore: null, daysToPeak: null })),
    ];

    const results: any[] = [];
    const researchedProductIds = new Set<string>();
    const candidatesWithPrice: RadarCandidate[] = [];
    let concreteProductsFound = 0;
    let researched = 0;
    let withoutPrice = 0;

    for (let index = 0; index < discoveryInputs.length; index += 1) {
      const input = discoveryInputs[index];
      if (!input.keyword) continue;

      try {
        const products = await discoverConcreteProducts(input.keyword, { sourceType: input.sourceType, sourceSeason: input.sourceSeason, sourceScore: input.sourceScore });
        concreteProductsFound += products.length;

        if (!products.length) {
          results.push({ sourceTrend: input.keyword, sourceType: input.sourceType, sourceSeason: input.sourceSeason, status: "SKIPPED", result: "NO_CONCRETE_PRODUCT_FOUND" });
          continue;
        }

        for (const product of products.slice(0, 2)) {
          if (researchedProductIds.has(product.productId)) continue;
          researchedProductIds.add(product.productId);
          researched += 1;

          try {
            const result = await createTrendingCandidate(product, index, discoveryInputs.length);
            results.push(result.research);
            if (result.candidate) candidatesWithPrice.push(result.candidate);
            else withoutPrice += 1;
          } catch (error: any) {
            console.warn("[AUTO DISCOVERY] product research failed", product.title, error?.message || error);
            results.push({ keyword: product.title, sourceTrend: input.keyword, sourceType: input.sourceType, sourceSeason: input.sourceSeason, status: "FAILED", result: "RESEARCH_FAILED", missingReason: error?.message || "UNKNOWN_ERROR" });
          }
        }
      } catch (error: any) {
        console.warn("[AUTO DISCOVERY] discovery input failed", input.keyword, error?.message || error);
        results.push({ sourceTrend: input.keyword, sourceType: input.sourceType, sourceSeason: input.sourceSeason, status: "FAILED", result: "DISCOVERY_FAILED", missingReason: error?.message || "UNKNOWN_ERROR" });
      }
    }

    candidatesWithPrice.sort((a, b) => Number(b.MarketScore) - Number(a.MarketScore) || Number(b.ConfidenceScore) - Number(a.ConfidenceScore));

    // Investiga proveedores de los productos más atractivos. Un solo precio ML basta para entrar al Radar.
    const sourcingShortlist = candidatesWithPrice.slice(0, Math.min(8, candidatesWithPrice.length));
    const sourcingResults = [];
    for (const candidate of sourcingShortlist) {
      sourcingResults.push({ candidateId: candidate.ID_RadarCandidate, title: candidate.Title, ...(await enrichWithSupplierResearch(candidate, availableCapital)) });
    }

    const rankedCandidates = [...candidatesWithPrice].sort((a, b) => Number(b.MarketScore) - Number(a.MarketScore) || Number(b.ConfidenceScore) - Number(a.ConfidenceScore));

    const summary = {
      trendsFound: trends.length,
      trendsAnalyzed: selectedTrends.length,
      trendQueriesAnalyzed: selectedTrends.length,
      seasonalQueriesAnalyzed: seasonalSeeds.length,
      seasonalQueries: seasonalSeeds,
      discoveryQueriesAnalyzed: discoveryInputs.length,
      concreteProductsFound,
      productsResearched: researched,
      productsWithMlPrice: candidatesWithPrice.length,
      validatedMarketCandidates: candidatesWithPrice.length,
      withoutMlPrice: withoutPrice,
      skippedWithoutReliableMarketPrice: withoutPrice,
      sourcingShortlist: sourcingShortlist.length,
      availableCapital,
      failed: results.filter((row) => row.status === "FAILED").length,
      topOpportunities: rankedCandidates.slice(0, 10).map((candidate, rank) => ({
        rank: rank + 1,
        candidateId: candidate.ID_RadarCandidate,
        title: candidate.Title,
        salePrice: Number(candidate.EstimatedSalePrice || 0),
        score: Number(candidate.MarketScore || 0),
        confidence: Number(candidate.ConfidenceScore || 0),
        season: candidate.Season || null,
        status: candidate.Status,
      })),
      results,
      sourcingResults,
    };

    await run.update({ Status: "COMPLETED", TrendsFound: trends.length, TrendsAnalyzed: discoveryInputs.length, CatalogMatches: researched, WithMarketPrice: candidatesWithPrice.length, CandidatesCreated: candidatesWithPrice.length, CandidatesWithoutPrice: withoutPrice, Summary: summary, FinishedAt: new Date() });
    return { run, summary };
  } catch (error: any) {
    await run.update({ Status: "FAILED", ErrorMessage: error?.message || "Discovery failed", FinishedAt: new Date() });
    throw error;
  }
}

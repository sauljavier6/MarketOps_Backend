import { Op } from "sequelize";
import CapitalAccount from "../models/CapitalAccount";
import DiscoveryRun from "../models/DiscoveryRun";
import RadarCandidate from "../models/RadarCandidate";
import { createCandidateFromDiscoveredProduct, discoverConcreteProducts, getMexicoTrends } from "./mercadoLibreResearchService";
import { discoverSupplierLeads } from "./supplierAutoDiscoveryService";

function median(values: number[]) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

async function enrichWithSupplierResearch(candidate: RadarCandidate, availableCapital: number) {
  try {
    const result = await discoverSupplierLeads(candidate.Title, 6);
    const salePrice = Number(candidate.EstimatedSalePrice || 0);
    const plausible = result.leads
      .filter((lead) => lead.PriceHint != null)
      .map((lead) => ({ lead, price: Number(lead.PriceHint) }))
      .filter((row) => Number.isFinite(row.price) && row.price > salePrice * 0.05 && row.price < salePrice * 0.78)
      .sort((a, b) => Number(b.lead.LeadScore) - Number(a.lead.LeadScore));

    const priceHints = plausible.map((row) => row.price);
    const estimatedPurchasePrice = priceHints.length >= 2 ? Number(median(priceHints).toFixed(2)) : null;
    const fee = Number(candidate.EstimatedMarketplaceFee || 0);
    const preliminaryProfitBeforeShipping = estimatedPurchasePrice == null ? null : Number((salePrice - estimatedPurchasePrice - fee).toFixed(2));
    const preliminaryMarginBeforeShipping = preliminaryProfitBeforeShipping == null || !salePrice ? null : Number((preliminaryProfitBeforeShipping / salePrice * 100).toFixed(2));
    const testCapital = Math.max(0, availableCapital * 0.25);
    const suggestedTestUnits = estimatedPurchasePrice && estimatedPurchasePrice > 0 ? Math.max(0, Math.floor(testCapital / estimatedPurchasePrice)) : 0;

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
    };

    await candidate.update({ Evidence: evidence, Status: candidate.Status === "REJECTED" ? "REJECTED" : "SOURCING" });
    return { leadsFound: result.leads.length, estimatedPurchasePrice, preliminaryMarginBeforeShipping };
  } catch (error: any) {
    console.warn("[AUTO DISCOVERY] supplier enrichment failed", candidate.Title, error?.message || error);
    return { leadsFound: 0, estimatedPurchasePrice: null, preliminaryMarginBeforeShipping: null };
  }
}

export async function runMercadoLibreDiscovery(categoryId?: string, maxTrends = 20) {
  const run = await DiscoveryRun.create({ Source: "MERCADOLIBRE", Status: "RUNNING", CategoryId: categoryId || null, StartedAt: new Date() });

  try {
    await RadarCandidate.update({ Status: "ARCHIVED" }, { where: { Evidence: { [Op.not]: null } } });

    const capitalAccount = await CapitalAccount.findOne({ order: [["ID_CapitalAccount", "ASC"]] });
    const availableCapital = capitalAccount ? Number(capitalAccount.CurrentCash || 0) : 0;
    const trends = await getMexicoTrends(categoryId);
    const selected = trends.slice(0, Math.min(Math.max(maxTrends, 1), 30));
    const results: any[] = [];
    const researchedProductIds = new Set<string>();
    const validatedCandidates: RadarCandidate[] = [];
    let concreteProductsFound = 0;
    let researched = 0;
    let skippedNoPrice = 0;

    for (let index = 0; index < selected.length; index += 1) {
      const trend = selected[index];
      if (!trend?.keyword) continue;

      try {
        const products = await discoverConcreteProducts(trend.keyword);
        concreteProductsFound += products.length;
        if (!products.length) {
          results.push({ sourceTrend: trend.keyword, status: "SKIPPED", result: "NO_CONCRETE_PRODUCT_FOUND" });
          continue;
        }

        for (const product of products.slice(0, 2)) {
          if (researchedProductIds.has(product.productId)) continue;
          researchedProductIds.add(product.productId);
          researched += 1;

          try {
            const result = await createCandidateFromDiscoveredProduct(product, index, selected.length);
            results.push(result.research);
            if (result.candidate) validatedCandidates.push(result.candidate);
            else skippedNoPrice += 1;
          } catch (error: any) {
            console.warn("[AUTO DISCOVERY] product research failed", product.title, error?.message || error);
            results.push({ keyword: product.title, sourceTrend: trend.keyword, status: "FAILED", result: "RESEARCH_FAILED", missingReason: error?.message || "UNKNOWN_ERROR" });
          }
        }
      } catch (error: any) {
        console.warn("[AUTO DISCOVERY] trend expansion failed", trend.keyword, error?.message || error);
        results.push({ sourceTrend: trend.keyword, status: "FAILED", result: "DISCOVERY_FAILED", missingReason: error?.message || "UNKNOWN_ERROR" });
      }
    }

    validatedCandidates.sort((a, b) => Number(b.MarketScore) - Number(a.MarketScore) || Number(b.ConfidenceScore) - Number(a.ConfidenceScore));
    const shortlist = validatedCandidates.filter((candidate) => Number(candidate.MarketScore) >= 60).slice(0, 5);
    const sourcingResults = [];
    for (const candidate of shortlist) sourcingResults.push({ candidateId: candidate.ID_RadarCandidate, title: candidate.Title, ...(await enrichWithSupplierResearch(candidate, availableCapital)) });

    const summary = {
      trendsFound: trends.length,
      trendsAnalyzed: selected.length,
      concreteProductsFound,
      productsResearched: researched,
      validatedMarketCandidates: validatedCandidates.length,
      skippedWithoutReliableMarketPrice: skippedNoPrice,
      sourcingShortlist: shortlist.length,
      availableCapital,
      failed: results.filter((row) => row.status === "FAILED").length,
      results,
      sourcingResults,
    };

    await run.update({ Status: "COMPLETED", TrendsFound: trends.length, TrendsAnalyzed: selected.length, CatalogMatches: researched, WithMarketPrice: validatedCandidates.length, CandidatesCreated: validatedCandidates.length, CandidatesWithoutPrice: skippedNoPrice, Summary: summary, FinishedAt: new Date() });
    return { run, summary };
  } catch (error: any) {
    await run.update({ Status: "FAILED", ErrorMessage: error?.message || "Discovery failed", FinishedAt: new Date() });
    throw error;
  }
}

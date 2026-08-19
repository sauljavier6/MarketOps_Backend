import { Op } from "sequelize";
import DiscoveryRun from "../models/DiscoveryRun";
import RadarCandidate from "../models/RadarCandidate";
import { createCandidateFromTrend, discoverConcreteProducts, getMexicoTrends } from "./mercadoLibreResearchService";

export async function runMercadoLibreDiscovery(categoryId?: string, maxTrends = 20) {
  const run = await DiscoveryRun.create({ Source: "MERCADOLIBRE", Status: "RUNNING", CategoryId: categoryId || null, StartedAt: new Date() });

  try {
    await RadarCandidate.update({ Status: "ARCHIVED" }, { where: { Evidence: { [Op.not]: null } } });

    const trends = await getMexicoTrends(categoryId);
    const selected = trends.slice(0, Math.min(Math.max(maxTrends, 1), 50));
    const results: any[] = [];
    const researchedTitles = new Set<string>();
    let catalogMatches = 0;
    let withMarketPrice = 0;
    let created = 0;
    let withoutPrice = 0;
    let concreteProductsFound = 0;

    for (let index = 0; index < selected.length; index += 1) {
      const trend = selected[index];
      if (!trend?.keyword) continue;

      try {
        const products = await discoverConcreteProducts(trend.keyword);
        concreteProductsFound += products.length;

        if (!products.length) {
          results.push({ keyword: trend.keyword, sourceTrend: trend.keyword, status: "SKIPPED", result: "NO_CONCRETE_PRODUCT_FOUND", missingReason: "GENERIC_TREND_ONLY" });
          continue;
        }

        for (const title of products.slice(0, 3)) {
          const key = title.toLowerCase().trim();
          if (!key || researchedTitles.has(key)) continue;
          researchedTitles.add(key);

          try {
            const result = await createCandidateFromTrend(title, index, selected.length);
            created += 1;
            if (Number(result.research.catalogMatchCount || 0) > 0) catalogMatches += 1;
            if (result.research.estimatedSalePrice != null) withMarketPrice += 1;
            else withoutPrice += 1;
            results.push({ ...result.research, sourceTrend: trend.keyword, concreteProduct: true });
          } catch (error: any) {
            console.warn("[AUTO DISCOVERY] product failed", title, error);
            results.push({ keyword: title, sourceTrend: trend.keyword, status: "FAILED", result: "RESEARCH_FAILED", missingReason: error?.message || "UNKNOWN_ERROR" });
          }
        }
      } catch (error: any) {
        console.warn("[AUTO DISCOVERY] trend expansion failed", trend.keyword, error);
        results.push({ keyword: trend.keyword, status: "FAILED", result: "DISCOVERY_FAILED", missingReason: error?.message || "UNKNOWN_ERROR" });
      }
    }

    const summary = { trendsFound: trends.length, trendsAnalyzed: selected.length, concreteProductsFound, uniqueProductsResearched: researchedTitles.size, catalogMatches, withoutCatalogMatch: Math.max(0, researchedTitles.size - catalogMatches), withMarketPrice, withoutMarketPrice: withoutPrice, candidatesCreated: created, genericTrendsSkipped: results.filter((row) => row.result === "NO_CONCRETE_PRODUCT_FOUND").length, failed: results.filter((row) => row.status === "FAILED").length, results };

    await run.update({ Status: "COMPLETED", TrendsFound: trends.length, TrendsAnalyzed: selected.length, CatalogMatches: catalogMatches, WithMarketPrice: withMarketPrice, CandidatesCreated: created, CandidatesWithoutPrice: withoutPrice, Summary: summary, FinishedAt: new Date() });
    return { run, summary };
  } catch (error: any) {
    await run.update({ Status: "FAILED", ErrorMessage: error?.message || "Discovery failed", FinishedAt: new Date() });
    throw error;
  }
}

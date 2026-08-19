import DiscoveryRun from "../models/DiscoveryRun";
import { createCandidateFromTrend, getMexicoTrends } from "./mercadoLibreResearchService";

export async function runMercadoLibreDiscovery(categoryId?: string, maxTrends = 20) {
  const run = await DiscoveryRun.create({
    Source: "MERCADOLIBRE",
    Status: "RUNNING",
    CategoryId: categoryId || null,
    StartedAt: new Date(),
  });

  try {
    const trends = await getMexicoTrends(categoryId);
    const selected = trends.slice(0, Math.min(Math.max(maxTrends, 1), 50));
    const results: any[] = [];
    let catalogMatches = 0;
    let withMarketPrice = 0;
    let created = 0;
    let withoutPrice = 0;

    for (let index = 0; index < selected.length; index += 1) {
      const trend = selected[index];
      if (!trend?.keyword) continue;

      try {
        const result = await createCandidateFromTrend(trend.keyword, index, selected.length);
        created += 1;
        if (Number(result.research.catalogMatchCount || 0) > 0) catalogMatches += 1;
        if (Number(result.research.winnerPriceSampleCount || 0) > 0) withMarketPrice += 1;
        else withoutPrice += 1;
        results.push(result.research);
      } catch (error: any) {
        console.warn("[AUTO DISCOVERY] keyword failed", trend.keyword, error);
        results.push({ keyword: trend.keyword, status: "FAILED", result: "RESEARCH_FAILED", missingReason: error?.message || "UNKNOWN_ERROR" });
      }
    }

    const summary = {
      trendsFound: trends.length,
      trendsAnalyzed: selected.length,
      catalogMatches,
      withoutCatalogMatch: Math.max(0, selected.length - catalogMatches),
      withMarketPrice,
      withoutMarketPrice: withoutPrice,
      candidatesCreated: created,
      failed: results.filter((row) => row.status === "FAILED").length,
      results,
    };

    await run.update({
      Status: "COMPLETED",
      TrendsFound: trends.length,
      TrendsAnalyzed: selected.length,
      CatalogMatches: catalogMatches,
      WithMarketPrice: withMarketPrice,
      CandidatesCreated: created,
      CandidatesWithoutPrice: withoutPrice,
      Summary: summary,
      FinishedAt: new Date(),
    });

    return { run, summary };
  } catch (error: any) {
    await run.update({ Status: "FAILED", ErrorMessage: error?.message || "Discovery failed", FinishedAt: new Date() });
    throw error;
  }
}

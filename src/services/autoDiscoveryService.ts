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
    let created = 0;

    for (let index = 0; index < selected.length; index += 1) {
      const trend = selected[index];
      if (!trend?.keyword) continue;

      try {
        const candidate = await createCandidateFromTrend(trend.keyword, index, selected.length);
        if (candidate) created += 1;
      } catch (error) {
        console.warn("[AUTO DISCOVERY] keyword failed", trend.keyword, error);
      }
    }

    await run.update({
      Status: "COMPLETED",
      TrendsFound: trends.length,
      CandidatesCreated: created,
      FinishedAt: new Date(),
    });

    return run;
  } catch (error: any) {
    await run.update({
      Status: "FAILED",
      ErrorMessage: error?.message || "Discovery failed",
      FinishedAt: new Date(),
    });
    throw error;
  }
}

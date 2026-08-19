export function calculateMarketScore(i: any) {
  const demand = Number(i.demandScore || 0);
  const competitionOpportunity = 100 - Number(i.competitionScore || 0);
  const seasonal = Number(i.seasonalScore ?? 50);
  const trend = Number(i.trendScore || 0);
  const confidence = Number(i.confidenceScore ?? 0);

  const base = demand * 0.35 + competitionOpportunity * 0.2 + seasonal * 0.2 + trend * 0.15 + confidence * 0.1;
  return Math.max(0, Math.min(100, Math.round(base)));
}

export function getCandidateStatus(score: number, confidence = 0, hasMarketPrice = false) {
  if (!hasMarketPrice || confidence < 70) return "RESEARCHING";
  if (score >= 78) return "SOURCING";
  if (score >= 62) return "VALIDATED";
  return "REJECTED";
}

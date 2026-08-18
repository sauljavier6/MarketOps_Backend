export type PortfolioCandidate = {
  title: string;
  score: number;
  decision: "BUY" | "TEST" | "WATCH" | "SKIP";
  landedUnitCost: number;
  estimatedProfitPerUnit: number;
  maxQuantity: number;
  supplierName?: string;
};

export function buildPortfolio(
  availableCapital: number,
  candidates: PortfolioCandidate[],
  options?: { reservePct?: number; maxProductPct?: number; maxProducts?: number }
) {
  const reservePct = options?.reservePct ?? 0.40;
  const maxProductPct = options?.maxProductPct ?? 0.25;
  const maxProducts = options?.maxProducts ?? 5;
  const investableCapital = availableCapital * (1 - reservePct);
  const maxPerProduct = availableCapital * maxProductPct;

  const ranked = candidates
    .filter((x) => ["BUY", "TEST"].includes(x.decision) && x.landedUnitCost > 0 && x.maxQuantity > 0)
    .map((x) => ({
      ...x,
      roiPct: (x.estimatedProfitPerUnit / x.landedUnitCost) * 100,
      priority: (x.score * 0.72) + (Math.min(150, Math.max(0, (x.estimatedProfitPerUnit / x.landedUnitCost) * 100)) * 0.28),
    }))
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxProducts);

  let remaining = investableCapital;
  const allocation: any[] = [];

  for (const item of ranked) {
    const productBudget = Math.min(maxPerProduct, remaining);
    let qty = Math.min(item.maxQuantity, Math.floor(productBudget / item.landedUnitCost));

    // TEST receives a smaller initial exposure.
    if (item.decision === "TEST") qty = Math.max(0, Math.floor(qty * 0.6));
    if (qty <= 0) continue;

    const investment = Number((qty * item.landedUnitCost).toFixed(2));
    const expectedProfit = Number((qty * item.estimatedProfitPerUnit).toFixed(2));
    remaining = Number((remaining - investment).toFixed(2));

    allocation.push({
      title: item.title,
      supplierName: item.supplierName,
      score: item.score,
      decision: item.decision,
      quantity: qty,
      landedUnitCost: item.landedUnitCost,
      investment,
      expectedProfit,
      roiPct: Number(item.roiPct.toFixed(2)),
    });

    if (remaining <= 0) break;
  }

  const recommendedInvestment = Number(allocation.reduce((s, x) => s + x.investment, 0).toFixed(2));
  const reserveCapital = Number((availableCapital - recommendedInvestment).toFixed(2));
  const exposurePct = availableCapital ? (recommendedInvestment / availableCapital) * 100 : 0;

  const riskLevel: "LOW" | "MEDIUM" | "HIGH" =
    exposurePct <= 45 ? "LOW" : exposurePct <= 65 ? "MEDIUM" : "HIGH";

  return {
    availableCapital,
    investableCapital: Number(investableCapital.toFixed(2)),
    recommendedInvestment,
    reserveCapital,
    exposurePct: Number(exposurePct.toFixed(2)),
    productCount: allocation.length,
    riskLevel,
    allocation,
  };
}

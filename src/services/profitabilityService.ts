export interface ProfitabilityInput {
  purchasePrice: number;
  salePrice: number;
  marketplaceFee: number;
  shippingCost: number;
  packagingCost: number;
  demandScore: number;
  competitionScore: number;
}

export function calculateProfitability(input: ProfitabilityInput) {
  const totalVariableCost = input.purchasePrice + input.marketplaceFee + input.shippingCost + input.packagingCost;
  const estimatedProfit = input.salePrice - totalVariableCost;
  const margin = input.salePrice > 0 ? (estimatedProfit / input.salePrice) * 100 : 0;
  const roi = input.purchasePrice > 0 ? (estimatedProfit / input.purchasePrice) * 100 : 0;
  const profitScore = Math.max(0, Math.min(100, margin * 2.2));
  const score = Math.round((input.demandScore * 0.4) + ((100 - input.competitionScore) * 0.2) + (profitScore * 0.4));
  const recommendation = score >= 82 ? "BUY" : score >= 68 ? "TEST" : score >= 52 ? "WATCH" : "SKIP";

  return {
    totalVariableCost: Number(totalVariableCost.toFixed(2)),
    estimatedProfit: Number(estimatedProfit.toFixed(2)),
    margin: Number(margin.toFixed(2)),
    roi: Number(roi.toFixed(2)),
    score,
    recommendation,
  };
}

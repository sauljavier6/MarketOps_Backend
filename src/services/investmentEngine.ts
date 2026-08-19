import { calculateSupplierScore } from "./supplierDiscoveryService";

export function calculateTargetPurchaseCost(i: any) {
  const salePrice = Number(i.estimatedSalePrice || 0);
  const fee = Number(i.marketplaceFeePerUnit || 0);
  const shipping = Number(i.outboundShippingPerUnit || 0);
  const packaging = Number(i.packagingCostPerUnit || 0);
  const desiredNetMarginPct = Math.max(0, Math.min(60, Number(i.desiredNetMarginPct ?? 25)));
  const desiredProfit = salePrice * desiredNetMarginPct / 100;
  return Number(Math.max(0, salePrice - fee - shipping - packaging - desiredProfit).toFixed(2));
}

export function buildInvestmentRecommendation(i: any) {
  const availableCapital = Math.max(0, Number(i.availableCapital || 0));
  const target = calculateTargetPurchaseCost(i);
  const maxCapitalShare = Math.max(0.1, Math.min(0.5, Number(i.maxCapitalShare ?? 0.25)));
  const usable = availableCapital * maxCapitalShare;
  const offers = (i.offers || [])
    .map((o: any) => ({ ...o, ...calculateSupplierScore(o, target, Math.max(Number(o.moq || 1), 1)) }))
    .filter((o: any) => Number.isFinite(o.landedUnitCost) && o.landedUnitCost > 0)
    .sort((a: any, b: any) => b.score - a.score || a.landedUnitCost - b.landedUnitCost);

  const best = offers[0];
  if (!best) {
    return { title: i.title, targetPurchaseCost: target, decision: "WATCH", score: Number(i.marketScore || 0), reason: "Falta una cotización de proveedor verificada.", offers, recommendedQuantity: 0, recommendedInvestment: 0, estimatedProfitPerUnit: 0, estimatedMarginPct: 0 };
  }

  let qty = Math.floor(usable / best.landedUnitCost);
  const moq = Math.max(1, Number(best.moq || 1));
  if (qty > 0 && qty < moq) qty = usable >= moq * best.landedUnitCost ? moq : 0;
  if (i.seasonDaysRemaining != null) {
    if (i.seasonDaysRemaining < 7) qty = Math.floor(qty * 0.25);
    else if (i.seasonDaysRemaining < 21) qty = Math.floor(qty * 0.55);
  }
  if (qty > 0 && qty < moq) qty = 0;

  const salePrice = Number(i.estimatedSalePrice || 0);
  const fee = Number(i.marketplaceFeePerUnit || 0);
  const shipping = Number(i.outboundShippingPerUnit || 0);
  const packaging = Number(i.packagingCostPerUnit || 0);
  const profit = Number((salePrice - best.landedUnitCost - fee - shipping - packaging).toFixed(2));
  const margin = salePrice > 0 ? profit / salePrice * 100 : 0;
  const total = Math.round(Number(i.marketScore || 0) * 0.45 + Number(best.score || 0) * 0.25 + Math.max(0, Math.min(100, margin * 2.5)) * 0.3);
  const decision = qty <= 0 || profit <= 0 ? "SKIP" : total >= 82 && margin >= 25 ? "BUY" : total >= 68 && margin >= 18 ? "TEST" : total >= 55 ? "WATCH" : "SKIP";
  const inv = Number((qty * best.landedUnitCost).toFixed(2));

  return {
    title: i.title,
    targetPurchaseCost: target,
    bestSupplier: { supplierName: best.supplierName, source: best.source, sourceUrl: best.sourceUrl, moq: best.moq, landedUnitCost: best.landedUnitCost, supplierScore: best.score, deliveryDays: best.deliveryDays },
    offers,
    estimatedSalePrice: salePrice,
    estimatedProfitPerUnit: profit,
    estimatedMarginPct: Number(margin.toFixed(2)),
    recommendedQuantity: qty,
    recommendedInvestment: inv,
    capitalSharePct: availableCapital > 0 ? Number((inv / availableCapital * 100).toFixed(1)) : 0,
    capitalRemainingAfterRecommendation: Number((availableCapital - inv).toFixed(2)),
    score: total,
    decision,
    reason: decision === "BUY" ? "Mercado, proveedor y margen cumplen los objetivos." : decision === "TEST" ? "Tiene potencial; conviene una compra piloto controlada." : decision === "WATCH" ? "Necesita mejor costo, logística o más evidencia." : "No cumple margen, capital o MOQ.",
  };
}

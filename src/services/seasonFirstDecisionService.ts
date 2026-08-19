import type { CommercialOpportunity } from "./commercialCalendarService";

export type EconomicsInput = {
  salePrice: number | null;
  supplierPrice: number | null;
  purchaseShippingPerUnit?: number | null;
  otherPurchaseCostsPerUnit?: number | null;
  mercadoLibreFee?: number | null;
  mercadoLibreShipping?: number | null;
  packagingCost?: number | null;
  otherSellingCosts?: number | null;
};

export function calculateUnitEconomics(input: EconomicsInput) {
  const missing = [input.salePrice == null ? "SALE_PRICE" : null, input.supplierPrice == null ? "SUPPLIER_PRICE" : null, input.mercadoLibreFee == null ? "MARKETPLACE_FEE" : null, input.mercadoLibreShipping == null ? "MARKETPLACE_SHIPPING" : null, input.packagingCost == null ? "PACKAGING_COST" : null].filter((value): value is string => Boolean(value));
  if (missing.length) return { ready: false, landedCost: null, unitProfit: null, netMarginPct: null, roiPct: null, missing };
  const purchaseShipping = input.purchaseShippingPerUnit ?? 0;
  const otherPurchase = input.otherPurchaseCostsPerUnit ?? 0;
  const otherSelling = input.otherSellingCosts ?? 0;
  const landedCost = Number((Number(input.supplierPrice) + purchaseShipping + otherPurchase).toFixed(2));
  const unitProfit = Number((Number(input.salePrice) - landedCost - Number(input.mercadoLibreFee) - Number(input.mercadoLibreShipping) - Number(input.packagingCost) - otherSelling).toFixed(2));
  const netMarginPct = Number((unitProfit / Number(input.salePrice) * 100).toFixed(2));
  const roiPct = landedCost > 0 ? Number((unitProfit / landedCost * 100).toFixed(2)) : null;
  return { ready: true, landedCost, unitProfit, netMarginPct, roiPct, missing: [] as string[] };
}

function scoreMargin(margin: number | null) {
  if (margin == null) return 0;
  if (margin >= 35) return 95;
  if (margin >= 25) return 82;
  if (margin >= 18) return 68;
  if (margin >= 10) return 45;
  return 20;
}

function scoreCapitalFit(landedCost: number | null, capital: number, maxUnitCostPct = 0.30) {
  if (!landedCost || !capital) return 0;
  const pct = landedCost / capital;
  if (pct <= maxUnitCostPct * 0.5) return 95;
  if (pct <= maxUnitCostPct) return 80;
  if (pct <= maxUnitCostPct * 1.25) return 45;
  return 10;
}

export function evaluateInvestment(input: {
  opportunity: CommercialOpportunity | null;
  marketScore: number;
  demandScore: number;
  competitionScore: number;
  dataConfidence: number;
  supplierScore: number | null;
  timingScore: number;
  timingStatus: string;
  economics: ReturnType<typeof calculateUnitEconomics>;
  capital: number;
  supplierVerified: boolean;
  marketPriceVerified?: boolean;
  maxUnitCostPercentOfCapital?: number;
  minimumExpectedMargin?: number;
  minimumROI?: number;
}) {
  const marginScore = scoreMargin(input.economics.netMarginPct);
  const capitalFitScore = scoreCapitalFit(input.economics.landedCost, input.capital, input.maxUnitCostPercentOfCapital ?? 0.30);
  const riskScore = Math.max(0, Math.min(100, Math.round(100 - ((100 - input.timingScore) * 0.55 + input.competitionScore * 0.25 + (100 - input.dataConfidence) * 0.20))));
  const supplierScore = input.supplierScore ?? 0;
  const investmentScore = Math.round(input.marketScore * 0.20 + input.demandScore * 0.15 + input.timingScore * 0.15 + supplierScore * 0.10 + marginScore * 0.15 + capitalFitScore * 0.10 + riskScore * 0.05 + input.dataConfidence * 0.10);
  const qualityGates = {
    concreteProduct: true,
    demandReason: Boolean(input.opportunity || input.demandScore >= 50),
    timingAdequate: input.timingStatus !== "TOO_LATE",
    marketPriceVerified: Boolean(input.marketPriceVerified),
    supplierVerified: input.supplierVerified,
    economicsReady: input.economics.ready,
    capitalFit: capitalFitScore >= 50,
    minimumMargin: input.economics.netMarginPct != null && input.economics.netMarginPct >= (input.minimumExpectedMargin ?? 18),
    minimumROI: input.economics.roiPct != null && input.economics.roiPct >= (input.minimumROI ?? 25),
    acceptableRisk: riskScore >= 50,
    minimumConfidence: input.dataConfidence >= 40,
  };

  let decision: "RESEARCH" | "BUY" | "TEST" | "WATCH" | "REJECT" | "TOO_LATE" = "RESEARCH";
  let reason = "Faltan datos para cerrar la decisión.";
  if (input.timingStatus === "TOO_LATE") { decision = "TOO_LATE"; reason = "El inventario no llegaría con margen suficiente antes del inicio de demanda."; }
  else if (!qualityGates.marketPriceVerified || !input.supplierVerified || !input.economics.ready) { decision = "RESEARCH"; reason = "La oportunidad sigue en investigación porque falta validar mercado, proveedor o costos completos."; }
  else if (!qualityGates.capitalFit || !qualityGates.minimumMargin || !qualityGates.minimumROI) { decision = "REJECT"; reason = "No cumple capital, margen o ROI mínimo."; }
  else if (investmentScore >= 80 && Object.values(qualityGates).every(Boolean)) { decision = "BUY"; reason = "Timing, mercado, proveedor, economía y capital cumplen los filtros de compra."; }
  else if (investmentScore >= 68) { decision = "TEST"; reason = "Tiene potencial, pero conviene una compra piloto controlada."; }
  else { decision = "WATCH"; reason = "La oportunidad existe, pero el balance riesgo/retorno todavía no es suficientemente atractivo."; }
  return { decision, reason, investmentScore, marginScore, capitalFitScore, riskScore, qualityGates };
}

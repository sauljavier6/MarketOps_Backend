import CapitalAccount from "../models/CapitalAccount";
import InvestmentRecommendation from "../models/InvestmentRecommendation";
import RadarCandidate from "../models/RadarCandidate";
import SupplierOffer from "../models/SupplierOffer";
import { calculateTiming, type CommercialOpportunity } from "./commercialCalendarService";
import { calculateUnitEconomics, evaluateInvestment } from "./seasonFirstDecisionService";

const CONFIG = {
  maxUnitCostPercentOfCapital: 0.30,
  maxAllocationPerProduct: 0.25,
  minimumExpectedMargin: 18,
  minimumROI: 25,
  preparationDays: 3,
  safetyBufferDays: 7,
};

export async function finalizeCandidateDecision(candidateId: number) {
  const candidate = await RadarCandidate.findByPk(candidateId);
  if (!candidate) throw new Error("Radar candidate not found");
  const capitalAccount = await CapitalAccount.findOne({ order: [["ID_CapitalAccount", "ASC"]] });
  if (!capitalAccount) throw new Error("Capital account is not configured");
  const capital = Number(capitalAccount.CurrentCash || 0);
  const evidence: any = candidate.Evidence || {};
  const sellingCosts = evidence.sellingCosts;
  if (!sellingCosts?.verified) throw new Error("Selling costs are not verified");
  const offer = await SupplierOffer.findOne({ where: { ProductQuery: candidate.Title, State: true }, order: [["updatedAt", "DESC"]] });
  if (!offer) throw new Error("Verified supplier offer is required");

  const salePrice = Number(candidate.EstimatedSalePrice || 0);
  if (!salePrice) throw new Error("Mercado Libre market price is required");
  const leadTime = offer.DeliveryDays == null ? null : Number(offer.DeliveryDays);
  const opportunity = (evidence.commercialOpportunity || null) as CommercialOpportunity | null;
  const timing = calculateTiming(opportunity, leadTime, CONFIG.preparationDays, CONFIG.safetyBufferDays);
  const moq = Math.max(1, Number(offer.MOQ || 1));
  const economics = calculateUnitEconomics({
    salePrice,
    supplierPrice: Number(offer.UnitPrice),
    purchaseShippingPerUnit: Number(offer.ShippingCost || 0) / moq,
    otherPurchaseCostsPerUnit: Number(offer.ImportCost || 0) / moq,
    mercadoLibreFee: Number(candidate.EstimatedMarketplaceFee || 0),
    mercadoLibreShipping: Number(sellingCosts.marketplaceShipping || 0),
    packagingCost: Number(sellingCosts.packagingCost || 0),
    otherSellingCosts: Number(sellingCosts.otherSellingCosts || 0),
  });
  const supplierScore = Math.max(0, Math.min(100, Math.round(Number(offer.ReliabilityScore || 50) * 0.7 + (leadTime == null ? 40 : Math.max(0, 100 - leadTime * 2)) * 0.3)));
  const decision = evaluateInvestment({ opportunity, marketScore: Number(candidate.MarketScore || 0), demandScore: Number(candidate.DemandScore || 0), competitionScore: Number(candidate.CompetitionScore || 0), dataConfidence: Number(candidate.ConfidenceScore || 0), supplierScore, timingScore: timing.timingScore, timingStatus: timing.timingStatus, economics, capital, supplierVerified: true, marketPriceVerified: true, maxUnitCostPercentOfCapital: CONFIG.maxUnitCostPercentOfCapital, minimumExpectedMargin: CONFIG.minimumExpectedMargin, minimumROI: CONFIG.minimumROI });

  const maxBudget = capital * CONFIG.maxAllocationPerProduct;
  let quantity = economics.ready && economics.landedCost ? Math.floor(maxBudget / economics.landedCost) : 0;
  if (quantity > 0 && quantity < moq) quantity = maxBudget >= moq * Number(economics.landedCost) ? moq : 0;
  if (decision.decision === "REJECT" || decision.decision === "TOO_LATE" || decision.decision === "RESEARCH" || decision.decision === "WATCH") quantity = 0;
  const investment = economics.ready && economics.landedCost ? Number((quantity * economics.landedCost).toFixed(2)) : 0;

  evidence.timing = timing;
  evidence.economics = economics;
  evidence.scoring = { ...(evidence.scoring || {}), SupplierScore: supplierScore, TimingScore: timing.timingScore, MarginScore: decision.marginScore, CapitalFitScore: decision.capitalFitScore, RiskScore: decision.riskScore, DataConfidence: Number(candidate.ConfidenceScore || 0), InvestmentScore: decision.investmentScore };
  evidence.qualityGates = decision.qualityGates;
  evidence.decision = decision.decision;
  evidence.decisionReason = decision.reason;
  evidence.stage = "DECISION";
  evidence.recommendation = { quantity, investment, availableCapital: capital, capitalRemaining: Number((capital - investment).toFixed(2)) };
  await candidate.update({ Evidence: evidence, Status: "DECISION", EstimatedShippingCost: Number(sellingCosts.marketplaceShipping || 0), PackagingCost: Number(sellingCosts.packagingCost || 0) });

  const saved = await InvestmentRecommendation.create({ ProductTitle: candidate.Title, SupplierName: offer.SupplierName, UnitLandedCost: Number(economics.landedCost || 0), EstimatedSalePrice: salePrice, EstimatedProfitPerUnit: Number(economics.unitProfit || 0), RecommendedQuantity: quantity, RecommendedInvestment: investment, Score: decision.investmentScore, Decision: decision.decision, Reason: decision.reason });
  return { candidateId: candidate.ID_RadarCandidate, recommendationId: saved.ID_InvestmentRecommendation, title: candidate.Title, supplierName: offer.SupplierName, salePrice, timing, economics, ...decision, recommendedQuantity: quantity, recommendedInvestment: investment, availableCapital: capital };
}

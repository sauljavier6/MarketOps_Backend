import type { Request, Response } from "express";
import { Op } from "sequelize";
import CapitalAccount from "../models/CapitalAccount";
import InvestmentRecommendation from "../models/InvestmentRecommendation";
import RadarCandidate from "../models/RadarCandidate";
import SupplierOffer from "../models/SupplierOffer";
import { finalizeCandidateDecision } from "../services/candidateDecisionService";
import { researchCandidateDeep } from "../services/candidateDeepResearchService";
import { buildInvestmentRecommendation } from "../services/investmentEngine";
import { calculateMarketScore, getCandidateStatus } from "../services/marketRadarService";

function commercialPriority(candidate: RadarCandidate) {
  const evidence: any = candidate.Evidence || {};
  const opportunity = evidence.commercialOpportunity || null;
  const stage = opportunity?.stage || null;

  if (stage === "SOURCE_NOW") return 1;
  if (stage === "BUY_NOW") return 2;
  if (stage === "RESEARCH_NOW") return 3;
  if (stage === "SELL_NOW") return 4;
  if (stage === "UPCOMING") return 5;
  if (!opportunity || evidence.sourceStrategy === "EVERGREEN") return 6;
  if (stage === "TOO_LATE") return 9;
  return 7;
}

function daysToCommercialEvent(candidate: RadarCandidate) {
  const evidence: any = candidate.Evidence || {};
  const opportunity = evidence.commercialOpportunity || null;
  if (!opportunity) return Number.MAX_SAFE_INTEGER;

  const daysUntilPeak = Number(opportunity.daysUntilPeak);
  if (Number.isFinite(daysUntilPeak)) return daysUntilPeak >= 0 ? daysUntilPeak : Number.MAX_SAFE_INTEGER - 2;
  return Number.MAX_SAFE_INTEGER - 1;
}

function evidencePriority(candidate: RadarCandidate) {
  const evidence: any = candidate.Evidence || {};
  const samples = Number(evidence.priceRange?.samples || 0);
  const confidence = Number(candidate.ConfidenceScore || evidence.scoring?.DataConfidence || 0);
  const marketScore = Number(candidate.MarketScore || 0);
  return samples * 10000 + confidence * 100 + marketScore;
}

function compareCandidates(a: RadarCandidate, b: RadarCandidate) {
  const aEvidence: any = a.Evidence || {};
  const bEvidence: any = b.Evidence || {};
  const aOpportunity = aEvidence.commercialOpportunity || null;
  const bOpportunity = bEvidence.commercialOpportunity || null;
  const aTooLate = aOpportunity?.stage === "TOO_LATE";
  const bTooLate = bOpportunity?.stage === "TOO_LATE";

  if (aTooLate !== bTooLate) return aTooLate ? 1 : -1;

  // Season-first: upcoming commercial events are shown chronologically so the
  // nearest opportunity is never hidden below a later season just because both
  // happen to be in different workflow stages.
  if (aOpportunity && bOpportunity && !aTooLate && !bTooLate) {
    const eventDifference = daysToCommercialEvent(a) - daysToCommercialEvent(b);
    if (eventDifference !== 0) return eventDifference;
  } else if (aOpportunity !== bOpportunity) {
    return aOpportunity ? -1 : 1;
  }

  const priorityDifference = commercialPriority(a) - commercialPriority(b);
  if (priorityDifference !== 0) return priorityDifference;

  const aPrice = Number(a.EstimatedSalePrice || 0) > 0 ? 1 : 0;
  const bPrice = Number(b.EstimatedSalePrice || 0) > 0 ? 1 : 0;
  if (aPrice !== bPrice) return bPrice - aPrice;

  const evidenceDifference = evidencePriority(b) - evidencePriority(a);
  if (evidenceDifference !== 0) return evidenceDifference;

  return Number((b.Evidence as any)?.scoring?.InvestmentScore || b.MarketScore || 0) - Number((a.Evidence as any)?.scoring?.InvestmentScore || a.MarketScore || 0);
}

export async function discoverCandidate(req: Request, res: Response) {
  const d = req.body;
  if (!d.title || d.estimatedSalePrice == null) return res.status(400).json({ error: "title and estimatedSalePrice are required" });
  const score = calculateMarketScore({ ...d, confidenceScore: 100 });
  const row = await RadarCandidate.create({ Title: d.title, Season: d.season || null, EstimatedSalePrice: Number(d.estimatedSalePrice), EstimatedMarketplaceFee: Number(d.estimatedMarketplaceFee || 0), EstimatedShippingCost: Number(d.estimatedShippingCost || 0), PackagingCost: Number(d.packagingCost || 0), DemandScore: Number(d.demandScore || 50), CompetitionScore: Number(d.competitionScore || 50), SeasonalScore: Number(d.seasonalScore || 50), TrendScore: Number(d.trendScore || 50), MarketScore: score, ConfidenceScore: 100, Status: getCandidateStatus(score, 100, true), Evidence: { source: "MANUAL", sourceStrategy: "MANUAL", dataClassification: "USER_PROVIDED", decision: "RESEARCH" } });
  res.status(201).json(row);
}

export async function getRadarCandidates(_req: Request, res: Response) {
  const rows = await RadarCandidate.findAll({ where: { Status: { [Op.notIn]: ["ARCHIVED", "REJECTED", "RESEARCH_REQUIRED"] } } });
  rows.sort(compareCandidates);
  res.json(rows);
}

export async function deepResearchCandidate(req: Request, res: Response) {
  try {
    const candidateId = Number(req.params.candidateId);
    if (!Number.isFinite(candidateId) || candidateId <= 0) return res.status(400).json({ error: "candidateId must be valid" });
    return res.json(await researchCandidateDeep(candidateId));
  } catch (error: any) {
    return res.status(409).json({ error: error?.message || "No se pudo completar la investigación profunda" });
  }
}

export async function setSellingCosts(req: Request, res: Response) {
  const candidateId = Number(req.params.candidateId);
  const candidate = await RadarCandidate.findByPk(candidateId);
  if (!candidate) return res.status(404).json({ error: "Radar candidate not found" });
  const d = req.body || {};
  const fields = ["marketplaceShipping", "packagingCost", "otherSellingCosts"];
  for (const field of fields) if (d[field] == null || !Number.isFinite(Number(d[field])) || Number(d[field]) < 0) return res.status(400).json({ error: `${field} must be a non-negative number` });
  const evidence: any = candidate.Evidence || {};
  evidence.sellingCosts = { verified: true, marketplaceShipping: Number(d.marketplaceShipping), packagingCost: Number(d.packagingCost), otherSellingCosts: Number(d.otherSellingCosts), verifiedAt: new Date().toISOString(), source: String(d.source || "USER_VERIFIED") };
  evidence.decision = "RESEARCH";
  evidence.decisionReason = "Costos de venta actualizados; recalcula la decisión final con el proveedor verificado.";
  await candidate.update({ Evidence: evidence, EstimatedShippingCost: Number(d.marketplaceShipping), PackagingCost: Number(d.packagingCost) });
  res.json(candidate);
}

export async function addSupplierOffer(req: Request, res: Response) {
  const d = req.body;
  if (!d.productQuery || !d.supplierName || d.unitPrice == null) return res.status(400).json({ error: "productQuery, supplierName and unitPrice are required" });
  res.status(201).json(await SupplierOffer.create({ ProductQuery: d.productQuery, SupplierName: d.supplierName, Source: d.source || null, SourceUrl: d.sourceUrl || null, UnitPrice: Number(d.unitPrice), MOQ: Number(d.moq || 1), ShippingCost: Number(d.shippingCost || 0), ImportCost: Number(d.importCost || 0), DeliveryDays: d.deliveryDays == null ? null : Number(d.deliveryDays), ReliabilityScore: Number(d.reliabilityScore || 50) }));
}

export async function getSupplierOffers(req: Request, res: Response) {
  const p = String(req.query.product || "");
  res.json(await SupplierOffer.findAll({ where: p ? { ProductQuery: p, State: true } : { State: true }, order: [["updatedAt", "DESC"]] }));
}

export async function recommendInvestment(req: Request, res: Response) {
  const d = req.body || {};
  if (d.candidateId != null) {
    try {
      return res.json(await finalizeCandidateDecision(Number(d.candidateId)));
    } catch (error: any) {
      return res.status(409).json({ error: error?.message || "Unable to finalize candidate decision" });
    }
  }
  if (!d.title || d.marketScore == null || d.estimatedSalePrice == null) return res.status(400).json({ error: "candidateId or title/marketScore/estimatedSalePrice are required" });
  const capitalAccount = await CapitalAccount.findOne({ order: [["ID_CapitalAccount", "ASC"]] });
  if (!capitalAccount) return res.status(409).json({ error: "Capital account is not configured" });
  const result = buildInvestmentRecommendation({ ...d, availableCapital: Number(capitalAccount.CurrentCash || 0) });
  const saved = await InvestmentRecommendation.create({ ProductTitle: d.title, SupplierName: result.bestSupplier?.supplierName || null, UnitLandedCost: result.bestSupplier?.landedUnitCost || 0, EstimatedSalePrice: Number(d.estimatedSalePrice), EstimatedProfitPerUnit: result.estimatedProfitPerUnit, RecommendedQuantity: result.recommendedQuantity, RecommendedInvestment: result.recommendedInvestment, Score: result.score, Decision: result.decision, Reason: result.reason });
  res.json({ ...result, recommendationId: saved.ID_InvestmentRecommendation });
}

export async function getRecommendations(_req: Request, res: Response) {
  res.json(await InvestmentRecommendation.findAll({ order: [["createdAt", "DESC"]], limit: 50 }));
}

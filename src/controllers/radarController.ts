import type { Request, Response } from "express";
import { Op } from "sequelize";
import CapitalAccount from "../models/CapitalAccount";
import InvestmentRecommendation from "../models/InvestmentRecommendation";
import RadarCandidate from "../models/RadarCandidate";
import SupplierOffer from "../models/SupplierOffer";
import { buildInvestmentRecommendation } from "../services/investmentEngine";
import { calculateMarketScore, getCandidateStatus } from "../services/marketRadarService";

export async function discoverCandidate(req: Request, res: Response) {
  const d = req.body;
  if (!d.title || d.estimatedSalePrice == null) return res.status(400).json({ error: "title and estimatedSalePrice are required" });
  const score = calculateMarketScore({ ...d, confidenceScore: 100 });
  const row = await RadarCandidate.create({ Title: d.title, Season: d.season || null, EstimatedSalePrice: Number(d.estimatedSalePrice), EstimatedMarketplaceFee: Number(d.estimatedMarketplaceFee || 0), EstimatedShippingCost: Number(d.estimatedShippingCost || 0), PackagingCost: Number(d.packagingCost || 0), DemandScore: Number(d.demandScore || 50), CompetitionScore: Number(d.competitionScore || 50), SeasonalScore: Number(d.seasonalScore || 50), TrendScore: Number(d.trendScore || 50), MarketScore: score, ConfidenceScore: 100, Status: getCandidateStatus(score, 100, true), Evidence: { source: "MANUAL", dataClassification: "USER_PROVIDED" } });
  res.status(201).json(row);
}

export async function getRadarCandidates(_req: Request, res: Response) {
  res.json(await RadarCandidate.findAll({ where: { Status: { [Op.notIn]: ["ARCHIVED", "REJECTED", "RESEARCH_REQUIRED"] } }, order: [["MarketScore", "DESC"], ["ConfidenceScore", "DESC"]], limit: 20 }));
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
  const d = req.body;
  if (!d.title || d.marketScore == null || d.estimatedSalePrice == null) return res.status(400).json({ error: "title, marketScore and estimatedSalePrice are required" });
  const capitalAccount = await CapitalAccount.findOne({ order: [["ID_CapitalAccount", "ASC"]] });
  if (!capitalAccount) return res.status(409).json({ error: "Capital account is not configured" });
  const capital = Number(capitalAccount.CurrentCash || 0);
  const result = buildInvestmentRecommendation({ ...d, availableCapital: capital });
  const saved = await InvestmentRecommendation.create({ ProductTitle: d.title, SupplierName: result.bestSupplier?.supplierName || null, UnitLandedCost: result.bestSupplier?.landedUnitCost || 0, EstimatedSalePrice: Number(d.estimatedSalePrice), EstimatedProfitPerUnit: result.estimatedProfitPerUnit, RecommendedQuantity: result.recommendedQuantity, RecommendedInvestment: result.recommendedInvestment, Score: result.score, Decision: result.decision, Reason: result.reason });
  res.json({ ...result, recommendationId: saved.ID_InvestmentRecommendation });
}

export async function getRecommendations(_req: Request, res: Response) {
  res.json(await InvestmentRecommendation.findAll({ order: [["createdAt", "DESC"]], limit: 50 }));
}

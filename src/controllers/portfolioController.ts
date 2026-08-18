import type { Request, Response } from "express";
import CapitalAccount from "../models/CapitalAccount";
import InvestmentRecommendation from "../models/InvestmentRecommendation";
import PortfolioRecommendation from "../models/PortfolioRecommendation";
import { buildPortfolio } from "../services/portfolioEngine";

export async function generatePortfolio(req: Request, res: Response) {
  let availableCapital = Number(req.body?.availableCapital || 0);
  if (!availableCapital) {
    const account = await CapitalAccount.findOne({ order: [["ID_CapitalAccount", "ASC"]] });
    availableCapital = account ? Number(account.CurrentCash) : 5000;
  }

  const latest = await InvestmentRecommendation.findAll({
    order: [["createdAt", "DESC"]],
    limit: 100,
  });

  // Keep latest recommendation per product.
  const unique = new Map<string, InvestmentRecommendation>();
  for (const row of latest) {
    if (!unique.has(row.ProductTitle)) unique.set(row.ProductTitle, row);
  }

  const candidates = [...unique.values()].map((row) => ({
    title: row.ProductTitle,
    score: Number(row.Score),
    decision: row.Decision as "BUY" | "TEST" | "WATCH" | "SKIP",
    landedUnitCost: Number(row.UnitLandedCost),
    estimatedProfitPerUnit: Number(row.EstimatedProfitPerUnit),
    maxQuantity: Math.max(Number(row.RecommendedQuantity), 0),
    supplierName: row.SupplierName || undefined,
  }));

  const result = buildPortfolio(availableCapital, candidates, {
    reservePct: Number(req.body?.reservePct ?? 0.40),
    maxProductPct: Number(req.body?.maxProductPct ?? 0.25),
    maxProducts: Number(req.body?.maxProducts ?? 5),
  });

  const persisted = await PortfolioRecommendation.create({
    AvailableCapital: result.availableCapital,
    RecommendedInvestment: result.recommendedInvestment,
    ReserveCapital: result.reserveCapital,
    ProductCount: result.productCount,
    RiskLevel: result.riskLevel,
    Allocation: result.allocation,
  });

  return res.json({ ...result, portfolioId: persisted.ID_PortfolioRecommendation });
}

export async function getPortfolios(_req: Request, res: Response) {
  const rows = await PortfolioRecommendation.findAll({ order: [["createdAt", "DESC"]], limit: 30 });
  return res.json(rows);
}

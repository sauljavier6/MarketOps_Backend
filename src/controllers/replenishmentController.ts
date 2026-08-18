import type { Request, Response } from "express";
import Product from "../models/Product";
import ReplenishmentDecision from "../models/ReplenishmentDecision";
import { buildReplenishmentDecision } from "../services/replenishmentEngine";
import { getProductSalesWindow } from "../services/salesAnalyticsService";

export async function evaluateProductReplenishment(req: Request, res: Response) {
  try {
    const productId = Number(req.params.productId);
    const windowDays = Number(req.body?.windowDays ?? 14);
    const leadTimeDays = Number(req.body?.leadTimeDays ?? 7);
    const seasonDaysRemaining = req.body?.seasonDaysRemaining == null ? undefined : Number(req.body.seasonDaysRemaining);
    const targetCoverDays = Number(req.body?.targetCoverDays ?? 21);
    const minHealthyMarginPct = Number(req.body?.minHealthyMarginPct ?? 18);

    const analytics = await getProductSalesWindow(productId, windowDays);

    const decision = buildReplenishmentDecision({
      currentStock: analytics.currentStock,
      unitsSoldWindow: analytics.unitsSold,
      windowDays,
      leadTimeDays,
      seasonDaysRemaining,
      realMarginPct: analytics.realMarginPct,
      targetCoverDays,
      minHealthyMarginPct,
    });

    const saved = await ReplenishmentDecision.create({
      ID_Product: productId,
      ProductName: analytics.productName,
      CurrentStock: analytics.currentStock,
      UnitsSoldWindow: analytics.unitsSold,
      WindowDays: windowDays,
      SeasonDaysRemaining: seasonDaysRemaining ?? null,
      AverageDailySales: decision.averageDailySales,
      DaysOfCover: decision.daysOfCover,
      RealMarginPct: analytics.realMarginPct,
      RecommendedQuantity: decision.recommendedQuantity,
      Decision: decision.decision,
      Reason: decision.reason,
    });

    return res.json({ analytics, ...decision, decisionId: saved.ID_ReplenishmentDecision });
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Unable to evaluate replenishment" });
  }
}

export async function evaluateAllReplenishment(req: Request, res: Response) {
  const products = await Product.findAll({ where: { State: true }, order: [["Description", "ASC"]] });
  const results = [];

  for (const product of products) {
    try {
      const analytics = await getProductSalesWindow(product.ID_Product, Number(req.body?.windowDays ?? 14));
      const decision = buildReplenishmentDecision({
        currentStock: analytics.currentStock,
        unitsSoldWindow: analytics.unitsSold,
        windowDays: Number(req.body?.windowDays ?? 14),
        leadTimeDays: Number(req.body?.leadTimeDays ?? 7),
        seasonDaysRemaining: req.body?.seasonDaysRemaining == null ? undefined : Number(req.body.seasonDaysRemaining),
        realMarginPct: analytics.realMarginPct,
        targetCoverDays: Number(req.body?.targetCoverDays ?? 21),
        minHealthyMarginPct: Number(req.body?.minHealthyMarginPct ?? 18),
      });

      results.push({ analytics, ...decision });
    } catch (error) {
      console.error("[REPLENISHMENT]", product.ID_Product, error);
    }
  }

  return res.json(results);
}

export async function getReplenishmentHistory(_req: Request, res: Response) {
  const rows = await ReplenishmentDecision.findAll({ order: [["createdAt", "DESC"]], limit: 100 });
  return res.json(rows);
}

import type { Request, Response } from "express";
import LearningOutcome from "../models/LearningOutcome";
import Product from "../models/Product";
import { calculateLearningOutcome } from "../services/learningOutcomeService";

export async function evaluateProductLearning(req: Request, res: Response) {
  try {
    const productId = Number(req.params.productId);
    const windowDays = Number(req.body?.windowDays ?? 60);
    const outcome = await calculateLearningOutcome(productId, windowDays);
    return res.json(outcome);
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Unable to evaluate learning outcome" });
  }
}

export async function evaluateAllLearning(req: Request, res: Response) {
  const products = await Product.findAll({ where: { State: true }, order: [["Description", "ASC"]] });
  const results = [];

  for (const product of products) {
    try {
      const outcome = await calculateLearningOutcome(product.ID_Product, Number(req.body?.windowDays ?? 60));
      results.push(outcome);
    } catch (error: any) {
      results.push({
        ID_Product: product.ID_Product,
        ProductTitle: product.Description,
        skipped: true,
        reason: error?.message || "No data",
      });
    }
  }

  return res.json(results);
}

export async function getLearningOutcomes(_req: Request, res: Response) {
  const rows = await LearningOutcome.findAll({
    order: [["updatedAt", "DESC"]],
    limit: 100,
  });
  return res.json(rows);
}

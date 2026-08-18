import type { Request, Response } from "express";
import { calculateProfitability } from "../services/profitabilityService";

const demo = [
  { id: 1, title: "Cempasúchil LED 3m", season: "Día de Muertos", purchasePrice: 82, salePrice: 349, marketplaceFee: 74, shippingCost: 44, packagingCost: 12, demandScore: 94, competitionScore: 58 },
  { id: 2, title: "Kit Telaraña XXL", season: "Halloween", purchasePrice: 65, salePrice: 299, marketplaceFee: 62, shippingCost: 42, packagingCost: 12, demandScore: 90, competitionScore: 61 },
  { id: 3, title: "Serie LED naranja/morado", season: "Halloween", purchasePrice: 128, salePrice: 349, marketplaceFee: 74, shippingCost: 48, packagingCost: 12, demandScore: 81, competitionScore: 76 },
];

export async function getOpportunities(_req: Request, res: Response) {
  res.json(demo.map(item => ({ ...item, ...calculateProfitability(item) })));
}

export async function analyzeOpportunity(req: Request, res: Response) {
  const data = req.body;
  const required = ["purchasePrice", "salePrice", "marketplaceFee", "shippingCost", "packagingCost", "demandScore", "competitionScore"];
  const missing = required.filter(key => data[key] === undefined);
  if (missing.length) return res.status(400).json({ error: `Missing: ${missing.join(", ")}` });
  return res.json({ ...data, ...calculateProfitability(data) });
}

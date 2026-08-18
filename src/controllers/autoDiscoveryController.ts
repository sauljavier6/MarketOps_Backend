import type { Request, Response } from "express";
import DiscoveryRun from "../models/DiscoveryRun";
import MarketSnapshot from "../models/MarketSnapshot";
import MarketplaceAccount from "../models/MarketplaceAccount";
import { runMercadoLibreDiscovery } from "../services/autoDiscoveryService";

export async function getDataSourceStatus(_req: Request, res: Response) {
  const account = await MarketplaceAccount.findOne({
    where: { Marketplace: "MERCADOLIBRE", State: true },
    attributes: ["ID_MarketplaceAccount", "ExternalUserId", "Nickname", "AccessTokenExpiresAt", "State"],
    order: [["updatedAt", "DESC"]],
  });

  res.json({
    sources: [
      {
        id: "meli_trends",
        name: "Mercado Libre Trends",
        provider: "Mercado Libre Official API",
        status: account ? "READY" : "AUTH_REQUIRED",
        dataType: "REAL",
        purpose: "Descubrir búsquedas/productos populares en México",
      },
      {
        id: "meli_search",
        name: "Mercado Libre Items/Search",
        provider: "Mercado Libre Official API",
        status: account ? "READY" : "AUTH_REQUIRED",
        dataType: "REAL",
        purpose: "Competencia, publicaciones activas y muestras de precios",
      },
      {
        id: "meli_category",
        name: "Domain Discovery",
        provider: "Mercado Libre Official API",
        status: "READY",
        dataType: "REAL",
        purpose: "Predecir categoría de publicación",
      },
      {
        id: "supplier_discovery",
        name: "Supplier Discovery",
        provider: "Brave Search API",
        status: process.env.BRAVE_SEARCH_API_KEY ? "READY" : "API_KEY_REQUIRED",
        dataType: process.env.BRAVE_SEARCH_API_KEY ? "REAL" : "MANUAL",
        purpose: "Encontrar proveedores candidatos y páginas de abastecimiento. Las cotizaciones deben verificarse antes de invertir.",
      },
    ],
    marketplaceAccount: account || null,
  });
}

export async function startAutoDiscovery(req: Request, res: Response) {
  try {
    const { categoryId, maxTrends = 20 } = req.body || {};
    const run = await runMercadoLibreDiscovery(categoryId || undefined, Number(maxTrends));
    res.status(201).json(run);
  } catch (error: any) {
    res.status(400).json({ error: error?.message || "Unable to run auto discovery" });
  }
}

export async function getDiscoveryRuns(_req: Request, res: Response) {
  const rows = await DiscoveryRun.findAll({ order: [["createdAt", "DESC"]], limit: 30 });
  res.json(rows);
}

export async function getMarketSnapshots(req: Request, res: Response) {
  const keyword = String(req.query.keyword || "");
  const where = keyword ? { Keyword: keyword } : undefined;
  const rows = await MarketSnapshot.findAll({ where, order: [["createdAt", "DESC"]], limit: 200 });
  res.json(rows);
}

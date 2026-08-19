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
        purpose: "Descubrir búsquedas populares y señales semanales de interés en México",
      },
      {
        id: "meli_catalog_products",
        name: "Mercado Libre Catalog Products",
        provider: "Mercado Libre Official API",
        status: account ? "READY" : "AUTH_REQUIRED",
        dataType: "REAL",
        purpose: "Convertir tendencias en productos concretos del catálogo y obtener el item_id ganador",
      },
      {
        id: "meli_sale_price",
        name: "Mercado Libre Sale Price",
        provider: "Mercado Libre Official API",
        status: account ? "READY" : "AUTH_REQUIRED",
        dataType: "REAL",
        purpose: "Obtener el precio de venta actual mostrado al comprador mediante /items/{ITEM_ID}/sale_price",
      },
      {
        id: "meli_general_keyword_search",
        name: "Mercado Libre General Keyword Search",
        provider: "Mercado Libre Official API",
        status: "UNAVAILABLE",
        dataType: "UNAVAILABLE",
        purpose: "La ruta /sites/MLM/search?q=keyword devuelve HTTP 403 para esta integración y no se usa como dependencia del Radar",
      },
      {
        id: "meli_category",
        name: "Domain Discovery",
        provider: "Mercado Libre Official API",
        status: "READY",
        dataType: "REAL",
        purpose: "Predecir categoría y dominio para enriquecer la investigación",
      },
      {
        id: "supplier_discovery",
        name: "Supplier Discovery",
        provider: "Brave Search API",
        status: process.env.BRAVE_SEARCH_API_KEY ? "READY" : "API_KEY_REQUIRED",
        dataType: process.env.BRAVE_SEARCH_API_KEY ? "REAL_LEADS" : "MANUAL",
        purpose: "Buscar proveedores, mayoristas, distribuidores y señales de precio de compra. Las cotizaciones deben verificarse antes de usarse en el cálculo final.",
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

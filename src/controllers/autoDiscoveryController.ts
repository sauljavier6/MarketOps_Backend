import type { Request, Response } from "express";
import CapitalAccount from "../models/CapitalAccount";
import DiscoveryRun from "../models/DiscoveryRun";
import MarketSnapshot from "../models/MarketSnapshot";
import MarketplaceAccount from "../models/MarketplaceAccount";
import { runMercadoLibreDiscovery } from "../services/autoDiscoveryService";
import { getCommercialCalendar } from "../services/commercialCalendarService";

export async function getDataSourceStatus(_req: Request, res: Response) {
  const account = await MarketplaceAccount.findOne({ where: { Marketplace: "MERCADOLIBRE", State: true }, attributes: ["ID_MarketplaceAccount", "ExternalUserId", "Nickname", "AccessTokenExpiresAt", "State"], order: [["updatedAt", "DESC"]] });
  res.json({ sources: [
    { id: "commercial_calendar", name: "Commercial Calendar", provider: "MarketOps", status: "READY", dataType: "CONFIGURED", purpose: "Anticipar ventanas comerciales de los próximos 30/60/90/120 días" },
    { id: "meli_trends", name: "Mercado Libre Trends", provider: "Mercado Libre Official API", status: account ? "READY" : "AUTH_REQUIRED", dataType: "REAL", purpose: "Validar señales de demanda y descubrir oportunidades adicionales" },
    { id: "meli_catalog_products", name: "Mercado Libre Catalog Research", provider: "Mercado Libre Official API", status: account ? "READY" : "AUTH_REQUIRED", dataType: "REAL", purpose: "Convertir hipótesis en productos concretos y validar precio/competencia" },
    { id: "meli_listing_prices", name: "Mercado Libre Selling Fees", provider: "Mercado Libre Official API", status: account ? "READY" : "AUTH_REQUIRED", dataType: "REAL", purpose: "Calcular comisión de venta disponible para precio y categoría" },
    { id: "meli_general_keyword_search", name: "Mercado Libre General Keyword Search", provider: "Mercado Libre Official API", status: "UNAVAILABLE", dataType: "UNAVAILABLE", purpose: "No se usa: /sites/MLM/search?q=keyword responde HTTP 403 para esta integración" },
    { id: "supplier_discovery", name: "Supplier Discovery", provider: "Brave Search API", status: process.env.BRAVE_SEARCH_API_KEY ? "READY" : "API_KEY_REQUIRED", dataType: process.env.BRAVE_SEARCH_API_KEY ? "REAL_LEADS" : "MANUAL", purpose: "Buscar proveedores, mayoristas, fabricantes y señales de costo de compra" },
  ], marketplaceAccount: account || null });
}

export async function getCommercialCalendarController(_req: Request, res: Response) {
  const capitalAccount = await CapitalAccount.findOne({ order: [["ID_CapitalAccount", "ASC"]] });
  const opportunities = getCommercialCalendar(new Date(), 120);
  res.json({ generatedAt: new Date().toISOString(), horizonDays: [30, 60, 90, 120], availableCapital: capitalAccount ? Number(capitalAccount.CurrentCash || 0) : 0, opportunities });
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
  res.json(await DiscoveryRun.findAll({ order: [["createdAt", "DESC"]], limit: 30 }));
}

export async function getMarketSnapshots(req: Request, res: Response) {
  const keyword = String(req.query.keyword || "");
  const where = keyword ? { Keyword: keyword } : undefined;
  res.json(await MarketSnapshot.findAll({ where, order: [["createdAt", "DESC"]], limit: 200 }));
}

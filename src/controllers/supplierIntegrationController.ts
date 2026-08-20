import type { Request, Response } from "express";
import { getSupplierConnector, listSupplierConnectors } from "../services/suppliers/supplierRegistry";

export async function getSupplierIntegrations(_req: Request, res: Response) {
  return res.json(listSupplierConnectors().map((connector) => connector.getStatus()));
}

export async function searchSupplierCatalog(req: Request, res: Response) {
  const provider = String(req.query.provider || "").trim().toUpperCase();
  if (!provider) return res.status(400).json({ error: "PROVIDER_REQUIRED", message: "Indica qué proveedor quieres consultar." });

  const connector = getSupplierConnector(provider);
  if (!connector) return res.status(404).json({ error: "PROVIDER_NOT_SUPPORTED", message: `El proveedor ${provider} todavía no tiene un conector registrado.` });
  if (!connector.searchProducts) return res.status(409).json({ error: "CATALOG_NOT_SUPPORTED", message: `${connector.getStatus().name} no permite consultar catálogo automáticamente.` });

  try {
    const query = String(req.query.q || req.query.search || "").trim();
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 30);
    const stockOnly = String(req.query.stock || "true") !== "false";
    return res.json(await connector.searchProducts({ query, page, limit, stockOnly }));
  } catch (error: any) {
    const message = String(error?.message || "No se pudo consultar el catálogo del proveedor");
    if (message.endsWith("_NOT_CONFIGURED")) return res.status(409).json({ error: "PROVIDER_NOT_CONFIGURED", message });
    if (message.endsWith("_QUERY_REQUIRED")) return res.status(400).json({ error: "QUERY_REQUIRED", message });
    if (message.includes("_AUTH_FAILED")) return res.status(401).json({ error: "PROVIDER_AUTH_FAILED", message });
    return res.status(502).json({ error: "PROVIDER_API_ERROR", message });
  }
}

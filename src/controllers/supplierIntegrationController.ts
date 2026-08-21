import type { Request, Response } from "express";
import Product from "../models/Product";
import Stock from "../models/Stock";
import SupplierProduct from "../models/SupplierProduct";
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

export async function importSupplierProduct(req: Request, res: Response) {
  const d = req.body || {};
  const provider = String(d.provider || "").trim().toUpperCase();
  const providerProductId = String(d.providerProductId || "").trim();
  const sku = String(d.sku || "").trim();
  const title = String(d.title || "").trim();

  if (!provider || !providerProductId || !title) return res.status(400).json({ error: "provider, providerProductId and title are required" });

  const code = `${provider}:${sku || providerProductId}`.slice(0, 120);
  let product = await Product.findOne({ where: { Code: code } });

  if (!product) {
    product = await Product.create({
      Description: title,
      Code: code,
      Brand: d.brand ? String(d.brand).trim() : null,
      Category: d.category ? String(d.category).trim() : null,
      ImageUrl: d.imageUrl ? String(d.imageUrl).trim() : null,
      TargetPurchasePrice: d.price == null || !Number.isFinite(Number(d.price)) ? null : Number(d.price),
      State: true,
    });
    await Stock.create({ ID_Product: product.ID_Product, Amount: 0, AveragePurchasePrice: 0, SalePrice: 0, Reserved: 0 });
  } else {
    await product.update({
      Description: title,
      Brand: d.brand ? String(d.brand).trim() : product.Brand,
      Category: d.category ? String(d.category).trim() : product.Category,
      ImageUrl: d.imageUrl ? String(d.imageUrl).trim() : product.ImageUrl,
      TargetPurchasePrice: d.price == null || !Number.isFinite(Number(d.price)) ? product.TargetPurchasePrice : Number(d.price),
      State: true,
    });
  }

  const [mapping] = await SupplierProduct.findOrCreate({
    where: { Provider: provider, ProviderProductId: providerProductId },
    defaults: {
      ID_Product: product.ID_Product,
      Provider: provider,
      ProviderProductId: providerProductId,
      SupplierSku: sku || null,
      CurrentSupplierPrice: d.price == null || !Number.isFinite(Number(d.price)) ? null : Number(d.price),
      CurrentSupplierStock: d.stock == null || !Number.isFinite(Number(d.stock)) ? null : Number(d.stock),
      Currency: String(d.currency || "MXN"),
      ImageUrl: d.imageUrl ? String(d.imageUrl).trim() : null,
      DropshippingEnabled: Boolean(d.dropshippingEnabled),
      LastSyncedAt: new Date(),
      State: true,
    },
  });

  await mapping.update({
    ID_Product: product.ID_Product,
    SupplierSku: sku || mapping.SupplierSku,
    CurrentSupplierPrice: d.price == null || !Number.isFinite(Number(d.price)) ? mapping.CurrentSupplierPrice : Number(d.price),
    CurrentSupplierStock: d.stock == null || !Number.isFinite(Number(d.stock)) ? mapping.CurrentSupplierStock : Number(d.stock),
    Currency: String(d.currency || mapping.Currency || "MXN"),
    ImageUrl: d.imageUrl ? String(d.imageUrl).trim() : mapping.ImageUrl,
    DropshippingEnabled: Boolean(d.dropshippingEnabled),
    LastSyncedAt: new Date(),
    State: true,
  });

  return res.status(201).json({ product: await Product.findByPk(product.ID_Product, { include: [Stock] }), supplierProduct: await mapping.reload() });
}

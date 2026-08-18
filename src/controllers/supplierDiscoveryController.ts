import type { Request, Response } from "express";
import SupplierLead from "../models/SupplierLead";
import SupplierOffer from "../models/SupplierOffer";
import { discoverSupplierLeads } from "../services/supplierAutoDiscoveryService";

export async function getSupplierDiscoveryStatus(_req: Request, res: Response) {
  res.json({
    provider: "BRAVE_SEARCH",
    configured: Boolean(process.env.BRAVE_SEARCH_API_KEY),
    mode: process.env.BRAVE_SEARCH_API_KEY ? "AUTOMATIC" : "MANUAL_FALLBACK",
    note: "Search results are supplier leads, not confirmed quotations.",
  });
}

export async function runSupplierDiscovery(req: Request, res: Response) {
  try {
    const productQuery = String(req.body?.productQuery || "").trim();
    if (!productQuery) return res.status(400).json({ error: "productQuery is required" });

    const result = await discoverSupplierLeads(productQuery);
    return res.status(201).json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error?.message || "Unable to discover suppliers" });
  }
}

export async function getSupplierLeads(req: Request, res: Response) {
  const productQuery = String(req.query.product || "").trim();
  const where = productQuery ? { ProductQuery: productQuery } : undefined;

  const rows = await SupplierLead.findAll({
    where,
    order: [["LeadScore", "DESC"], ["updatedAt", "DESC"]],
    limit: 100,
  });

  return res.json(rows);
}

export async function updateSupplierLead(req: Request, res: Response) {
  const lead = await SupplierLead.findByPk(Number(req.params.leadId));
  if (!lead) return res.status(404).json({ error: "Supplier lead not found" });

  const { verificationStatus, notes } = req.body;
  if (verificationStatus) lead.VerificationStatus = verificationStatus;
  if (notes !== undefined) lead.Notes = notes;
  await lead.save();

  return res.json(lead);
}

export async function convertLeadToOffer(req: Request, res: Response) {
  const lead = await SupplierLead.findByPk(Number(req.params.leadId));
  if (!lead) return res.status(404).json({ error: "Supplier lead not found" });

  const {
    unitPrice,
    moq = 1,
    shippingCost = 0,
    importCost = 0,
    deliveryDays,
    reliabilityScore,
  } = req.body;

  if (unitPrice == null) {
    return res.status(400).json({
      error: "unitPrice is required. A discovered lead cannot become a quote without a verified price.",
    });
  }

  const offer = await SupplierOffer.create({
    ProductQuery: lead.ProductQuery,
    SupplierName: lead.Name,
    Source: lead.Domain,
    SourceUrl: lead.Url,
    UnitPrice: Number(unitPrice),
    MOQ: Number(moq),
    ShippingCost: Number(shippingCost),
    ImportCost: Number(importCost),
    DeliveryDays: deliveryDays == null ? null : Number(deliveryDays),
    ReliabilityScore: Number(reliabilityScore ?? lead.LeadScore),
  });

  await lead.update({
    VerificationStatus: "QUOTED",
    Notes: `Converted to SupplierOffer #${offer.ID_SupplierOffer}`,
  });

  return res.status(201).json(offer);
}

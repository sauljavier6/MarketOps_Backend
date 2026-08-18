import type { Request, Response } from "express";
import MarketplaceAccount from "../models/MarketplaceAccount";
import MarketplaceListing from "../models/MarketplaceListing";
import { createOAuthState, validateOAuthState } from "../services/oauthStateService";
import {
  buildAuthorizationUrl,
  createListing,
  exchangeAuthorizationCode,
  getActiveAccount,
  hydrateUserProfile,
  pauseListing,
  syncOrderByResource,
  updateListingStock,
} from "../services/mercadoLibreService";

export async function getMercadoLibreStatus(_req: Request, res: Response) {
  const account = await MarketplaceAccount.findOne({
    where: { Marketplace: "MERCADOLIBRE", State: true },
    order: [["updatedAt", "DESC"]],
    attributes: { exclude: ["AccessTokenEncrypted", "RefreshTokenEncrypted"] },
  });

  res.json({ connected: Boolean(account), account });
}

export async function getMercadoLibreAuthUrl(_req: Request, res: Response) {
  const state = createOAuthState();
  res.json({ url: buildAuthorizationUrl(state) });
}

export async function mercadoLibreCallback(req: Request, res: Response) {
  const code = String(req.query.code || "");
  const state = String(req.query.state || "");

  if (!code || !state || !validateOAuthState(state)) {
    return res.status(400).json({ error: "Invalid OAuth callback" });
  }

  try {
    const account = await exchangeAuthorizationCode(code);
    return res.redirect(`${process.env.FRONTEND_URL || "http://localhost:5173"}/settings?meli=connected&user=${encodeURIComponent(String(account.Nickname || account.ExternalUserId))}`);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "Unable to connect Mercado Libre" });
  }
}

export async function refreshMercadoLibreProfile(_req: Request, res: Response) {
  try {
    const account = await getActiveAccount();
    const profile = await hydrateUserProfile(account);
    return res.json(profile);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
}

export async function getListings(_req: Request, res: Response) {
  const rows = await MarketplaceListing.findAll({ order: [["updatedAt", "DESC"]] });
  res.json(rows);
}

export async function publishListing(req: Request, res: Response) {
  try {
    const { productId, listing } = req.body;
    if (!productId || !listing) return res.status(400).json({ error: "productId and listing are required" });
    const created = await createListing(Number(productId), listing);
    return res.status(201).json(created);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
}

export async function setListingStock(req: Request, res: Response) {
  try {
    const listing = await updateListingStock(Number(req.params.listingId), Number(req.body.quantity));
    return res.json(listing);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
}

export async function pauseListingController(req: Request, res: Response) {
  try {
    const listing = await pauseListing(Number(req.params.listingId));
    return res.json(listing);
  } catch (error: any) {
    return res.status(400).json({ error: error.message });
  }
}

export async function mercadoLibreWebhook(req: Request, res: Response) {
  // Ack quickly. Processing happens asynchronously in this MVP.
  res.sendStatus(200);

  const { topic, resource } = req.body || {};
  if (!topic || !resource) return;

  try {
    if (topic === "orders_v2") {
      await syncOrderByResource(String(resource));
    }
    // `items` can be handled next to reconcile external changes with local listings.
  } catch (error) {
    console.error("[MELI WEBHOOK]", topic, resource, error);
  }
}

import MarketplaceAccount from "../models/MarketplaceAccount";
import MarketplaceListing from "../models/MarketplaceListing";
import Sale from "../models/Sale";
import SaleItem from "../models/SaleItem";
import Stock from "../models/Stock";
import { decryptSecret, encryptSecret } from "./tokenCryptoService";

const API_BASE = "https://api.mercadolibre.com";
const AUTH_BASE = "https://auth.mercadolibre.com.mx/authorization";

type TokenResponse = {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope?: string;
  user_id: number | string;
  refresh_token: string;
};

function requiredEnv(name: string) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not configured`);
  return value;
}

export function buildAuthorizationUrl(state: string) {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: requiredEnv("MELI_CLIENT_ID"),
    redirect_uri: requiredEnv("MELI_REDIRECT_URI"),
    state,
  });
  return `${AUTH_BASE}?${params.toString()}`;
}

async function tokenRequest(params: URLSearchParams): Promise<TokenResponse> {
  const response = await fetch(`${API_BASE}/oauth/token`, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: params,
  });

  const body = await response.json() as any;
  if (!response.ok) throw new Error(body?.error_description || body?.message || `Mercado Libre OAuth error ${response.status}`);
  return body as TokenResponse;
}

export async function exchangeAuthorizationCode(code: string) {
  const token = await tokenRequest(new URLSearchParams({
    grant_type: "authorization_code",
    client_id: requiredEnv("MELI_CLIENT_ID"),
    client_secret: requiredEnv("MELI_CLIENT_SECRET"),
    code,
    redirect_uri: requiredEnv("MELI_REDIRECT_URI"),
  }));

  const account = await saveTokenResponse(token);
  await hydrateUserProfile(account);
  return account.reload();
}

async function saveTokenResponse(token: TokenResponse, account?: MarketplaceAccount) {
  const expiresAt = new Date(Date.now() + (Number(token.expires_in) * 1000));
  const payload = {
    Marketplace: "MERCADOLIBRE" as const,
    ExternalUserId: String(token.user_id),
    AccessTokenEncrypted: encryptSecret(token.access_token),
    RefreshTokenEncrypted: encryptSecret(token.refresh_token),
    AccessTokenExpiresAt: expiresAt,
    Scope: token.scope || null,
    State: true,
  };

  if (account) {
    await account.update(payload);
    return account;
  }

  const [saved] = await MarketplaceAccount.upsert(payload, {
    conflictFields: ["ExternalUserId"],
    returning: true,
  });
  return saved;
}

async function refreshAccount(account: MarketplaceAccount) {
  const token = await tokenRequest(new URLSearchParams({
    grant_type: "refresh_token",
    client_id: requiredEnv("MELI_CLIENT_ID"),
    client_secret: requiredEnv("MELI_CLIENT_SECRET"),
    refresh_token: decryptSecret(account.RefreshTokenEncrypted),
  }));

  // Mercado Libre returns a NEW single-use refresh token; persist it immediately.
  return saveTokenResponse(token, account);
}

export async function getValidAccessToken(account: MarketplaceAccount) {
  const refreshThreshold = Date.now() + (2 * 60 * 1000);
  if (account.AccessTokenExpiresAt.getTime() <= refreshThreshold) {
    account = await refreshAccount(account);
  }
  return decryptSecret(account.AccessTokenEncrypted);
}

export async function getActiveAccount() {
  const account = await MarketplaceAccount.findOne({
    where: { Marketplace: "MERCADOLIBRE", State: true },
    order: [["updatedAt", "DESC"]],
  });
  if (!account) throw new Error("Mercado Libre is not connected");
  return account;
}

async function meliRequest<T>(path: string, init: RequestInit = {}, account?: MarketplaceAccount): Promise<T> {
  const target = account || await getActiveAccount();
  let token = await getValidAccessToken(target);

  const request = () => fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      accept: "application/json",
      "content-type": "application/json",
      ...(init.headers || {}),
      Authorization: `Bearer ${token}`,
    },
  });

  let response = await request();

  // If the access token was invalidated early, try one refresh once.
  if (response.status === 401) {
    const refreshed = await refreshAccount(target);
    token = decryptSecret(refreshed.AccessTokenEncrypted);
    response = await request();
  }

  const body = await response.json().catch(() => ({})) as any;
  if (!response.ok) {
    throw new Error(body?.message || body?.error || `Mercado Libre API error ${response.status}`);
  }
  return body as T;
}

export async function hydrateUserProfile(account: MarketplaceAccount) {
  const profile = await meliRequest<any>("/users/me", {}, account);
  await account.update({ Nickname: profile.nickname || null, ExternalUserId: String(profile.id || account.ExternalUserId) });
  return profile;
}

export async function createListing(productId: number, payload: Record<string, unknown>) {
  const listing = await meliRequest<any>("/items", {
    method: "POST",
    body: JSON.stringify(payload),
  });

  return MarketplaceListing.create({
    ID_Product: productId,
    Marketplace: "MERCADOLIBRE",
    ExternalId: listing.id,
    Status: (["ACTIVE", "PAUSED", "CLOSED"].includes(String(listing.status || "").toUpperCase()) ? String(listing.status).toUpperCase() : "ACTIVE") as "ACTIVE" | "PAUSED" | "CLOSED",
    Price: Number(listing.price || payload.price || 0),
    AvailableQuantity: Number(listing.available_quantity || payload.available_quantity || 0),
    Permalink: listing.permalink || null,
  });
}

export async function updateListingStock(listingId: number, quantity: number) {
  const listing = await MarketplaceListing.findByPk(listingId);
  if (!listing?.ExternalId) throw new Error("Listing not found or not published");

  const result = await meliRequest<any>(`/items/${listing.ExternalId}`, {
    method: "PUT",
    body: JSON.stringify({ available_quantity: Math.max(0, Number(quantity)) }),
  });

  await listing.update({
    AvailableQuantity: Number(result.available_quantity ?? quantity),
    Status: (["ACTIVE", "PAUSED", "CLOSED"].includes(String(result.status || listing.Status).toUpperCase()) ? String(result.status || listing.Status).toUpperCase() : listing.Status) as "ACTIVE" | "PAUSED" | "CLOSED",
  });

  return listing;
}

export async function pauseListing(listingId: number) {
  return updateListingStock(listingId, 0);
}

export async function fetchResource(resource: string) {
  const path = resource.startsWith("/") ? resource : `/${resource}`;
  return meliRequest<any>(path);
}

export async function syncOrderByResource(resource: string) {
  const order = await fetchResource(resource);
  if (!order?.id) return null;

  const externalOrderId = String(order.id);
  let sale = await Sale.findOne({ where: { ExternalOrderId: externalOrderId, Channel: "MERCADOLIBRE" } });

  const fees = Array.isArray(order.order_items)
    ? order.order_items.reduce((sum: number, row: any) => sum + Number(row.sale_fee || 0), 0)
    : 0;

  const grossAmount = Number(order.total_amount || 0);

  const payload = {
    Channel: "MERCADOLIBRE" as const,
    ExternalOrderId: externalOrderId,
    Status: String(order.status || "unknown").toUpperCase(),
    GrossAmount: grossAmount,
    MarketplaceFees: fees,
    ShippingCost: 0,
    NetAmount: grossAmount - fees,
  };

  if (sale) await sale.update(payload);
  else sale = await Sale.create(payload);

  for (const row of order.order_items || []) {
    const itemId = String(row.item?.id || "");
    if (!itemId) continue;

    const listing = await MarketplaceListing.findOne({ where: { ExternalId: itemId } });
    if (!listing) continue;

    const existing = await SaleItem.findOne({
      where: { ID_Sale: sale.ID_Sale, ID_Product: listing.ID_Product },
    });

    const stock = await Stock.findByPk(listing.ID_Product);
    const unitCost = Number(stock?.AveragePurchasePrice || 0);

    const itemPayload = {
      ID_Sale: sale.ID_Sale,
      ID_Product: listing.ID_Product,
      Quantity: Number(row.quantity || 1),
      UnitPrice: Number(row.unit_price || 0),
      UnitCost: unitCost,
    };

    if (existing) await existing.update(itemPayload);
    else await SaleItem.create(itemPayload);
  }

  return sale;
}

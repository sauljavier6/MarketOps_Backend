type SyscomTokenResponse = { token_type: string; expires_in: number; access_token: string };

type SyscomProductSearchResponse = {
  productos?: any[];
  products?: any[];
  pagina?: number;
  paginas?: number;
  total?: number;
  cantidad?: number;
  [key: string]: any;
};

const BASE_URL = "https://developers.syscom.mx/api/v1";
let tokenCache: { token: string; expiresAt: number } | null = null;

function getCredentials() {
  const clientId = String(process.env.SYSCOM_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.SYSCOM_CLIENT_SECRET || "").trim();
  return { clientId, clientSecret, configured: Boolean(clientId && clientSecret) };
}

async function getAccessToken() {
  const { clientId, clientSecret, configured } = getCredentials();
  if (!configured) throw new Error("SYSCOM_NOT_CONFIGURED");

  if (tokenCache && tokenCache.expiresAt > Date.now() + 60_000) return tokenCache.token;

  const body = new URLSearchParams({ grant_type: "client_credentials", client_id: clientId, client_secret: clientSecret });
  const response = await fetch(`${BASE_URL}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const data = await response.json().catch(() => ({})) as Partial<SyscomTokenResponse> & Record<string, any>;
  if (!response.ok || !data.access_token) throw new Error(`SYSCOM_AUTH_FAILED:${response.status}:${data.message || data.error || "unknown"}`);

  tokenCache = { token: data.access_token, expiresAt: Date.now() + Math.max(60, Number(data.expires_in || 3600)) * 1000 };
  return tokenCache.token;
}

async function authorizedGet(path: string) {
  const token = await getAccessToken();
  const response = await fetch(`${BASE_URL}${path}`, { headers: { Authorization: `Bearer ${token}`, Accept: "application/json" } });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(`SYSCOM_API_FAILED:${response.status}:${(data as any)?.message || (data as any)?.error || "unknown"}`);
  return data;
}

function normalizeProduct(product: any) {
  const price = product?.precio ?? product?.price ?? product?.precios?.precio ?? product?.precio_lista ?? null;
  const stock = product?.existencia?.total ?? product?.existencia ?? product?.stock ?? product?.disponible ?? null;
  const image = product?.img_portada ?? product?.imagen ?? product?.image ?? product?.imagenes?.[0] ?? null;
  return {
    provider: "SYSCOM",
    providerProductId: String(product?.producto_id ?? product?.id ?? product?.productoId ?? ""),
    sku: String(product?.modelo ?? product?.sku ?? product?.cod_art ?? ""),
    title: String(product?.titulo ?? product?.titulo_pro ?? product?.nombre ?? product?.descripcion ?? "Producto SYSCOM"),
    brand: product?.marca?.nombre ?? product?.marca ?? null,
    category: product?.categoria?.nombre ?? product?.categoria ?? null,
    price: price == null ? null : Number(price),
    currency: product?.moneda ?? "MXN",
    stock: stock == null || typeof stock === "object" ? null : Number(stock),
    imageUrl: typeof image === "string" ? image : image?.url ?? null,
    raw: product,
  };
}

export function getSyscomStatus() {
  const credentials = getCredentials();
  return {
    provider: "SYSCOM",
    configured: credentials.configured,
    capabilities: {
      catalog: true,
      prices: true,
      stock: true,
      orderQuote: true,
      orderCreate: true,
      shippingGuide: true,
      tracking: true,
    },
    mode: credentials.configured ? "API" : "CONFIGURATION_REQUIRED",
  };
}

export async function searchSyscomProducts(options: { query?: string; page?: number; limit?: number; stockOnly?: boolean }) {
  const query = String(options.query || "").trim();
  const page = Math.max(1, Math.min(1000, Number(options.page || 1)));
  const limit = Math.max(10, Math.min(100, Number(options.limit || 30)));
  if (!query) throw new Error("SYSCOM_QUERY_REQUIRED");

  const params = new URLSearchParams({ busqueda: query, pagina: String(page), limit: String(limit), moneda: "mxn", iva: "true", inventarios: "true", informacion_pro: "true" });
  if (options.stockOnly !== false) params.set("stock", "true");

  const data = await authorizedGet(`/productos?${params.toString()}`) as SyscomProductSearchResponse;
  const products = Array.isArray(data.productos) ? data.productos : Array.isArray(data.products) ? data.products : Array.isArray(data) ? data : [];

  return {
    provider: "SYSCOM",
    query,
    page,
    limit,
    total: Number(data.total ?? data.cantidad ?? products.length),
    products: products.map(normalizeProduct),
  };
}

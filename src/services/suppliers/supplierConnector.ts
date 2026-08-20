export type SupplierCapabilities = {
  catalog: boolean;
  prices: boolean;
  stock: boolean;
  dropshipping: boolean;
  orderQuote: boolean;
  orderCreate: boolean;
  shippingGuide: boolean;
  tracking: boolean;
};

export type SupplierConnectorStatus = {
  provider: string;
  name: string;
  configured: boolean;
  mode: "API" | "MANUAL" | "CONFIGURATION_REQUIRED";
  capabilities: SupplierCapabilities;
};

export type SupplierProduct = {
  provider: string;
  providerProductId: string;
  sku: string;
  title: string;
  brand: string | null;
  category: string | null;
  price: number | null;
  currency: string;
  stock: number | null;
  imageUrl: string | null;
  raw?: unknown;
};

export type SupplierProductSearchResult = {
  provider: string;
  query: string;
  page: number;
  limit: number;
  total: number;
  products: SupplierProduct[];
};

export interface SupplierConnector {
  readonly id: string;
  getStatus(): SupplierConnectorStatus;
  searchProducts?(options: { query?: string; page?: number; limit?: number; stockOnly?: boolean }): Promise<SupplierProductSearchResult>;
}

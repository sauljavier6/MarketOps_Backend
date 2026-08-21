import type { SupplierConnector } from "./supplierConnector";

export const eleGateConnector: SupplierConnector = {
  id: "ELE-GATE",
  getStatus: () => ({
    provider: "ELE-GATE",
    name: "ELE-GATE",
    configured: true,
    mode: "MANUAL",
    capabilities: {
      catalog: false,
      prices: false,
      stock: false,
      dropshipping: true,
      orderQuote: true,
      orderCreate: false,
      shippingGuide: true,
      tracking: false,
    },
  }),
};

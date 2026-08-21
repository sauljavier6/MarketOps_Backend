import type { SupplierConnector } from "./supplierConnector";
import { eleGateConnector } from "./eleGateConnector";
import { syscomConnector } from "./syscomConnector";

const connectors: SupplierConnector[] = [eleGateConnector, syscomConnector];

export function listSupplierConnectors() {
  return connectors;
}

export function getSupplierConnector(provider: string) {
  const normalized = String(provider || "").trim().toUpperCase();
  return connectors.find((connector) => connector.id.toUpperCase() === normalized) || null;
}

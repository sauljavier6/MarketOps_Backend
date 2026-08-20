import type { Request, Response } from "express";
import { getSyscomStatus, searchSyscomProducts } from "../services/suppliers/syscomConnector";

export async function getSyscomStatusController(_req: Request, res: Response) {
  return res.json(getSyscomStatus());
}

export async function getSyscomProductsController(req: Request, res: Response) {
  try {
    const query = String(req.query.q || req.query.search || "").trim();
    const page = Number(req.query.page || 1);
    const limit = Number(req.query.limit || 30);
    const stockOnly = String(req.query.stock || "true") !== "false";
    return res.json(await searchSyscomProducts({ query, page, limit, stockOnly }));
  } catch (error: any) {
    const message = String(error?.message || "No se pudo consultar el catálogo de SYSCOM");
    if (message === "SYSCOM_NOT_CONFIGURED") return res.status(409).json({ error: "SYSCOM_NOT_CONFIGURED", message: "Configura SYSCOM_CLIENT_ID y SYSCOM_CLIENT_SECRET en el backend." });
    if (message === "SYSCOM_QUERY_REQUIRED") return res.status(400).json({ error: "SYSCOM_QUERY_REQUIRED", message: "Escribe qué producto quieres buscar en SYSCOM." });
    if (message.startsWith("SYSCOM_AUTH_FAILED")) return res.status(401).json({ error: "SYSCOM_AUTH_FAILED", message });
    return res.status(502).json({ error: "SYSCOM_API_ERROR", message });
  }
}

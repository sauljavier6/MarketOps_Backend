import type { Request, Response } from "express";
import InventoryMovement from "../models/InventoryMovement";
import Product from "../models/Product";
import Stock from "../models/Stock";

export async function getInventory(_req: Request, res: Response) {
  const rows = await Stock.findAll({ include: [Product], order: [["updatedAt", "DESC"]] });
  res.json(rows.map((row) => ({
    productId: row.ID_Product,
    description: row.Product?.Description || `Producto ${row.ID_Product}`,
    code: row.Product?.Code || null,
    amount: Number(row.Amount),
    reserved: Number(row.Reserved),
    available: Number(row.Amount) - Number(row.Reserved),
    averagePurchasePrice: Number(row.AveragePurchasePrice),
    salePrice: Number(row.SalePrice),
    inventoryValue: Number(row.Amount) * Number(row.AveragePurchasePrice),
  })));
}

export async function getInventoryMovements(_req: Request, res: Response) {
  const rows = await InventoryMovement.findAll({
    include: [Product],
    order: [["createdAt", "DESC"]],
    limit: 100,
  });
  res.json(rows);
}

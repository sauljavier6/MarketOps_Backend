import type { Request, Response } from "express";
import Purchase from "../models/Purchase";
import PurchaseItem from "../models/PurchaseItem";
import Supplier from "../models/Supplier";
import { commitPurchaseToCapital, receivePurchase } from "../services/purchaseService";

export async function getPurchases(_req: Request, res: Response) {
  const rows = await Purchase.findAll({
    include: [{ model: Supplier }, { model: PurchaseItem }],
    order: [["createdAt", "DESC"]],
  });
  res.json(rows);
}

export async function createPurchase(req: Request, res: Response) {
  const { supplierId, items = [], shippingCost = 0, expectedDate } = req.body;
  if (!supplierId || !Array.isArray(items) || items.length === 0) {
    return res.status(400).json({ error: "supplierId and items are required" });
  }

  const merchandiseTotal = items.reduce((sum: number, item: any) => {
    return sum + (Number(item.quantity) * Number(item.unitCost));
  }, 0);

  const purchase = await Purchase.create({
    ID_Supplier: Number(supplierId),
    Status: "ORDERED",
    MerchandiseTotal: merchandiseTotal,
    ShippingCost: Number(shippingCost),
    Total: merchandiseTotal + Number(shippingCost),
    ExpectedDate: expectedDate || null,
  });

  for (const item of items) {
    await PurchaseItem.create({
      ID_Purchase: purchase.ID_Purchase,
      ID_Product: Number(item.productId),
      Quantity: Number(item.quantity),
      ReceivedQuantity: 0,
      UnitCost: Number(item.unitCost),
    });
  }

  await commitPurchaseToCapital(purchase);

  const created = await Purchase.findByPk(purchase.ID_Purchase, { include: [{ model: Supplier }, { model: PurchaseItem }] });
  return res.status(201).json(created);
}

export async function receivePurchaseController(req: Request, res: Response) {
  try {
    const purchaseId = Number(req.params.purchaseId);
    const { items = [] } = req.body;
    const result = await receivePurchase(purchaseId, items);
    return res.json(result);
  } catch (error: any) {
    return res.status(400).json({ error: error.message || "Unable to receive purchase" });
  }
}

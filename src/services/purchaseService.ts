import CapitalAccount from "../models/CapitalAccount";
import CapitalMovement from "../models/CapitalMovement";
import InventoryMovement from "../models/InventoryMovement";
import Product from "../models/Product";
import Purchase from "../models/Purchase";
import PurchaseItem from "../models/PurchaseItem";
import Stock from "../models/Stock";

export async function receivePurchase(purchaseId: number, receivedItems: Array<{ purchaseItemId: number; receivedQuantity: number }>) {
  const purchase = await Purchase.findByPk(purchaseId, { include: [PurchaseItem] });
  if (!purchase) throw new Error("Purchase not found");

  const items = purchase.Items || [];

  for (const input of receivedItems) {
    const item = items.find((row) => row.ID_PurchaseItem === input.purchaseItemId);
    if (!item) continue;

    const qty = Math.max(0, Number(input.receivedQuantity || 0));
    item.ReceivedQuantity = Math.min(item.Quantity, item.ReceivedQuantity + qty);
    await item.save();

    let stock = await Stock.findByPk(item.ID_Product);
    if (!stock) {
      stock = await Stock.create({
        ID_Product: item.ID_Product,
        Amount: 0,
        AveragePurchasePrice: 0,
        SalePrice: 0,
        Reserved: 0,
      });
    }

    const oldAmount = Number(stock.Amount || 0);
    const oldAvg = Number(stock.AveragePurchasePrice || 0);
    const newAmount = oldAmount + qty;
    const newAvg = newAmount > 0
      ? ((oldAmount * oldAvg) + (qty * Number(item.UnitCost))) / newAmount
      : Number(item.UnitCost);

    stock.Amount = newAmount;
    stock.AveragePurchasePrice = Number(newAvg.toFixed(2));
    await stock.save();

    await InventoryMovement.create({
      ID_Product: item.ID_Product,
      Type: "PURCHASE",
      Quantity: qty,
      Reference: `PURCHASE:${purchase.ID_Purchase}`,
    });
  }

  const refreshedItems = await PurchaseItem.findAll({ where: { ID_Purchase: purchase.ID_Purchase } });
  const fullyReceived = refreshedItems.every((item) => item.ReceivedQuantity >= item.Quantity);
  purchase.Status = fullyReceived ? "RECEIVED" : "IN_TRANSIT";
  await purchase.save();

  return purchase;
}

export async function commitPurchaseToCapital(purchase: Purchase) {
  const account = await CapitalAccount.findOne({ order: [["ID_CapitalAccount", "ASC"]] });
  if (!account) return null;

  const total = Number(purchase.Total || 0);
  account.CurrentCash = Number(account.CurrentCash || 0) - total;
  await account.save();

  return CapitalMovement.create({
    ID_CapitalAccount: account.ID_CapitalAccount,
    Type: "PURCHASE",
    Amount: -total,
    Reference: `PURCHASE:${purchase.ID_Purchase}`,
    Notes: `Compra #${purchase.ID_Purchase}`,
  });
}

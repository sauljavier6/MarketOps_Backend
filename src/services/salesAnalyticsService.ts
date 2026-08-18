import { Op } from "sequelize";
import Product from "../models/Product";
import Sale from "../models/Sale";
import SaleItem from "../models/SaleItem";
import Stock from "../models/Stock";

export async function getProductSalesWindow(productId: number, windowDays = 14) {
  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const saleItems = await SaleItem.findAll({
    where: {
      ID_Product: productId,
      createdAt: { [Op.gte]: since },
    },
    include: [{ model: Sale }],
  });

  const unitsSold = saleItems.reduce((sum, row) => sum + Number(row.Quantity || 0), 0);
  const revenue = saleItems.reduce((sum, row) => sum + (Number(row.Quantity || 0) * Number(row.UnitPrice || 0)), 0);
  const cost = saleItems.reduce((sum, row) => sum + (Number(row.Quantity || 0) * Number(row.UnitCost || 0)), 0);

  const saleFees = saleItems.reduce((sum, row) => {
    const parent = row.Sale;
    if (!parent || Number(parent.GrossAmount || 0) <= 0) return sum;
    const share = (Number(row.Quantity || 0) * Number(row.UnitPrice || 0)) / Number(parent.GrossAmount);
    return sum + (Number(parent.MarketplaceFees || 0) * share);
  }, 0);

  const realProfit = revenue - cost - saleFees;
  const realMarginPct = revenue > 0 ? (realProfit / revenue) * 100 : 0;

  const stock = await Stock.findByPk(productId, { include: [Product] });

  return {
    productId,
    productName: stock?.Product?.Description || `Producto ${productId}`,
    currentStock: Number(stock?.Amount || 0) - Number(stock?.Reserved || 0),
    unitsSold,
    revenue: Number(revenue.toFixed(2)),
    realProfit: Number(realProfit.toFixed(2)),
    realMarginPct: Number(realMarginPct.toFixed(2)),
    windowDays,
  };
}

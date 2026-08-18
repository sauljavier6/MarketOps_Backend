import type { Request, Response } from "express";
import { Op } from "sequelize";
import CapitalAccount from "../models/CapitalAccount";
import Purchase from "../models/Purchase";
import Stock from "../models/Stock";

export async function getDashboard(_req: Request, res: Response) {
  try {
    const account = await CapitalAccount.findOne({ order: [["ID_CapitalAccount", "ASC"]] });
    const stock = await Stock.findAll();
    const activePurchases = await Purchase.count({ where: { Status: { [Op.in]: ["ORDERED", "IN_TRANSIT"] } } });

    const inventoryValue = stock.reduce((sum, row) => sum + (Number(row.Amount) * Number(row.AveragePurchasePrice)), 0);

    return res.json({
      capital: {
        initial: account ? Number(account.InitialCapital) : 5000,
        available: account ? Number(account.CurrentCash) : 5000,
        inventoryValue: Number(inventoryValue.toFixed(2)),
        receivable: 0,
        realizedProfit: 0,
      },
      activePurchases,
      season: { name: "Halloween / Día de Muertos", phase: "RESEARCH" },
    });
  } catch (error) {
    console.error("[DASHBOARD]", error);
    return res.status(500).json({ error: "Unable to load dashboard" });
  }
}

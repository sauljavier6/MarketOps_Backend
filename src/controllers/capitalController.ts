import type { Request, Response } from "express";
import { sequelize } from "../config/database";
import CapitalAccount from "../models/CapitalAccount";
import CapitalMovement from "../models/CapitalMovement";

async function getOrCreateCapitalAccount() {
  let account = await CapitalAccount.findOne({ order: [["ID_CapitalAccount", "ASC"]] });

  if (!account) {
    account = await CapitalAccount.create({ Name: "Capital principal", InitialCapital: 5000, CurrentCash: 5000 });
    await CapitalMovement.create({
      ID_CapitalAccount: account.ID_CapitalAccount,
      Type: "INITIAL",
      Amount: 5000,
      Reference: "INITIAL_CAPITAL",
      Notes: "Capital inicial de MarketOps",
    });
  }

  return account;
}

export async function getCapitalSummary(_req: Request, res: Response) {
  const account = await getOrCreateCapitalAccount();
  const movements = await CapitalMovement.findAll({
    where: { ID_CapitalAccount: account.ID_CapitalAccount },
    order: [["createdAt", "DESC"]],
    limit: 20,
  });

  res.json({
    id: account.ID_CapitalAccount,
    name: account.Name,
    initialCapital: Number(account.InitialCapital),
    currentCash: Number(account.CurrentCash),
    movements,
  });
}

export async function updateCapitalBudget(req: Request, res: Response) {
  const nextCapital = Number(req.body?.capital);

  if (!Number.isFinite(nextCapital) || nextCapital < 0) {
    return res.status(400).json({ error: "capital must be a number greater than or equal to 0" });
  }

  const transaction = await sequelize.transaction();

  try {
    const account = await getOrCreateCapitalAccount();
    await account.reload({ transaction });

    const previousInitial = Number(account.InitialCapital || 0);
    const previousCash = Number(account.CurrentCash || 0);
    const difference = Number((nextCapital - previousInitial).toFixed(2));
    const nextCash = Number((previousCash + difference).toFixed(2));

    if (nextCash < 0) {
      await transaction.rollback();
      return res.status(400).json({
        error: "No puedes reducir el presupuesto por debajo del capital que ya está comprometido.",
      });
    }

    account.InitialCapital = nextCapital;
    account.CurrentCash = nextCash;
    await account.save({ transaction });

    if (difference !== 0) {
      await CapitalMovement.create({
        ID_CapitalAccount: account.ID_CapitalAccount,
        Type: "ADJUSTMENT",
        Amount: difference,
        Reference: "BUDGET_UPDATE",
        Notes: `Presupuesto actualizado de ${previousInitial.toFixed(2)} a ${nextCapital.toFixed(2)}`,
      }, { transaction });
    }

    await transaction.commit();

    const movements = await CapitalMovement.findAll({
      where: { ID_CapitalAccount: account.ID_CapitalAccount },
      order: [["createdAt", "DESC"]],
      limit: 20,
    });

    return res.json({
      id: account.ID_CapitalAccount,
      name: account.Name,
      initialCapital: Number(account.InitialCapital),
      currentCash: Number(account.CurrentCash),
      movements,
    });
  } catch (error) {
    await transaction.rollback();
    console.error("[CAPITAL UPDATE]", error);
    return res.status(500).json({ error: "Unable to update capital budget" });
  }
}

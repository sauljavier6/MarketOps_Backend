export type ReplenishmentInput = {
  currentStock: number;
  unitsSoldWindow: number;
  windowDays: number;
  leadTimeDays: number;
  safetyDays?: number;
  seasonDaysRemaining?: number;
  realMarginPct: number;
  minHealthyMarginPct?: number;
  targetCoverDays?: number;
};

export function buildReplenishmentDecision(input: ReplenishmentInput) {
  const safetyDays = input.safetyDays ?? 5;
  const targetCoverDays = input.targetCoverDays ?? 21;
  const minHealthyMarginPct = input.minHealthyMarginPct ?? 18;

  const avgDailySales = input.windowDays > 0
    ? input.unitsSoldWindow / input.windowDays
    : 0;

  const daysOfCover = avgDailySales > 0
    ? input.currentStock / avgDailySales
    : 999;

  const effectiveTargetDays = input.seasonDaysRemaining == null
    ? targetCoverDays
    : Math.min(targetCoverDays, Math.max(0, input.seasonDaysRemaining));

  const reorderPointDays = input.leadTimeDays + safetyDays;
  let decision: "REORDER" | "HOLD" | "STOP" | "EXIT" = "HOLD";
  let recommendedQuantity = 0;
  let reason = "Inventario suficiente para la demanda actual.";

  if (input.realMarginPct < 0) {
    decision = "EXIT";
    reason = "El margen real es negativo; conviene detener reinversión y salir del inventario.";
  } else if (input.realMarginPct < minHealthyMarginPct) {
    decision = "STOP";
    reason = `Margen real ${input.realMarginPct.toFixed(1)}% por debajo del mínimo saludable ${minHealthyMarginPct}%.`;
  } else if (input.seasonDaysRemaining != null && input.seasonDaysRemaining <= input.leadTimeDays + 5) {
    decision = "EXIT";
    reason = "La temporada termina antes de que un nuevo reabastecimiento tenga tiempo suficiente para rotar.";
  } else if (avgDailySales <= 0) {
    decision = input.currentStock > 0 ? "STOP" : "HOLD";
    reason = input.currentStock > 0
      ? "No hay ventas recientes; no conviene reabastecer."
      : "Sin ventas ni stock; mantener en observación.";
  } else if (daysOfCover <= reorderPointDays) {
    const desiredStock = Math.ceil(avgDailySales * effectiveTargetDays);
    recommendedQuantity = Math.max(0, desiredStock - input.currentStock);

    if (input.seasonDaysRemaining != null) {
      const maxSeasonDemand = Math.ceil(avgDailySales * input.seasonDaysRemaining);
      recommendedQuantity = Math.min(recommendedQuantity, Math.max(0, maxSeasonDemand - input.currentStock));
    }

    if (recommendedQuantity > 0) {
      decision = "REORDER";
      reason = `Stock cubre ${daysOfCover.toFixed(1)} días y el punto de reorden es ${reorderPointDays} días.`;
    } else {
      decision = "HOLD";
      reason = "El stock actual cubre la demanda estimada restante de temporada.";
    }
  }

  return {
    averageDailySales: Number(avgDailySales.toFixed(2)),
    daysOfCover: Number(daysOfCover.toFixed(2)),
    recommendedQuantity,
    decision,
    reason,
  };
}

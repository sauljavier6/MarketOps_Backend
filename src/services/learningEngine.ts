export type LearningInput = {
  predictedSalePrice: number;
  actualAverageSalePrice: number;
  predictedMarginPct: number;
  actualMarginPct: number;
  predictedSellThroughDays?: number;
  actualSellThroughDays?: number;
  unitsPurchased: number;
  unitsSold: number;
};

function pctError(predicted: number, actual: number) {
  if (predicted === 0) return actual === 0 ? 0 : 100;
  return Math.abs((actual - predicted) / predicted) * 100;
}

export function evaluatePrediction(input: LearningInput) {
  const priceErrorPct = pctError(input.predictedSalePrice, input.actualAverageSalePrice);
  const marginErrorPct = pctError(input.predictedMarginPct, input.actualMarginPct);

  const rotationErrorPct =
    input.predictedSellThroughDays && input.actualSellThroughDays
      ? pctError(input.predictedSellThroughDays, input.actualSellThroughDays)
      : null;

  const sellThroughRate = input.unitsPurchased > 0
    ? Math.min(1, input.unitsSold / input.unitsPurchased)
    : 0;

  const priceAccuracy = Math.max(0, 100 - priceErrorPct);
  const marginAccuracy = Math.max(0, 100 - marginErrorPct);
  const rotationAccuracy = rotationErrorPct == null ? 50 : Math.max(0, 100 - rotationErrorPct);

  const predictionAccuracyScore = Math.round(
    (priceAccuracy * 0.30) +
    (marginAccuracy * 0.35) +
    (rotationAccuracy * 0.20) +
    ((sellThroughRate * 100) * 0.15)
  );

  // 50 = neutral. Higher means trust similar future predictions more.
  const confidenceAdjustment = Math.round(
    50 + ((predictionAccuracyScore - 50) * 0.6)
  );

  let note = "Predicción con precisión media.";
  if (predictionAccuracyScore >= 85) note = "Predicción muy precisa; aumentar confianza en señales similares.";
  else if (predictionAccuracyScore >= 70) note = "Predicción consistente; mantener modelo con ajuste ligero.";
  else if (predictionAccuracyScore < 50) note = "Predicción débil; penalizar señales similares y exigir mayor margen de seguridad.";

  return {
    priceErrorPct: Number(priceErrorPct.toFixed(2)),
    marginErrorPct: Number(marginErrorPct.toFixed(2)),
    rotationErrorPct: rotationErrorPct == null ? null : Number(rotationErrorPct.toFixed(2)),
    sellThroughRatePct: Number((sellThroughRate * 100).toFixed(2)),
    predictionAccuracyScore,
    confidenceAdjustment: Math.max(0, Math.min(100, confidenceAdjustment)),
    note,
  };
}

export function applyLearningToScore(baseScore: number, historicalAccuracyScore?: number) {
  if (historicalAccuracyScore == null) return Math.round(baseScore);

  // Historical learning affects only 15% of final score so it cannot dominate market signals.
  const historicalFactor = (historicalAccuracyScore - 50) * 0.30;
  return Math.max(0, Math.min(100, Math.round(baseScore + historicalFactor)));
}

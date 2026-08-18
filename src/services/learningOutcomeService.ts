import { Op } from "sequelize";
import InvestmentRecommendation from "../models/InvestmentRecommendation";
import LearningOutcome from "../models/LearningOutcome";
import Product from "../models/Product";
import PurchaseItem from "../models/PurchaseItem";
import SaleItem from "../models/SaleItem";
import { evaluatePrediction } from "./learningEngine";

export async function calculateLearningOutcome(productId: number, windowDays = 60) {
  const product = await Product.findByPk(productId);
  if (!product) throw new Error("Product not found");

  const since = new Date();
  since.setDate(since.getDate() - windowDays);

  const sales = await SaleItem.findAll({
    where: {
      ID_Product: productId,
      createdAt: { [Op.gte]: since },
    },
    order: [["createdAt", "ASC"]],
  });

  const purchases = await PurchaseItem.findAll({
    where: {
      ID_Product: productId,
      createdAt: { [Op.gte]: since },
    },
    order: [["createdAt", "ASC"]],
  });

  const latestPrediction = await InvestmentRecommendation.findOne({
    where: { ProductTitle: product.Description },
    order: [["createdAt", "DESC"]],
  });

  if (!latestPrediction) throw new Error("No investment prediction found for this product");
  if (!sales.length) throw new Error("No sales data available yet");

  const unitsSold = sales.reduce((s, x) => s + Number(x.Quantity || 0), 0);
  const salesRevenue = sales.reduce((s, x) => s + (Number(x.Quantity || 0) * Number(x.UnitPrice || 0)), 0);
  const salesCost = sales.reduce((s, x) => s + (Number(x.Quantity || 0) * Number(x.UnitCost || 0)), 0);

  const unitsPurchased = purchases.reduce((s, x) => s + Number(x.Quantity || 0), 0);

  const actualAverageSalePrice = unitsSold > 0 ? salesRevenue / unitsSold : 0;
  const actualMarginPct = salesRevenue > 0 ? ((salesRevenue - salesCost) / salesRevenue) * 100 : 0;

  const firstSale = sales[0]?.createdAt ? new Date(sales[0].createdAt) : null;
  const lastSale = sales[sales.length - 1]?.createdAt ? new Date(sales[sales.length - 1].createdAt) : null;
  const actualSellThroughDays = firstSale && lastSale
    ? Math.max(1, Math.ceil((lastSale.getTime() - firstSale.getTime()) / 86400000))
    : 1;

  const predictedSalePrice = Number(latestPrediction.EstimatedSalePrice);
  const predictedMarginPct = predictedSalePrice > 0
    ? (Number(latestPrediction.EstimatedProfitPerUnit) / predictedSalePrice) * 100
    : 0;

  // First iteration: assume predicted sell-through horizon of 21 days.
  const predictedSellThroughDays = 21;

  const evaluation = evaluatePrediction({
    predictedSalePrice,
    actualAverageSalePrice,
    predictedMarginPct,
    actualMarginPct,
    predictedSellThroughDays,
    actualSellThroughDays,
    unitsPurchased,
    unitsSold,
  });

  const [outcome] = await LearningOutcome.upsert({
    ID_Product: productId,
    ProductTitle: product.Description,
    PredictedSalePrice: predictedSalePrice,
    ActualAverageSalePrice: Number(actualAverageSalePrice.toFixed(2)),
    PredictedMarginPct: Number(predictedMarginPct.toFixed(2)),
    ActualMarginPct: Number(actualMarginPct.toFixed(2)),
    PredictedSellThroughDays: predictedSellThroughDays,
    ActualSellThroughDays: actualSellThroughDays,
    UnitsPurchased: unitsPurchased,
    UnitsSold: unitsSold,
    PriceErrorPct: evaluation.priceErrorPct,
    MarginErrorPct: evaluation.marginErrorPct,
    RotationErrorPct: evaluation.rotationErrorPct,
    PredictionAccuracyScore: evaluation.predictionAccuracyScore,
    ConfidenceAdjustment: evaluation.confidenceAdjustment,
    Notes: evaluation.note,
  }, { returning: true });

  return outcome;
}

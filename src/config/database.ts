import { Sequelize } from "sequelize-typescript";
import CapitalAccount from "../models/CapitalAccount";
import CapitalMovement from "../models/CapitalMovement";
import InventoryMovement from "../models/InventoryMovement";
import MarketplaceListing from "../models/MarketplaceListing";
import MarketplaceAccount from "../models/MarketplaceAccount";
import Opportunity from "../models/Opportunity";
import Product from "../models/Product";
import Purchase from "../models/Purchase";
import PurchaseItem from "../models/PurchaseItem";
import Sale from "../models/Sale";
import SaleItem from "../models/SaleItem";
import Season from "../models/Season";
import Stock from "../models/Stock";
import Supplier from "../models/Supplier";
import SupplierOffer from "../models/SupplierOffer";
import SupplierProduct from "../models/SupplierProduct";
import MarketSnapshot from "../models/MarketSnapshot";
import DiscoveryRun from "../models/DiscoveryRun";
import SupplierLead from "../models/SupplierLead";
import SupplierDiscoveryRun from "../models/SupplierDiscoveryRun";
import PortfolioRecommendation from "../models/PortfolioRecommendation";
import ReplenishmentDecision from "../models/ReplenishmentDecision";
import LearningOutcome from "../models/LearningOutcome";
import RadarCandidate from "../models/RadarCandidate";
import InvestmentRecommendation from "../models/InvestmentRecommendation";

export const sequelize = new Sequelize({
  dialect: "postgres",
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORT || 5432),
  database: process.env.DB_NAME,
  username: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  logging: process.env.DB_LOGGING === "true" ? console.log : false,
  models: [CapitalAccount, CapitalMovement, InventoryMovement, MarketplaceAccount, MarketplaceListing, Opportunity, Product, Purchase, PurchaseItem, Sale, SaleItem, Season, Stock, Supplier, SupplierOffer, SupplierProduct, RadarCandidate, InvestmentRecommendation, MarketSnapshot, DiscoveryRun, SupplierLead, SupplierDiscoveryRun, PortfolioRecommendation, ReplenishmentDecision, LearningOutcome],
});

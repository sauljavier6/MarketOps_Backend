import CapitalAccount from "../models/CapitalAccount";
import RadarCandidate from "../models/RadarCandidate";
import SupplierOffer from "../models/SupplierOffer";
import { calculateTiming, type CommercialOpportunity } from "./commercialCalendarService";
import { analyzeDiscoveredProduct, type DiscoveredProduct } from "./mercadoLibreResearchService";

function shouldQuoteSupplier(market: any, timing: any) {
  const salePrice = Number(market.estimatedSalePrice || 0);
  const confidence = Number(market.confidence || 0);
  const demand = Number(market.demandScore || 0);
  const marketScore = Number(market.marketScore || 0);
  const competition = Number(market.competitionScore || 0);
  const tooLate = timing?.timingStatus === "TOO_LATE";

  if (!salePrice || confidence < 40 || tooLate) return false;
  return demand >= 50 && marketScore >= 50 && competition <= 85;
}

export async function researchCandidateDeep(candidateId: number) {
  const candidate = await RadarCandidate.findByPk(candidateId);
  if (!candidate) throw new Error("Radar candidate not found");

  const previousEvidence: any = candidate.Evidence || {};
  const catalogProductId = previousEvidence.catalogProductId;
  if (!catalogProductId) throw new Error("El candidato no tiene un producto de catálogo de Mercado Libre asociado");

  const product: DiscoveredProduct = {
    productId: String(catalogProductId),
    title: candidate.Title,
    domainId: previousEvidence.domainId || null,
    sourceTrend: previousEvidence.sourceTrend || candidate.Title,
    sourceType: previousEvidence.sourceType || (previousEvidence.sourceStrategy === "SEASONAL" ? "SEASONAL_SEED" : "MELI_TREND"),
    sourceSeason: candidate.Season || previousEvidence.sourceSeason || null,
    sourceScore: previousEvidence.sourceScore || previousEvidence.scoring?.SeasonScore || null,
    relevanceScore: previousEvidence.sourceRelevanceScore || previousEvidence.scoring?.DiscoveryScore || null,
  };

  // El análisis profundo del Radar es MARKET-FIRST.
  // Mercado Libre valida mercado, precio, demanda y competencia.
  // La búsqueda automática de proveedores queda fuera de este flujo porque sus resultados
  // no son suficientemente confiables para alimentar costos de inversión.
  const market = await analyzeDiscoveredProduct(product, 0, 1);

  const verifiedOffer = await SupplierOffer.findOne({
    where: { ProductQuery: candidate.Title, State: true },
    order: [["updatedAt", "DESC"]],
  });

  const supplierLeadTime = verifiedOffer?.DeliveryDays == null ? null : Number(verifiedOffer.DeliveryDays);
  const opportunity = (previousEvidence.commercialOpportunity || null) as CommercialOpportunity | null;
  const timing = calculateTiming(opportunity, supplierLeadTime, 3, 7);
  const capital = await CapitalAccount.findOne({ order: [["ID_CapitalAccount", "ASC"]] });
  const quoteRecommended = shouldQuoteSupplier(market, timing);

  const verifiedSupplier = verifiedOffer ? {
    name: verifiedOffer.SupplierName,
    unitPrice: Number(verifiedOffer.UnitPrice),
    moq: Number(verifiedOffer.MOQ),
    shippingCost: Number(verifiedOffer.ShippingCost),
    importCost: Number(verifiedOffer.ImportCost),
    deliveryDays: verifiedOffer.DeliveryDays,
    reliabilityScore: Number(verifiedOffer.ReliabilityScore),
  } : null;

  const evidence: any = {
    ...previousEvidence,
    ...market.evidence,
    sourceStrategy: previousEvidence.sourceStrategy,
    commercialOpportunity: previousEvidence.commercialOpportunity,
    trendValidation: previousEvidence.trendValidation,
    sellingCosts: previousEvidence.sellingCosts,
    deepResearch: {
      researchedAt: new Date().toISOString(),
      marketRefreshed: true,
      supplierSearchCompleted: false,
      supplierSearchMode: "MANUAL_VERIFIED",
      quoteRecommended,
    },
    sourcing: {
      provider: verifiedOffer ? "USER_VERIFIED" : "MANUAL_REQUIRED",
      leadsFound: 0,
      estimatedPurchasePrice: verifiedOffer ? Number(verifiedOffer.UnitPrice) : null,
      supplierVerified: Boolean(verifiedOffer),
      verifiedSupplier,
      supplierLeads: [],
    },
    timing,
    scoring: {
      ...(previousEvidence.scoring || {}),
      DemandScore: market.demandScore,
      MarketScore: market.marketScore,
      CompetitionScore: market.competitionScore,
      DataConfidence: market.confidence,
      TimingScore: timing.timingScore,
      InvestmentScore: null,
    },
    decision: "RESEARCH",
    decisionReason: verifiedOffer
      ? "Cotización de proveedor registrada. Completa los costos de venta y calcula la decisión final."
      : quoteRecommended
        ? "El mercado muestra evidencia suficiente. Vale la pena cotizar un proveedor para completar la inversión."
        : "La evidencia de mercado todavía no justifica dedicar tiempo a cotizar un proveedor.",
    stage: verifiedOffer ? "ECONOMICS" : "MARKET_RESEARCH",
    recommendation: {
      ...(previousEvidence.recommendation || {}),
      availableCapital: Number(capital?.CurrentCash || 0),
      quoteSupplier: quoteRecommended,
    },
  };

  await candidate.update({
    EstimatedSalePrice: market.estimatedSalePrice,
    EstimatedMarketplaceFee: Number(market.fee?.saleFeeAmount || 0),
    DemandScore: market.demandScore,
    CompetitionScore: market.competitionScore,
    MarketScore: market.marketScore,
    ConfidenceScore: market.confidence,
    Status: evidence.stage,
    Evidence: evidence,
  });

  return candidate.reload();
}

import CapitalAccount from "../models/CapitalAccount";
import RadarCandidate from "../models/RadarCandidate";
import SupplierOffer from "../models/SupplierOffer";
import { calculateTiming, type CommercialOpportunity } from "./commercialCalendarService";
import { analyzeDiscoveredProduct, type DiscoveredProduct } from "./mercadoLibreResearchService";
import { discoverSupplierLeads } from "./supplierAutoDiscoveryService";

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
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

  const market = await analyzeDiscoveredProduct(product, 0, 1);
  const brave = await discoverSupplierLeads(candidate.Title, 8).catch(() => ({ leads: [] as any[] }));
  const salePrice = Number(market.estimatedSalePrice || 0) || null;
  const plausible = brave.leads
    .filter((lead: any) => lead.PriceHint != null)
    .map((lead: any) => ({ lead, price: Number(lead.PriceHint) }))
    .filter((row: any) => Number.isFinite(row.price) && row.price > 0 && (!salePrice || (row.price > salePrice * 0.05 && row.price < salePrice * 0.82)))
    .sort((a: any, b: any) => Number(b.lead.LeadScore || 0) - Number(a.lead.LeadScore || 0));

  const estimatedPurchasePrice = plausible.length ? Number(Number(median(plausible.map((row: any) => row.price))).toFixed(2)) : null;
  const verifiedOffer = await SupplierOffer.findOne({ where: { ProductQuery: candidate.Title, State: true }, order: [["updatedAt", "DESC"]] });
  const supplierLeadTime = verifiedOffer?.DeliveryDays == null ? null : Number(verifiedOffer.DeliveryDays);
  const opportunity = (previousEvidence.commercialOpportunity || null) as CommercialOpportunity | null;
  const timing = calculateTiming(opportunity, supplierLeadTime, 3, 7);
  const capital = await CapitalAccount.findOne({ order: [["ID_CapitalAccount", "ASC"]] });

  const evidence: any = {
    ...previousEvidence,
    ...market.evidence,
    sourceStrategy: previousEvidence.sourceStrategy,
    commercialOpportunity: previousEvidence.commercialOpportunity,
    trendValidation: previousEvidence.trendValidation,
    sellingCosts: previousEvidence.sellingCosts,
    deepResearch: { researchedAt: new Date().toISOString(), marketRefreshed: true, supplierSearchCompleted: true },
    sourcing: {
      provider: "BRAVE_SEARCH",
      leadsFound: brave.leads.length,
      estimatedPurchasePrice,
      supplierVerified: Boolean(verifiedOffer),
      verifiedSupplier: verifiedOffer ? {
        name: verifiedOffer.SupplierName,
        unitPrice: Number(verifiedOffer.UnitPrice),
        moq: Number(verifiedOffer.MOQ),
        shippingCost: Number(verifiedOffer.ShippingCost),
        importCost: Number(verifiedOffer.ImportCost),
        deliveryDays: verifiedOffer.DeliveryDays,
        reliabilityScore: Number(verifiedOffer.ReliabilityScore),
      } : null,
      supplierLeads: plausible.slice(0, 8).map((row: any) => ({ name: row.lead.Name, domain: row.lead.Domain, url: row.lead.Url, leadScore: row.lead.LeadScore, priceHint: row.price })),
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
    decisionReason: verifiedOffer ? "Proveedor encontrado. Completa los costos de venta y calcula la decisión final." : "Investigación actualizada. Verifica una cotización de proveedor antes de calcular la decisión final.",
    stage: verifiedOffer ? "ECONOMICS" : "SOURCING",
    recommendation: { ...(previousEvidence.recommendation || {}), availableCapital: Number(capital?.CurrentCash || 0) },
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

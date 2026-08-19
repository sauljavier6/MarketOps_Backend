export type OpportunityType = "SEASONAL" | "EVENT_DRIVEN" | "EVERGREEN";
export type CommercialStage = "RESEARCH_NOW" | "SOURCE_NOW" | "BUY_NOW" | "SELL_NOW" | "TOO_LATE" | "UPCOMING";

export type CommercialSeasonRule = {
  id: string;
  name: string;
  type: OpportunityType;
  month: number;
  day: number;
  researchStartOffset: number;
  purchaseStartOffset: number;
  purchaseEndOffset: number;
  demandStartOffset: number;
  demandEndOffset: number;
  priority: number;
  hypotheses: string[];
};

export type CommercialOpportunity = {
  id: string;
  name: string;
  type: OpportunityType;
  eventDate: string;
  researchStartDate: string;
  recommendedPurchaseStart: string;
  recommendedPurchaseEnd: string;
  demandStartDate: string;
  demandPeakDate: string;
  demandEndDate: string;
  daysUntilDemand: number;
  daysUntilPeak: number;
  priority: number;
  stage: CommercialStage;
  hypotheses: string[];
};

const DAY = 86_400_000;

const RULES: CommercialSeasonRule[] = [
  { id: "back-to-school", name: "Regreso a clases", type: "SEASONAL", month: 8, day: 25, researchStartOffset: -120, purchaseStartOffset: -90, purchaseEndOffset: -25, demandStartOffset: -45, demandEndOffset: 10, priority: 86, hypotheses: ["mochila escolar impermeable laptop", "lonchera térmica escolar", "lapicera escolar estuche grande", "organizador útiles escolares escritorio", "botella agua escolar acero inoxidable", "etiquetas escolares personalizables", "mochila escolar ruedas", "porta lunch infantil térmico"] },
  { id: "patriotic", name: "Fiestas Patrias", type: "SEASONAL", month: 9, day: 16, researchStartOffset: -90, purchaseStartOffset: -65, purchaseEndOffset: -20, demandStartOffset: -35, demandEndOffset: 3, priority: 72, hypotheses: ["bandera mexicana grande exterior", "guirnalda tricolor mexicana", "sombrero mexicano fiesta", "mantel tricolor fiesta mexicana", "luces led tricolor mexico", "decoración mesa fiestas patrias", "papel picado mexicano plástico", "banderines mexicanos fiesta"] },
  { id: "halloween", name: "Halloween", type: "SEASONAL", month: 10, day: 31, researchStartOffset: -120, purchaseStartOffset: -90, purchaseEndOffset: -25, demandStartOffset: -50, demandEndOffset: 3, priority: 94, hypotheses: ["telaraña decorativa halloween 5m arañas", "luces led halloween 3m", "proyector halloween exterior", "máscara led halloween", "bolsa dulces halloween reutilizable", "guirnalda halloween luces", "inflable halloween exterior", "cortina halloween decoración"] },
  { id: "day-of-dead", name: "Día de Muertos", type: "SEASONAL", month: 11, day: 2, researchStartOffset: -120, purchaseStartOffset: -90, purchaseEndOffset: -25, demandStartOffset: -50, demandEndOffset: 5, priority: 95, hypotheses: ["cempasúchil led 3m", "guirnalda cempasúchil artificial", "luces día de muertos", "papel picado día de muertos plástico", "mantel día de muertos", "calavera decorativa día de muertos", "camino mesa día de muertos", "kit decoración altar día de muertos"] },
  { id: "buen-fin", name: "Buen Fin", type: "EVENT_DRIVEN", month: 11, day: 15, researchStartOffset: -120, purchaseStartOffset: -75, purchaseEndOffset: -20, demandStartOffset: -18, demandEndOffset: 5, priority: 88, hypotheses: ["audífonos bluetooth cancelación ruido", "cargador usb c 65w", "power bank 20000mah", "smartwatch económico", "control xbox inalámbrico", "teclado mecánico gamer", "bocina bluetooth portátil", "soporte laptop aluminio"] },
  { id: "christmas", name: "Navidad", type: "SEASONAL", month: 12, day: 25, researchStartOffset: -150, purchaseStartOffset: -110, purchaseEndOffset: -30, demandStartOffset: -60, demandEndOffset: 7, priority: 96, hypotheses: ["luces navideñas led exterior", "serie navideña led", "proyector navideño exterior", "guirnalda navideña puerta", "inflable navideño exterior", "luces cascada navideñas", "esferas navideñas set", "árbol navidad artificial pequeño"] },
  { id: "new-year", name: "Año Nuevo", type: "SEASONAL", month: 12, day: 31, researchStartOffset: -90, purchaseStartOffset: -60, purchaseEndOffset: -18, demandStartOffset: -25, demandEndOffset: 2, priority: 70, hypotheses: ["kit decoración año nuevo dorado", "globos año nuevo números", "cortina metálica dorada fiesta", "luces fiesta año nuevo", "gorros fiesta año nuevo", "photobooth año nuevo accesorios"] },
  { id: "valentine", name: "San Valentín", type: "SEASONAL", month: 2, day: 14, researchStartOffset: -100, purchaseStartOffset: -70, purchaseEndOffset: -20, demandStartOffset: -35, demandEndOffset: 2, priority: 84, hypotheses: ["luces corazones led", "oso peluche grande", "caja regalo corazón", "globos corazón san valentín", "decoración romántica led", "kit regalo pareja"] },
  { id: "childrens-day", name: "Día del Niño", type: "SEASONAL", month: 4, day: 30, researchStartOffset: -100, purchaseStartOffset: -70, purchaseEndOffset: -20, demandStartOffset: -35, demandEndOffset: 3, priority: 82, hypotheses: ["juego educativo niños", "juguete construcción bloques", "pista carros infantil", "kit pintura niños", "proyector dibujo infantil", "juego mesa familiar niños"] },
  { id: "mothers-day", name: "Día de las Madres", type: "SEASONAL", month: 5, day: 10, researchStartOffset: -100, purchaseStartOffset: -70, purchaseEndOffset: -18, demandStartOffset: -30, demandEndOffset: 2, priority: 86, hypotheses: ["joyero organizador mujer", "set spa regalo mujer", "bolsa regalo elegante", "termo mujer acero inoxidable", "lámpara luna personalizada", "kit regalo mamá"] },
  { id: "fathers-day", name: "Día del Padre", type: "SEASONAL", month: 6, day: 21, researchStartOffset: -100, purchaseStartOffset: -70, purchaseEndOffset: -18, demandStartOffset: -30, demandEndOffset: 2, priority: 78, hypotheses: ["cartera hombre piel", "kit herramientas compacto", "termo hombre acero inoxidable", "organizador auto cajuela", "soporte celular auto", "kit regalo papá"] },
  { id: "summer", name: "Verano", type: "SEASONAL", month: 7, day: 1, researchStartOffset: -120, purchaseStartOffset: -90, purchaseEndOffset: -20, demandStartOffset: -45, demandEndOffset: 60, priority: 72, hypotheses: ["ventilador portátil recargable", "sombrilla playa grande", "bolsa térmica playa", "botella térmica grande", "flotador alberca adulto", "ventilador cuello portátil"] },
];

export const EVERGREEN_HYPOTHESES = ["organizador cajuela auto", "soporte celular auto", "cargador usb c 65w", "power bank 20000mah", "botella térmica acero inoxidable", "organizador cables escritorio", "lámpara escritorio led recargable", "audífonos bluetooth económicos", "mochila laptop impermeable", "báscula cocina digital"];

function addDays(date: Date, days: number) { return new Date(date.getTime() + days * DAY); }
function iso(date: Date) { return date.toISOString().slice(0, 10); }
function diffDays(from: Date, to: Date) { return Math.ceil((to.getTime() - from.getTime()) / DAY); }
function eventForRule(rule: CommercialSeasonRule, now: Date) {
  let event = new Date(Date.UTC(now.getUTCFullYear(), rule.month - 1, rule.day));
  if (event.getTime() < now.getTime() - 7 * DAY) event = new Date(Date.UTC(now.getUTCFullYear() + 1, rule.month - 1, rule.day));
  return event;
}

function stageFor(now: Date, research: Date, buyStart: Date, buyEnd: Date, demandStart: Date, demandEnd: Date): CommercialStage {
  const t = now.getTime();
  if (t > demandEnd.getTime()) return "TOO_LATE";
  if (t >= demandStart.getTime()) return "SELL_NOW";
  if (t >= buyStart.getTime() && t <= buyEnd.getTime()) return "BUY_NOW";
  if (t > buyEnd.getTime() && t < demandStart.getTime()) return "SOURCE_NOW";
  if (t >= research.getTime()) return "RESEARCH_NOW";
  return "UPCOMING";
}

export function getCommercialCalendar(now = new Date(), horizonDays = 120): CommercialOpportunity[] {
  return RULES.map((rule) => {
    const event = eventForRule(rule, now);
    const research = addDays(event, rule.researchStartOffset);
    const buyStart = addDays(event, rule.purchaseStartOffset);
    const buyEnd = addDays(event, rule.purchaseEndOffset);
    const demandStart = addDays(event, rule.demandStartOffset);
    const demandEnd = addDays(event, rule.demandEndOffset);
    return { id: rule.id, name: rule.name, type: rule.type, eventDate: iso(event), researchStartDate: iso(research), recommendedPurchaseStart: iso(buyStart), recommendedPurchaseEnd: iso(buyEnd), demandStartDate: iso(demandStart), demandPeakDate: iso(event), demandEndDate: iso(demandEnd), daysUntilDemand: diffDays(now, demandStart), daysUntilPeak: diffDays(now, event), priority: rule.priority, stage: stageFor(now, research, buyStart, buyEnd, demandStart, demandEnd), hypotheses: rule.hypotheses };
  }).filter((row) => row.daysUntilPeak >= -7 && row.daysUntilPeak <= horizonDays).sort((a, b) => a.daysUntilPeak - b.daysUntilPeak || b.priority - a.priority);
}

export function getSeasonDiscoveryPlan(now = new Date(), options?: { horizonDays?: number; maxSeasons?: number; hypothesesPerSeason?: number }) {
  const horizonDays = options?.horizonDays ?? 120;
  const maxSeasons = options?.maxSeasons ?? 5;
  const hypothesesPerSeason = options?.hypothesesPerSeason ?? 8;
  return getCommercialCalendar(now, horizonDays).filter((row) => row.stage !== "TOO_LATE" && row.stage !== "UPCOMING").slice(0, maxSeasons).map((row) => ({ ...row, hypotheses: row.hypotheses.slice(0, Math.max(1, Math.min(10, hypothesesPerSeason))) }));
}

export function calculateTiming(opportunity: CommercialOpportunity | null, supplierLeadTimeDays: number | null, preparationDays = 3, safetyBufferDays = 7) {
  if (!opportunity) return { timingScore: 70, totalLeadTimeDays: supplierLeadTimeDays == null ? null : supplierLeadTimeDays + preparationDays + safetyBufferDays, timingStatus: "EVERGREEN" as const, timingReady: supplierLeadTimeDays != null };
  if (supplierLeadTimeDays == null) return { timingScore: opportunity.stage === "BUY_NOW" ? 65 : 55, totalLeadTimeDays: null, timingStatus: "LEAD_TIME_REQUIRED" as const, timingReady: false };
  const totalLeadTimeDays = supplierLeadTimeDays + preparationDays + safetyBufferDays;
  const slack = opportunity.daysUntilDemand - totalLeadTimeDays;
  if (slack < 0) return { timingScore: 10, totalLeadTimeDays, timingStatus: "TOO_LATE" as const, timingReady: true };
  if (slack < 7) return { timingScore: 45, totalLeadTimeDays, timingStatus: "HIGH_RISK" as const, timingReady: true };
  if (slack < 21) return { timingScore: 75, totalLeadTimeDays, timingStatus: "BUY_NOW" as const, timingReady: true };
  return { timingScore: 92, totalLeadTimeDays, timingStatus: opportunity.stage === "RESEARCH_NOW" ? "RESEARCH_NOW" as const : "SOURCE_OR_BUY" as const, timingReady: true };
}

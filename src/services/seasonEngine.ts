type SeasonSignal = {
  name: string | null;
  score: number;
  daysToPeak: number | null;
  reason: string;
  classification: "INFERRED_DATA" | "NEUTRAL_DATA";
};

export type SeasonalDiscoverySeed = {
  season: string;
  query: string;
  score: number;
  daysToPeak: number;
};

const DAY = 86_400_000;

function dayDiff(from: Date, to: Date) {
  return Math.round((to.getTime() - from.getTime()) / DAY);
}

function nextDate(now: Date, month: number, day: number) {
  let target = new Date(Date.UTC(now.getUTCFullYear(), month - 1, day));
  if (target.getTime() < now.getTime() - 14 * DAY) target = new Date(Date.UTC(now.getUTCFullYear() + 1, month - 1, day));
  return target;
}

function scoreDaysToPeak(days: number) {
  if (days >= 21 && days <= 75) return 92;
  if (days >= 7 && days < 21) return 82;
  if (days >= 0 && days < 7) return 68;
  if (days > 75 && days <= 120) return 72;
  if (days > 120 && days <= 150) return 60;
  if (days < 0 && days >= -14) return 25;
  return 45;
}

const SEASON_RULES = [
  {
    name: "Día de Muertos",
    month: 11,
    day: 2,
    terms: ["cempasuchil", "cempasúchil", "dia de muertos", "día de muertos", "calavera", "catrina", "ofrenda"],
    discoveryQueries: ["cempasuchil led 3m", "guirnalda cempasuchil artificial", "luces dia de muertos"],
  },
  {
    name: "Halloween",
    month: 10,
    day: 31,
    terms: ["halloween", "disfraz", "terror", "calabaza", "decoracion halloween", "decoración halloween"],
    discoveryQueries: ["luces halloween led", "decoracion halloween calabaza", "disfraz halloween adulto"],
  },
  {
    name: "Regreso a clases",
    month: 8,
    day: 25,
    terms: ["mochila escolar", "lonchera", "lapicera", "util escolar", "útil escolar", "cuaderno", "lunch escolar"],
    discoveryQueries: ["mochila escolar impermeable", "lonchera termica escolar", "lapicera escolar"],
  },
  {
    name: "Navidad",
    month: 12,
    day: 25,
    terms: ["navidad", "navideñ", "luces led", "serie led", "arbol navidad", "árbol navidad", "esfera", "regalo"],
    discoveryQueries: ["luces navideñas led exterior", "serie navideña led", "proyector navideño"],
  },
  {
    name: "Buen Fin",
    month: 11,
    day: 15,
    terms: ["television", "televisión", "laptop", "notebook", "celular", "consola", "xbox", "playstation", "audifono", "audífono"],
    discoveryQueries: [],
  },
];

export function evaluateMexicoSeason(title: string, now = new Date()): SeasonSignal {
  const text = title.toLowerCase();
  const matches = SEASON_RULES.filter((rule) => rule.terms.some((term) => text.includes(term)));
  if (!matches.length) return { name: null, score: 50, daysToPeak: null, reason: "Sin señal estacional específica detectada.", classification: "NEUTRAL_DATA" };

  const ranked = matches.map((rule) => {
    const peak = nextDate(now, rule.month, rule.day);
    const days = dayDiff(now, peak);
    return { rule, days, score: scoreDaysToPeak(days) };
  }).sort((a, b) => b.score - a.score);

  const best = ranked[0];
  return {
    name: best.rule.name,
    score: best.score,
    daysToPeak: best.days,
    reason: `${best.rule.name}: ${best.days} días para la fecha pico aproximada.`,
    classification: "INFERRED_DATA",
  };
}

export function getMexicoSeasonDiscoverySeeds(now = new Date(), limit = 8): SeasonalDiscoverySeed[] {
  const seeds = SEASON_RULES.flatMap((rule) => {
    if (!rule.discoveryQueries.length) return [];
    const peak = nextDate(now, rule.month, rule.day);
    const daysToPeak = dayDiff(now, peak);
    if (daysToPeak < -7 || daysToPeak > 150) return [];
    const score = scoreDaysToPeak(daysToPeak);
    return rule.discoveryQueries.map((query) => ({ season: rule.name, query, score, daysToPeak }));
  });

  return seeds.sort((a, b) => b.score - a.score || a.daysToPeak - b.daysToPeak).slice(0, Math.max(0, limit));
}

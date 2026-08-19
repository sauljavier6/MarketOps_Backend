type SeasonSignal = {
  name: string | null;
  score: number;
  daysToPeak: number | null;
  reason: string;
  classification: "INFERRED_DATA" | "NEUTRAL_DATA";
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

export function evaluateMexicoSeason(title: string, now = new Date()): SeasonSignal {
  const text = title.toLowerCase();
  const rules = [
    { name: "Día de Muertos", month: 11, day: 2, terms: ["cempasuchil", "cempasúchil", "dia de muertos", "día de muertos", "calavera", "catrina", "ofrenda"] },
    { name: "Halloween", month: 10, day: 31, terms: ["halloween", "disfraz", "terror", "calabaza", "decoracion halloween", "decoración halloween"] },
    { name: "Regreso a clases", month: 8, day: 25, terms: ["mochila escolar", "lonchera", "lapicera", "util escolar", "útil escolar", "cuaderno", "lunch escolar"] },
    { name: "Navidad", month: 12, day: 25, terms: ["navidad", "navideñ", "luces led", "serie led", "arbol navidad", "árbol navidad", "esfera", "regalo"] },
    { name: "Buen Fin", month: 11, day: 15, terms: ["television", "televisión", "laptop", "notebook", "celular", "consola", "xbox", "playstation", "audifono", "audífono"] },
  ];

  const matches = rules.filter((rule) => rule.terms.some((term) => text.includes(term)));
  if (!matches.length) return { name: null, score: 50, daysToPeak: null, reason: "Sin señal estacional específica detectada.", classification: "NEUTRAL_DATA" };

  const ranked = matches.map((rule) => {
    const peak = nextDate(now, rule.month, rule.day);
    const days = dayDiff(now, peak);
    let score = 45;
    if (days >= 21 && days <= 75) score = 92;
    else if (days >= 7 && days < 21) score = 82;
    else if (days >= 0 && days < 7) score = 68;
    else if (days > 75 && days <= 120) score = 72;
    else if (days < 0 && days >= -14) score = 25;
    return { rule, days, score };
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

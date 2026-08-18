import SupplierDiscoveryRun from "../models/SupplierDiscoveryRun";
import SupplierLead from "../models/SupplierLead";
import { braveWebSearch } from "./braveSearchService";

const SUPPLIER_TERMS = [
  "mayoreo", "mayorista", "proveedor", "proveedores", "distribuidor", "distribuidores",
  "fabricante", "fábrica", "importador", "importadora", "wholesale", "manufacturer", "supplier",
];

const RETAIL_PENALTY_DOMAINS = [
  "mercadolibre.com", "amazon.com", "walmart.com", "liverpool.com", "temu.com",
];

function getDomain(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "").toLowerCase();
  } catch {
    return "";
  }
}

function extractPriceHint(text: string) {
  const normalized = text.replace(/,/g, "");
  const matches = [...normalized.matchAll(/(?:MXN|MX\$|\$)\s?([0-9]{2,6}(?:\.\d{1,2})?)/gi)]
    .map((m) => Number(m[1]))
    .filter((value) => Number.isFinite(value) && value > 0);

  return matches.length ? Math.min(...matches) : null;
}

function calculateLeadScore(title: string, snippet: string, domain: string) {
  const text = `${title} ${snippet}`.toLowerCase();
  let score = 45;

  const supplierMatches = SUPPLIER_TERMS.filter((term) => text.includes(term)).length;
  score += Math.min(30, supplierMatches * 8);

  if (domain.endsWith(".mx")) score += 8;
  if (text.includes("mínimo") || text.includes("moq")) score += 5;
  if (text.includes("envío") || text.includes("entrega")) score += 4;

  if (RETAIL_PENALTY_DOMAINS.some((retail) => domain.includes(retail))) score -= 25;

  return Math.max(0, Math.min(100, score));
}

export async function discoverSupplierLeads(productQuery: string, maxPerQuery = 8) {
  const run = await SupplierDiscoveryRun.create({
    ProductQuery: productQuery,
    Provider: "BRAVE_SEARCH",
    Status: "RUNNING",
    StartedAt: new Date(),
  });

  try {
    const queries = [
      `${productQuery} proveedor mayoreo México`,
      `${productQuery} distribuidor importador México`,
      `${productQuery} fabricante wholesale México`,
    ];

    const collected: Array<{ title: string; url: string; description: string }> = [];

    for (const query of queries) {
      const results = await braveWebSearch(query, maxPerQuery);
      for (const result of results) {
        if (!result.url) continue;
        collected.push({
          title: result.title || getDomain(result.url),
          url: result.url,
          description: result.description || "",
        });
      }
    }

    const byUrl = new Map<string, typeof collected[number]>();
    for (const result of collected) byUrl.set(result.url, result);

    const candidates = [...byUrl.values()]
      .map((row) => {
        const domain = getDomain(row.url);
        return {
          ...row,
          domain,
          leadScore: calculateLeadScore(row.title, row.description, domain),
          priceHint: extractPriceHint(`${row.title} ${row.description}`),
        };
      })
      .filter((row) => row.domain && row.leadScore >= 35)
      .sort((a, b) => b.leadScore - a.leadScore)
      .slice(0, 20);

    const leads: SupplierLead[] = [];

    for (const row of candidates) {
      const [lead] = await SupplierLead.findOrCreate({
        where: { ProductQuery: productQuery, Url: row.url },
        defaults: {
          ProductQuery: productQuery,
          Name: row.title,
          Domain: row.domain,
          Url: row.url,
          Snippet: row.description,
          Source: "BRAVE_SEARCH",
          LeadScore: row.leadScore,
          PriceHint: row.priceHint,
          VerificationStatus: "UNVERIFIED",
          Notes: row.priceHint ? "PriceHint extracted from search snippet; verify before using as quote." : null,
        },
      });

      if (!lead.isNewRecord) {
        await lead.update({
          Name: row.title,
          Domain: row.domain,
          Snippet: row.description,
          LeadScore: row.leadScore,
          PriceHint: row.priceHint,
        });
      }

      leads.push(lead);
    }

    await run.update({
      Status: "COMPLETED",
      LeadsFound: leads.length,
      FinishedAt: new Date(),
    });

    return { run, leads };
  } catch (error: any) {
    await run.update({
      Status: "FAILED",
      ErrorMessage: error?.message || "Supplier discovery failed",
      FinishedAt: new Date(),
    });
    throw error;
  }
}

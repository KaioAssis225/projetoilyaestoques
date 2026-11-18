import { env } from "cloudflare:workers";

/**
 * Preços por SKU usados pelo Dashboard.
 *
 * - Custo sem imposto: calculado das compras registradas no Comércio Exterior, em R$ por unidade:
 *   (FOB + rateio do frete do embarque pelo valor FOB de cada item) × câmbio do embarque,
 *   em média ponderada pela quantidade de todas as compras do SKU com câmbio informado.
 * - Custo com imposto, Venda lojista e Venda corporativa: cadastro manual (tabela product_prices).
 *
 * Todos os valores trafegam em centavos de R$; `null` significa "sem preço".
 */
type PriceRow = {
  code: string;
  cost_tax_cents: number | null;
  retail_cents: number | null;
  corporate_cents: number | null;
};

type LandedRow = {
  code: string;
  cost_units: number;
  units_without_rate: number;
  landed_total_cents: number;
};

async function ensurePricesTable() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS product_prices (
    code TEXT PRIMARY KEY,
    cost_tax_cents INTEGER,
    retail_cents INTEGER,
    corporate_cents INTEGER,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
}

async function tableExists(name: string) {
  return Boolean(await env.DB.prepare("SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = ?").bind(name).first());
}

async function landedCosts() {
  // As compras só existem depois que o Comércio Exterior criou suas tabelas.
  if (!(await tableExists("purchase_order_items")) || !(await tableExists("purchase_orders"))) return [];
  const rows = await env.DB.prepare(`WITH order_fob AS (
      SELECT purchase_order_id, SUM(unit_value_usd_cents * total_quantity) AS fob_total
      FROM purchase_order_items GROUP BY purchase_order_id
    )
    SELECT poi.code,
      SUM(CASE WHEN po.dollar_rate_cents > 0 THEN poi.total_quantity ELSE 0 END) AS cost_units,
      SUM(CASE WHEN po.dollar_rate_cents > 0 THEN 0 ELSE poi.total_quantity END) AS units_without_rate,
      SUM(CASE WHEN po.dollar_rate_cents > 0 THEN
        (poi.unit_value_usd_cents * poi.total_quantity
          + COALESCE(po.freight_usd_cents, 0) * (poi.unit_value_usd_cents * poi.total_quantity * 1.0 / NULLIF(f.fob_total, 0)))
        * po.dollar_rate_cents / 100.0
      ELSE 0 END) AS landed_total_cents
    FROM purchase_order_items poi
    JOIN purchase_orders po ON po.id = poi.purchase_order_id
    JOIN order_fob f ON f.purchase_order_id = poi.purchase_order_id
    GROUP BY poi.code`).all<LandedRow>();
  return rows.results;
}

async function readPrices() {
  if (!(await tableExists("inventory"))) return Response.json({ prices: [] });
  const [manual, landed] = await Promise.all([
    env.DB.prepare(`SELECT i.code, p.cost_tax_cents, p.retail_cents, p.corporate_cents
      FROM inventory i LEFT JOIN product_prices p ON p.code = i.code ORDER BY i.code`).all<PriceRow>(),
    landedCosts(),
  ]);
  const landedByCode = new Map(landed.map((row) => [row.code, row]));
  return Response.json({
    prices: manual.results.map((row) => {
      const cost = landedByCode.get(row.code);
      const units = Number(cost?.cost_units ?? 0);
      return {
        ...row,
        landed_cost_cents: units > 0 ? Math.round(Number(cost?.landed_total_cents ?? 0) / units) : null,
        cost_units: units,
        units_without_rate: Number(cost?.units_without_rate ?? 0),
      };
    }),
  });
}

/**
 * Valor em reais → centavos. Vazio vira `null`; formato inválido vira `undefined`.
 * Aceita "1.234,56", "1234,56", "1234.56", "1.234" (milhar) e "R$ 1.234,56".
 */
function brlCents(value: unknown): number | null | undefined {
  const raw = String(value ?? "").replace(/R\$|\s/g, "");
  if (!raw) return null;
  let normalized: string;
  if (raw.includes(",") && raw.includes(".")) {
    // O último separador é o decimal.
    normalized = raw.lastIndexOf(",") > raw.lastIndexOf(".")
      ? raw.replace(/\./g, "").replace(",", ".")
      : raw.replace(/,/g, "");
  } else if (raw.includes(",")) {
    normalized = raw.replace(",", ".");
  } else {
    normalized = /^\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw;
  }
  if (!/^\d+(\.\d{1,2})?$/.test(normalized)) return undefined;
  const cents = Math.round(Number(normalized) * 100);
  return Number.isSafeInteger(cents) ? cents : undefined;
}

export async function GET() {
  await ensurePricesTable();
  return readPrices();
}

export async function POST(request: Request) {
  await ensurePricesTable();
  const payload = await request.json() as Record<string, unknown>;
  const entries = Array.isArray(payload.prices) ? payload.prices as Array<Record<string, unknown>> : [];
  if (!entries.length) return Response.json({ error: "Informe ao menos um preço." }, { status: 400 });

  const statements: D1PreparedStatement[] = [];
  for (const entry of entries) {
    const code = String(entry.code ?? "").trim().toUpperCase();
    const costTax = brlCents(entry.costTax);
    const retail = brlCents(entry.retail);
    const corporate = brlCents(entry.corporate);
    if (!code) return Response.json({ error: "Produto inválido." }, { status: 400 });
    if (costTax === undefined || retail === undefined || corporate === undefined) {
      return Response.json({ error: `${code}: use valores em reais, como 1.234,56.` }, { status: 400 });
    }
    statements.push(env.DB.prepare(`INSERT INTO product_prices (code, cost_tax_cents, retail_cents, corporate_cents, updated_at)
      VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(code) DO UPDATE SET cost_tax_cents = excluded.cost_tax_cents, retail_cents = excluded.retail_cents,
        corporate_cents = excluded.corporate_cents, updated_at = CURRENT_TIMESTAMP`)
      .bind(code, costTax, retail, corporate));
  }
  await env.DB.batch(statements);
  return readPrices();
}

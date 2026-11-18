"use client";

import { useMemo, useState } from "react";

type ValueKey = "costNet" | "costTax" | "retail" | "corporate";
type DashboardView = "gh" | "china" | "exit";

type InventoryItem = {
  code: string;
  description: string;
  finish: string;
  china?: number;
  transit?: number;
  port?: number;
  gh: number;
  returns: number;
  ghCommitted: number;
};

type LogisticsEventItem = {
  id: number;
  type: "exit" | "adjustment";
  code: string;
  quantity: number;
  invoice_number: string | null;
  order_number: string | null;
  created_at: string;
};

/** Total acumulado de saídas por produto, calculado pela API sobre todos os eventos (não só os 100 últimos). */
export type ExitSummaryItem = {
  code: string;
  quantity: number;
  count: number;
  last_invoice: string | null;
};

type PriceReference = {
  code: string;
  label: string;
  costNet: number;
  costTax: number;
  retail: number;
  corporate: number;
};

const priceReferences: Record<string, Omit<PriceReference, "code">> = {
  CD0100: { label: "Cadeira", costNet: 100, costTax: 180, retail: 500, corporate: 480 },
  MJ0100: { label: "Mesa", costNet: 150, costTax: 210, retail: 800, corporate: 780 },
  SF0100: { label: "Sofá", costNet: 300, costTax: 420, retail: 1000, corporate: 990 },
};

const valueOptions: Array<{ key: ValueKey; label: string; tag: string }> = [
  { key: "costNet", label: "Custo sem imposto", tag: "CUSTO LÍQ." },
  { key: "costTax", label: "Custo com imposto", tag: "C/ IMPOSTO" },
  { key: "retail", label: "Venda lojista", tag: "VAREJO" },
  { key: "corporate", label: "Venda corporativa", tag: "CORP." },
];

const dashboardTabs: Array<{
  key: DashboardView;
  label: string;
  title: string;
  subtitle: string;
  baseLabel: string;
  formula: string;
}> = [
  {
    key: "gh",
    label: "Estoque GH",
    title: "Dashboard · Estoque GH",
    subtitle: "Valorização financeira do estoque disponível no GH somado ao saldo de devolução.",
    baseLabel: "unidades disponíveis (GH + Devolução)",
    formula: "(Estoque GH − Empenhos) + Estoque Devolução",
  },
  {
    key: "china",
    label: "Estoque China",
    title: "Dashboard · Estoque China",
    subtitle: "Valorização financeira e posição dos produtos armazenados no Estoque China.",
    baseLabel: "unidades no Estoque China",
    formula: "Saldo disponível no Estoque China × Valor unitário",
  },
  {
    key: "exit",
    label: "Saída",
    title: "Dashboard · Saída",
    subtitle: "Valorização financeira e volume acumulado das saídas expedidas pela Logística.",
    baseLabel: "unidades expedidas em saídas",
    formula: "Total de unidades baixadas por NF na Logística × Valor unitário",
  },
];

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const unitMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

export default function ValuationDashboard({
  items,
  logisticsEvents = [],
  exitSummary,
  syncedLabel = "Carregando saldos…",
}: {
  items: InventoryItem[];
  logisticsEvents?: LogisticsEventItem[];
  exitSummary?: ExitSummaryItem[];
  syncedLabel?: string;
}) {
  const [dashboardTab, setDashboardTab] = useState<DashboardView>("gh");
  const [productFilter, setProductFilter] = useState("all");
  const [rankingBy, setRankingBy] = useState<ValueKey>("retail");

  const exitStatsByCode = useMemo(() => {
    const map = new Map<string, { quantity: number; count: number; lastInvoice: string | null }>();
    if (exitSummary?.length) {
      for (const entry of exitSummary) {
        map.set(entry.code, { quantity: Number(entry.quantity), count: Number(entry.count), lastInvoice: entry.last_invoice });
      }
      return map;
    }
    for (const event of logisticsEvents) {
      if (event.type !== "exit") continue;
      const current = map.get(event.code) ?? { quantity: 0, count: 0, lastInvoice: null };
      current.quantity += event.quantity;
      current.count += 1;
      if (!current.lastInvoice && event.invoice_number) {
        current.lastInvoice = event.invoice_number;
      }
      map.set(event.code, current);
    }
    return map;
  }, [logisticsEvents, exitSummary]);

  const products = useMemo(() => items.map((inventory) => {
    const genericPrice = !priceReferences[inventory.code];
    const reference = priceReferences[inventory.code] ?? {
      label: inventory.description,
      costNet: 120,
      costTax: 190,
      retail: 550,
      corporate: 520,
    };
    const ghAvailable = Math.max((inventory.gh ?? 0) - (inventory.ghCommitted ?? 0), 0);
    const ghCommitted = inventory.ghCommitted ?? 0;
    const returns = inventory.returns ?? 0;
    const china = inventory.china ?? 0;
    const transit = inventory.transit ?? 0;
    const port = inventory.port ?? 0;
    const exitStats = exitStatsByCode.get(inventory.code) ?? { quantity: 0, count: 0, lastInvoice: null };

    const quantityByTab: Record<DashboardView, number> = {
      gh: ghAvailable + returns,
      china,
      exit: exitStats.quantity,
    };

    const detailByTab: Record<DashboardView, string> = {
      gh: `${ghAvailable} GH disponível + ${returns} devolução${ghCommitted > 0 ? ` (${ghCommitted} empenhado)` : ""}`,
      china: `${china} no armazém China · ${transit} em trânsito · ${port} no porto`,
      exit: `${exitStats.count} ${exitStats.count === 1 ? "saída registrada" : "saídas registradas"}${exitStats.lastInvoice ? ` · Última NF: ${exitStats.lastInvoice}` : ""}`,
    };

    return {
      code: inventory.code,
      genericPrice,
      ...reference,
      ghAvailable,
      returns,
      china,
      transit,
      port,
      exitQuantity: exitStats.quantity,
      quantity: quantityByTab[dashboardTab],
      detail: detailByTab[dashboardTab],
    };
  }), [items, exitStatsByCode, dashboardTab]);

  const tabUnitTotals = useMemo(() => ({
    gh: items.reduce((sum, item) => sum + Math.max((item.gh ?? 0) - (item.ghCommitted ?? 0), 0) + (item.returns ?? 0), 0),
    china: items.reduce((sum, item) => sum + (item.china ?? 0), 0),
    exit: [...exitStatsByCode.values()].reduce((sum, stat) => sum + stat.quantity, 0),
  }), [items, exitStatsByCode]);

  const activeConfig = dashboardTabs.find((tab) => tab.key === dashboardTab) ?? dashboardTabs[0];
  // Produtos sem unidades nesta visão não entram no ranking, na contagem de SKUs nem no filtro.
  const activeProducts = products.filter((product) => product.quantity > 0);
  const filterOptions = productFilter === "all" || activeProducts.some((product) => product.code === productFilter)
    ? activeProducts
    : [...activeProducts, ...products.filter((product) => product.code === productFilter)];
  const visibleProducts = productFilter === "all" ? activeProducts : products.filter((product) => product.code === productFilter);
  const emptyMessage: Record<DashboardView, { title: string; hint: string }> = {
    gh: { title: "Nenhuma unidade disponível no Estoque GH", hint: "O saldo aparece aqui quando um embarque chega ao GH ou uma devolução é registrada." },
    china: { title: "Nenhuma unidade no Estoque China", hint: "O saldo aparece aqui quando um pedido de compra deixa itens retidos no armazém da China." },
    exit: { title: "Nenhuma saída registrada", hint: "As baixas por NF feitas na Logística aparecem aqui." },
  };
  const selectedUnits = visibleProducts.reduce((sum, product) => sum + product.quantity, 0);
  const totals = Object.fromEntries(valueOptions.map(({ key }) => [
    key,
    visibleProducts.reduce((sum, product) => sum + product.quantity * product[key], 0),
  ])) as Record<ValueKey, number>;
  const ranking = [...visibleProducts].sort((a, b) => b.quantity * b[rankingBy] - a.quantity * a[rankingBy]);
  const maxRanking = Math.max(...ranking.map((product) => product.quantity * product[rankingBy]), 1);
  const totalSelectedRankingValue = Math.max(totals[rankingBy], 1);
  const rankingLabel = valueOptions.find((option) => option.key === rankingBy)?.label;

  return (
    <>
      <div className="page-heading valuation-heading">
        <div>
          <h1>{activeConfig.title}</h1>
          <p className="subtitle">{activeConfig.subtitle}</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div
            className="allocation-tabs"
            role="tablist"
            aria-label="Selecionar dashboard"
          >
            {dashboardTabs.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={dashboardTab === tab.key}
                className={dashboardTab === tab.key ? "active" : ""}
                onClick={() => setDashboardTab(tab.key)}
              >
                {tab.label} ({tabUnitTotals[tab.key]})
              </button>
            ))}
          </div>
          <span className="updated"><span className="status-dot" aria-hidden="true" />{syncedLabel}</span>
        </div>
      </div>

      <section className="valuation-filter" aria-label="Filtros do dashboard">
        <label>
          <span>Produto</span>
          <select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
            <option value="all">Todos os produtos</option>
            {filterOptions.map((product) => (
              <option key={product.code} value={product.code}>{product.code} · {product.label}</option>
            ))}
          </select>
        </label>
        <div><span>SKUs com saldo</span><strong>{visibleProducts.filter((product) => product.quantity > 0).length}</strong></div>
        <div><span>Unidades consideradas</span><strong>{selectedUnits}</strong></div>
        {productFilter !== "all" && <button type="button" onClick={() => setProductFilter("all")}>Limpar filtro</button>}
      </section>

      <p className="valuation-notice" role="note">
        <span className="valuation-notice-tag">Preços provisórios</span>
        Os valores usam uma tabela de preços fixa no sistema, não o custo real de cada embarque. Use para ordem de grandeza até o cadastro de preços existir.
      </p>

      <section className="valuation-metrics" aria-label="Resumo de valorização">
        {valueOptions.map((option) => (
          <article key={option.key}>
            <header>
              <span>{option.label}</span>
              <span className="valuation-lens-tag">{option.tag}</span>
            </header>
            <strong>{money.format(totals[option.key])}</strong>
            <p>Base: {selectedUnits} {activeConfig.baseLabel}</p>
          </article>
        ))}
      </section>

      <section className="valuation-ranking" aria-labelledby="valuation-ranking-title">
        <header>
          <div>
            <h2 id="valuation-ranking-title">Ranking por valorização · {activeConfig.label}</h2>
          </div>
          <label>
            <span>Ordenar por</span>
            <select value={rankingBy} onChange={(event) => setRankingBy(event.target.value as ValueKey)}>
              {valueOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
            </select>
          </label>
        </header>
        <div className="valuation-ranking-list">
          {ranking.length === 0 && (
            <div className="empty-state" role="status">
              <strong>{emptyMessage[dashboardTab].title}</strong>
              <p>{emptyMessage[dashboardTab].hint}</p>
            </div>
          )}
          {ranking.map((product, index) => {
            const total = product.quantity * product[rankingBy];
            const ratio = Math.min(Math.max(total / maxRanking, 0), 1);
            const share = totals[rankingBy] > 0 ? Math.round((total / totalSelectedRankingValue) * 100) : 0;
            return (
              <div className="valuation-ranking-row" key={product.code}>
                <span className="valuation-position">#{String(index + 1).padStart(2, "0")}</span>
                <div className="valuation-product">
                  <strong>{product.label}</strong>
                  <span>{product.code} · {product.quantity} un. ({share}% do total)</span>
                  <small>{product.detail}</small>
                </div>
                <div className="valuation-bar">
                  <span style={{ transform: `scaleX(${ratio})` }} />
                </div>
                <div className="valuation-total">
                  <strong>{money.format(total)}</strong>
                  <span>{unitMoney.format(product[rankingBy])} / un.{product.genericPrice ? " · preço genérico" : ""}</span>
                </div>
              </div>
            );
          })}
        </div>
        <footer>
          Classificação ativa: <strong>{rankingLabel}</strong>
          <span>Fórmula: {activeConfig.formula}</span>
        </footer>
      </section>
    </>
  );
}

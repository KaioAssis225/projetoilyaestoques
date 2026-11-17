"use client";

import { useMemo, useState } from "react";
import DemoOne from "@/components/ui/demo";

type ValueKey = "costNet" | "costTax" | "retail" | "corporate";

type InventoryItem = {
  code: string;
  description: string;
  finish: string;
  gh: number;
  returns: number;
  ghCommitted: number;
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

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const unitMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

export default function ValuationDashboard({ items }: { items: InventoryItem[] }) {
  const [dashboardTab, setDashboardTab] = useState<"valuation" | "bento">("valuation");
  const [productFilter, setProductFilter] = useState("all");
  const [rankingBy, setRankingBy] = useState<ValueKey>("retail");

  const products = useMemo(() => items.map((inventory) => {
    const reference = priceReferences[inventory.code] ?? {
      label: inventory.description,
      costNet: 120,
      costTax: 190,
      retail: 550,
      corporate: 520,
    };
    const ghAvailable = Math.max((inventory.gh ?? 0) - (inventory.ghCommitted ?? 0), 0);
    const returns = inventory.returns ?? 0;
    return {
      code: inventory.code,
      ...reference,
      ghAvailable,
      returns,
      quantity: ghAvailable + returns,
    };
  }), [items]);

  const visibleProducts = productFilter === "all" ? products : products.filter((product) => product.code === productFilter);
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
          <h1>Dashboard de Valorização</h1>
          <p className="subtitle">Valorização financeira do estoque disponível no GH somado ao saldo de devolução.</p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
          <div style={{ display: "inline-flex", background: "var(--surface-sunken)", padding: "3px", borderRadius: "10px", border: "1px solid var(--border-subtle)" }}>
            <button
              type="button"
              onClick={() => setDashboardTab("valuation")}
              style={{
                padding: "6px 14px",
                fontSize: "12px",
                fontWeight: 600,
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                background: dashboardTab === "valuation" ? "var(--surface-elevated)" : "transparent",
                color: dashboardTab === "valuation" ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow: dashboardTab === "valuation" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              Visão Financeira
            </button>
            <button
              type="button"
              onClick={() => setDashboardTab("bento")}
              style={{
                padding: "6px 14px",
                fontSize: "12px",
                fontWeight: 600,
                borderRadius: "8px",
                border: "none",
                cursor: "pointer",
                background: dashboardTab === "bento" ? "var(--surface-elevated)" : "transparent",
                color: dashboardTab === "bento" ? "var(--text-primary)" : "var(--text-muted)",
                boxShadow: dashboardTab === "bento" ? "0 1px 3px rgba(0,0,0,0.1)" : "none",
                transition: "all 0.15s ease",
              }}
            >
              ⚡ Bento Grid / Features
            </button>
          </div>
          <span className="updated"><span className="status-dot" aria-hidden="true" />Atualizado em tempo real</span>
        </div>
      </div>

      {dashboardTab === "bento" ? (
        <div className="rounded-2xl overflow-hidden border border-zinc-800 my-4">
          <DemoOne />
        </div>
      ) : (
        <>
          <section className="valuation-filter" aria-label="Filtros do dashboard">
            <label>
              <span>Produto</span>
              <select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}>
                <option value="all">Todos os produtos</option>
                {products.map((product) => (
                  <option key={product.code} value={product.code}>{product.code} · {product.label}</option>
                ))}
              </select>
            </label>
            <div><span>SKUs ativos</span><strong>{visibleProducts.length}</strong></div>
            <div><span>Unidades consideradas</span><strong>{selectedUnits}</strong></div>
            {productFilter !== "all" && <button type="button" onClick={() => setProductFilter("all")}>Limpar filtro</button>}
          </section>

          <section className="valuation-metrics" aria-label="Resumo de valorização">
            {valueOptions.map((option) => (
              <article key={option.key}>
                <header>
                  <span>{option.label}</span>
                  <span className="valuation-lens-tag">{option.tag}</span>
                </header>
                <strong>{money.format(totals[option.key])}</strong>
                <p>Base: {selectedUnits} unidades disponíveis (GH + Devolução)</p>
              </article>
            ))}
          </section>

          <section className="valuation-ranking" aria-labelledby="valuation-ranking-title">
            <header>
              <div>
                <h2 id="valuation-ranking-title">Ranking por valorização</h2>
              </div>
              <label>
                <span>Ordenar por</span>
                <select value={rankingBy} onChange={(event) => setRankingBy(event.target.value as ValueKey)}>
                  {valueOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}
                </select>
              </label>
            </header>
            <div className="valuation-ranking-list">
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
                      <small>{product.ghAvailable} GH disponível + {product.returns} devolução</small>
                    </div>
                    <div className="valuation-bar">
                      <span style={{ transform: `scaleX(${ratio})` }} />
                    </div>
                    <div className="valuation-total">
                      <strong>{money.format(total)}</strong>
                      <span>{unitMoney.format(product[rankingBy])} / un.</span>
                    </div>
                  </div>
                );
              })}
            </div>
            <footer>
              Classificação ativa: <strong>{rankingLabel}</strong>
              <span>Fórmula: (Estoque GH − Empenhos) + Estoque Devolução</span>
            </footer>
          </section>
        </>
      )}
    </>
  );
}

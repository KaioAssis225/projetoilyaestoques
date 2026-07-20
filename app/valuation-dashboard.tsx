"use client";

import { useMemo, useState } from "react";

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

const priceReferences: PriceReference[] = [
  { code: "CD0100", label: "Cadeira Taupe", costNet: 100, costTax: 180, retail: 500, corporate: 480 },
  { code: "MJ0100", label: "Mesa Rose", costNet: 150, costTax: 210, retail: 800, corporate: 780 },
  { code: "SF0100", label: "Sofá Areia", costNet: 300, costTax: 420, retail: 1000, corporate: 990 },
];

const valueOptions: Array<{ key: ValueKey; label: string }> = [
  { key: "costNet", label: "Custo sem imposto" },
  { key: "costTax", label: "Custo com imposto" },
  { key: "retail", label: "Venda lojista" },
  { key: "corporate", label: "Venda corporativa" },
];

const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 });
const unitMoney = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL", minimumFractionDigits: 2 });

export default function ValuationDashboard({ items }: { items: InventoryItem[] }) {
  const [productFilter, setProductFilter] = useState("all");
  const [rankingBy, setRankingBy] = useState<ValueKey>("retail");

  const products = useMemo(() => priceReferences.map((reference) => {
    const inventory = items.find((item) => item.code === reference.code);
    const ghAvailable = Math.max((inventory?.gh ?? 0) - (inventory?.ghCommitted ?? 0), 0);
    const returns = inventory?.returns ?? 0;
    return { ...reference, ghAvailable, returns, quantity: ghAvailable + returns };
  }), [items]);

  const visibleProducts = productFilter === "all" ? products : products.filter((product) => product.code === productFilter);
  const selectedUnits = visibleProducts.reduce((sum, product) => sum + product.quantity, 0);
  const totals = Object.fromEntries(valueOptions.map(({ key }) => [
    key,
    visibleProducts.reduce((sum, product) => sum + product.quantity * product[key], 0),
  ])) as Record<ValueKey, number>;
  const ranking = [...visibleProducts].sort((a, b) => b.quantity * b[rankingBy] - a.quantity * a[rankingBy]);
  const maxRanking = Math.max(...ranking.map((product) => product.quantity * product[rankingBy]), 1);
  const rankingLabel = valueOptions.find((option) => option.key === rankingBy)?.label;

  return <>
    <div className="page-heading valuation-heading">
      <div><p className="context">Visão geral</p><h1>Dashboard</h1><p className="subtitle">Valorização do estoque disponível no GH e em devolução.</p></div>
      <span className="updated">Atualizado agora</span>
    </div>

    <section className="valuation-filter" aria-label="Filtros do dashboard">
      <label><span>Produto</span><select value={productFilter} onChange={(event) => setProductFilter(event.target.value)}><option value="all">Todos os produtos</option>{products.map((product) => <option key={product.code} value={product.code}>{product.code} · {product.label}</option>)}</select></label>
      <div><span>Itens selecionados</span><strong>{visibleProducts.length}</strong></div>
      <div><span>Unidades disponíveis</span><strong>{selectedUnits}</strong></div>
      {productFilter !== "all" && <button type="button" onClick={() => setProductFilter("all")}>Limpar filtro</button>}
    </section>

    <section className="valuation-metrics" aria-label="Resumo de valorização">
      {valueOptions.map((option, index) => <article key={option.key}><header><span>{option.label}</span><small>0{index + 1}</small></header><strong>{money.format(totals[option.key])}</strong><p>Valor total para {selectedUnits} unidades disponíveis</p></article>)}
    </section>

    <section className="valuation-ranking" aria-labelledby="valuation-ranking-title">
      <header><div><p className="valuation-kicker">COMPARATIVO</p><h2 id="valuation-ranking-title">Ranking por valorização</h2></div><label><span>Ordenar por</span><select value={rankingBy} onChange={(event) => setRankingBy(event.target.value as ValueKey)}>{valueOptions.map((option) => <option key={option.key} value={option.key}>{option.label}</option>)}</select></label></header>
      <div className="valuation-ranking-list">{ranking.map((product, index) => {
        const total = product.quantity * product[rankingBy];
        return <div className="valuation-ranking-row" key={product.code}><span className="valuation-position">{String(index + 1).padStart(2, "0")}</span><div className="valuation-product"><strong>{product.label}</strong><span>{product.code} · {product.quantity} disponíveis</span><small>{product.ghAvailable} GH + {product.returns} devolução</small></div><div className="valuation-bar"><span style={{ width: `${total / maxRanking * 100}%` }} /></div><div className="valuation-total"><strong>{money.format(total)}</strong><span>{unitMoney.format(product[rankingBy])} / un.</span></div></div>;
      })}</div>
      <footer>Classificação atual: <strong>{rankingLabel}</strong><span>Quantidade = GH disponível + devolução</span></footer>
    </section>
  </>;
}

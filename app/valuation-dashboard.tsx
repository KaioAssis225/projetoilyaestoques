"use client";

import { FormEvent, useMemo, useState } from "react";

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

/**
 * Preço por SKU vindo de /api/prices, em centavos de R$ (`null` = sem preço).
 * `landed_cost_cents` é calculado das compras: (FOB + frete rateado) × câmbio.
 */
export type ProductPrice = {
  code: string;
  landed_cost_cents: number | null;
  cost_units: number;
  units_without_rate: number;
  cost_tax_cents: number | null;
  retail_cents: number | null;
  corporate_cents: number | null;
};

export type PriceDraft = { code: string; costTax: string; retail: string; corporate: string };

const valueOptions: Array<{ key: ValueKey; label: string; tag: string; missing: string }> = [
  { key: "costNet", label: "Custo sem imposto", tag: "FOB + FRETE", missing: "sem compra com câmbio" },
  { key: "costTax", label: "Custo com imposto", tag: "C/ IMPOSTO", missing: "sem custo com imposto cadastrado" },
  { key: "retail", label: "Venda lojista", tag: "VAREJO", missing: "sem preço lojista cadastrado" },
  { key: "corporate", label: "Venda corporativa", tag: "CORP.", missing: "sem preço corporativo cadastrado" },
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
const plainMoney = new Intl.NumberFormat("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const centsToReais = (cents: number | null | undefined) => (cents === null || cents === undefined ? null : cents / 100);
const centsToInput = (cents: number | null | undefined) => (cents === null || cents === undefined ? "" : plainMoney.format(cents / 100));

export default function ValuationDashboard({
  items,
  logisticsEvents = [],
  exitSummary,
  prices = [],
  onSavePrices,
  syncedLabel = "Carregando saldos…",
}: {
  items: InventoryItem[];
  logisticsEvents?: LogisticsEventItem[];
  exitSummary?: ExitSummaryItem[];
  prices?: ProductPrice[];
  /** Grava os preços alterados; deve lançar um erro com mensagem legível se falhar. */
  onSavePrices?: (drafts: PriceDraft[]) => Promise<void>;
  syncedLabel?: string;
}) {
  const [dashboardTab, setDashboardTab] = useState<DashboardView>("gh");
  const [productFilter, setProductFilter] = useState("all");
  const [rankingBy, setRankingBy] = useState<ValueKey>("retail");
  const [priceEditorOpen, setPriceEditorOpen] = useState(false);
  const [priceDrafts, setPriceDrafts] = useState<Record<string, PriceDraft>>({});
  const [priceError, setPriceError] = useState("");
  const [savingPrices, setSavingPrices] = useState(false);

  const pricesByCode = useMemo(() => new Map(prices.map((price) => [price.code, price])), [prices]);

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
    const price = pricesByCode.get(inventory.code);
    // Valores unitários em R$; null quando o SKU ainda não tem esse preço.
    const unitValues: Record<ValueKey, number | null> = {
      costNet: centsToReais(price?.landed_cost_cents),
      costTax: centsToReais(price?.cost_tax_cents),
      retail: centsToReais(price?.retail_cents),
      corporate: centsToReais(price?.corporate_cents),
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
      label: inventory.description,
      unitValues,
      quantity: quantityByTab[dashboardTab],
      detail: detailByTab[dashboardTab],
    };
  }), [items, exitStatsByCode, dashboardTab, pricesByCode]);

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
  const pricedProducts = visibleProducts.filter((product) => product.quantity > 0);
  const totals = Object.fromEntries(valueOptions.map(({ key }) => [
    key,
    pricedProducts.reduce((sum, product) => sum + product.quantity * (product.unitValues[key] ?? 0), 0),
  ])) as Record<ValueKey, number>;
  const missingByKey = Object.fromEntries(valueOptions.map(({ key }) => [
    key,
    pricedProducts.filter((product) => product.unitValues[key] === null).length,
  ])) as Record<ValueKey, number>;
  const lineTotal = (product: (typeof products)[number]) => product.quantity * (product.unitValues[rankingBy] ?? 0);
  const ranking = [...visibleProducts].sort((a, b) => lineTotal(b) - lineTotal(a));
  const maxRanking = Math.max(...ranking.map(lineTotal), 1);
  const totalSelectedRankingValue = Math.max(totals[rankingBy], 1);
  const rankingLabel = valueOptions.find((option) => option.key === rankingBy)?.label;

  // Editor: produtos com saldo em qualquer etapa primeiro, depois o resto do catálogo.
  const editorRows = useMemo(() => {
    const withStock = (item: InventoryItem) => (item.china ?? 0) + (item.transit ?? 0) + (item.port ?? 0) + item.gh + item.returns > 0;
    return [...items].sort((a, b) => Number(withStock(b)) - Number(withStock(a)) || a.code.localeCompare(b.code));
  }, [items]);

  function openPriceEditor() {
    setPriceDrafts(Object.fromEntries(items.map((item) => {
      const price = pricesByCode.get(item.code);
      return [item.code, {
        code: item.code,
        costTax: centsToInput(price?.cost_tax_cents),
        retail: centsToInput(price?.retail_cents),
        corporate: centsToInput(price?.corporate_cents),
      }];
    })));
    setPriceError("");
    setPriceEditorOpen(true);
  }

  function updateDraft(code: string, field: keyof Omit<PriceDraft, "code">, value: string) {
    setPriceDrafts((current) => ({ ...current, [code]: { ...current[code], [field]: value } }));
    setPriceError("");
  }

  async function submitPrices(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!onSavePrices || savingPrices) return;
    const changed = Object.values(priceDrafts).filter((draft) => {
      const price = pricesByCode.get(draft.code);
      return draft.costTax !== centsToInput(price?.cost_tax_cents)
        || draft.retail !== centsToInput(price?.retail_cents)
        || draft.corporate !== centsToInput(price?.corporate_cents);
    });
    if (!changed.length) {
      setPriceEditorOpen(false);
      return;
    }
    setSavingPrices(true);
    try {
      await onSavePrices(changed);
      setPriceEditorOpen(false);
    } catch (error) {
      setPriceError(error instanceof Error ? error.message : "Não foi possível salvar os preços.");
    } finally {
      setSavingPrices(false);
    }
  }

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
        <div><span>SKUs com saldo</span><strong>{pricedProducts.length}</strong></div>
        <div><span>Unidades consideradas</span><strong>{selectedUnits}</strong></div>
        {productFilter !== "all" && <button type="button" onClick={() => setProductFilter("all")}>Limpar filtro</button>}
        {onSavePrices && <button type="button" className="valuation-edit-prices" onClick={openPriceEditor}>Editar preços</button>}
      </section>

      <section className="valuation-metrics" aria-label="Resumo de valorização">
        {valueOptions.map((option) => (
          <article key={option.key}>
            <header>
              <span>{option.label}</span>
              <span className="valuation-lens-tag">{option.tag}</span>
            </header>
            <strong>{money.format(totals[option.key])}</strong>
            <p>Base: {selectedUnits} {activeConfig.baseLabel}</p>
            {missingByKey[option.key] > 0 && (
              <p className="valuation-missing">
                {missingByKey[option.key]} {missingByKey[option.key] === 1 ? "SKU" : "SKUs"} {option.missing}, fora do total
              </p>
            )}
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
            const unitValue = product.unitValues[rankingBy];
            const total = lineTotal(product);
            const ratio = Math.min(Math.max(total / maxRanking, 0), 1);
            const share = totals[rankingBy] > 0 ? Math.round((total / totalSelectedRankingValue) * 100) : 0;
            return (
              <div className="valuation-ranking-row" key={product.code}>
                <span className="valuation-position">#{String(index + 1).padStart(2, "0")}</span>
                <div className="valuation-product">
                  <strong>{product.label}</strong>
                  <span>{product.code} · {product.quantity} un.{unitValue === null ? "" : ` (${share}% do total)`}</span>
                  <small>{product.detail}</small>
                </div>
                <div className="valuation-bar">
                  <span style={{ transform: `scaleX(${ratio})` }} />
                </div>
                <div className="valuation-total">
                  {unitValue === null ? (
                    <>
                      <strong className="valuation-no-price">Sem preço</strong>
                      <span>{valueOptions.find((option) => option.key === rankingBy)?.missing}</span>
                    </>
                  ) : (
                    <>
                      <strong>{money.format(total)}</strong>
                      <span>{unitMoney.format(unitValue)} / un.</span>
                    </>
                  )}
                </div>
              </div>
            );
          })}
        </div>
        <footer>
          Classificação ativa: <strong>{rankingLabel}</strong>
          <span>Fórmula: {activeConfig.formula} · Custo sem imposto = (FOB + frete rateado) × câmbio das compras</span>
        </footer>
      </section>

      {priceEditorOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section className="commitment-dialog price-dialog" role="dialog" aria-modal="true" aria-labelledby="price-editor-title">
            <div className="dialog-heading">
              <div>
                <h2 id="price-editor-title">Preços por produto</h2>
                <p className="price-dialog-intro">O custo sem imposto é calculado das compras (FOB + frete rateado × câmbio). Preencha os demais em reais; deixe vazio quando ainda não houver preço.</p>
              </div>
              <button className="close-button" type="button" onClick={() => setPriceEditorOpen(false)} aria-label="Fechar">×</button>
            </div>
            <form onSubmit={submitPrices}>
              <div className="price-table-wrap">
                <table className="price-table">
                  <thead>
                    <tr>
                      <th>Produto</th>
                      <th className="numeric">Custo s/ imposto</th>
                      <th className="numeric">Custo c/ imposto</th>
                      <th className="numeric">Venda lojista</th>
                      <th className="numeric">Venda corporativa</th>
                    </tr>
                  </thead>
                  <tbody>
                    {editorRows.map((item) => {
                      const price = pricesByCode.get(item.code);
                      const draft = priceDrafts[item.code];
                      if (!draft) return null;
                      return (
                        <tr key={item.code}>
                          <td>
                            <span className="item-code">{item.code}</span>
                            <span className="price-product-name">{item.description}</span>
                          </td>
                          <td className="numeric">
                            {price?.landed_cost_cents !== null && price?.landed_cost_cents !== undefined ? (
                              <span className="price-computed" title={`Média de ${price.cost_units} un. compradas`}>{unitMoney.format(price.landed_cost_cents / 100)}</span>
                            ) : (
                              <span className="price-computed muted">Sem compra com câmbio</span>
                            )}
                            {price && price.units_without_rate > 0 && (
                              <span className="price-warning">{price.units_without_rate} un. sem câmbio fora da média</span>
                            )}
                          </td>
                          {(["costTax", "retail", "corporate"] as const).map((field) => (
                            <td className="numeric" key={field}>
                              <input
                                className="price-input"
                                inputMode="decimal"
                                placeholder="—"
                                aria-label={`${valueOptions.find((option) => option.key === field)?.label} de ${item.code}`}
                                value={draft[field]}
                                onChange={(event) => updateDraft(item.code, field, event.target.value)}
                              />
                            </td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {priceError && <p className="form-error" role="alert">{priceError}</p>}
              <div className="dialog-actions">
                <button className="secondary-button" type="button" onClick={() => setPriceEditorOpen(false)}>Cancelar</button>
                <button className="primary-button" type="submit" disabled={savingPrices}>Salvar preços</button>
              </div>
            </form>
          </section>
        </div>
      )}
    </>
  );
}

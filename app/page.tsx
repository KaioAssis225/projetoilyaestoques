"use client";

import { useMemo, useState } from "react";

type StockItem = {
  code: string;
  description: string;
  finish: string;
  china: number;
  transit: number;
  port: number;
  gh: number;
  committed: number;
};

const items: StockItem[] = [
  { code: "CD0100", description: "Cadeira", finish: "Taupe", china: 30, transit: 10, port: 0, gh: 20, committed: 20 },
  { code: "SF0100", description: "Sofá", finish: "Areia", china: 0, transit: 50, port: 0, gh: 50, committed: 50 },
  { code: "MJ0100", description: "Mesa", finish: "Rose", china: 80, transit: 0, port: 30, gh: 0, committed: 50 },
];

type SortKey = keyof Pick<StockItem, "code" | "description" | "finish" | "china" | "transit" | "port" | "gh" | "committed">;

const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "code", label: "Código do item" },
  { key: "description", label: "Descrição" },
  { key: "finish", label: "Acabamento" },
  { key: "china", label: "Estoque China", numeric: true },
  { key: "transit", label: "Em trânsito", numeric: true },
  { key: "port", label: "Porto", numeric: true },
  { key: "gh", label: "Estoque GH", numeric: true },
  { key: "committed", label: "Empenhado", numeric: true },
];

export default function Home() {
  const [query, setQuery] = useState("");
  const [onlyCommitted, setOnlyCommitted] = useState(false);
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "code", direction: "asc" });

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return items
      .filter((item) => !onlyCommitted || item.committed > 0)
      .filter((item) => [item.code, item.description, item.finish].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalized)))
      .sort((a, b) => {
        const result = typeof a[sort.key] === "number"
          ? Number(a[sort.key]) - Number(b[sort.key])
          : String(a[sort.key]).localeCompare(String(b[sort.key]), "pt-BR");
        return sort.direction === "asc" ? result : -result;
      });
  }, [onlyCommitted, query, sort]);

  function changeSort(key: SortKey) {
    setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  }

  const totals = items.reduce(
    (sum, item) => ({ gh: sum.gh + item.gh, transit: sum.transit + item.transit, committed: sum.committed + item.committed }),
    { gh: 0, transit: 0, committed: 0 },
  );

  return (
    <main>
      <header className="topbar">
        <a className="brand" href="#conteudo" aria-label="Ilya Estoque — início">
          <span className="brand-mark" aria-hidden="true">I</span>
          <span>Ilya Estoque</span>
        </a>
        <div className="user-area">
          <span className="role">Comercial</span>
          <span className="avatar" aria-hidden="true">LU</span>
          <span className="user-name">Lucimara</span>
        </div>
      </header>

      <section className="workspace" id="conteudo">
        <div className="page-heading">
          <div>
            <p className="context">Visão geral</p>
            <h1>Estoque</h1>
            <p className="subtitle">Acompanhe a posição atual de cada item.</p>
          </div>
          <span className="updated">Atualizado agora</span>
        </div>

        <section className="summary" aria-label="Resumo do estoque">
          <div><span>Estoque GH</span><strong>{totals.gh}</strong><small>peças físicas</small></div>
          <div><span>Em trânsito</span><strong>{totals.transit}</strong><small>a caminho do Brasil</small></div>
          <div className="summary-committed"><span>Estoque empenhado</span><strong>{totals.committed}</strong><small>peças reservadas</small></div>
        </section>

        <section className="stock-panel" aria-labelledby="stock-table-title">
          <div className="toolbar">
            <div>
              <h2 id="stock-table-title">Posição por item</h2>
              <p>{visibleItems.length} {visibleItems.length === 1 ? "item encontrado" : "itens encontrados"}</p>
            </div>
            <div className="controls">
              <label className="search">
                <span className="sr-only">Pesquisar itens</span>
                <span aria-hidden="true">⌕</span>
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar código, descrição ou acabamento" />
                {query && <button type="button" onClick={() => setQuery("")} aria-label="Limpar pesquisa">×</button>}
              </label>
              <label className="toggle">
                <input type="checkbox" checked={onlyCommitted} onChange={(event) => setOnlyCommitted(event.target.checked)} />
                <span aria-hidden="true" />
                Somente empenhados
              </label>
            </div>
          </div>

          <div className="table-scroll">
            <table>
              <thead>
                <tr>
                  {columns.map((column) => (
                    <th key={column.key} className={column.numeric ? "numeric" : undefined} aria-sort={sort.key === column.key ? (sort.direction === "asc" ? "ascending" : "descending") : "none"}>
                      <button type="button" onClick={() => changeSort(column.key)}>
                        {column.label}
                        <span aria-hidden="true">{sort.key === column.key ? (sort.direction === "asc" ? "↑" : "↓") : ""}</span>
                      </button>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {visibleItems.map((item) => (
                  <tr key={item.code}>
                    <td><button className="item-code" type="button">{item.code}</button></td>
                    <td className="description">{item.description}</td>
                    <td><span className="finish">{item.finish}</span></td>
                    <td className="numeric">{item.china}</td>
                    <td className="numeric">{item.transit}</td>
                    <td className="numeric">{item.port}</td>
                    <td className="numeric strong-number">{item.gh}</td>
                    <td className="numeric"><span className={item.committed > 0 ? "committed" : "zero"}>{item.committed}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleItems.length === 0 && (
              <div className="empty-state" role="status">
                <strong>Nenhum item encontrado</strong>
                <p>Revise a busca ou remova o filtro de empenhados.</p>
                <button type="button" onClick={() => { setQuery(""); setOnlyCommitted(false); }}>Limpar filtros</button>
              </div>
            )}
          </div>
          <footer className="table-note"><span aria-hidden="true">●</span> Os saldos são atualizados automaticamente pelas movimentações.</footer>
        </section>
      </section>
    </main>
  );
}

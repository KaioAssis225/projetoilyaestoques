"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";

type StockItem = {
  code: string;
  description: string;
  finish: string;
  china: number;
  transit: number;
  port: number;
  gh: number;
  ghCommitted: number;
};

type Shipment = {
  id: number;
  code: string;
  quantity: number;
  source: string;
  stage: "transit" | "port";
  due_date: string;
};

type ForeignTradeData = {
  inventory: Array<Omit<StockItem, "ghCommitted">>;
  shipments: Shipment[];
  orders: Array<{
    id: number;
    code: string;
    total_quantity: number;
    china_quantity: number;
    transit_quantity: number;
    created_at: string;
  }>;
};

type LogisticsEvent = {
  id: number;
  type: "exit" | "adjustment";
  code: string;
  quantity: number;
  previous_quantity: number | null;
  new_quantity: number | null;
  invoice_number: string | null;
  order_number: string | null;
  street: string | null;
  column: string | null;
  level: string | null;
  note: string;
  created_at: string;
};

type Allocation = {
  id: number;
  code: string;
  description: string;
  finish: string;
  street: string;
  column: string;
  level: string;
  quantity: number;
  created_at: string;
};

type AllocationTask = {
  id: number;
  shipment_id: number | null;
  code: string;
  description: string;
  finish: string;
  quantity: number;
  allocated_quantity: number;
  status: string;
};

const initialItems: StockItem[] = [
  { code: "CD0100", description: "Cadeira", finish: "Taupe", china: 0, transit: 0, port: 0, gh: 0, ghCommitted: 0 },
  { code: "SF0100", description: "Sofá", finish: "Areia", china: 0, transit: 0, port: 0, gh: 0, ghCommitted: 0 },
  { code: "MJ0100", description: "Mesa", finish: "Rose", china: 0, transit: 0, port: 0, gh: 0, ghCommitted: 0 },
];

type SortKey = keyof Pick<StockItem, "code" | "description" | "finish" | "china" | "transit" | "port" | "gh">;

const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "code", label: "Código do item" },
  { key: "description", label: "Descrição" },
  { key: "finish", label: "Acabamento" },
  { key: "china", label: "Estoque China", numeric: true },
  { key: "transit", label: "Em trânsito", numeric: true },
  { key: "port", label: "Porto", numeric: true },
  { key: "gh", label: "Estoque GH", numeric: true },
];

function GhBalance({ total, committed }: { total: number; committed: number }) {
  return (
    <div className="stock-balance">
      <strong className="stock-total">{total}</strong>
      {committed > 0 && <span className="source-committed">{committed} empenho</span>}
      <span className="available">{Math.max(total - committed, 0)} disponível</span>
    </div>
  );
}

export default function Home() {
  const [activeSection, setActiveSection] = useState<"stock" | "commercial" | "foreign" | "logistics" | "allocation">("stock");
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "code", direction: "asc" });
  const [commitments, setCommitments] = useState<{ id: number; code: string; quantity: number; note: string }[]>([]);
  const [formOpen, setFormOpen] = useState(false);
  const [selectedCode, setSelectedCode] = useState(initialItems[0].code);
  const [quantity, setQuantity] = useState("");
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [foreignData, setForeignData] = useState<ForeignTradeData>({ inventory: [], shipments: [], orders: [] });
  const [foreignLoading, setForeignLoading] = useState(true);
  const [foreignError, setForeignError] = useState("");
  const [foreignForm, setForeignForm] = useState<"purchase" | "dispatch" | null>(null);
  const [foreignCode, setForeignCode] = useState(initialItems[0].code);
  const [totalQuantity, setTotalQuantity] = useState("");
  const [chinaQuantity, setChinaQuantity] = useState("");
  const [transitQuantity, setTransitQuantity] = useState("");
  const [movementQuantity, setMovementQuantity] = useState("");
  const [dueDate, setDueDate] = useState("");
  const [arrivalAction, setArrivalAction] = useState<{ shipment: Shipment; type: "arrived" | "delayed" } | null>(null);
  const [arrivalDate, setArrivalDate] = useState("");
  const [logisticsEvents, setLogisticsEvents] = useState<LogisticsEvent[]>([]);
  const [logisticsForm, setLogisticsForm] = useState<"exit" | "adjustment" | null>(null);
  const [logisticsCode, setLogisticsCode] = useState(initialItems[0].code);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [orderNumber, setOrderNumber] = useState("");
  const [logisticsQuantity, setLogisticsQuantity] = useState("");
  const [logisticsAllocationId, setLogisticsAllocationId] = useState("");
  const [adjustedQuantity, setAdjustedQuantity] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [logisticsError, setLogisticsError] = useState("");
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [allocationTasks, setAllocationTasks] = useState<AllocationTask[]>([]);
  const [selectedAllocationTask, setSelectedAllocationTask] = useState<number | null>(null);
  const [allocationFormOpen, setAllocationFormOpen] = useState(false);
  const [allocationCode, setAllocationCode] = useState(initialItems[0].code);
  const [street, setStreet] = useState("");
  const [allocationColumn, setAllocationColumn] = useState("");
  const [level, setLevel] = useState("");
  const [allocationQuantity, setAllocationQuantity] = useState("");
  const [allocationError, setAllocationError] = useState("");
  const [allocationSort, setAllocationSort] = useState<"asc" | "desc">("asc");

  const selectedItem = items.find((item) => item.code === selectedCode) ?? items[0];
  const selectedAvailable = Math.max(selectedItem.gh - selectedItem.ghCommitted, 0);
  const foreignItem = items.find((item) => item.code === foreignCode) ?? items[0];
  const logisticsItem = items.find((item) => item.code === logisticsCode) ?? items[0];
  const logisticsPositions = allocations.filter((allocation) => allocation.code === logisticsCode);
  const logisticsPosition = logisticsPositions.find((allocation) => allocation.id === Number(logisticsAllocationId));
  const allocationItem = items.find((item) => item.code === allocationCode) ?? items[0];
  const allocatedForItem = allocations
    .filter((allocation) => allocation.code === allocationCode)
    .reduce((total, allocation) => total + allocation.quantity, 0);
  const availableToAllocate = Math.max(allocationItem.gh - allocatedForItem, 0);
  const sortedAllocations = useMemo(
    () => [...allocations].sort((a, b) => {
      const codeResult = a.code.localeCompare(b.code, "pt-BR");
      if (codeResult !== 0) return allocationSort === "asc" ? codeResult : -codeResult;
      return a.street.localeCompare(b.street, "pt-BR", { numeric: true })
        || a.column.localeCompare(b.column, "pt-BR", { numeric: true })
        || a.level.localeCompare(b.level, "pt-BR", { numeric: true });
    }),
    [allocations, allocationSort],
  );
  const today = new Date().toISOString().slice(0, 10);

  async function refreshForeignTrade() {
    setForeignLoading(true);
    try {
      const response = await fetch("/api/foreign-trade");
      const data = await response.json() as ForeignTradeData & { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível carregar o Comércio Exterior.");
      setForeignData(data);
      setItems((current) => data.inventory.map((item) => ({
        ...item,
        ghCommitted: current.find((candidate) => candidate.code === item.code)?.ghCommitted ?? 0,
      })));
      setForeignError("");
    } catch (error) {
      setForeignError(error instanceof Error ? error.message : "Não foi possível carregar os dados.");
    } finally {
      setForeignLoading(false);
    }
  }

  async function refreshAllocations() {
    const response = await fetch("/api/allocations");
    const data = await response.json() as { allocations?: Allocation[]; tasks?: AllocationTask[] };
    setAllocations(data.allocations ?? []);
    setAllocationTasks(data.tasks ?? []);
  }

  useEffect(() => {
    // Initial API hydration intentionally updates the client-side workspace state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshForeignTrade();
    void fetch("/api/logistics").then(async (response) => {
      const data = await response.json() as { events?: LogisticsEvent[] };
      setLogisticsEvents(data.events ?? []);
    });
    void refreshAllocations();
  }, []);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return items
      .filter((item) => [item.code, item.description, item.finish].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalized)))
      .sort((a, b) => {
        const aValue = a[sort.key];
        const bValue = b[sort.key];
        const result = typeof aValue === "number"
          ? Number(aValue) - Number(bValue)
          : String(aValue).localeCompare(String(bValue), "pt-BR");
        return sort.direction === "asc" ? result : -result;
      });
  }, [items, query, sort]);

  function changeSort(key: SortKey) {
    setSort((current) => ({ key, direction: current.key === key && current.direction === "asc" ? "desc" : "asc" }));
  }

  function openCommitmentForm() {
    setSelectedCode(items.find((item) => item.gh - item.ghCommitted > 0)?.code ?? items[0].code);
    setQuantity("");
    setNote("");
    setFormError("");
    setFormOpen(true);
  }

  function submitCommitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requested = Number(quantity);
    if (!Number.isInteger(requested) || requested <= 0) {
      setFormError("Informe uma quantidade inteira maior que zero.");
      return;
    }
    if (requested > selectedAvailable) {
      setFormError(`Quantidade maior que o disponível. Há ${selectedAvailable} unidades disponíveis no Estoque GH.`);
      return;
    }
    if (!note.trim()) {
      setFormError("Informe o motivo ou para quem este item será empenhado.");
      return;
    }

    setItems((current) => current.map((item) => (
      item.code === selectedCode ? { ...item, ghCommitted: item.ghCommitted + requested } : item
    )));
    setCommitments((current) => [
      { id: Date.now(), code: selectedCode, quantity: requested, note: note.trim() },
      ...current,
    ]);
    setFormOpen(false);
  }

  function cancelCommitment(id: number) {
    const commitment = commitments.find((item) => item.id === id);
    if (!commitment || !window.confirm(`Cancelar o empenho de ${commitment.quantity} unidades do item ${commitment.code}?`)) {
      return;
    }

    setItems((current) => current.map((item) => (
      item.code === commitment.code
        ? { ...item, ghCommitted: Math.max(item.ghCommitted - commitment.quantity, 0) }
        : item
    )));
    setCommitments((current) => current.filter((item) => item.id !== id));
  }

  async function sendForeignAction(payload: Record<string, unknown>) {
    const response = await fetch("/api/foreign-trade", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload),
    });
    const data = await response.json() as ForeignTradeData & { error?: string };
    if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir a operação.");
    setForeignData(data);
    setItems((current) => data.inventory.map((item) => ({
      ...item,
      ghCommitted: current.find((candidate) => candidate.code === item.code)?.ghCommitted ?? 0,
    })));
    await refreshAllocations();
  }

  async function submitForeignForm(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      if (foreignForm === "purchase") {
        await sendForeignAction({
          action: "purchase",
          code: foreignCode,
          totalQuantity,
          chinaQuantity: chinaQuantity || 0,
          transitQuantity: transitQuantity || 0,
          dueDate,
        });
      } else {
        await sendForeignAction({
          action: "dispatch_china",
          code: foreignCode,
          quantity: movementQuantity,
          dueDate,
        });
      }
      setForeignForm(null);
      setForeignError("");
    } catch (error) {
      setForeignError(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    }
  }

  async function submitArrival(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!arrivalAction) return;
    try {
      await sendForeignAction({
        action: arrivalAction.type === "arrived" ? "confirm_arrival" : "reschedule",
        code: arrivalAction.shipment.code,
        shipmentId: arrivalAction.shipment.id,
        dueDate: arrivalDate,
      });
      setArrivalAction(null);
      setForeignError("");
    } catch (error) {
      setForeignError(error instanceof Error ? error.message : "Não foi possível concluir a operação.");
    }
  }

  async function submitLogistics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const requested = Number(logisticsQuantity);
    if (logisticsForm === "exit" && requested > logisticsItem.gh - logisticsItem.ghCommitted) {
      setLogisticsError(`A saída não pode consumir unidades empenhadas. Há ${Math.max(logisticsItem.gh - logisticsItem.ghCommitted, 0)} unidades disponíveis.`);
      return;
    }
    if (logisticsForm === "adjustment" && Number(adjustedQuantity) < logisticsItem.ghCommitted) {
      setLogisticsError(`O ajuste não pode deixar o estoque abaixo das ${logisticsItem.ghCommitted} unidades empenhadas.`);
      return;
    }
    try {
      const response = await fetch("/api/logistics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(logisticsForm === "exit" ? {
          action: "exit",
          code: logisticsCode,
          invoiceNumber,
          orderNumber,
          quantity: logisticsQuantity,
          allocationId: logisticsAllocationId,
        } : {
          action: "adjustment",
          code: logisticsCode,
          newQuantity: adjustedQuantity,
          note: adjustmentNote,
        }),
      });
      const data = await response.json() as {
        inventory?: Array<Omit<StockItem, "ghCommitted">>;
        events?: LogisticsEvent[];
        error?: string;
      };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir a movimentação.");
      setItems((current) => (data.inventory ?? []).map((item) => ({
        ...item,
        ghCommitted: current.find((candidate) => candidate.code === item.code)?.ghCommitted ?? 0,
      })));
      setLogisticsEvents(data.events ?? []);
      await refreshAllocations();
      setLogisticsForm(null);
      setLogisticsError("");
    } catch (error) {
      setLogisticsError(error instanceof Error ? error.message : "Não foi possível concluir a movimentação.");
    }
  }

  async function submitAllocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    try {
      const response = await fetch("/api/allocations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          code: allocationCode,
          street,
          column: allocationColumn,
          level,
          quantity: allocationQuantity,
          taskId: selectedAllocationTask,
        }),
      });
      const data = await response.json() as { allocations?: Allocation[]; tasks?: AllocationTask[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível alocar os produtos.");
      setAllocations(data.allocations ?? []);
      setAllocationTasks(data.tasks ?? []);
      setAllocationFormOpen(false);
      setSelectedAllocationTask(null);
      setAllocationError("");
    } catch (error) {
      setAllocationError(error instanceof Error ? error.message : "Não foi possível alocar os produtos.");
    }
  }

  return (
    <main className="app-shell">
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

      <aside className="sidebar" aria-label="Navegação principal">
        <p className="sidebar-label">Áreas</p>
        <button className={activeSection === "stock" ? "nav-item active" : "nav-item"} type="button" onClick={() => setActiveSection("stock")}>
          <span aria-hidden="true">▦</span>
          Estoque
        </button>
        <button className={activeSection === "commercial" ? "nav-item active" : "nav-item"} type="button" onClick={() => setActiveSection("commercial")}>
          <span aria-hidden="true">◎</span>
          Comercial
        </button>
        <button className={activeSection === "foreign" ? "nav-item active" : "nav-item"} type="button" onClick={() => setActiveSection("foreign")}>
          <span aria-hidden="true">⇄</span>
          Comércio Exterior
        </button>
        <button className={activeSection === "logistics" ? "nav-item active" : "nav-item"} type="button" onClick={() => setActiveSection("logistics")}>
          <span aria-hidden="true">⇥</span>
          Logística
        </button>
        <button className={activeSection === "allocation" ? "nav-item active" : "nav-item"} type="button" onClick={() => setActiveSection("allocation")}>
          <span aria-hidden="true">⌗</span>
          Alocação
        </button>
      </aside>

      <section className="workspace" id="conteudo">
        {activeSection === "stock" ? (
          <>
        <div className="page-heading">
          <div>
            <p className="context">Visão geral</p>
            <h1>Estoque</h1>
            <p className="subtitle">Acompanhe a posição atual de cada item.</p>
          </div>
          <span className="updated">Atualizado agora</span>
        </div>

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
                    <td className="numeric"><GhBalance total={item.gh} committed={item.ghCommitted} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleItems.length === 0 && (
              <div className="empty-state" role="status">
                <strong>Nenhum item encontrado</strong>
                <p>Revise o código, a descrição ou o acabamento pesquisado.</p>
                <button type="button" onClick={() => setQuery("")}>Limpar busca</button>
              </div>
            )}
          </div>
          <footer className="table-note"><span aria-hidden="true">●</span> Os saldos são atualizados automaticamente pelas movimentações.</footer>
        </section>
          </>
        ) : activeSection === "commercial" ? (
          <>
            <div className="page-heading commercial-heading">
              <div>
                <p className="context">Área Comercial</p>
                <h1>Empenhos</h1>
                <p className="subtitle">Reserve itens disponíveis no Estoque GH para demandas confirmadas.</p>
              </div>
              <button className="primary-button" type="button" onClick={openCommitmentForm}>+ Novo empenho</button>
            </div>

            <section className="commitment-panel" aria-labelledby="commitments-title">
              <div className="panel-heading">
                <div>
                  <h2 id="commitments-title">Empenhos realizados</h2>
                  <p>Registros criados nesta sessão.</p>
                </div>
              </div>
              {commitments.length > 0 ? (
                <div className="commitment-list">
                  {commitments.map((commitment) => {
                    const item = items.find((candidate) => candidate.code === commitment.code);
                    return (
                      <article className="commitment-row" key={commitment.id}>
                        <div>
                          <strong>{commitment.code}</strong>
                          <span>{item?.description} · {item?.finish}</span>
                        </div>
                        <p>{commitment.note}</p>
                        <div className="commitment-actions">
                          <span className="source-committed">{commitment.quantity} empenhado</span>
                          <button className="cancel-button" type="button" onClick={() => cancelCommitment(commitment.id)}>
                            Cancelar empenho
                          </button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state commercial-empty">
                  <strong>Nenhum empenho criado</strong>
                  <p>Use “Novo empenho” para reservar uma quantidade disponível no Estoque GH.</p>
                  <button type="button" onClick={openCommitmentForm}>Criar primeiro empenho</button>
                </div>
              )}
            </section>
          </>
        ) : activeSection === "foreign" ? (
          <>
            <div className="page-heading commercial-heading">
              <div>
                <p className="context">Operação internacional</p>
                <h1>Comércio Exterior</h1>
                <p className="subtitle">Acompanhe compras e transferências da China até o Estoque GH.</p>
              </div>
              <div className="heading-actions">
                <button className="secondary-button" type="button" onClick={() => {
                  setForeignForm("dispatch"); setForeignError(""); setMovementQuantity(""); setDueDate("");
                }}>Retirar do estoque China</button>
                <button className="primary-button" type="button" onClick={() => {
                  setForeignForm("purchase"); setForeignError(""); setTotalQuantity(""); setChinaQuantity(""); setTransitQuantity(""); setDueDate("");
                }}>+ Novo pedido de compra</button>
              </div>
            </div>

            {foreignError && <p className="form-error page-error" role="alert">{foreignError}</p>}

            <section className="commitment-panel foreign-panel">
              <div className="panel-heading">
                <div>
                  <h2>Remessas em andamento</h2>
                  <p>Confirme a chegada na data prevista ou informe uma nova previsão.</p>
                </div>
              </div>
              {foreignLoading ? (
                <div className="empty-state"><strong>Carregando movimentações…</strong></div>
              ) : foreignData.shipments.length ? (
                <div className="shipment-list">
                  {foreignData.shipments.map((shipment) => {
                    const due = shipment.due_date <= today;
                    return (
                      <article className={due ? "shipment-row due" : "shipment-row"} key={shipment.id}>
                        <div>
                          <strong>{shipment.code}</strong>
                          <span>{shipment.quantity} unidades</span>
                        </div>
                        <div>
                          <span>Etapa</span>
                          <strong>{shipment.stage === "transit" ? "China → Porto" : "Porto → Estoque GH"}</strong>
                        </div>
                        <div>
                          <span>Previsão</span>
                          <strong>{new Date(`${shipment.due_date}T12:00:00`).toLocaleDateString("pt-BR")}</strong>
                        </div>
                        <div className="shipment-actions">
                          {due && <span className="arrival-alert">Confirmar chegada</span>}
                          <button className="secondary-button compact" type="button" onClick={() => {
                            setArrivalAction({ shipment, type: "delayed" }); setArrivalDate("");
                          }}>Não chegou</button>
                          <button className="primary-button compact" type="button" onClick={() => {
                            setArrivalAction({ shipment, type: "arrived" }); setArrivalDate("");
                          }}>Chegou</button>
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state"><strong>Nenhuma remessa em andamento</strong><p>Crie um pedido ou retire itens da China.</p></div>
              )}
            </section>

            <section className="commitment-panel orders-panel">
              <div className="panel-heading"><div><h2>Pedidos de compra</h2><p>Últimos pedidos registrados no banco.</p></div></div>
              {foreignData.orders.length ? (
                <div className="order-list">
                  {foreignData.orders.map((order) => (
                    <article className="order-row" key={order.id}>
                      <strong>{order.code}</strong>
                      <span>{order.total_quantity} comprados</span>
                      <span>{order.china_quantity} China</span>
                      <span>{order.transit_quantity} em trânsito</span>
                    </article>
                  ))}
                </div>
              ) : <div className="empty-state small-empty"><p>Nenhum pedido registrado.</p></div>}
            </section>
          </>
        ) : activeSection === "logistics" ? (
          <>
            <div className="page-heading commercial-heading">
              <div>
                <p className="context">Operação de estoque</p>
                <h1>Logística</h1>
                <p className="subtitle">Registre saídas e ajustes do Estoque GH com rastreabilidade.</p>
              </div>
              <div className="heading-actions">
                <button className="secondary-button" type="button" onClick={() => {
                  setLogisticsForm("adjustment"); setLogisticsError(""); setAdjustedQuantity(""); setAdjustmentNote("");
                }}>Ajuste de estoque</button>
                <button className="primary-button" type="button" onClick={() => {
                  setLogisticsForm("exit"); setLogisticsError(""); setInvoiceNumber(""); setOrderNumber(""); setLogisticsQuantity(""); setLogisticsAllocationId("");
                }}>+ Saída de produtos</button>
              </div>
            </div>

            {logisticsError && <p className="form-error page-error" role="alert">{logisticsError}</p>}

            <section className="commitment-panel">
              <div className="panel-heading">
                <div><h2>Histórico da Logística</h2><p>Saídas por nota fiscal e ajustes realizados no Estoque GH.</p></div>
              </div>
              {logisticsEvents.length ? (
                <div className="logistics-list">
                  {logisticsEvents.map((entry) => {
                    const item = items.find((candidate) => candidate.code === entry.code);
                    return (
                      <article className="logistics-row" key={entry.id}>
                        <div><strong>{entry.code}</strong><span>{item?.description} · {item?.finish}</span></div>
                        <div>
                          <span>{entry.type === "exit" ? "Saída de produto" : "Ajuste de estoque"}</span>
                          <strong>{entry.type === "exit" ? `${entry.quantity} unidades` : `${entry.previous_quantity} → ${entry.new_quantity}`}</strong>
                        </div>
                        <div>
                          {entry.type === "exit" ? (
                            <><span>NF {entry.invoice_number} · Pedido {entry.order_number}</span><strong>Rua {entry.street} · Coluna {entry.column} · Nível {entry.level}</strong></>
                          ) : (
                            <><span>Motivo</span><strong>{entry.note}</strong></>
                          )}
                        </div>
                        <time>{new Date(`${entry.created_at.replace(" ", "T")}Z`).toLocaleString("pt-BR")}</time>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state"><strong>Nenhuma movimentação registrada</strong><p>As saídas e os ajustes aparecerão aqui.</p></div>
              )}
            </section>
          </>
        ) : (
          <>
            <div className="page-heading commercial-heading">
              <div>
                <p className="context">Organização física</p>
                <h1>Alocação</h1>
                <p className="subtitle">Distribua o Estoque GH por rua, coluna e nível.</p>
              </div>
              <button className="primary-button" type="button" onClick={() => {
                setAllocationFormOpen(true); setSelectedAllocationTask(null); setAllocationError(""); setStreet(""); setAllocationColumn(""); setLevel(""); setAllocationQuantity("");
              }}>+ Alocar produtos</button>
            </div>

            {allocationError && <p className="form-error page-error" role="alert">{allocationError}</p>}

            {allocationTasks.length > 0 && (
              <section className="allocation-tasks" aria-labelledby="allocation-tasks-title">
                <div className="panel-heading">
                  <div><h2 id="allocation-tasks-title">Aguardando alocação</h2><p>Produtos recebidos do Comércio Exterior no Estoque GH.</p></div>
                </div>
                <div className="task-list">
                  {allocationTasks.map((task) => {
                    const remaining = task.quantity - task.allocated_quantity;
                    return (
                      <article className="allocation-task-row" key={task.id}>
                        <div><strong>{task.code}</strong><span>{task.description} · {task.finish}</span></div>
                        <div><span>Recebido no GH</span><strong>{task.quantity}</strong></div>
                        <div><span>A alocar</span><strong>{remaining}</strong></div>
                        <button className="primary-button compact" type="button" onClick={() => {
                          setAllocationCode(task.code);
                          setAllocationQuantity(String(remaining));
                          setSelectedAllocationTask(task.id);
                          setStreet(""); setAllocationColumn(""); setLevel(""); setAllocationError("");
                          setAllocationFormOpen(true);
                        }}>Alocar agora</button>
                      </article>
                    );
                  })}
                </div>
              </section>
            )}

            <section className="commitment-panel">
              <div className="panel-heading"><div><h2>Produtos alocados</h2><p>Posições registradas no Estoque GH.</p></div></div>
              {allocations.length ? (
                <div className="allocation-table-wrap">
                  <table className="allocation-table">
                    <thead><tr><th aria-sort={allocationSort === "asc" ? "ascending" : "descending"}><button type="button" onClick={() => setAllocationSort((current) => current === "asc" ? "desc" : "asc")}>Produto <span aria-hidden="true">{allocationSort === "asc" ? "↑" : "↓"}</span></button></th><th>Descrição</th><th>Rua</th><th>Coluna</th><th>Nível</th><th className="numeric">Quantidade</th></tr></thead>
                    <tbody>
                      {sortedAllocations.map((allocation) => (
                        <tr key={allocation.id}>
                          <td><span className="item-code">{allocation.code}</span></td>
                          <td className="description">{allocation.description} · {allocation.finish}</td>
                          <td>{allocation.street}</td>
                          <td>{allocation.column}</td>
                          <td>{allocation.level}</td>
                          <td className="numeric strong-number">{allocation.quantity}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state"><strong>Nenhum produto alocado</strong><p>Use “Alocar produtos” para registrar a primeira posição.</p></div>
              )}
            </section>
          </>
        )}
      </section>

      {formOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setFormOpen(false);
        }}>
          <section className="commitment-dialog" role="dialog" aria-modal="true" aria-labelledby="new-commitment-title">
            <div className="dialog-heading">
              <div>
                <p className="context">Comercial</p>
                <h2 id="new-commitment-title">Novo empenho</h2>
              </div>
              <button className="close-button" type="button" onClick={() => setFormOpen(false)} aria-label="Fechar">×</button>
            </div>
            <form onSubmit={submitCommitment}>
              <label className="field">
                <span>Código do item</span>
                <select value={selectedCode} onChange={(event) => {
                  setSelectedCode(event.target.value);
                  setFormError("");
                }}>
                  {items.map((item) => (
                    <option key={item.code} value={item.code}>{item.code} — {item.description} ({item.finish})</option>
                  ))}
                </select>
              </label>

              <div className="selected-stock">
                <div><span>Estoque GH</span><strong>{selectedItem.gh}</strong></div>
                <div><span>Já empenhado</span><strong>{selectedItem.ghCommitted}</strong></div>
                <div><span>Disponível</span><strong>{selectedAvailable}</strong></div>
              </div>

              <label className="field">
                <span>Quantidade a empenhar</span>
                <input type="number" min="1" step="1" value={quantity} onChange={(event) => {
                  setQuantity(event.target.value);
                  setFormError("");
                }} placeholder="Ex.: 10" />
              </label>

              <label className="field">
                <span>Observação</span>
                <textarea value={note} onChange={(event) => {
                  setNote(event.target.value);
                  setFormError("");
                }} placeholder="Informe o motivo ou para quem o estoque será empenhado" rows={4} />
              </label>

              {formError && <p className="form-error" role="alert">{formError}</p>}

              <div className="dialog-actions">
                <button className="secondary-button" type="button" onClick={() => setFormOpen(false)}>Cancelar</button>
                <button className="primary-button" type="submit">Confirmar empenho</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {foreignForm && (
        <div className="dialog-backdrop" role="presentation">
          <section className="commitment-dialog" role="dialog" aria-modal="true" aria-labelledby="foreign-form-title">
            <div className="dialog-heading">
              <div><p className="context">Comércio Exterior</p><h2 id="foreign-form-title">{foreignForm === "purchase" ? "Novo pedido de compra" : "Retirar do estoque China"}</h2></div>
              <button className="close-button" type="button" onClick={() => setForeignForm(null)} aria-label="Fechar">×</button>
            </div>
            <form onSubmit={submitForeignForm}>
              <label className="field"><span>Código do item</span>
                <select value={foreignCode} onChange={(event) => setForeignCode(event.target.value)}>
                  {items.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.description} ({item.finish})</option>)}
                </select>
              </label>
              {foreignForm === "purchase" ? (
                <>
                  <label className="field"><span>Quantidade total comprada</span><input type="number" min="1" step="1" value={totalQuantity} onChange={(event) => setTotalQuantity(event.target.value)} /></label>
                  <div className="split-fields">
                    <label className="field"><span>Armazenar na China</span><input type="number" min="0" step="1" value={chinaQuantity} onChange={(event) => setChinaQuantity(event.target.value)} /></label>
                    <label className="field"><span>Enviar em trânsito</span><input type="number" min="0" step="1" value={transitQuantity} onChange={(event) => setTransitQuantity(event.target.value)} /></label>
                  </div>
                  {Number(transitQuantity) > 0 && <label className="field"><span>Previsão de chegada ao Porto</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>}
                </>
              ) : (
                <>
                  <div className="selected-stock"><div><span>Disponível na China</span><strong>{foreignItem.china}</strong></div></div>
                  <label className="field"><span>Quantidade a retirar</span><input type="number" min="1" max={foreignItem.china} step="1" value={movementQuantity} onChange={(event) => setMovementQuantity(event.target.value)} /></label>
                  <label className="field"><span>Previsão de chegada ao Porto</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
                </>
              )}
              {foreignError && <p className="form-error" role="alert">{foreignError}</p>}
              <div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setForeignForm(null)}>Cancelar</button><button className="primary-button" type="submit">Confirmar</button></div>
            </form>
          </section>
        </div>
      )}

      {arrivalAction && (
        <div className="dialog-backdrop" role="presentation">
          <section className="commitment-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="arrival-title">
            <div className="dialog-heading">
              <div><p className="context">{arrivalAction.shipment.code}</p><h2 id="arrival-title">{arrivalAction.type === "arrived" ? "Confirmar chegada" : "Atualizar previsão"}</h2></div>
              <button className="close-button" type="button" onClick={() => setArrivalAction(null)} aria-label="Fechar">×</button>
            </div>
            <form onSubmit={submitArrival}>
              <p className="dialog-copy">{arrivalAction.shipment.quantity} unidades · {arrivalAction.shipment.stage === "transit" ? "destino Porto" : "destino Estoque GH"}</p>
              {(arrivalAction.type === "delayed" || arrivalAction.shipment.stage === "transit") && (
                <label className="field"><span>{arrivalAction.type === "delayed" ? "Nova data prevista" : "Previsão de chegada ao Estoque GH"}</span><input type="date" value={arrivalDate} onChange={(event) => setArrivalDate(event.target.value)} /></label>
              )}
              {foreignError && <p className="form-error" role="alert">{foreignError}</p>}
              <div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setArrivalAction(null)}>Voltar</button><button className="primary-button" type="submit">Confirmar</button></div>
            </form>
          </section>
        </div>
      )}

      {logisticsForm && (
        <div className="dialog-backdrop" role="presentation">
          <section className="commitment-dialog" role="dialog" aria-modal="true" aria-labelledby="logistics-form-title">
            <div className="dialog-heading">
              <div>
                <p className="context">Logística</p>
                <h2 id="logistics-form-title">{logisticsForm === "exit" ? "Saída de produtos" : "Ajuste de estoque"}</h2>
              </div>
              <button className="close-button" type="button" onClick={() => setLogisticsForm(null)} aria-label="Fechar">×</button>
            </div>
            <form onSubmit={submitLogistics}>
              {logisticsForm === "exit" && (
                <div className="split-fields">
                  <label className="field"><span>Número da nota fiscal</span><input value={invoiceNumber} onChange={(event) => setInvoiceNumber(event.target.value)} /></label>
                  <label className="field"><span>Número do pedido</span><input value={orderNumber} onChange={(event) => setOrderNumber(event.target.value)} /></label>
                </div>
              )}
              <label className="field"><span>Código do produto</span>
                <select value={logisticsCode} onChange={(event) => { setLogisticsCode(event.target.value); setLogisticsAllocationId(""); setLogisticsError(""); }}>
                  {items.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.description} ({item.finish})</option>)}
                </select>
              </label>
              <div className="selected-stock">
                <div><span>Estoque GH</span><strong>{logisticsItem.gh}</strong></div>
                <div><span>Empenhado</span><strong>{logisticsItem.ghCommitted}</strong></div>
                <div><span>Disponível</span><strong>{Math.max(logisticsItem.gh - logisticsItem.ghCommitted, 0)}</strong></div>
              </div>
              {logisticsForm === "exit" ? (
                <>
                  <label className="field"><span>Posição de saída</span>
                    <select value={logisticsAllocationId} onChange={(event) => { setLogisticsAllocationId(event.target.value); setLogisticsError(""); }}>
                      <option value="">Selecione rua, coluna e nível</option>
                      {logisticsPositions.map((position) => (
                        <option key={position.id} value={position.id}>Rua {position.street} · Coluna {position.column} · Nível {position.level} — {position.quantity} unidades</option>
                      ))}
                    </select>
                  </label>
                  {logisticsPositions.length === 0 && <p className="field-hint warning">Este produto não possui posição alocada para saída.</p>}
                  {logisticsPosition && <p className="field-hint">Disponível nesta posição: <strong>{logisticsPosition.quantity}</strong></p>}
                  <label className="field"><span>Quantidade a retirar</span><input type="number" min="1" max={logisticsPosition?.quantity} step="1" value={logisticsQuantity} onChange={(event) => { setLogisticsQuantity(event.target.value); setLogisticsError(""); }} /></label>
                </>
              ) : (
                <>
                  <label className="field"><span>Nova quantidade do Estoque GH</span><input type="number" min="0" step="1" value={adjustedQuantity} onChange={(event) => { setAdjustedQuantity(event.target.value); setLogisticsError(""); }} /></label>
                  <label className="field"><span>Motivo do ajuste</span><textarea rows={4} value={adjustmentNote} onChange={(event) => { setAdjustmentNote(event.target.value); setLogisticsError(""); }} placeholder="Explique por que o saldo está sendo ajustado" /></label>
                </>
              )}
              {logisticsError && <p className="form-error" role="alert">{logisticsError}</p>}
              <div className="dialog-actions">
                <button className="secondary-button" type="button" onClick={() => setLogisticsForm(null)}>Cancelar</button>
                <button className="primary-button" type="submit">{logisticsForm === "exit" ? "Confirmar saída" : "Salvar ajuste"}</button>
              </div>
            </form>
          </section>
        </div>
      )}

      {allocationFormOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section className="commitment-dialog" role="dialog" aria-modal="true" aria-labelledby="allocation-form-title">
            <div className="dialog-heading">
              <div><p className="context">Alocação</p><h2 id="allocation-form-title">Alocar produtos</h2></div>
              <button className="close-button" type="button" onClick={() => setAllocationFormOpen(false)} aria-label="Fechar">×</button>
            </div>
            <form onSubmit={submitAllocation}>
              <label className="field"><span>Código do produto</span>
                <select value={allocationCode} onChange={(event) => { setAllocationCode(event.target.value); setAllocationError(""); }}>
                  {items.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.description} ({item.finish})</option>)}
                </select>
              </label>
              <div className="selected-stock">
                <div><span>Estoque GH</span><strong>{allocationItem.gh}</strong></div>
                <div><span>Já alocado</span><strong>{allocatedForItem}</strong></div>
                <div><span>Disponível</span><strong>{availableToAllocate}</strong></div>
              </div>
              <div className="allocation-fields">
                <label className="field"><span>Rua</span><input value={street} onChange={(event) => { setStreet(event.target.value); setAllocationError(""); }} placeholder="Ex.: A" /></label>
                <label className="field"><span>Coluna</span><input value={allocationColumn} onChange={(event) => { setAllocationColumn(event.target.value); setAllocationError(""); }} placeholder="Ex.: 03" /></label>
                <label className="field"><span>Nível</span><input value={level} onChange={(event) => { setLevel(event.target.value); setAllocationError(""); }} placeholder="Ex.: 2" /></label>
              </div>
              <label className="field"><span>Quantidade a alocar</span><input type="number" min="1" max={availableToAllocate} step="1" value={allocationQuantity} onChange={(event) => { setAllocationQuantity(event.target.value); setAllocationError(""); }} /></label>
              {allocationError && <p className="form-error" role="alert">{allocationError}</p>}
              <div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setAllocationFormOpen(false)}>Cancelar</button><button className="primary-button" type="submit">Confirmar alocação</button></div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}

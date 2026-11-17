"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import ValuationDashboard from "./valuation-dashboard";

type StockItem = {
  code: string;
  description: string;
  finish: string;
  china: number;
  transit: number;
  port: number;
  gh: number;
  returns: number;
  ghCommitted: number;
};

type ShipmentItem = {
  shipment_id: number;
  code: string;
  description: string;
  finish: string;
  quantity: number;
  unit_value_usd_cents: number | null;
};

type Shipment = {
  id: string;
  purchase_order_id: number | null;
  shipment_identifier: string;
  source: string;
  stage: "transit" | "port";
  due_date: string;
  items: ShipmentItem[];
};

type PurchaseOrder = {
  id: number;
  shipment_identifier: string;
  invoice_code?: string | null;
  created_at: string;
  items: Array<{
    item_id: number;
    code: string;
    description: string;
    finish: string;
    unit_value_usd_cents: number;
    total_quantity: number;
    china_quantity: number;
    transit_quantity: number;
  }>;
};

type ForeignTradeData = {
  inventory: Array<Omit<StockItem, "ghCommitted">>;
  shipments: Shipment[];
  orders: PurchaseOrder[];
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

type LogisticsOrder = {
  id: number;
  order_number: string;
  loan_items: number;
  status?: "awaiting_invoice" | "awaiting_return" | "completed" | "returned";
  invoice_number?: string | null;
  created_at?: string;
  separated_at?: string;
  departed_at?: string | null;
  returned_at?: string | null;
  items: Array<{ id: number; code: string; quantity: number; description: string; finish: string; sources?: Array<{ id: number; street: string; column: string; level: string; quantity: number }> }>;
};

type Allocation = {
  id: number;
  code: string;
  shipment_identifier?: string | null;
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
  shipment_identifier: string;
  due_date?: string | null;
  source?: string | null;
  code: string;
  description: string;
  finish: string;
  quantity: number;
  allocated_quantity: number;
  status: string;
};

type IncomingShipment = {
  id: string;
  shipment_identifier: string;
  stage: "transit" | "port";
  due_date: string;
  items: Array<{ shipment_id: number; code: string; description: string; finish: string; quantity: number }>;
};

type ReturnAllocation = {
  id: number;
  code: string;
  description: string;
  finish: string;
  order_number: string;
  street: string;
  column: string;
  level: string;
  quantity: number;
  created_at: string;
};

type CommitmentDocument = {
  id: number;
  type: "reservation" | "order";
  reservation_code: string | null;
  note: string;
  order_number: string | null;
  loan_items: number;
  created_at: string;
  items: Array<{ id: number; code: string; quantity: number; description: string; finish: string }>;
};

const initialItems: StockItem[] = [
  { code: "CD0100", description: "Cadeira", finish: "Taupe", china: 0, transit: 0, port: 0, gh: 0, returns: 0, ghCommitted: 0 },
  { code: "SF0100", description: "Sofá", finish: "Areia", china: 0, transit: 0, port: 0, gh: 0, returns: 0, ghCommitted: 0 },
  { code: "MJ0100", description: "Mesa", finish: "Rose", china: 0, transit: 0, port: 0, gh: 0, returns: 0, ghCommitted: 0 },
];

type SortKey = keyof Pick<StockItem, "code" | "description" | "china" | "transit" | "port" | "gh" | "returns">;

const columns: { key: SortKey; label: string; numeric?: boolean }[] = [
  { key: "code", label: "Código do item" },
  { key: "description", label: "Descrição" },
  { key: "china", label: "Estoque China", numeric: true },
  { key: "transit", label: "Em trânsito", numeric: true },
  { key: "port", label: "Porto", numeric: true },
  { key: "gh", label: "Estoque GH", numeric: true },
  { key: "returns", label: "Estoque Devolução", numeric: true },
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
  const [activeSection, setActiveSection] = useState<"stock" | "dashboard" | "commercial" | "foreign" | "logistics" | "allocation">("stock");
  const [items, setItems] = useState(initialItems);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<{ key: SortKey; direction: "asc" | "desc" }>({ key: "code", direction: "asc" });
  const [commitments, setCommitments] = useState<CommitmentDocument[]>([]);
  const [commitmentChoiceOpen, setCommitmentChoiceOpen] = useState(false);
  const [commitmentType, setCommitmentType] = useState<"reservation" | "order">("reservation");
  const [commitmentOrderNumber, setCommitmentOrderNumber] = useState("");
  const [loanItems, setLoanItems] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [commitmentLines, setCommitmentLines] = useState([{ code: initialItems[0].code, quantity: "" }]);
  const [commitmentToCancel, setCommitmentToCancel] = useState<CommitmentDocument | null>(null);
  const [note, setNote] = useState("");
  const [formError, setFormError] = useState("");
  const [foreignData, setForeignData] = useState<ForeignTradeData>({ inventory: [], shipments: [], orders: [] });
  const [foreignLoading, setForeignLoading] = useState(true);
  const [foreignError, setForeignError] = useState("");
  const [foreignForm, setForeignForm] = useState<"purchase" | "dispatch" | null>(null);
  const [foreignShipmentIdentifier, setForeignShipmentIdentifier] = useState("");
  const [foreignInvoiceCode, setForeignInvoiceCode] = useState("");
  const [purchaseLines, setPurchaseLines] = useState([{ code: initialItems[0].code, unitValueUsd: "", totalQuantity: "", chinaQuantity: "" }]);
  const [dispatchLines, setDispatchLines] = useState([{ code: initialItems[0].code, unitValueUsd: "", quantity: "" }]);
  const [dueDate, setDueDate] = useState("");
  const [arrivalAction, setArrivalAction] = useState<{ shipment: Shipment; type: "arrived" | "delayed" } | null>(null);
  const [arrivalDate, setArrivalDate] = useState("");
  const [logisticsEvents, setLogisticsEvents] = useState<LogisticsEvent[]>([]);
  const [openLogisticsOrders, setOpenLogisticsOrders] = useState<LogisticsOrder[]>([]);
  const [logisticsOrders, setLogisticsOrders] = useState<LogisticsOrder[]>([]);
  const [returnAllocations, setReturnAllocations] = useState<ReturnAllocation[]>([]);
  const [logisticsForm, setLogisticsForm] = useState<"exit" | "adjustment" | null>(null);
  const [selectedLogisticsOrder, setSelectedLogisticsOrder] = useState<LogisticsOrder | null>(null);
  const [orderSelections, setOrderSelections] = useState<Record<number, Array<{ allocationId: string; quantity: string }>>>({});
  const [invoiceOrder, setInvoiceOrder] = useState<LogisticsOrder | null>(null);
  const [returnOrder, setReturnOrder] = useState<LogisticsOrder | null>(null);
  const [returnPositions, setReturnPositions] = useState<Record<number, { street: string; column: string; level: string }>>({});
  const [logisticsCode, setLogisticsCode] = useState(initialItems[0].code);
  const [invoiceNumber, setInvoiceNumber] = useState("");
  const [adjustedQuantity, setAdjustedQuantity] = useState("");
  const [adjustmentNote, setAdjustmentNote] = useState("");
  const [logisticsError, setLogisticsError] = useState("");
  const [allocations, setAllocations] = useState<Allocation[]>([]);
  const [allocationTasks, setAllocationTasks] = useState<AllocationTask[]>([]);
  const [incomingShipments, setIncomingShipments] = useState<IncomingShipment[]>([]);
  const [selectedAllocationTask, setSelectedAllocationTask] = useState<number | null>(null);
  const [allocationFormOpen, setAllocationFormOpen] = useState(false);
  const [editingAllocation, setEditingAllocation] = useState<(Allocation & { isReturn?: boolean }) | null>(null);
  const [transferStreet, setTransferStreet] = useState("");
  const [transferColumn, setTransferColumn] = useState("");
  const [transferLevel, setTransferLevel] = useState("");
  const [transferQuantity, setTransferQuantity] = useState("");
  const [transferError, setTransferError] = useState("");
  const [allocationCode, setAllocationCode] = useState(initialItems[0].code);
  const [street, setStreet] = useState("");
  const [allocationColumn, setAllocationColumn] = useState("");
  const [level, setLevel] = useState("");
  const [allocationQuantity, setAllocationQuantity] = useState("");
  const [allocationError, setAllocationError] = useState("");
  const [allocationSort, setAllocationSort] = useState<"asc" | "desc">("asc");
  const [allocationView, setAllocationView] = useState<"gh" | "returns">("gh");

  function findStockItem(code: string) {
    const normalized = code.trim().toUpperCase();
    return items.find((item) => item.code === normalized) ?? null;
  }

  function parseUsdInput(value: string) {
    const normalized = value.trim().replace(",", ".");
    if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
    const [whole, decimal = ""] = normalized.split(".");
    const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
    return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
  }

  function formatUsdCents(cents: number | null | undefined) {
    if (cents === null || cents === undefined) return "—";
    return new Intl.NumberFormat("pt-BR", { style: "currency", currency: "USD" }).format(cents / 100);
  }
  const logisticsItem = items.find((item) => item.code === logisticsCode) ?? items[0];
  const allocationItem = items.find((item) => item.code === allocationCode) ?? items[0];
  const activeAllocationTask = allocationTasks.find((task) => task.id === selectedAllocationTask) ?? null;
  const allocatedForItem = activeAllocationTask
    ? activeAllocationTask.allocated_quantity
    : allocations
        .filter((allocation) => allocation.code === allocationCode)
        .reduce((total, allocation) => total + allocation.quantity, 0);
  const availableToAllocate = activeAllocationTask
    ? Math.max(activeAllocationTask.quantity - activeAllocationTask.allocated_quantity, 0)
    : Math.max(allocationItem.gh - allocatedForItem, 0);
  const effectiveAllocationGh = activeAllocationTask
    ? activeAllocationTask.quantity
    : allocationItem.gh;
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
  const groupedAllocationTasks = useMemo(() => {
    const groups = new Map<string, { id: string; shipment_identifier: string; tasks: AllocationTask[]; total: number; allocated: number }>();
    for (const task of allocationTasks) {
      const key = task.shipment_id ? `embarque-${task.shipment_identifier}` : `avulso-${task.id}`;
      const label = task.shipment_identifier || "Entrada avulsa";
      const group = groups.get(key) ?? { id: key, shipment_identifier: label, tasks: [], total: 0, allocated: 0 };
      group.tasks.push(task);
      group.total += task.quantity;
      group.allocated += task.allocated_quantity;
      groups.set(key, group);
    }
    return [...groups.values()];
  }, [allocationTasks]);
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

  function applyAllocationsData(data: { inventory?: Array<Omit<StockItem, "ghCommitted">>; allocations?: Allocation[]; tasks?: AllocationTask[]; incomingShipments?: IncomingShipment[] }) {
    setAllocations(data.allocations ?? []);
    setAllocationTasks(data.tasks ?? []);
    setIncomingShipments(data.incomingShipments ?? []);
    if (data.inventory) {
      setItems((current) => data.inventory!.map((item) => ({
        ...item,
        ghCommitted: current.find((candidate) => candidate.code === item.code)?.ghCommitted ?? 0,
      })));
    }
  }

  async function refreshAllocations() {
    const response = await fetch("/api/allocations");
    const data = await response.json() as { inventory?: Array<Omit<StockItem, "ghCommitted">>; allocations?: Allocation[]; tasks?: AllocationTask[]; incomingShipments?: IncomingShipment[] };
    applyAllocationsData(data);
  }

  function applyLogisticsData(data: { inventory?: Array<Omit<StockItem, "ghCommitted">>; events?: LogisticsEvent[]; openOrders?: LogisticsOrder[]; logisticsOrders?: LogisticsOrder[]; returnAllocations?: ReturnAllocation[] }) {
    setLogisticsEvents(data.events ?? []);
    setOpenLogisticsOrders(data.openOrders ?? []);
    setLogisticsOrders(data.logisticsOrders ?? []);
    setReturnAllocations(data.returnAllocations ?? []);
    if (data.inventory) setItems((current) => data.inventory!.map((item) => ({
      ...item,
      ghCommitted: current.find((candidate) => candidate.code === item.code)?.ghCommitted ?? 0,
    })));
  }

  async function refreshLogistics() {
    const response = await fetch("/api/logistics");
    applyLogisticsData(await response.json());
  }

  useEffect(() => {
    // Initial API hydration intentionally updates the client-side workspace state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refreshForeignTrade();
    void refreshLogistics();
    void refreshAllocations();
    void fetch("/api/commitments").then(async (response) => {
      const data = await response.json() as { documents?: CommitmentDocument[] };
      const saved = data.documents ?? [];
      setCommitments(saved);
      setItems((current) => current.map((item) => ({
        ...item,
        ghCommitted: saved.flatMap((document) => document.items).filter((entry) => entry.code === item.code).reduce((total, entry) => total + entry.quantity, 0),
      })));
    });
    // Initial hydration is intentionally executed once for this single-page workspace.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const visibleItems = useMemo(() => {
    const normalized = query.trim().toLocaleLowerCase("pt-BR");
    return items
      .filter((item) => [item.code, item.description].some((value) => value.toLocaleLowerCase("pt-BR").includes(normalized)))
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
    setCommitmentLines([{ code: items.find((item) => item.gh - item.ghCommitted > 0)?.code ?? items[0].code, quantity: "" }]);
    setNote("");
    setCommitmentOrderNumber("");
    setLoanItems(false);
    setFormError("");
    setFormOpen(true);
  }

  async function submitCommitment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (commitmentLines.some((line) => !Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0)) {
      setFormError("Todos os itens precisam de uma quantidade inteira maior que zero.");
      return;
    }
    if (commitmentType === "reservation" && !note.trim()) {
      setFormError("Informe o motivo ou para quem este item será empenhado.");
      return;
    }
    if (commitmentType === "order" && !commitmentOrderNumber.trim()) {
      setFormError("Informe o número do pedido.");
      return;
    }
    try {
      const response = await fetch("/api/commitments", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ type: commitmentType, items: commitmentLines, note, orderNumber: commitmentOrderNumber, loanItems }),
      });
      const data = await response.json() as { documents?: CommitmentDocument[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível criar o empenho.");
      const saved = data.documents ?? [];
      setCommitments(saved);
      setItems((current) => current.map((item) => ({
        ...item,
        ghCommitted: saved.flatMap((document) => document.items).filter((entry) => entry.code === item.code).reduce((total, entry) => total + entry.quantity, 0),
      })));
      setFormOpen(false);
      await refreshLogistics();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível criar o empenho.");
    }
  }

  async function confirmCommitmentCancellation() {
    if (!commitmentToCancel) return;
    try {
      const response = await fetch(`/api/commitments?id=${commitmentToCancel.id}`, { method: "DELETE" });
      const data = await response.json() as { documents?: CommitmentDocument[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível cancelar o documento.");
      const saved = data.documents ?? [];
      setCommitments(saved);
      setItems((current) => current.map((item) => ({
        ...item,
        ghCommitted: saved.flatMap((document) => document.items).filter((entry) => entry.code === item.code).reduce((total, entry) => total + entry.quantity, 0),
      })));
      setCommitmentToCancel(null);
      setFormError("");
    } catch (error) {
      setFormError(error instanceof Error ? error.message : "Não foi possível cancelar o documento.");
    }
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
          shipmentIdentifier: foreignShipmentIdentifier,
          invoiceCode: foreignInvoiceCode,
          dueDate,
          items: purchaseLines.map((line) => ({
            code: line.code.trim().toUpperCase(),
            unitValueUsd: line.unitValueUsd,
            totalQuantity: line.totalQuantity,
            chinaQuantity: line.chinaQuantity === "" ? 0 : line.chinaQuantity,
          })),
        });
      } else {
        await sendForeignAction({
          action: "dispatch_china",
          shipmentIdentifier: foreignShipmentIdentifier,
          dueDate,
          items: dispatchLines.map((line) => ({
            code: line.code.trim().toUpperCase(),
            unitValueUsd: line.unitValueUsd,
            quantity: line.quantity,
          })),
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
        purchaseOrderId: arrivalAction.shipment.purchase_order_id,
        shipmentIdentifier: arrivalAction.shipment.shipment_identifier,
        shipmentId: arrivalAction.shipment.items[0]?.shipment_id,
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
    if (Number(adjustedQuantity) < logisticsItem.ghCommitted) {
      setLogisticsError(`O ajuste não pode deixar o estoque abaixo das ${logisticsItem.ghCommitted} unidades empenhadas.`);
      return;
    }
    try {
      const response = await fetch("/api/logistics", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
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

  async function sendLogisticsAction(payload: Record<string, unknown>) {
    const response = await fetch("/api/logistics", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(payload) });
    const data = await response.json() as { inventory?: Array<Omit<StockItem, "ghCommitted">>; events?: LogisticsEvent[]; openOrders?: LogisticsOrder[]; logisticsOrders?: LogisticsOrder[]; returnAllocations?: ReturnAllocation[]; error?: string };
    if (!response.ok) throw new Error(data.error ?? "Não foi possível concluir a operação.");
    applyLogisticsData(data);
    await refreshAllocations();
    const commercialResponse = await fetch("/api/commitments");
    const commercialData = await commercialResponse.json() as { documents?: CommitmentDocument[] };
    const documents = commercialData.documents ?? [];
    setCommitments(documents);
    setItems((current) => current.map((item) => ({ ...item, ghCommitted: documents.flatMap((document) => document.items).filter((entry) => entry.code === item.code).reduce((total, entry) => total + entry.quantity, 0) })));
  }

  async function separateOrder(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!selectedLogisticsOrder) return;
    try {
      const selections = Object.entries(orderSelections).flatMap(([itemId, rows]) => rows.map((row) => ({ itemId: Number(itemId), allocationId: row.allocationId, quantity: row.quantity })));
      await sendLogisticsAction({ action: "separate_order", documentId: selectedLogisticsOrder.id, selections });
      setSelectedLogisticsOrder(null); setLogisticsForm(null); setLogisticsError("");
    } catch (error) { setLogisticsError(error instanceof Error ? error.message : "Não foi possível separar o pedido."); }
  }

  async function submitInvoice(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!invoiceOrder) return;
    try { await sendLogisticsAction({ action: "invoice", orderId: invoiceOrder.id, invoiceNumber }); setInvoiceOrder(null); setInvoiceNumber(""); setLogisticsError(""); }
    catch (error) { setLogisticsError(error instanceof Error ? error.message : "Não foi possível registrar a nota fiscal."); }
  }

  async function submitReturn(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!returnOrder) return;
    try {
      const positions = returnOrder.items.map((item) => ({ itemId: item.id, ...(returnPositions[item.id] ?? {}) }));
      await sendLogisticsAction({ action: "return_order", orderId: returnOrder.id, positions });
      setReturnOrder(null); setReturnPositions({}); setLogisticsError("");
    } catch (error) { setLogisticsError(error instanceof Error ? error.message : "Não foi possível registrar a devolução."); }
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
      const data = await response.json() as { inventory?: Array<Omit<StockItem, "ghCommitted">>; allocations?: Allocation[]; tasks?: AllocationTask[]; incomingShipments?: IncomingShipment[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível alocar os produtos.");
      applyAllocationsData(data);
      setAllocationFormOpen(false);
      setSelectedAllocationTask(null);
      setAllocationError("");
    } catch (error) {
      setAllocationError(error instanceof Error ? error.message : "Não foi possível alocar os produtos.");
    }
  }

  async function submitTransfer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingAllocation) return;
    try {
      const response = await fetch("/api/allocations", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          action: editingAllocation.isReturn ? "transfer_return" : "transfer",
          allocationId: editingAllocation.id,
          street: transferStreet,
          column: transferColumn,
          level: transferLevel,
          quantity: transferQuantity,
        }),
      });
      const data = await response.json() as { inventory?: Array<Omit<StockItem, "ghCommitted">>; allocations?: Allocation[]; tasks?: AllocationTask[]; incomingShipments?: IncomingShipment[]; error?: string };
      if (!response.ok) throw new Error(data.error ?? "Não foi possível transferir a posição.");
      applyAllocationsData(data);
      if (editingAllocation.isReturn) {
        await refreshLogistics();
      }
      setEditingAllocation(null);
      setTransferError("");
    } catch (error) {
      setTransferError(error instanceof Error ? error.message : "Não foi possível transferir a posição.");
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
        <button className={activeSection === "dashboard" ? "nav-item active" : "nav-item"} type="button" onClick={() => setActiveSection("dashboard")}>
          <span aria-hidden="true">▥</span>
          Dashboard
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
        {activeSection === "dashboard" ? (
          <ValuationDashboard items={items} />
        ) : activeSection === "stock" ? (
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
                <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Buscar código ou descrição" />
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
                    <td className="numeric">{item.china}</td>
                    <td className="numeric">{item.transit}</td>
                    <td className="numeric">{item.port}</td>
                    <td className="numeric"><GhBalance total={item.gh} committed={item.ghCommitted} /></td>
                    <td className="numeric">{item.returns}</td>
                  </tr>
                ))}
              </tbody>
            </table>
            {visibleItems.length === 0 && (
              <div className="empty-state" role="status">
                <strong>Nenhum item encontrado</strong>
                <p>Revise o código ou a descrição pesquisada.</p>
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
              <button className="primary-button" type="button" onClick={() => setCommitmentChoiceOpen(true)}>+ Novo empenho</button>
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
                    const total = commitment.items.reduce((sum, item) => sum + item.quantity, 0);
                    return (
                      <article className="commitment-document" key={commitment.id}>
                        <div className="commitment-document-heading">
                          <div>
                            <strong>{commitment.type === "reservation" ? commitment.reservation_code : `Pedido nº ${commitment.order_number}`}</strong>
                            <span>{commitment.type === "reservation" ? "Reserva de itens" : `Empenho de pedido${commitment.loan_items ? " · Itens de empréstimo" : ""}`}</span>
                          </div>
                          <div className="commitment-actions">
                            <span className="source-committed">{total} empenhado</span>
                            <button className="cancel-button" type="button" onClick={() => setCommitmentToCancel(commitment)}>Cancelar documento</button>
                          </div>
                        </div>
                        {commitment.note && <p className="commitment-note">{commitment.note}</p>}
                        <div className="commitment-items">
                          {commitment.items.map((line) => (
                            <div key={line.id}><span>{line.code} · {line.description} · {line.finish}</span><strong>{line.quantity}</strong></div>
                          ))}
                        </div>
                      </article>
                    );
                  })}
                </div>
              ) : (
                <div className="empty-state commercial-empty">
                  <strong>Nenhum empenho criado</strong>
                  <p>Use “Novo empenho” para reservar uma quantidade disponível no Estoque GH.</p>
                  <button type="button" onClick={() => setCommitmentChoiceOpen(true)}>Criar primeiro empenho</button>
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
                  setForeignForm("dispatch");
                  setForeignError("");
                  setForeignShipmentIdentifier("");
                  setDispatchLines([{ code: items[0]?.code ?? "", unitValueUsd: "", quantity: "" }]);
                  setDueDate("");
                }}>Retirar do estoque China</button>
                <button className="primary-button" type="button" onClick={() => {
                  setForeignForm("purchase");
                  setForeignError("");
                  setForeignShipmentIdentifier("");
                  setForeignInvoiceCode("");
                  setPurchaseLines([{ code: items[0]?.code ?? "", unitValueUsd: "", totalQuantity: "", chinaQuantity: "" }]);
                  setDueDate("");
                }}>+ Novo pedido de compra</button>
              </div>
            </div>

            {foreignError && <p className="form-error page-error" role="alert">{foreignError}</p>}

            <section className="commitment-panel foreign-panel">
              <div className="panel-heading">
                <div>
                  <h2>Remessas em andamento</h2>
                  <p>Confirme a chegada do embarque na data prevista ou informe uma nova previsão.</p>
                </div>
              </div>
              {foreignLoading ? (
                <div className="empty-state"><strong>Carregando movimentações…</strong></div>
              ) : foreignData.shipments.length ? (
                <div className="shipment-list">
                  {foreignData.shipments.map((shipment) => {
                    const due = shipment.due_date <= today;
                    const totalUnits = shipment.items.reduce((sum, item) => sum + item.quantity, 0);
                    return (
                      <article className={due ? "shipment-row due" : "shipment-row"} key={shipment.id}>
                        <div>
                          <strong>{shipment.shipment_identifier}</strong>
                          <span>{totalUnits} unidades · {shipment.items.length} {shipment.items.length === 1 ? "item" : "itens"}</span>
                          <div className="shipment-items-list">
                            {shipment.items.map((item) => (
                              <div className="shipment-item-line" key={item.shipment_id}>
                                <strong>{item.code}</strong>
                                <span>{item.description}</span>
                                <span>{item.quantity} un.</span>
                                {item.unit_value_usd_cents ? <span>{formatUsdCents(item.unit_value_usd_cents)}/un.</span> : null}
                              </div>
                            ))}
                          </div>
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
              <div className="panel-heading"><div><h2>Pedidos de compra</h2><p>Últimos embarques registrados no banco.</p></div></div>
              {foreignData.orders.length ? (
                <div className="order-list">
                  {foreignData.orders.map((order) => {
                    const totalUnits = order.items.reduce((sum, item) => sum + item.total_quantity, 0);
                    const totalUsdCents = order.items.reduce((sum, item) => sum + item.unit_value_usd_cents * item.total_quantity, 0);
                    return (
                      <article className="order-card" key={order.id}>
                        <div className="order-card-head">
                          <strong>Embarque {order.shipment_identifier}</strong>
                          <div className="order-card-meta">
                            {order.invoice_code ? <span>NF: {order.invoice_code}</span> : null}
                            <span>{order.items.length} {order.items.length === 1 ? "produto" : "produtos"}</span>
                            <span>{totalUnits} unidades</span>
                            <span>Total: {formatUsdCents(totalUsdCents)}</span>
                          </div>
                        </div>
                        <div className="order-items-list">
                          {order.items.map((item) => (
                            <div className="order-item-line" key={item.item_id}>
                              <strong>{item.code}</strong>
                              <span>{item.description}</span>
                              <span>{formatUsdCents(item.unit_value_usd_cents)}/un.</span>
                              <span>{item.total_quantity} comprados</span>
                              <span>{item.china_quantity} China</span>
                              <span>{item.transit_quantity} em trânsito</span>
                            </div>
                          ))}
                        </div>
                      </article>
                    );
                  })}
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
                  setLogisticsForm("exit"); setSelectedLogisticsOrder(null); setOrderSelections({}); setLogisticsError("");
                }}>+ Saída de produtos</button>
              </div>
            </div>

            {logisticsError && <p className="form-error page-error" role="alert">{logisticsError}</p>}

            <section className="commitment-panel">
              <div className="panel-heading">
                <div><h2>Histórico da Logística</h2><p>Pedidos separados, baixas por nota fiscal, devoluções e ajustes do Estoque GH.</p></div>
              </div>
              {logisticsOrders.length || logisticsEvents.length ? (
                <div className="logistics-list">
                  {logisticsOrders.map((order) => (
                    <article className="logistics-order-row" key={`order-${order.id}`}>
                      <div><strong>Pedido {order.order_number}</strong><span>{order.loan_items ? "Itens de empréstimo" : "Pedido de venda"}</span></div>
                      <div><span>{order.items.length} {order.items.length === 1 ? "produto" : "produtos"}</span><strong>{order.items.reduce((sum, item) => sum + item.quantity, 0)} unidades</strong></div>
                      <div className="order-history-items">
                        {order.items.map((item) => <span key={item.id}><strong>{item.code}</strong> · {item.quantity} un. · {(item.sources ?? []).map((source) => `Rua ${source.street} / Col. ${source.column} / Nív. ${source.level}: ${source.quantity}`).join("; ")}</span>)}
                      </div>
                      <div><span>Status</span><strong>{order.status === "awaiting_invoice" ? "Separado · aguardando NF" : order.status === "awaiting_return" ? "Aguardando devolução" : order.status === "returned" ? "Devolvido" : "Saída concluída"}</strong>{order.invoice_number && <span>NF {order.invoice_number}</span>}</div>
                      <div className="history-action">
                        {order.status === "awaiting_invoice" && <button className="primary-button compact" type="button" onClick={() => { setInvoiceOrder(order); setInvoiceNumber(""); setLogisticsError(""); }}>Baixa por NF</button>}
                        {order.status === "awaiting_return" && <button className="primary-button compact" type="button" onClick={() => { setReturnOrder(order); setReturnPositions({}); setLogisticsError(""); }}>Registrar devolução</button>}
                        {order.status !== "awaiting_invoice" && order.status !== "awaiting_return" && <time>{new Date(`${(order.returned_at ?? order.departed_at ?? order.separated_at)?.replace(" ", "T")}Z`).toLocaleString("pt-BR")}</time>}
                      </div>
                    </article>
                  ))}
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
            </div>

            {allocationError && <p className="form-error page-error" role="alert">{allocationError}</p>}

            {groupedAllocationTasks.length > 0 && (
              <section className="allocation-tasks" aria-labelledby="allocation-tasks-title">
                <div className="panel-heading">
                  <div><h2 id="allocation-tasks-title">Aguardando alocação</h2><p>Produtos recebidos no Estoque GH agrupados por embarque.</p></div>
                </div>
                <div className="allocation-embarque-list">
                  {groupedAllocationTasks.map((group) => {
                    const percent = group.total > 0 ? Math.round((group.allocated / group.total) * 100) : 0;
                    return (
                      <div className="allocation-embarque-group" key={group.id}>
                        <div className="allocation-embarque-head">
                          <div className="allocation-embarque-title">
                            <strong>Embarque {group.shipment_identifier}</strong>
                            <span>{group.tasks.length} {group.tasks.length === 1 ? "produto" : "produtos"}</span>
                          </div>
                          <div className="allocation-progress-wrap">
                            <span>{group.allocated}/{group.total} un. alocadas</span>
                            <span className="allocation-progress-track" aria-hidden="true">
                              <span className="allocation-progress-fill" style={{ width: `${percent}%` }} />
                            </span>
                          </div>
                        </div>
                        <div className="task-list">
                          {group.tasks.map((task) => {
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
                      </div>
                    );
                  })}
                </div>
              </section>
            )}

            {incomingShipments.length > 0 && (
              <section className="commitment-panel incoming-panel" aria-labelledby="incoming-shipments-title">
                <div className="panel-heading">
                  <div><h2 id="incoming-shipments-title">Embarques a caminho do GH</h2><p>Previsão de contêineres em trânsito ou no porto para planejamento de endereços.</p></div>
                </div>
                <div className="incoming-list">
                  {incomingShipments.map((shipment) => (
                    <article className="incoming-row" key={shipment.id}>
                      <div>
                        <strong>Embarque {shipment.shipment_identifier}</strong>
                        <span>{shipment.stage === "transit" ? "China → Porto" : "Porto → Estoque GH"} · Previsão {new Date(`${shipment.due_date}T12:00:00`).toLocaleDateString("pt-BR")}</span>
                      </div>
                      <div className="shipment-items-list">
                        {shipment.items.map((item) => (
                          <div className="shipment-item-line" key={item.shipment_id}>
                            <strong>{item.code}</strong>
                            <span>{item.description}</span>
                            <span>{item.quantity} un.</span>
                          </div>
                        ))}
                      </div>
                      <div>
                        <strong>{shipment.items.reduce((sum, item) => sum + item.quantity, 0)} un.</strong>
                        <span>Previsto</span>
                      </div>
                    </article>
                  ))}
                </div>
              </section>
            )}

            <section className="commitment-panel">
              <div className="panel-heading allocation-panel-heading">
                <div><h2>{allocationView === "gh" ? "Produtos alocados" : "Produtos alocados — Devolução"}</h2><p>{allocationView === "gh" ? "Posições registradas no Estoque GH." : "Controle dos itens devolvidos por pedidos de empréstimo."}</p></div>
                <div className="allocation-tabs" role="tablist" aria-label="Tipo de estoque alocado">
                  <button className={allocationView === "gh" ? "active" : ""} type="button" role="tab" aria-selected={allocationView === "gh"} onClick={() => setAllocationView("gh")}>Estoque GH</button>
                  <button className={allocationView === "returns" ? "active" : ""} type="button" role="tab" aria-selected={allocationView === "returns"} onClick={() => setAllocationView("returns")}>Devolução</button>
                </div>
              </div>
              {allocationView === "gh" ? allocations.length ? (
                <div className="allocation-table-wrap">
                  <table className="allocation-table">
                    <thead><tr><th aria-sort={allocationSort === "asc" ? "ascending" : "descending"}><button type="button" onClick={() => setAllocationSort((current) => current === "asc" ? "desc" : "asc")}>Produto <span aria-hidden="true">{allocationSort === "asc" ? "↑" : "↓"}</span></button></th><th>Descrição</th><th>Rua</th><th>Coluna</th><th>Nível</th><th className="numeric">Quantidade</th><th className="numeric">Ações</th></tr></thead>
                    <tbody>
                      {sortedAllocations.map((allocation) => (
                        <tr key={allocation.id}>
                          <td><span className="item-code">{allocation.code}</span></td>
                          <td className="description">{allocation.description} · {allocation.finish}</td>
                          <td>{allocation.street}</td>
                          <td>{allocation.column}</td>
                          <td>{allocation.level}</td>
                          <td className="numeric strong-number">{allocation.quantity}</td>
                          <td className="allocation-action-cell">
                            <button
                              className="secondary-button compact"
                              type="button"
                              onClick={() => {
                                setEditingAllocation(allocation);
                                setTransferStreet(allocation.street);
                                setTransferColumn(allocation.column);
                                setTransferLevel(allocation.level);
                                setTransferQuantity(String(allocation.quantity));
                                setTransferError("");
                              }}
                            >Editar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-state"><strong>Nenhum produto alocado</strong><p>Aloque os produtos recebidos em “Aguardando alocação”.</p></div>
              ) : returnAllocations.length ? (
                <div className="allocation-table-wrap">
                  <table className="allocation-table return-allocation-table">
                    <thead><tr><th>Produto</th><th>Descrição</th><th>Pedido</th><th>Rua</th><th>Coluna</th><th>Nível</th><th className="numeric">Quantidade</th><th className="numeric">Ações</th></tr></thead>
                    <tbody>
                      {returnAllocations.map((position) => (
                        <tr key={position.id}>
                          <td><span className="item-code">{position.code}</span></td>
                          <td className="description">{position.description} · {position.finish}</td>
                          <td>{position.order_number}</td>
                          <td>{position.street}</td>
                          <td>{position.column}</td>
                          <td>{position.level}</td>
                          <td className="numeric strong-number">{position.quantity}</td>
                          <td className="allocation-action-cell">
                            <button
                              className="secondary-button compact"
                              type="button"
                              onClick={() => {
                                setEditingAllocation({ ...position, isReturn: true });
                                setTransferStreet(position.street);
                                setTransferColumn(position.column);
                                setTransferLevel(position.level);
                                setTransferQuantity(String(position.quantity));
                                setTransferError("");
                              }}
                            >Editar</button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : <div className="empty-state"><strong>Nenhum produto devolvido</strong><p>Os itens de empréstimo aparecerão aqui após a devolução ser confirmada pela Logística.</p></div>}
            </section>
          </>
        )}
      </section>

      {commitmentChoiceOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section className="commitment-dialog choice-dialog" role="dialog" aria-modal="true" aria-labelledby="commitment-choice-title">
            <div className="dialog-heading">
              <div><p className="context">Comercial</p><h2 id="commitment-choice-title">Novo empenho</h2></div>
              <button className="close-button" type="button" onClick={() => setCommitmentChoiceOpen(false)} aria-label="Fechar">×</button>
            </div>
            <p className="choice-intro">Escolha como deseja comprometer o saldo disponível do Estoque GH.</p>
            <div className="commitment-choices">
              <button type="button" onClick={() => { setCommitmentType("reservation"); setCommitmentChoiceOpen(false); openCommitmentForm(); }}>
                <strong>Reserva de itens</strong>
                <span>Reserve uma quantidade informando o motivo ou destinatário.</span>
              </button>
              <button type="button" onClick={() => { setCommitmentType("order"); setCommitmentChoiceOpen(false); openCommitmentForm(); }}>
                <strong>Empenho de pedido</strong>
                <span>Vincule a reserva a um número de pedido obrigatório.</span>
              </button>
            </div>
          </section>
        </div>
      )}

      {commitmentToCancel && (
        <div className="dialog-backdrop" role="presentation">
          <section className="commitment-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="cancel-document-title">
            <div className="dialog-heading">
              <div><p className="context">Comercial</p><h2 id="cancel-document-title">Cancelar documento?</h2></div>
              <button className="close-button" type="button" onClick={() => setCommitmentToCancel(null)} aria-label="Fechar">×</button>
            </div>
            <p className="dialog-copy">{commitmentToCancel.type === "reservation" ? commitmentToCancel.reservation_code : `Pedido nº ${commitmentToCancel.order_number}`} · {commitmentToCancel.items.length} {commitmentToCancel.items.length === 1 ? "item" : "itens"}</p>
            <p className="cancel-warning">Todos os itens deste documento serão cancelados e as quantidades voltarão a ficar disponíveis no Estoque GH.</p>
            {formError && <p className="form-error" role="alert">{formError}</p>}
            <div className="dialog-actions">
              <button className="secondary-button" type="button" onClick={() => setCommitmentToCancel(null)}>Manter documento</button>
              <button className="danger-button" type="button" onClick={() => void confirmCommitmentCancellation()}>Confirmar cancelamento</button>
            </div>
          </section>
        </div>
      )}

      {formOpen && (
        <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.currentTarget === event.target) setFormOpen(false);
        }}>
          <section className="commitment-dialog" role="dialog" aria-modal="true" aria-labelledby="new-commitment-title">
            <div className="dialog-heading">
              <div>
                <p className="context">Comercial</p>
                <h2 id="new-commitment-title">{commitmentType === "order" ? "Empenho de pedido" : "Reserva de itens"}</h2>
              </div>
              <button className="close-button" type="button" onClick={() => setFormOpen(false)} aria-label="Fechar">×</button>
            </div>
            <form onSubmit={submitCommitment}>
              <div className="document-lines">
                <div className="document-lines-heading"><strong>Itens</strong><span>{commitmentLines.length} {commitmentLines.length === 1 ? "item" : "itens"}</span></div>
                {commitmentLines.map((line, index) => {
                  const item = items.find((candidate) => candidate.code === line.code) ?? items[0];
                  const available = Math.max(item.gh - item.ghCommitted, 0);
                  return (
                    <div className="document-line" key={index}>
                      <label className="field"><span>Produto</span><select value={line.code} onChange={(event) => setCommitmentLines((current) => current.map((entry, lineIndex) => lineIndex === index ? { ...entry, code: event.target.value } : entry))}>{items.map((candidate) => <option key={candidate.code} value={candidate.code}>{candidate.code} — {candidate.description} ({candidate.finish})</option>)}</select></label>
                      <label className="field"><span>Quantidade</span><input type="number" min="1" step="1" value={line.quantity} onChange={(event) => { setCommitmentLines((current) => current.map((entry, lineIndex) => lineIndex === index ? { ...entry, quantity: event.target.value } : entry)); setFormError(""); }} placeholder="Ex.: 10" /></label>
                      <span className="line-available">{available} disponível</span>
                      {commitmentLines.length > 1 && <button className="remove-line" type="button" onClick={() => setCommitmentLines((current) => current.filter((_, lineIndex) => lineIndex !== index))} aria-label={`Remover item ${index + 1}`}>×</button>}
                    </div>
                  );
                })}
                <button className="add-line" type="button" onClick={() => setCommitmentLines((current) => [...current, { code: items[0].code, quantity: "" }])}>+ Adicionar item</button>
              </div>

              {commitmentType === "order" && (
                <>
                  <label className="field">
                    <span>Número do pedido</span>
                    <input value={commitmentOrderNumber} onChange={(event) => { setCommitmentOrderNumber(event.target.value); setFormError(""); }} placeholder="Ex.: 10458" />
                  </label>
                  <label className="checkbox-field">
                    <input type="checkbox" checked={loanItems} onChange={(event) => setLoanItems(event.target.checked)} />
                    <span><strong>Itens de empréstimo</strong><small>Marque quando os itens deverão retornar futuramente ao Estoque Devolução.</small></span>
                  </label>
                </>
              )}

              <label className="field">
                <span>Observação{commitmentType === "order" ? " (opcional)" : ""}</span>
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

      {foreignForm && (() => {
        const hasPurchaseTransit = foreignForm === "purchase" && purchaseLines.some((line) => {
          const total = Number(line.totalQuantity);
          const china = Number(line.chinaQuantity || 0);
          return Number.isInteger(total) && total > 0 && Number.isInteger(china) && china >= 0 && total - china > 0;
        });
        const purchaseTotals = purchaseLines.reduce((acc, line) => {
          const total = Number.isInteger(Number(line.totalQuantity)) && Number(line.totalQuantity) > 0 ? Number(line.totalQuantity) : 0;
          const china = Number.isInteger(Number(line.chinaQuantity || 0)) && Number(line.chinaQuantity || 0) >= 0 ? Number(line.chinaQuantity || 0) : 0;
          const transit = Math.max(total - china, 0);
          const unitCents = parseUsdInput(line.unitValueUsd) ?? 0;
          return {
            total: acc.total + total,
            china: acc.china + Math.min(china, total),
            transit: acc.transit + transit,
            usdCents: acc.usdCents + unitCents * total,
          };
        }, { total: 0, china: 0, transit: 0, usdCents: 0 });

        return (
          <div className="dialog-backdrop" role="presentation">
            <section className="commitment-dialog foreign-dialog" role="dialog" aria-modal="true" aria-labelledby="foreign-form-title">
              <div className="dialog-heading">
                <div><p className="context">Comércio Exterior</p><h2 id="foreign-form-title">{foreignForm === "purchase" ? "Novo pedido de compra" : "Retirar do estoque China"}</h2></div>
                <button className="close-button" type="button" onClick={() => setForeignForm(null)} aria-label="Fechar">×</button>
              </div>
              <datalist id="foreign-product-codes">
                {items.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.description} ({item.finish})</option>)}
              </datalist>
              <form onSubmit={submitForeignForm}>
                {foreignForm === "purchase" ? (
                  <div className="split-fields">
                    <label className="field">
                      <span>Embarque (nº do pedido / contêiner)</span>
                      <input
                        type="text"
                        placeholder="Ex.: EMB-2026-001"
                        value={foreignShipmentIdentifier}
                        onChange={(event) => setForeignShipmentIdentifier(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Código da Nota Fiscal</span>
                      <input
                        type="text"
                        placeholder="Ex.: NF-12345"
                        value={foreignInvoiceCode}
                        onChange={(event) => setForeignInvoiceCode(event.target.value)}
                      />
                    </label>
                  </div>
                ) : (
                  <label className="field">
                    <span>Embarque (nº do pedido / contêiner)</span>
                    <input
                      type="text"
                      placeholder="Ex.: EMB-2026-001"
                      value={foreignShipmentIdentifier}
                      onChange={(event) => setForeignShipmentIdentifier(event.target.value)}
                    />
                  </label>
                )}

                {foreignForm === "purchase" ? (
                  <>
                    <div className="foreign-lines">
                      <div className="foreign-lines-head">
                        <strong>Produtos do embarque</strong>
                        <button
                          className="secondary-button compact"
                          type="button"
                          onClick={() => setPurchaseLines((current) => [...current, { code: "", unitValueUsd: "", totalQuantity: "", chinaQuantity: "" }])}
                        >+ Adicionar produto</button>
                      </div>
                      {purchaseLines.map((line, index) => {
                        const matched = findStockItem(line.code);
                        const total = Number(line.totalQuantity);
                        const china = Number(line.chinaQuantity || 0);
                        const validQty = Number.isInteger(total) && total > 0 && Number.isInteger(china) && china >= 0 && china <= total;
                        const transit = validQty ? total - china : null;
                        const unitCents = parseUsdInput(line.unitValueUsd);
                        const lineTotalCents = unitCents && Number.isInteger(total) && total > 0 ? unitCents * total : null;
                        return (
                          <div className="foreign-line-card" key={index}>
                            <div className="foreign-purchase-grid">
                              <label className="field">
                                <span>Código</span>
                                <input
                                  list="foreign-product-codes"
                                  placeholder="Ex.: CD0100"
                                  value={line.code}
                                  onChange={(event) => setPurchaseLines((current) => current.map((entry, idx) => idx === index ? { ...entry, code: event.target.value } : entry))}
                                />
                              </label>
                              <div className="field">
                                <span>Descrição</span>
                                <div className={matched ? "foreign-readonly" : "foreign-readonly muted"} title={matched ? `${matched.description} (${matched.finish})` : "Selecione um código válido"}>
                                  {matched ? `${matched.description} (${matched.finish})` : "Código não encontrado"}
                                </div>
                              </div>
                              <label className="field">
                                <span>Valor (US$)</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  value={line.unitValueUsd}
                                  onChange={(event) => setPurchaseLines((current) => current.map((entry, idx) => idx === index ? { ...entry, unitValueUsd: event.target.value } : entry))}
                                />
                              </label>
                              <label className="field">
                                <span>Quantidade</span>
                                <input
                                  type="number"
                                  min="1"
                                  step="1"
                                  value={line.totalQuantity}
                                  onChange={(event) => setPurchaseLines((current) => current.map((entry, idx) => idx === index ? { ...entry, totalQuantity: event.target.value } : entry))}
                                />
                              </label>
                              <label className="field">
                                <span>Armazém China</span>
                                <input
                                  type="number"
                                  min="0"
                                  step="1"
                                  value={line.chinaQuantity}
                                  onChange={(event) => setPurchaseLines((current) => current.map((entry, idx) => idx === index ? { ...entry, chinaQuantity: event.target.value } : entry))}
                                />
                              </label>
                              <div className="field">
                                <span>Em trânsito</span>
                                <div className={transit === null ? "foreign-readonly muted" : "foreign-readonly"}>{transit ?? "—"}</div>
                              </div>
                              <div className="field">
                                <span>Total (US$)</span>
                                <div className={lineTotalCents === null ? "foreign-readonly muted" : "foreign-readonly"}>{formatUsdCents(lineTotalCents)}</div>
                              </div>
                              <button
                                className="remove-line"
                                type="button"
                                disabled={purchaseLines.length <= 1}
                                onClick={() => setPurchaseLines((current) => current.filter((_, idx) => idx !== index))}
                                aria-label="Remover produto"
                              >×</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="foreign-summary">
                      <span>Total comprado: <strong>{purchaseTotals.total}</strong> un.</span>
                      <span>Armazém China: <strong>{purchaseTotals.china}</strong> un.</span>
                      <span>Em trânsito: <strong>{purchaseTotals.transit}</strong> un.</span>
                      <span>Total do pedido: <strong>{formatUsdCents(purchaseTotals.usdCents)}</strong></span>
                    </div>
                    {hasPurchaseTransit && (
                      <label className="field"><span>Previsão de chegada ao Porto</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
                    )}
                  </>
                ) : (
                  <>
                    <div className="foreign-lines">
                      <div className="foreign-lines-head">
                        <strong>Produtos para retirada da China</strong>
                        <button
                          className="secondary-button compact"
                          type="button"
                          onClick={() => setDispatchLines((current) => [...current, { code: "", unitValueUsd: "", quantity: "" }])}
                        >+ Adicionar produto</button>
                      </div>
                      {dispatchLines.map((line, index) => {
                        const matched = findStockItem(line.code);
                        return (
                          <div className="foreign-line-card" key={index}>
                            <div className="foreign-dispatch-grid">
                              <label className="field">
                                <span>Código</span>
                                <input
                                  list="foreign-product-codes"
                                  placeholder="Ex.: CD0100"
                                  value={line.code}
                                  onChange={(event) => setDispatchLines((current) => current.map((entry, idx) => idx === index ? { ...entry, code: event.target.value } : entry))}
                                />
                              </label>
                              <label className="field">
                                <span>Valor (US$)</span>
                                <input
                                  type="text"
                                  inputMode="decimal"
                                  placeholder="0.00"
                                  value={line.unitValueUsd}
                                  onChange={(event) => setDispatchLines((current) => current.map((entry, idx) => idx === index ? { ...entry, unitValueUsd: event.target.value } : entry))}
                                />
                              </label>
                              <div className="field">
                                <span>Descrição</span>
                                <div className={matched ? "foreign-readonly" : "foreign-readonly muted"} title={matched ? `${matched.description} (${matched.finish})` : "Selecione um código válido"}>
                                  {matched ? `${matched.description} (${matched.finish})` : "Código não encontrado"}
                                </div>
                              </div>
                              <div className="field">
                                <span>Qtd. disponível</span>
                                <div className={matched ? "foreign-readonly" : "foreign-readonly muted"}>{matched ? matched.china : "—"}</div>
                              </div>
                              <label className="field">
                                <span>Qtd. a retirar</span>
                                <input
                                  type="number"
                                  min="1"
                                  max={matched ? matched.china : undefined}
                                  step="1"
                                  value={line.quantity}
                                  onChange={(event) => setDispatchLines((current) => current.map((entry, idx) => idx === index ? { ...entry, quantity: event.target.value } : entry))}
                                />
                              </label>
                              <button
                                className="remove-line"
                                type="button"
                                disabled={dispatchLines.length <= 1}
                                onClick={() => setDispatchLines((current) => current.filter((_, idx) => idx !== index))}
                                aria-label="Remover produto"
                              >×</button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <label className="field"><span>Data de chegada ao Porto</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /></label>
                  </>
                )}
                {foreignError && <p className="form-error" role="alert">{foreignError}</p>}
                <div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setForeignForm(null)}>Cancelar</button><button className="primary-button" type="submit">Confirmar</button></div>
              </form>
            </section>
          </div>
        );
      })()}

      {arrivalAction && (
        <div className="dialog-backdrop" role="presentation">
          <section className="commitment-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="arrival-title">
            <div className="dialog-heading">
              <div><p className="context">{arrivalAction.shipment.shipment_identifier}</p><h2 id="arrival-title">{arrivalAction.type === "arrived" ? "Confirmar chegada" : "Atualizar previsão"}</h2></div>
              <button className="close-button" type="button" onClick={() => setArrivalAction(null)} aria-label="Fechar">×</button>
            </div>
            <form onSubmit={submitArrival}>
              <p className="dialog-copy">
                {arrivalAction.shipment.items.reduce((sum, item) => sum + item.quantity, 0)} unidades em {arrivalAction.shipment.items.length} {arrivalAction.shipment.items.length === 1 ? "item" : "itens"} · {arrivalAction.shipment.stage === "transit" ? "destino Porto" : "destino Estoque GH"}
              </p>
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
          <section className="commitment-dialog logistics-dialog" role="dialog" aria-modal="true" aria-labelledby="logistics-form-title">
            <div className="dialog-heading">
              <div>
                <p className="context">Logística</p>
                <h2 id="logistics-form-title">{logisticsForm === "exit" ? "Separação de item por pedido" : "Ajuste de estoque"}</h2>
              </div>
              <button className="close-button" type="button" onClick={() => setLogisticsForm(null)} aria-label="Fechar">×</button>
            </div>
            {logisticsForm === "exit" ? (
              <form onSubmit={separateOrder}>
                <label className="field"><span>Pedido empenhado pelo Comercial</span>
                  <select value={selectedLogisticsOrder?.id ?? ""} onChange={(event) => {
                    const order = openLogisticsOrders.find((candidate) => candidate.id === Number(event.target.value)) ?? null;
                    setSelectedLogisticsOrder(order); setOrderSelections({}); setLogisticsError("");
                  }}><option value="">Selecione o número do pedido</option>{openLogisticsOrders.map((order) => <option key={order.id} value={order.id}>Pedido {order.order_number}{order.loan_items ? " · Empréstimo" : ""}</option>)}</select>
                </label>
                {!openLogisticsOrders.length && <p className="field-hint warning">Não há pedidos empenhados aguardando separação.</p>}
                {selectedLogisticsOrder?.items.map((item) => {
                  const positions = allocations.filter((position) => position.code === item.code);
                  const rows = orderSelections[item.id] ?? [{ allocationId: "", quantity: "" }];
                  const selectedTotal = rows.reduce((sum, row) => sum + Number(row.quantity || 0), 0);
                  return <fieldset className="separation-item" key={item.id}><legend><strong>{item.code}</strong> · {item.description} ({item.finish}) <span>{item.quantity} unidades</span></legend>
                    {rows.map((row, index) => <div className="source-line" key={index}>
                      <label className="field"><span>Posição de saída</span><select value={row.allocationId} onChange={(event) => setOrderSelections((current) => ({ ...current, [item.id]: rows.map((entry, rowIndex) => rowIndex === index ? { ...entry, allocationId: event.target.value } : entry) }))}><option value="">Selecione rua, coluna e nível</option>{positions.map((position) => <option key={position.id} value={position.id}>Rua {position.street} · Coluna {position.column} · Nível {position.level} — {position.quantity} un.</option>)}</select></label>
                      <label className="field"><span>Quantidade</span><input type="number" min="1" step="1" value={row.quantity} onChange={(event) => setOrderSelections((current) => ({ ...current, [item.id]: rows.map((entry, rowIndex) => rowIndex === index ? { ...entry, quantity: event.target.value } : entry) }))} /></label>
                      {rows.length > 1 && <button className="remove-line source-remove" type="button" aria-label="Remover posição" onClick={() => setOrderSelections((current) => ({ ...current, [item.id]: rows.filter((_, rowIndex) => rowIndex !== index) }))}>×</button>}
                    </div>)}
                    <div className="source-summary"><button className="add-line" type="button" onClick={() => setOrderSelections((current) => ({ ...current, [item.id]: [...rows, { allocationId: "", quantity: "" }] }))}>+ Usar outra posição</button><span className={selectedTotal === item.quantity ? "complete" : ""}>{selectedTotal} de {item.quantity} selecionadas</span></div>
                    {!positions.length && <p className="field-hint warning">Este produto não possui posição alocada.</p>}
                  </fieldset>;
                })}
                {logisticsError && <p className="form-error" role="alert">{logisticsError}</p>}
                <div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setLogisticsForm(null)}>Cancelar</button><button className="primary-button" type="submit" disabled={!selectedLogisticsOrder}>Confirmar separação</button></div>
              </form>
            ) : (
              <form onSubmit={submitLogistics}>
                <label className="field"><span>Código do produto</span><select value={logisticsCode} onChange={(event) => { setLogisticsCode(event.target.value); setLogisticsError(""); }}>{items.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.description} ({item.finish})</option>)}</select></label>
                <div className="selected-stock"><div><span>Estoque GH</span><strong>{logisticsItem.gh}</strong></div><div><span>Empenhado</span><strong>{logisticsItem.ghCommitted}</strong></div><div><span>Disponível</span><strong>{Math.max(logisticsItem.gh - logisticsItem.ghCommitted, 0)}</strong></div></div>
                <>
                  <label className="field"><span>Nova quantidade do Estoque GH</span><input type="number" min="0" step="1" value={adjustedQuantity} onChange={(event) => { setAdjustedQuantity(event.target.value); setLogisticsError(""); }} /></label>
                  <label className="field"><span>Motivo do ajuste</span><textarea rows={4} value={adjustmentNote} onChange={(event) => { setAdjustmentNote(event.target.value); setLogisticsError(""); }} placeholder="Explique por que o saldo está sendo ajustado" /></label>
                </>
                {logisticsError && <p className="form-error" role="alert">{logisticsError}</p>}
                <div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setLogisticsForm(null)}>Cancelar</button><button className="primary-button" type="submit">Salvar ajuste</button></div>
              </form>
            )}
          </section>
        </div>
      )}

      {invoiceOrder && <div className="dialog-backdrop" role="presentation"><section className="commitment-dialog compact-dialog" role="dialog" aria-modal="true" aria-labelledby="invoice-title"><div className="dialog-heading"><div><p className="context">Pedido {invoiceOrder.order_number}</p><h2 id="invoice-title">Baixa por NF</h2></div><button className="close-button" type="button" onClick={() => setInvoiceOrder(null)} aria-label="Fechar">×</button></div><form onSubmit={submitInvoice}><label className="field"><span>Número da nota fiscal</span><input autoFocus value={invoiceNumber} onChange={(event) => { setInvoiceNumber(event.target.value); setLogisticsError(""); }} /></label>{invoiceOrder.loan_items ? <p className="field-hint">Após a baixa, este pedido ficará aguardando a devolução de todos os itens.</p> : null}{logisticsError && <p className="form-error" role="alert">{logisticsError}</p>}<div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setInvoiceOrder(null)}>Cancelar</button><button className="primary-button" type="submit">Confirmar saída</button></div></form></section></div>}

      {returnOrder && <div className="dialog-backdrop" role="presentation"><section className="commitment-dialog" role="dialog" aria-modal="true" aria-labelledby="return-title"><div className="dialog-heading"><div><p className="context">Pedido {returnOrder.order_number}</p><h2 id="return-title">Registrar devolução integral</h2></div><button className="close-button" type="button" onClick={() => setReturnOrder(null)} aria-label="Fechar">×</button></div><form onSubmit={submitReturn}><p className="dialog-copy">Todos os itens abaixo retornarão juntos ao Estoque Devolução.</p>{returnOrder.items.map((item) => { const position = returnPositions[item.id] ?? { street: "", column: "", level: "" }; return <fieldset className="return-item" key={item.id}><legend><strong>{item.code}</strong> · {item.quantity} unidades</legend><div className="allocation-fields"><label className="field"><span>Rua</span><input value={position.street} onChange={(event) => setReturnPositions((current) => ({ ...current, [item.id]: { ...position, street: event.target.value } }))} /></label><label className="field"><span>Coluna</span><input value={position.column} onChange={(event) => setReturnPositions((current) => ({ ...current, [item.id]: { ...position, column: event.target.value } }))} /></label><label className="field"><span>Nível</span><input value={position.level} onChange={(event) => setReturnPositions((current) => ({ ...current, [item.id]: { ...position, level: event.target.value } }))} /></label></div></fieldset>; })}{logisticsError && <p className="form-error" role="alert">{logisticsError}</p>}<div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setReturnOrder(null)}>Cancelar</button><button className="primary-button" type="submit">Confirmar devolução</button></div></form></section></div>}

      {allocationFormOpen && (
        <div className="dialog-backdrop" role="presentation">
          <section className="commitment-dialog" role="dialog" aria-modal="true" aria-labelledby="allocation-form-title">
            <div className="dialog-heading">
              <div><p className="context">Alocação</p><h2 id="allocation-form-title">{activeAllocationTask ? "Alocar produtos" : "Editar produtos"}</h2></div>
              <button className="close-button" type="button" onClick={() => setAllocationFormOpen(false)} aria-label="Fechar">×</button>
            </div>
            <form onSubmit={submitAllocation}>
              {activeAllocationTask ? (
                <div className="task-banner">
                  <div><span>Embarque</span><strong>{activeAllocationTask.shipment_identifier}</strong></div>
                  <div><span>Produto</span><strong>{activeAllocationTask.code} — {activeAllocationTask.description}</strong></div>
                  <div><span>Falta alocar neste embarque</span><strong>{availableToAllocate} un.</strong></div>
                </div>
              ) : (
                <label className="field"><span>Código do produto</span>
                  <select value={allocationCode} onChange={(event) => { setAllocationCode(event.target.value); setAllocationError(""); }}>
                    {items.map((item) => <option key={item.code} value={item.code}>{item.code} — {item.description} ({item.finish})</option>)}
                  </select>
                </label>
              )}
              <div className="selected-stock">
                <div><span>{activeAllocationTask ? "Total no embarque" : "Estoque GH"}</span><strong>{effectiveAllocationGh}</strong></div>
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

      {editingAllocation && (() => {
        const sourceList = editingAllocation.isReturn ? returnAllocations : allocations;
        const destinationMatch = sourceList.find((entry) =>
          entry.id !== editingAllocation.id
          && entry.code === editingAllocation.code
          && entry.street.trim().toLowerCase() === transferStreet.trim().toLowerCase()
          && entry.column.trim().toLowerCase() === transferColumn.trim().toLowerCase()
          && entry.level.trim().toLowerCase() === transferLevel.trim().toLowerCase(),
        );
        const parsedQty = Number.isInteger(Number(transferQuantity)) && Number(transferQuantity) > 0 ? Number(transferQuantity) : 0;
        return (
          <div className="dialog-backdrop" role="presentation">
            <section className="commitment-dialog" role="dialog" aria-modal="true" aria-labelledby="transfer-form-title">
              <div className="dialog-heading">
                <div><p className="context">{editingAllocation.code} — {editingAllocation.description}</p><h2 id="transfer-form-title">Transferir posição</h2></div>
                <button className="close-button" type="button" onClick={() => setEditingAllocation(null)} aria-label="Fechar">×</button>
              </div>
              <form onSubmit={submitTransfer}>
                <div className="selected-stock">
                  <div><span>Origem</span><strong>Rua {editingAllocation.street} · Col. {editingAllocation.column} · Nív. {editingAllocation.level}</strong></div>
                  <div><span>Saldo na posição</span><strong>{editingAllocation.quantity} un.</strong></div>
                </div>
                <div className="allocation-fields">
                  <label className="field"><span>Nova Rua</span><input value={transferStreet} onChange={(event) => { setTransferStreet(event.target.value); setTransferError(""); }} /></label>
                  <label className="field"><span>Nova Coluna</span><input value={transferColumn} onChange={(event) => { setTransferColumn(event.target.value); setTransferError(""); }} /></label>
                  <label className="field"><span>Novo Nível</span><input value={transferLevel} onChange={(event) => { setTransferLevel(event.target.value); setTransferError(""); }} /></label>
                </div>
                <label className="field"><span>Quantidade a transferir</span><input type="number" min="1" max={editingAllocation.quantity} step="1" value={transferQuantity} onChange={(event) => { setTransferQuantity(event.target.value); setTransferError(""); }} /></label>
                {destinationMatch && (
                  <div className="task-banner">
                    <div><span>Produto já na posição</span><strong>{destinationMatch.quantity} un.</strong></div>
                    <div><span>Transferindo</span><strong>+{parsedQty} un.</strong></div>
                    <div><span>Novo saldo somado</span><strong>{destinationMatch.quantity + parsedQty} un.</strong></div>
                  </div>
                )}
                {transferError && <p className="form-error" role="alert">{transferError}</p>}
                <div className="dialog-actions"><button className="secondary-button" type="button" onClick={() => setEditingAllocation(null)}>Cancelar</button><button className="primary-button" type="submit">Confirmar transferência</button></div>
              </form>
            </section>
          </div>
        );
      })()}
    </main>
  );
}

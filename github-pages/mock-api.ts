/* eslint-disable @typescript-eslint/no-explicit-any */
type DemoRecord = Record<string, any>;

type DemoState = {
  inventory: DemoRecord[];
  shipments: DemoRecord[];
  purchaseOrders: DemoRecord[];
  commitments: DemoRecord[];
  allocations: DemoRecord[];
  allocationTasks: DemoRecord[];
  logisticsEvents: DemoRecord[];
  logisticsOrders: DemoRecord[];
  returnAllocations: DemoRecord[];
  counters: Record<string, number>;
};

const STORAGE_KEY = "ilya-estoque-github-pages-demo-v1";
const originalFetch = window.fetch.bind(window);

function initialState(): DemoState {
  return {
    inventory: [
      { code: "CD0100", description: "Cadeira", finish: "Taupe", china: 50, transit: 20, port: 0, gh: 120, returns: 4, updated_at: now() },
      { code: "MJ0100", description: "Mesa", finish: "Rose", china: 40, transit: 0, port: 30, gh: 80, returns: 0, updated_at: now() },
      { code: "SF0100", description: "Sofá", finish: "Areia", china: 60, transit: 50, port: 0, gh: 100, returns: 2, updated_at: now() },
    ],
    shipments: [
      { id: 1, code: "CD0100", quantity: 20, source: "purchase", stage: "transit", due_date: dateAfter(7) },
      { id: 2, code: "MJ0100", quantity: 30, source: "purchase", stage: "port", due_date: dateAfter(3) },
    ],
    purchaseOrders: [
      { id: 1, code: "CD0100", total_quantity: 70, china_quantity: 50, transit_quantity: 20, created_at: now() },
      { id: 2, code: "MJ0100", total_quantity: 70, china_quantity: 40, transit_quantity: 30, created_at: now() },
    ],
    commitments: [],
    allocations: [
      { id: 1, code: "CD0100", street: "A", column: "01", level: "01", quantity: 70, created_at: now() },
      { id: 2, code: "CD0100", street: "A", column: "02", level: "01", quantity: 50, created_at: now() },
      { id: 3, code: "MJ0100", street: "B", column: "01", level: "02", quantity: 80, created_at: now() },
      { id: 4, code: "SF0100", street: "C", column: "03", level: "01", quantity: 100, created_at: now() },
    ],
    allocationTasks: [],
    logisticsEvents: [],
    logisticsOrders: [],
    returnAllocations: [
      { id: 1, logistics_order_item_id: 0, code: "CD0100", street: "DEV", column: "01", level: "01", quantity: 4, order_number: "DEMO-001", created_at: now() },
      { id: 2, logistics_order_item_id: 0, code: "SF0100", street: "DEV", column: "02", level: "01", quantity: 2, order_number: "DEMO-002", created_at: now() },
    ],
    counters: { shipment: 2, purchase: 2, commitment: 0, commitmentItem: 0, allocation: 4, task: 0, logisticsEvent: 0, logisticsOrder: 0, logisticsItem: 0, returnAllocation: 2 },
  };
}

function loadState(): DemoState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : initialState();
  } catch {
    return initialState();
  }
}

const state = loadState();

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function now() {
  return new Date().toISOString().slice(0, 19).replace("T", " ");
}

function dateAfter(days: number) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

function next(counter: string) {
  state.counters[counter] = (state.counters[counter] ?? 0) + 1;
  return state.counters[counter];
}

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: { "content-type": "application/json" } });
}

function inventoryItem(code: string) {
  return state.inventory.find((item) => item.code === code);
}

function enrichedAllocation(position: DemoRecord) {
  return { ...position, ...pickProduct(position.code) };
}

function pickProduct(code: string) {
  const item = inventoryItem(code);
  return { description: item?.description ?? "", finish: item?.finish ?? "" };
}

function commitmentDocuments() {
  return state.commitments.map((document) => ({
    ...document,
    items: document.items.map((item: DemoRecord) => ({ ...item, ...pickProduct(item.code) })),
  })).sort((a, b) => b.id - a.id);
}

function logisticsData() {
  const openOrders = commitmentDocuments().filter((document) => document.type === "order");
  const logisticsOrders = state.logisticsOrders.map((order) => ({
    ...order,
    items: order.items.map((item: DemoRecord) => ({ ...item, ...pickProduct(item.code) })),
  })).sort((a, b) => b.id - a.id);
  return {
    inventory: state.inventory,
    events: state.logisticsEvents.slice().reverse(),
    openOrders,
    logisticsOrders,
    returnAllocations: state.returnAllocations.map((position) => ({ ...position, ...pickProduct(position.code) })).reverse(),
  };
}

function foreignData() {
  return {
    inventory: state.inventory,
    shipments: state.shipments.filter((shipment) => shipment.stage !== "completed").sort((a, b) => String(a.due_date).localeCompare(String(b.due_date))),
    orders: state.purchaseOrders.slice().reverse(),
  };
}

function allocationsData() {
  return {
    inventory: state.inventory,
    allocations: state.allocations.map(enrichedAllocation).reverse(),
    tasks: state.allocationTasks.filter((task) => task.status === "pending").map((task) => ({ ...task, ...pickProduct(task.code) })),
  };
}

async function bodyOf(input: RequestInfo | URL, init?: RequestInit) {
  if (init?.body) return JSON.parse(String(init.body));
  if (input instanceof Request) return input.clone().json();
  return {};
}

async function commitmentsApi(url: URL, method: string, input: RequestInfo | URL, init?: RequestInit) {
  if (method === "GET") return json({ documents: commitmentDocuments() });
  if (method === "DELETE") {
    const id = Number(url.searchParams.get("id"));
    state.commitments = state.commitments.filter((document) => document.id !== id);
    save();
    return json({ documents: commitmentDocuments() });
  }
  const payload = await bodyOf(input, init);
  const grouped = new Map<string, number>();
  for (const item of payload.items ?? []) grouped.set(item.code, (grouped.get(item.code) ?? 0) + Number(item.quantity));
  for (const [code, requested] of grouped) {
    const stock = inventoryItem(code);
    const committed = state.commitments.flatMap((document) => document.items).filter((item) => item.code === code).reduce((sum, item) => sum + item.quantity, 0);
    if (!stock || requested > stock.gh - committed) return json({ error: `${code}: quantidade maior que o disponível.` }, 400);
  }
  const id = next("commitment");
  state.commitments.push({
    id,
    type: payload.type,
    reservation_code: payload.type === "reservation" ? `R${String(id).padStart(3, "0")}` : null,
    order_number: payload.type === "order" ? String(payload.orderNumber) : null,
    note: String(payload.note ?? ""),
    loan_items: payload.loanItems ? 1 : 0,
    created_at: now(),
    items: (payload.items ?? []).map((item: DemoRecord) => ({ id: next("commitmentItem"), code: item.code, quantity: Number(item.quantity) })),
  });
  save();
  return json({ documents: commitmentDocuments() }, 201);
}

async function foreignApi(method: string, input: RequestInfo | URL, init?: RequestInit) {
  if (method === "GET") return json(foreignData());
  const payload = await bodyOf(input, init);
  const item = inventoryItem(String(payload.code));
  if (!item) return json({ error: "Código de item inválido." }, 400);
  if (payload.action === "purchase") {
    const total = Number(payload.totalQuantity), china = Number(payload.chinaQuantity), transit = Number(payload.transitQuantity);
    if (china + transit !== total) return json({ error: "A distribuição deve somar a quantidade total." }, 400);
    item.china += china; item.transit += transit; item.updated_at = now();
    const purchaseId = next("purchase");
    state.purchaseOrders.push({ id: purchaseId, code: item.code, total_quantity: total, china_quantity: china, transit_quantity: transit, created_at: now() });
    if (transit > 0) state.shipments.push({ id: next("shipment"), purchase_order_id: purchaseId, code: item.code, quantity: transit, source: "purchase", stage: "transit", due_date: payload.dueDate });
  } else if (payload.action === "dispatch_china") {
    const quantity = Number(payload.quantity);
    if (quantity > item.china) return json({ error: "Quantidade maior que o disponível na China." }, 400);
    item.china -= quantity; item.transit += quantity; item.updated_at = now();
    state.shipments.push({ id: next("shipment"), code: item.code, quantity, source: "china", stage: "transit", due_date: payload.dueDate });
  } else if (payload.action === "reschedule") {
    const shipment = state.shipments.find((entry) => entry.id === Number(payload.shipmentId));
    if (shipment) shipment.due_date = payload.dueDate;
  } else if (payload.action === "confirm_arrival") {
    const shipment = state.shipments.find((entry) => entry.id === Number(payload.shipmentId));
    if (!shipment) return json({ error: "Remessa não encontrada." }, 404);
    if (shipment.stage === "transit") {
      item.transit -= shipment.quantity; item.port += shipment.quantity;
      shipment.stage = "port"; shipment.due_date = payload.dueDate;
    } else {
      item.port -= shipment.quantity; item.gh += shipment.quantity; shipment.stage = "completed";
      state.allocationTasks.push({ id: next("task"), shipment_id: shipment.id, code: item.code, quantity: shipment.quantity, allocated_quantity: 0, status: "pending", created_at: now() });
      state.purchaseOrders = state.purchaseOrders.filter((order) => order.id !== shipment.purchase_order_id);
    }
    item.updated_at = now();
  }
  save();
  return json(foreignData());
}

async function allocationsApi(method: string, input: RequestInfo | URL, init?: RequestInit) {
  if (method === "GET") return json(allocationsData());
  const payload = await bodyOf(input, init);
  const item = inventoryItem(String(payload.code));
  const quantity = Number(payload.quantity);
  const allocated = state.allocations.filter((entry) => entry.code === payload.code).reduce((sum, entry) => sum + entry.quantity, 0);
  if (!item || quantity > item.gh - allocated) return json({ error: "Quantidade maior que a disponível para alocação." }, 400);
  const existing = state.allocations.find((entry) => entry.code === payload.code && entry.street.toLowerCase() === String(payload.street).toLowerCase() && entry.column.toLowerCase() === String(payload.column).toLowerCase() && entry.level.toLowerCase() === String(payload.level).toLowerCase());
  if (existing) existing.quantity += quantity;
  else state.allocations.push({ id: next("allocation"), code: payload.code, street: payload.street, column: payload.column, level: payload.level, quantity, created_at: now() });
  const task = state.allocationTasks.find((entry) => entry.id === Number(payload.taskId));
  if (task) {
    task.allocated_quantity += quantity;
    if (task.allocated_quantity >= task.quantity) task.status = "completed";
  }
  save();
  return json(allocationsData());
}

async function logisticsApi(method: string, input: RequestInfo | URL, init?: RequestInit) {
  if (method === "GET") return json(logisticsData());
  const payload = await bodyOf(input, init);
  if (payload.action === "adjustment") {
    const item = inventoryItem(String(payload.code));
    if (!item) return json({ error: "Produto inválido." }, 400);
    const previous = item.gh;
    item.gh = Number(payload.newQuantity); item.updated_at = now();
    state.logisticsEvents.push({ id: next("logisticsEvent"), type: "adjustment", code: item.code, quantity: item.gh - previous, previous_quantity: previous, new_quantity: item.gh, note: payload.note, created_at: now() });
  } else if (payload.action === "separate_order") {
    const document = state.commitments.find((entry) => entry.id === Number(payload.documentId) && entry.type === "order");
    if (!document) return json({ error: "Pedido não encontrado ou já separado." }, 400);
    const items = [];
    for (const line of document.items) {
      const selections = (payload.selections ?? []).filter((entry: DemoRecord) => Number(entry.itemId) === line.id);
      if (selections.reduce((sum: number, entry: DemoRecord) => sum + Number(entry.quantity), 0) !== line.quantity) return json({ error: `${line.code}: distribua exatamente ${line.quantity} unidades.` }, 400);
      const sources = [];
      for (const selection of selections) {
        const position = state.allocations.find((entry) => entry.id === Number(selection.allocationId) && entry.code === line.code);
        const quantity = Number(selection.quantity);
        if (!position || quantity > position.quantity) return json({ error: `${line.code}: posição sem saldo suficiente.` }, 400);
        sources.push({ id: next("logisticsItem"), street: position.street, column: position.column, level: position.level, quantity });
        position.quantity -= quantity;
      }
      state.allocations = state.allocations.filter((position) => position.quantity > 0);
      const stock = inventoryItem(line.code);
      if (stock) { stock.gh -= line.quantity; stock.updated_at = now(); }
      items.push({ id: next("logisticsItem"), code: line.code, quantity: line.quantity, sources });
    }
    state.logisticsOrders.push({ id: next("logisticsOrder"), order_number: document.order_number, loan_items: document.loan_items, status: "awaiting_invoice", invoice_number: null, separated_at: now(), departed_at: null, returned_at: null, items });
    state.commitments = state.commitments.filter((entry) => entry.id !== document.id);
  } else if (payload.action === "invoice") {
    const order = state.logisticsOrders.find((entry) => entry.id === Number(payload.orderId));
    if (!order) return json({ error: "Pedido não encontrado." }, 400);
    order.invoice_number = payload.invoiceNumber; order.departed_at = now(); order.status = order.loan_items ? "awaiting_return" : "completed";
  } else if (payload.action === "return_order") {
    const order = state.logisticsOrders.find((entry) => entry.id === Number(payload.orderId) && entry.status === "awaiting_return");
    if (!order) return json({ error: "Pedido não está aguardando devolução." }, 400);
    for (const line of order.items) {
      const position = (payload.positions ?? []).find((entry: DemoRecord) => Number(entry.itemId) === line.id);
      if (!position?.street || !position?.column || !position?.level) return json({ error: `Informe a posição de ${line.code}.` }, 400);
      const stock = inventoryItem(line.code);
      if (stock) { stock.returns += line.quantity; stock.updated_at = now(); }
      state.returnAllocations.push({ id: next("returnAllocation"), logistics_order_item_id: line.id, code: line.code, street: position.street, column: position.column, level: position.level, quantity: line.quantity, order_number: order.order_number, created_at: now() });
    }
    order.status = "returned"; order.returned_at = now();
  }
  save();
  return json(logisticsData());
}

export function installDemoApi() {
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const raw = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    const url = new URL(raw, window.location.origin);
    const method = String(init?.method ?? (input instanceof Request ? input.method : "GET")).toUpperCase();
    if (url.pathname.endsWith("/api/commitments")) return commitmentsApi(url, method, input, init);
    if (url.pathname.endsWith("/api/foreign-trade")) return foreignApi(method, input, init);
    if (url.pathname.endsWith("/api/allocations")) return allocationsApi(method, input, init);
    if (url.pathname.endsWith("/api/logistics")) return logisticsApi(method, input, init);
    return originalFetch(input, init);
  };
}

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

const STORAGE_KEY = "ilya-estoque-github-pages-demo-v3";
const originalFetch = window.fetch.bind(window);

const CATALOG_PRODUCTS: Array<{ code: string; description: string; finish: string }> = [
  { code: "ICS0001", description: "CONJUNTO SEATLE - TAUPE / TECIDO NATURAL / POLYWOOD TEKA", finish: "Taupe" },
  { code: "IES0005", description: "ESTRUTURA ESPREGUICADEIRA TEXAS S/ BCS - SEM GRADE", finish: "Sem Grade" },
  { code: "IMJ0003", description: "MESA JANTAR ASPEN C/ F RED 1,02 D X 0,72 H - TAUPE", finish: "Taupe" },
  { code: "IES0073", description: "ESPREGUICADEIRA LONDON S/ BCS - SEM GRADE", finish: "Sem Grade" },
  { code: "ISF0102", description: "SOFA LONDON 2 L C/ BCS- TAUPE", finish: "Taupe" },
  { code: "IPL0094", description: "POLTRONA LONDON C/ BCS- TAUPE", finish: "Taupe" },
  { code: "ICD0004", description: "CADEIRA GENOVA C/ BCS - TAUPE / KHAKI FECHADO / POLYWOOD TEKA", finish: "Taupe" },
  { code: "ICD0007", description: "CADEIRA ORLEANS C/ BCS - TAUPE / KHAKI FECHADO", finish: "Taupe" },
  { code: "IES0057", description: "ESPREGUICADEIRA LONDON S/ BCS - TAUPE / KHAKI", finish: "Taupe" },
  { code: "IMJ0005", description: "MESA JANTAR ASPEN C/ F RED 1,20 D X 0,72 H - TAUPE", finish: "Taupe" },
  { code: "00030781", description: "KIT BATOQUE ESPREGUICADEIRA TEXAS", finish: "Padrão" },
  { code: "00027871", description: "BRACO DE POLYWOOD CADEIRA GENOVA", finish: "Polywood" },
  { code: "MP000659", description: "BATOQUE ESPREGUIÇADEIRA LONDON - PRETO", finish: "Preto" },
  { code: "MP000658", description: "BATOQUE ESPREGUIÇADEIRA LONDON - CHAMPAGNE", finish: "Champagne" },
];

function initialState(): DemoState {
  return {
    inventory: [
      { code: "CD0100", description: "Cadeira", finish: "Taupe", china: 50, transit: 20, port: 0, gh: 120, returns: 4, updated_at: now() },
      { code: "MJ0100", description: "Mesa", finish: "Rose", china: 40, transit: 0, port: 30, gh: 80, returns: 0, updated_at: now() },
      { code: "SF0100", description: "Sofá", finish: "Areia", china: 60, transit: 50, port: 0, gh: 100, returns: 2, updated_at: now() },
      ...CATALOG_PRODUCTS.map((item) => ({ ...item, china: 0, transit: 0, port: 0, gh: 0, returns: 0, updated_at: now() })),
    ],
    shipments: [
      { id: 1, purchase_order_id: 1, shipment_identifier: "EMB-DEMO-001", code: "CD0100", quantity: 20, unit_value_usd_cents: 4500, source: "purchase", stage: "transit", due_date: dateAfter(7) },
      { id: 2, purchase_order_id: 2, shipment_identifier: "EMB-DEMO-002", code: "MJ0100", quantity: 30, unit_value_usd_cents: 12000, source: "purchase", stage: "port", due_date: dateAfter(3) },
    ],
    purchaseOrders: [
      {
        id: 1,
        shipment_identifier: "EMB-DEMO-001",
        invoice_code: "NF-DEMO-001",
        created_at: now(),
        items: [{ item_id: 1, code: "CD0100", unit_value_usd_cents: 4500, total_quantity: 70, china_quantity: 50, transit_quantity: 20 }],
      },
      {
        id: 2,
        shipment_identifier: "EMB-DEMO-002",
        invoice_code: "NF-DEMO-002",
        created_at: now(),
        items: [{ item_id: 2, code: "MJ0100", unit_value_usd_cents: 12000, total_quantity: 70, china_quantity: 40, transit_quantity: 30 }],
      },
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
    counters: { shipment: 2, purchase: 2, purchaseItem: 2, commitment: 0, commitmentItem: 0, allocation: 4, task: 0, logisticsEvent: 0, logisticsOrder: 0, logisticsItem: 0, returnAllocation: 2 },
  };
}

function loadState(): DemoState {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return initialState();
    const parsed = JSON.parse(saved) as DemoState;
    for (const item of CATALOG_PRODUCTS) {
      if (!parsed.inventory.some((existing) => existing.code === item.code)) {
        parsed.inventory.push({ ...item, china: 0, transit: 0, port: 0, gh: 0, returns: 0, updated_at: now() });
      }
    }
    return parsed;
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

function parseUsdCents(value: unknown) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, decimal = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function shipmentIdentifierExists(identifier: string) {
  const needle = identifier.toLowerCase();
  return state.purchaseOrders.some((order) => String(order.shipment_identifier ?? "").toLowerCase() === needle)
    || state.shipments.some((shipment) => String(shipment.shipment_identifier ?? "").toLowerCase() === needle);
}

function groupDemoShipments() {
  const active = state.shipments
    .filter((shipment) => shipment.stage !== "completed")
    .sort((a, b) => String(a.due_date).localeCompare(String(b.due_date)) || Number(a.id) - Number(b.id));

  const groups = new Map<string, DemoRecord>();
  for (const row of active) {
    const order = row.purchase_order_id ? state.purchaseOrders.find((entry) => entry.id === row.purchase_order_id) : null;
    const shipmentIdentifier = order?.shipment_identifier ?? row.shipment_identifier ?? `Transferência ${row.id}`;
    const key = row.purchase_order_id
      ? `purchase-${row.purchase_order_id}`
      : row.shipment_identifier
        ? `china-${String(row.shipment_identifier).toLowerCase()}`
        : `shipment-${row.id}`;
    const group = groups.get(key) ?? {
      id: key,
      purchase_order_id: row.purchase_order_id ?? null,
      shipment_identifier: shipmentIdentifier,
      dollar_rate_cents: order?.dollar_rate_cents ?? row.dollar_rate_cents ?? null,
      freight_usd_cents: order?.freight_usd_cents ?? row.freight_usd_cents ?? null,
      source: row.source,
      stage: row.stage,
      due_date: row.due_date,
      items: [],
    };
    group.items.push({
      shipment_id: row.id,
      code: row.code,
      ...pickProduct(row.code),
      quantity: row.quantity,
      unit_value_usd_cents: row.unit_value_usd_cents ?? null,
    });
    groups.set(key, group);
  }
  return [...groups.values()];
}

function matchingShipmentsFor(payload: DemoRecord) {
  const purchaseOrderId = Number(payload.purchaseOrderId);
  if (Number.isInteger(purchaseOrderId) && purchaseOrderId > 0) {
    return state.shipments.filter((entry) => entry.purchase_order_id === purchaseOrderId && entry.stage !== "completed");
  }
  const shipmentIdentifier = String(payload.shipmentIdentifier ?? "").trim().toLowerCase();
  if (shipmentIdentifier) {
    const byIdentifier = state.shipments.filter((entry) => String(entry.shipment_identifier ?? "").toLowerCase() === shipmentIdentifier && entry.stage !== "completed");
    if (byIdentifier.length) return byIdentifier;
  }
  const shipmentId = Number(payload.shipmentId);
  return state.shipments.filter((entry) => entry.id === shipmentId && entry.stage !== "completed");
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
  const exitSummary = new Map<string, DemoRecord>();
  for (const event of state.logisticsEvents) {
    if (event.type !== "exit") continue;
    const current = exitSummary.get(event.code) ?? { code: event.code, quantity: 0, invoices: new Set<string>(), last_invoice: null };
    current.quantity += Number(event.quantity);
    current.invoices.add(String(event.invoice_number ?? event.id));
    current.last_invoice = event.invoice_number ?? current.last_invoice;
    exitSummary.set(event.code, current);
  }
  return {
    inventory: state.inventory,
    events: state.logisticsEvents.slice().reverse().slice(0, 100),
    exitSummary: [...exitSummary.values()].map(({ invoices, ...entry }) => ({ ...entry, count: invoices.size })),
    openOrders,
    logisticsOrders,
    returnAllocations: state.returnAllocations.map((position) => ({ ...position, ...pickProduct(position.code) })).reverse(),
  };
}

function foreignData() {
  return {
    inventory: state.inventory,
    shipments: groupDemoShipments(),
    orders: state.purchaseOrders
      .slice()
      .sort((a, b) => Number(b.id) - Number(a.id))
      .slice(0, 30)
      .map((order) => ({
        ...order,
        items: (order.items ?? []).map((item: DemoRecord) => ({ ...item, ...pickProduct(item.code) })),
      })),
  };
}

function mergeShipmentIdentifiers(existing: unknown, incoming: unknown) {
  const first = String(existing ?? "").trim();
  const second = String(incoming ?? "").trim();
  if (!first) return second || null;
  if (!second) return first;
  const parts = first.split(",").map((part) => part.trim()).filter(Boolean);
  if (!parts.some((part) => part.toLowerCase() === second.toLowerCase())) {
    parts.push(second);
  }
  return parts.join(", ");
}

function resolveTaskShipmentIdentifier(task: DemoRecord) {
  const shipment = state.shipments.find((entry) => entry.id === task.shipment_id);
  const order = shipment?.purchase_order_id
    ? state.purchaseOrders.find((entry) => entry.id === shipment.purchase_order_id)
    : null;
  return order?.shipment_identifier
    ?? shipment?.shipment_identifier
    ?? (task.shipment_id ? `Embarque #${task.shipment_id}` : `Entrada avulsa #${task.id}`);
}

function allocationsData() {
  return {
    inventory: state.inventory,
    allocations: state.allocations.map(enrichedAllocation).reverse(),
    tasks: state.allocationTasks
      .filter((task) => task.status === "pending")
      .map((task) => {
        const shipment = state.shipments.find((entry) => entry.id === task.shipment_id);
        return {
          ...task,
          ...pickProduct(task.code),
          shipment_identifier: resolveTaskShipmentIdentifier(task),
          due_date: shipment?.due_date ?? null,
          source: shipment?.source ?? null,
        };
      }),
    incomingShipments: groupDemoShipments().filter((shipment) => shipment.stage === "port"),
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
  const type = String(payload.type ?? "");
  const note = String(payload.note ?? "").trim();
  const orderNumber = String(payload.orderNumber ?? "").trim();
  const rawItems = Array.isArray(payload.items) ? payload.items : [];
  if (!["reservation", "order"].includes(type) || rawItems.length === 0 || (type === "reservation" && !note)) {
    return json({ error: "Informe o tipo e pelo menos um item; reservas também exigem observação." }, 400);
  }
  if (type === "order" && !orderNumber) return json({ error: "O número do pedido é obrigatório." }, 400);
  const normalized = rawItems.map((item: DemoRecord) => ({ code: String(item.code ?? ""), quantity: Number(item.quantity) }));
  if (normalized.some((item: DemoRecord) => !item.code || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
    return json({ error: "Todos os itens precisam de produto e quantidade inteira positiva." }, 400);
  }
  const grouped = new Map<string, number>();
  for (const item of normalized) grouped.set(item.code, (grouped.get(item.code) ?? 0) + item.quantity);
  for (const [code, requested] of grouped) {
    const stock = inventoryItem(code);
    if (!stock) return json({ error: `Produto ${code} inválido.` }, 400);
    const committed = state.commitments.flatMap((document) => document.items).filter((item) => item.code === code).reduce((sum, item) => sum + item.quantity, 0);
    const available = Math.max(stock.gh - committed, 0);
    if (requested > available) return json({ error: `${code}: solicitado ${requested}, mas há ${available} unidades disponíveis no Estoque GH.` }, 400);
  }
  // Mesmo critério do D1: próximo número após o maior código R existente.
  const lastReservation = state.commitments
    .map((document) => /^R(\d+)$/.exec(String(document.reservation_code ?? ""))?.[1])
    .reduce((max, value) => Math.max(max, Number(value ?? 0)), 0);
  const id = next("commitment");
  state.commitments.push({
    id,
    type,
    reservation_code: type === "reservation" ? `R${String(lastReservation + 1).padStart(3, "0")}` : null,
    order_number: type === "order" ? orderNumber : null,
    note,
    loan_items: type === "order" && payload.loanItems === true ? 1 : 0,
    created_at: now(),
    items: normalized.map((item: DemoRecord) => ({ id: next("commitmentItem"), code: item.code, quantity: item.quantity })),
  });
  save();
  return json({ documents: commitmentDocuments() }, 201);
}

async function foreignApi(method: string, input: RequestInfo | URL, init?: RequestInit) {
  if (method === "GET") return json(foreignData());
  const payload = await bodyOf(input, init);

  if (payload.action === "purchase") {
    const shipmentIdentifier = String(payload.shipmentIdentifier ?? "").trim();
    const invoiceCode = String(payload.invoiceCode ?? "").trim() || null;
    const dollarRateCents = payload.dollarRate ? parseUsdCents(payload.dollarRate) : null;
    const freightUsdCents = payload.freightUsd ? parseUsdCents(payload.freightUsd) : null;
    const rawItems = Array.isArray(payload.items) ? payload.items : [];
    const dueDate = validDate(payload.dueDate);
    if (!shipmentIdentifier) return json({ error: "Informe o embarque." }, 400);
    if (!rawItems.length) return json({ error: "Adicione ao menos um item ao pedido." }, 400);
    if (shipmentIdentifierExists(shipmentIdentifier)) return json({ error: "Já existe um embarque com este identificador." }, 409);

    const parsedItems: Array<{ code: string; total: number; china: number; transit: number; unitValueUsdCents: number }> = [];
    for (const rawItem of rawItems) {
      const code = String(rawItem.code ?? "").trim().toUpperCase();
      const stock = inventoryItem(code);
      if (!stock) return json({ error: `${code || "Item"}: código não encontrado no banco de dados.` }, 400);
      const total = Number(rawItem.totalQuantity);
      const china = Number(rawItem.chinaQuantity);
      const valueCents = parseUsdCents(rawItem.unitValueUsd);
      if (!Number.isInteger(total) || total <= 0 || !Number.isInteger(china) || china < 0 || china > total) {
        return json({ error: `${code}: informe quantidades inteiras válidas; a quantidade na China não pode superar o total.` }, 400);
      }
      if (!valueCents) {
        return json({ error: `${code}: informe um Valor FOB maior que zero, com até duas casas decimais.` }, 400);
      }
      parsedItems.push({ code, total, china, transit: total - china, unitValueUsdCents: valueCents });
    }
    if (parsedItems.some((item) => item.transit > 0) && !dueDate) {
      return json({ error: "Informe a previsão de chegada ao Porto para o embarque." }, 400);
    }

    const purchaseId = next("purchase");
    const orderItems: DemoRecord[] = [];
    for (const entry of parsedItems) {
      const stock = inventoryItem(entry.code)!;
      stock.china += entry.china;
      stock.transit += entry.transit;
      stock.updated_at = now();
      orderItems.push({
        item_id: next("purchaseItem"),
        code: entry.code,
        unit_value_usd_cents: entry.unitValueUsdCents,
        total_quantity: entry.total,
        china_quantity: entry.china,
        transit_quantity: entry.transit,
      });
      if (entry.transit > 0) {
        state.shipments.push({
          id: next("shipment"),
          purchase_order_id: purchaseId,
          shipment_identifier: shipmentIdentifier,
          dollar_rate_cents: dollarRateCents,
          freight_usd_cents: freightUsdCents,
          code: entry.code,
          quantity: entry.transit,
          unit_value_usd_cents: entry.unitValueUsdCents,
          source: "purchase",
          stage: "transit",
          due_date: dueDate,
        });
      }
    }
    state.purchaseOrders.push({
      id: purchaseId,
      shipment_identifier: shipmentIdentifier,
      invoice_code: invoiceCode,
      dollar_rate_cents: dollarRateCents,
      freight_usd_cents: freightUsdCents,
      created_at: now(),
      items: orderItems,
    });
  } else if (payload.action === "dispatch_china") {
    const shipmentIdentifier = String(payload.shipmentIdentifier ?? "").trim();
    const dollarRateCents = payload.dollarRate ? parseUsdCents(payload.dollarRate) : null;
    const freightUsdCents = payload.freightUsd ? parseUsdCents(payload.freightUsd) : null;
    const dueDate = validDate(payload.dueDate);
    const rawItems = Array.isArray(payload.items)
      ? payload.items
      : payload.code
        ? [{ code: payload.code, quantity: payload.quantity, unitValueUsd: payload.unitValueUsd }]
        : [];
    if (!shipmentIdentifier) return json({ error: "Informe o embarque." }, 400);
    if (!dueDate) return json({ error: "Informe a data de chegada ao Porto." }, 400);
    if (!rawItems.length) return json({ error: "Adicione ao menos um item para retirada." }, 400);
    if (shipmentIdentifierExists(shipmentIdentifier)) return json({ error: "Já existe um embarque com este identificador." }, 409);

    const seenCodes = new Set<string>();
    const parsedItems: Array<{ code: string; quantity: number; unitValueUsdCents: number }> = [];
    for (const rawItem of rawItems) {
      const code = String(rawItem.code ?? "").trim().toUpperCase();
      const stock = inventoryItem(code);
      if (!stock) return json({ error: `${code || "Item"}: código inválido.` }, 400);
      if (seenCodes.has(code)) return json({ error: `${code}: o produto aparece mais de uma vez na retirada.` }, 400);
      const quantity = Number(rawItem.quantity);
      const valueCents = parseUsdCents(rawItem.unitValueUsd);
      if (!Number.isInteger(quantity) || quantity <= 0) return json({ error: `${code}: informe uma quantidade a retirar válida.` }, 400);
      if (quantity > stock.china) return json({ error: `${code}: quantidade maior que o disponível na China. Saldo atual: ${stock.china}.` }, 400);
      if (!valueCents) return json({ error: `${code}: informe um valor unitário em dólar maior que zero, com até duas casas decimais.` }, 400);
      seenCodes.add(code);
      parsedItems.push({ code, quantity, unitValueUsdCents: valueCents });
    }
    for (const entry of parsedItems) {
      const stock = inventoryItem(entry.code)!;
      stock.china -= entry.quantity;
      stock.transit += entry.quantity;
      stock.updated_at = now();
      state.shipments.push({
        id: next("shipment"),
        purchase_order_id: null,
        shipment_identifier: shipmentIdentifier,
        dollar_rate_cents: dollarRateCents,
        freight_usd_cents: freightUsdCents,
        code: entry.code,
        quantity: entry.quantity,
        unit_value_usd_cents: entry.unitValueUsdCents,
        source: "china",
        stage: "transit",
        due_date: dueDate,
      });
    }
  } else if (payload.action === "reschedule") {
    const dueDate = validDate(payload.dueDate);
    const matching = matchingShipmentsFor(payload);
    if (!matching.length || !dueDate) return json({ error: "Informe uma remessa válida e a nova data prevista." }, 400);
    for (const shipment of matching) shipment.due_date = dueDate;
  } else if (payload.action === "confirm_arrival") {
    const matching = matchingShipmentsFor(payload);
    if (!matching.length) return json({ error: "Embarque não encontrado." }, 404);
    const stages = new Set(matching.map((entry) => entry.stage));
    if (stages.size !== 1) return json({ error: "Os itens deste embarque estão em etapas diferentes." }, 409);
    const stage = matching[0].stage;
    if (stage === "transit") {
      const ghDueDate = validDate(payload.dueDate);
      if (!ghDueDate) return json({ error: "Informe a previsão de chegada ao Estoque GH." }, 400);
      for (const shipment of matching) {
        const stock = inventoryItem(shipment.code)!;
        stock.transit -= shipment.quantity;
        stock.port += shipment.quantity;
        stock.updated_at = now();
        shipment.stage = "port";
        shipment.due_date = ghDueDate;
      }
    } else if (stage === "port") {
      for (const shipment of matching) {
        const stock = inventoryItem(shipment.code)!;
        stock.port -= shipment.quantity;
        stock.gh += shipment.quantity;
        stock.updated_at = now();
        shipment.stage = "completed";
        state.allocationTasks.push({
          id: next("task"),
          shipment_id: shipment.id,
          code: shipment.code,
          quantity: shipment.quantity,
          allocated_quantity: 0,
          status: "pending",
          created_at: now(),
        });
      }
    } else {
      return json({ error: "Etapa de embarque inválida." }, 409);
    }
  } else {
    return json({ error: "Ação inválida." }, 400);
  }

  save();
  return json(foreignData());
}

async function allocationsApi(method: string, input: RequestInfo | URL, init?: RequestInit) {
  if (method === "GET") return json(allocationsData());
  const payload = await bodyOf(input, init);
  if (payload.action === "transfer") {
    const allocationId = Number(payload.allocationId);
    const street = String(payload.street ?? "").trim();
    const column = String(payload.column ?? "").trim();
    const level = String(payload.level ?? "").trim();
    const quantity = Number(payload.quantity);
    if (!Number.isInteger(allocationId) || allocationId <= 0 || !street || !column || !level || !Number.isInteger(quantity) || quantity <= 0) {
      return json({ error: "Informe posição de destino (rua, coluna, nível) e quantidade válida para transferência." }, 400);
    }
    const source = state.allocations.find((entry) => entry.id === allocationId);
    if (!source) return json({ error: "Posição de origem não encontrada." }, 404);
    if (quantity > source.quantity) return json({ error: `Quantidade maior que o saldo da posição (${source.quantity} un.).` }, 400);
    if (source.street.toLowerCase() === street.toLowerCase() && source.column.toLowerCase() === column.toLowerCase() && source.level.toLowerCase() === level.toLowerCase()) {
      return json({ error: "A posição de destino deve ser diferente da posição atual." }, 400);
    }
    const destination = state.allocations.find((entry) =>
      entry.id !== source.id
      && entry.code === source.code
      && String(entry.street).toLowerCase() === street.toLowerCase()
      && String(entry.column).toLowerCase() === column.toLowerCase()
      && String(entry.level).toLowerCase() === level.toLowerCase(),
    );
    if (destination) {
      destination.quantity += quantity;
      destination.shipment_identifier = mergeShipmentIdentifiers(destination.shipment_identifier, source.shipment_identifier);
      source.quantity -= quantity;
      if (source.quantity <= 0) state.allocations = state.allocations.filter((entry) => entry.id !== source.id);
    } else if (quantity === source.quantity) {
      source.street = street;
      source.column = column;
      source.level = level;
    } else {
      source.quantity -= quantity;
      state.allocations.push({
        id: next("allocation"),
        code: source.code,
        shipment_identifier: source.shipment_identifier ?? null,
        street,
        column,
        level,
        quantity,
        created_at: now(),
      });
    }
    save();
    return json(allocationsData());
  }
  if (payload.action === "transfer_return") {
    const allocationId = Number(payload.allocationId);
    const street = String(payload.street ?? "").trim();
    const column = String(payload.column ?? "").trim();
    const level = String(payload.level ?? "").trim();
    const quantity = Number(payload.quantity);
    if (!Number.isInteger(allocationId) || allocationId <= 0 || !street || !column || !level || !Number.isInteger(quantity) || quantity <= 0) {
      return json({ error: "Informe posição de destino (rua, coluna, nível) e quantidade válida para transferência." }, 400);
    }
    const source = state.returnAllocations.find((entry) => entry.id === allocationId);
    if (!source) return json({ error: "Posição de devolução não encontrada." }, 404);
    if (quantity > source.quantity) return json({ error: `Quantidade maior que o saldo da posição (${source.quantity} un.).` }, 400);
    if (source.street.toLowerCase() === street.toLowerCase() && source.column.toLowerCase() === column.toLowerCase() && source.level.toLowerCase() === level.toLowerCase()) {
      return json({ error: "A posição de destino deve ser diferente da posição atual." }, 400);
    }
    const destination = state.returnAllocations.find((entry) =>
      entry.id !== source.id
      && entry.code === source.code
      && String(entry.street).toLowerCase() === street.toLowerCase()
      && String(entry.column).toLowerCase() === column.toLowerCase()
      && String(entry.level).toLowerCase() === level.toLowerCase(),
    );
    if (destination) {
      destination.quantity += quantity;
      source.quantity -= quantity;
      if (source.quantity <= 0) state.returnAllocations = state.returnAllocations.filter((entry) => entry.id !== source.id);
    } else if (quantity === source.quantity) {
      source.street = street;
      source.column = column;
      source.level = level;
    } else {
      source.quantity -= quantity;
      state.returnAllocations.push({
        id: next("returnAllocation"),
        logistics_order_item_id: source.logistics_order_item_id ?? 0,
        code: source.code,
        street,
        column,
        level,
        quantity,
        order_number: source.order_number,
        created_at: now(),
      });
    }
    save();
    return json(allocationsData());
  }
  const quantity = Number(payload.quantity);
  const requestedTaskId = Number(payload.taskId);
  const street = String(payload.street ?? "").trim();
  const column = String(payload.column ?? "").trim();
  const level = String(payload.level ?? "").trim();
  if (!street || !column || !level || !Number.isInteger(quantity) || quantity <= 0) {
    return json({ error: "Produto, rua, coluna, nível e quantidade são obrigatórios." }, 400);
  }

  let targetCode = String(payload.code ?? "").trim().toUpperCase();
  let shipmentIdentifier = String(payload.shipmentIdentifier ?? "").trim() || null;
  const task = Number.isInteger(requestedTaskId) && requestedTaskId > 0
    ? state.allocationTasks.find((entry) => entry.id === requestedTaskId && entry.status === "pending")
    : null;
  if (Number.isInteger(requestedTaskId) && requestedTaskId > 0 && !task) return json({ error: "Embarque pendente não encontrado." }, 404);
  if (task) {
    targetCode = task.code;
    shipmentIdentifier = resolveTaskShipmentIdentifier(task);
  }

  const item = inventoryItem(targetCode);
  if (!item) return json({ error: "Código de produto inválido." }, 400);
  const allocated = state.allocations.filter((entry) => entry.code === targetCode).reduce((sum, entry) => sum + entry.quantity, 0);
  const pendingTaskTotal = state.allocationTasks
    .filter((entry) => entry.code === targetCode && entry.status === "pending")
    .reduce((sum, entry) => sum + Math.max(entry.quantity - entry.allocated_quantity, 0), 0);

  if (task) {
    const taskRemaining = Math.max(task.quantity - task.allocated_quantity, 0);
    if (quantity > taskRemaining) {
      return json({ error: `Quantidade maior que o saldo deste embarque (${shipmentIdentifier}). Restam ${taskRemaining} unidades.` }, 400);
    }
    if (allocated + quantity > item.gh) {
      return json({ error: `O Estoque GH de ${targetCode} tem ${item.gh} unidades e ${allocated} já estão alocadas. Revise o ajuste de estoque antes de alocar este embarque.` }, 409);
    }
    task.allocated_quantity += quantity;
    if (task.allocated_quantity >= task.quantity) task.status = "completed";
  } else {
    const available = Math.max(item.gh - allocated - pendingTaskTotal, 0);
    if (quantity > available) {
      return json({ error: `Quantidade maior que a disponível para alocação avulsa. Restam ${available} unidades (${pendingTaskTotal} reservadas para embarques aguardando alocação).` }, 400);
    }
  }

  const existingPosition = state.allocations.find((entry) =>
    entry.code === targetCode
    && String(entry.street).toLowerCase() === street.toLowerCase()
    && String(entry.column).toLowerCase() === column.toLowerCase()
    && String(entry.level).toLowerCase() === level.toLowerCase(),
  );
  if (existingPosition) {
    existingPosition.quantity += quantity;
    existingPosition.shipment_identifier = mergeShipmentIdentifiers(existingPosition.shipment_identifier, shipmentIdentifier);
  } else {
    state.allocations.push({
      id: next("allocation"),
      code: targetCode,
      shipment_identifier: shipmentIdentifier,
      street,
      column,
      level,
      quantity,
      created_at: now(),
    });
  }
  save();
  return json(allocationsData());
}

async function logisticsApi(method: string, input: RequestInfo | URL, init?: RequestInit) {
  if (method === "GET") return json(logisticsData());
  const payload = await bodyOf(input, init);
  if (payload.action === "adjustment") {
    const item = inventoryItem(String(payload.code));
    const newQuantity = Number(payload.newQuantity);
    const note = String(payload.note ?? "").trim();
    if (!item || !Number.isInteger(newQuantity) || newQuantity < 0 || !note) return json({ error: "Informe produto, nova quantidade e motivo do ajuste." }, 400);
    const allocated = state.allocations.filter((entry) => entry.code === item.code).reduce((sum, entry) => sum + entry.quantity, 0);
    const committed = state.commitments.flatMap((document) => document.items).filter((entry: DemoRecord) => entry.code === item.code).reduce((sum: number, entry: DemoRecord) => sum + entry.quantity, 0);
    if (newQuantity < allocated || newQuantity < committed) {
      return json({ error: `O Estoque GH não pode ficar abaixo de ${Math.max(allocated, committed)} unidades (${allocated} alocadas, ${committed} empenhadas).` }, 400);
    }
    const previous = item.gh;
    item.gh = newQuantity; item.updated_at = now();
    state.logisticsEvents.push({ id: next("logisticsEvent"), type: "adjustment", code: item.code, quantity: item.gh - previous, previous_quantity: previous, new_quantity: item.gh, note, created_at: now() });
  } else if (payload.action === "separate_order") {
    const document = state.commitments.find((entry) => entry.id === Number(payload.documentId) && entry.type === "order");
    if (!document) return json({ error: "Pedido não encontrado ou já separado." }, 400);
    // 1ª fase: valida tudo sem alterar o estado (antes, um erro no 2º item deixava o 1º já baixado).
    const usedByAllocation = new Map<number, number>();
    const planned: Array<{ line: DemoRecord; sources: Array<{ position: DemoRecord; quantity: number }> }> = [];
    for (const line of document.items) {
      const selections = (payload.selections ?? [])
        .filter((entry: DemoRecord) => Number(entry.itemId) === line.id)
        .map((entry: DemoRecord) => ({ allocationId: Number(entry.allocationId), quantity: Number(entry.quantity) }));
      const invalid = !selections.length
        || selections.some((entry: DemoRecord) => !Number.isInteger(entry.allocationId) || entry.allocationId <= 0 || !Number.isInteger(entry.quantity) || entry.quantity <= 0)
        || selections.reduce((sum: number, entry: DemoRecord) => sum + entry.quantity, 0) !== line.quantity;
      if (invalid) return json({ error: `${line.code}: distribua exatamente ${line.quantity} unidades entre as posições.` }, 400);
      const sources = [];
      for (const selection of selections) {
        const position = state.allocations.find((entry) => entry.id === selection.allocationId && entry.code === line.code);
        const accumulated = (usedByAllocation.get(selection.allocationId) ?? 0) + selection.quantity;
        if (!position || accumulated > position.quantity) return json({ error: `${line.code}: uma das posições não possui saldo suficiente.` }, 400);
        usedByAllocation.set(selection.allocationId, accumulated);
        sources.push({ position, quantity: selection.quantity });
      }
      planned.push({ line, sources });
    }
    // 2ª fase: aplica.
    const items = planned.map(({ line, sources }) => {
      const stock = inventoryItem(line.code);
      if (stock) { stock.gh -= line.quantity; stock.updated_at = now(); }
      for (const source of sources) source.position.quantity -= source.quantity;
      return {
        id: next("logisticsItem"),
        code: line.code,
        quantity: line.quantity,
        sources: sources.map((source) => ({ id: next("logisticsSource"), allocation_id: source.position.id, street: source.position.street, column: source.position.column, level: source.position.level, quantity: source.quantity })),
      };
    });
    state.allocations = state.allocations.filter((position) => position.quantity > 0);
    state.logisticsOrders.push({ id: next("logisticsOrder"), order_number: document.order_number, loan_items: document.loan_items, status: "awaiting_invoice", invoice_number: null, separated_at: now(), departed_at: null, returned_at: null, items });
    state.commitments = state.commitments.filter((entry) => entry.id !== document.id);
  } else if (payload.action === "invoice") {
    const invoiceNumber = String(payload.invoiceNumber ?? "").trim();
    if (!invoiceNumber) return json({ error: "Informe a nota fiscal." }, 400);
    const order = state.logisticsOrders.find((entry) => entry.id === Number(payload.orderId));
    if (!order || order.status !== "awaiting_invoice") return json({ error: "Este pedido não está aguardando nota fiscal." }, 400);
    order.invoice_number = invoiceNumber; order.departed_at = now(); order.status = order.loan_items ? "awaiting_return" : "completed";
    // Uma saída por posição de origem, como no D1: alimenta o histórico e o Dashboard Saída.
    const note = order.loan_items ? "Itens de empréstimo" : "";
    for (const line of order.items) {
      const sources = line.sources?.length ? line.sources : [{ street: null, column: null, level: null, quantity: line.quantity }];
      for (const source of sources) {
        state.logisticsEvents.push({ id: next("logisticsEvent"), type: "exit", code: line.code, quantity: source.quantity, previous_quantity: null, new_quantity: null, invoice_number: invoiceNumber, order_number: order.order_number, street: source.street, column: source.column, level: source.level, note, created_at: now() });
      }
    }
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

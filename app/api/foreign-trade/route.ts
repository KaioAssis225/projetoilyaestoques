import { env } from "cloudflare:workers";

type InventoryRow = {
  code: string;
  description: string;
  finish: string;
  china: number;
  transit: number;
  port: number;
  gh: number;
  returns: number;
};

type ShipmentRow = {
  id: number;
  purchase_order_id: number | null;
  shipment_identifier: string | null;
  code: string;
  description: string;
  finish: string;
  quantity: number;
  unit_value_usd_cents: number | null;
  source: string;
  stage: "transit" | "port";
  due_date: string;
};

type PurchaseOrderRow = {
  id: number;
  shipment_identifier: string;
  invoice_code: string | null;
  dollar_rate_cents: number | null;
  freight_usd_cents: number | null;
  created_at: string;
  item_id: number;
  code: string;
  description: string;
  finish: string;
  unit_value_usd_cents: number;
  total_quantity: number;
  china_quantity: number;
  transit_quantity: number;
};

type PurchaseItemInput = {
  code: string;
  totalQuantity: number;
  chinaQuantity: number;
  transitQuantity: number;
  unitValueUsdCents: number;
};

async function ensureDatabase() {
  const db = env.DB;
  await db.batch([
    db.prepare(`CREATE TABLE IF NOT EXISTS inventory (
      code TEXT PRIMARY KEY,
      description TEXT NOT NULL,
      finish TEXT NOT NULL,
      china INTEGER NOT NULL DEFAULT 0,
      transit INTEGER NOT NULL DEFAULT 0,
      port INTEGER NOT NULL DEFAULT 0,
      gh INTEGER NOT NULL DEFAULT 0,
      returns INTEGER NOT NULL DEFAULT 0,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER,
      shipment_identifier TEXT,
      code TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      unit_value_usd_cents INTEGER,
      source TEXT NOT NULL,
      stage TEXT NOT NULL,
      due_date TEXT NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS allocation_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER,
      code TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      allocated_quantity INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
  ]);

  const purchaseOrderTable = await db.prepare("PRAGMA table_info(purchase_orders)").all<{ name: string }>();
  if (!purchaseOrderTable.results.length) {
    await db.prepare(`CREATE TABLE purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_identifier TEXT NOT NULL COLLATE NOCASE UNIQUE,
      invoice_code TEXT,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`).run();
  } else if (purchaseOrderTable.results.some((column) => column.name === "code")) {
    await db.batch([
      db.prepare(`CREATE TABLE purchase_orders_v2 (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        shipment_identifier TEXT NOT NULL COLLATE NOCASE UNIQUE,
        invoice_code TEXT,
        created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
      )`),
      db.prepare(`INSERT INTO purchase_orders_v2 (id, shipment_identifier, created_at)
        SELECT id, 'LEGADO-' || id, created_at FROM purchase_orders`),
      db.prepare(`CREATE TABLE IF NOT EXISTS purchase_order_items (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        purchase_order_id INTEGER NOT NULL,
        code TEXT NOT NULL,
        unit_value_usd_cents INTEGER NOT NULL,
        total_quantity INTEGER NOT NULL,
        china_quantity INTEGER NOT NULL,
        transit_quantity INTEGER NOT NULL
      )`),
      db.prepare(`INSERT INTO purchase_order_items (purchase_order_id, code, unit_value_usd_cents, total_quantity, china_quantity, transit_quantity)
        SELECT id, code, 0, total_quantity, china_quantity, transit_quantity FROM purchase_orders`),
      db.prepare("DROP TABLE purchase_orders"),
      db.prepare("ALTER TABLE purchase_orders_v2 RENAME TO purchase_orders"),
    ]);
  } else if (!purchaseOrderTable.results.some((column) => column.name === "invoice_code")) {
    await db.prepare("ALTER TABLE purchase_orders ADD COLUMN invoice_code TEXT").run();
  }
  const latestOrderCols = await db.prepare("PRAGMA table_info(purchase_orders)").all<{ name: string }>();
  if (!latestOrderCols.results.some((column) => column.name === "dollar_rate_cents")) {
    await db.prepare("ALTER TABLE purchase_orders ADD COLUMN dollar_rate_cents INTEGER").run();
  }
  if (!latestOrderCols.results.some((column) => column.name === "freight_usd_cents")) {
    await db.prepare("ALTER TABLE purchase_orders ADD COLUMN freight_usd_cents INTEGER").run();
  }

  await db.prepare(`CREATE TABLE IF NOT EXISTS purchase_order_items (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    purchase_order_id INTEGER NOT NULL,
    code TEXT NOT NULL,
    unit_value_usd_cents INTEGER NOT NULL,
    total_quantity INTEGER NOT NULL,
    china_quantity INTEGER NOT NULL,
    transit_quantity INTEGER NOT NULL
  )`).run();

  const shipmentColumns = await db.prepare("PRAGMA table_info(shipments)").all<{ name: string }>();
  if (!shipmentColumns.results.some((column) => column.name === "purchase_order_id")) {
    await db.prepare("ALTER TABLE shipments ADD COLUMN purchase_order_id INTEGER").run();
  }
  if (!shipmentColumns.results.some((column) => column.name === "shipment_identifier")) {
    await db.prepare("ALTER TABLE shipments ADD COLUMN shipment_identifier TEXT").run();
  }
  if (!shipmentColumns.results.some((column) => column.name === "unit_value_usd_cents")) {
    await db.prepare("ALTER TABLE shipments ADD COLUMN unit_value_usd_cents INTEGER").run();
  }

  const inventoryColumns = await db.prepare("PRAGMA table_info(inventory)").all<{ name: string }>();
  if (!inventoryColumns.results.some((column) => column.name === "returns")) {
    await db.prepare("ALTER TABLE inventory ADD COLUMN returns INTEGER NOT NULL DEFAULT 0").run();
  }

  const catalogProducts: Array<[string, string, string]> = [
    ["CD0100", "Cadeira", "Taupe"],
    ["SF0100", "Sofá", "Areia"],
    ["MJ0100", "Mesa", "Rose"],
    ["ICS0001", "CONJUNTO SEATLE - TAUPE / TECIDO NATURAL / POLYWOOD TEKA", "Taupe"],
    ["IES0005", "ESTRUTURA ESPREGUICADEIRA TEXAS S/ BCS - SEM GRADE", "Sem Grade"],
    ["IMJ0003", "MESA JANTAR ASPEN C/ F RED 1,02 D X 0,72 H - TAUPE", "Taupe"],
    ["IES0073", "ESPREGUICADEIRA LONDON S/ BCS - SEM GRADE", "Sem Grade"],
    ["ISF0102", "SOFA LONDON 2 L C/ BCS- TAUPE", "Taupe"],
    ["IPL0094", "POLTRONA LONDON C/ BCS- TAUPE", "Taupe"],
    ["ICD0004", "CADEIRA GENOVA C/ BCS - TAUPE / KHAKI FECHADO / POLYWOOD TEKA", "Taupe"],
    ["ICD0007", "CADEIRA ORLEANS C/ BCS - TAUPE / KHAKI FECHADO", "Taupe"],
    ["IES0057", "ESPREGUICADEIRA LONDON S/ BCS - TAUPE / KHAKI", "Taupe"],
    ["IMJ0005", "MESA JANTAR ASPEN C/ F RED 1,20 D X 0,72 H - TAUPE", "Taupe"],
    ["00030781", "KIT BATOQUE ESPREGUICADEIRA TEXAS", "Padrão"],
    ["00027871", "BRACO DE POLYWOOD CADEIRA GENOVA", "Polywood"],
    ["MP000659", "BATOQUE ESPREGUIÇADEIRA LONDON - PRETO", "Preto"],
    ["MP000658", "BATOQUE ESPREGUIÇADEIRA LONDON - CHAMPAGNE", "Champagne"],
  ];

  await db.batch(
    catalogProducts.map(([code, description, finish]) =>
      db.prepare("INSERT OR IGNORE INTO inventory (code, description, finish, china, transit, port, gh) VALUES (?, ?, ?, 0, 0, 0, 0)")
        .bind(code, description, finish),
    ),
  );
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function unitValueUsdCents(value: unknown) {
  const normalized = String(value ?? "").trim().replace(",", ".");
  if (!/^\d+(?:\.\d{1,2})?$/.test(normalized)) return null;
  const [whole, decimal = ""] = normalized.split(".");
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, "0"));
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

async function getInventory(code: string) {
  return env.DB.prepare("SELECT * FROM inventory WHERE code = ?").bind(code).first<InventoryRow>();
}

async function shipmentIdentifierExists(identifier: string) {
  const [orderMatch, shipmentMatch] = await Promise.all([
    env.DB.prepare("SELECT id FROM purchase_orders WHERE shipment_identifier = ? COLLATE NOCASE").bind(identifier).first(),
    env.DB.prepare("SELECT id FROM shipments WHERE shipment_identifier = ? COLLATE NOCASE").bind(identifier).first(),
  ]);
  return Boolean(orderMatch || shipmentMatch);
}

function groupShipments(rows: ShipmentRow[]) {
  const groups = new Map<string, {
    id: string;
    purchase_order_id: number | null;
    shipment_identifier: string;
    source: string;
    stage: "transit" | "port";
    due_date: string;
    items: Array<{
      shipment_id: number;
      code: string;
      description: string;
      finish: string;
      quantity: number;
      unit_value_usd_cents: number | null;
    }>;
  }>();

  for (const row of rows) {
    const key = row.purchase_order_id
      ? `purchase-${row.purchase_order_id}`
      : row.shipment_identifier
        ? `china-${row.shipment_identifier.toLowerCase()}`
        : `shipment-${row.id}`;
    const group = groups.get(key) ?? {
      id: key,
      purchase_order_id: row.purchase_order_id,
      shipment_identifier: row.shipment_identifier ?? `Transferência ${row.id}`,
      source: row.source,
      stage: row.stage,
      due_date: row.due_date,
      items: [],
    };
    group.items.push({
      shipment_id: row.id,
      code: row.code,
      description: row.description,
      finish: row.finish,
      quantity: row.quantity,
      unit_value_usd_cents: row.unit_value_usd_cents,
    });
    groups.set(key, group);
  }
  return [...groups.values()];
}

function groupOrders(rows: PurchaseOrderRow[]) {
  const orders = new Map<number, {
    id: number;
    shipment_identifier: string;
    invoice_code: string | null;
    dollar_rate_cents: number | null;
    freight_usd_cents: number | null;
    created_at: string;
    items: Array<Omit<PurchaseOrderRow, "id" | "shipment_identifier" | "invoice_code" | "dollar_rate_cents" | "freight_usd_cents" | "created_at">>;
  }>();
  for (const row of rows) {
    const order = orders.get(row.id) ?? {
      id: row.id,
      shipment_identifier: row.shipment_identifier,
      invoice_code: row.invoice_code,
      dollar_rate_cents: row.dollar_rate_cents ?? null,
      freight_usd_cents: row.freight_usd_cents ?? null,
      created_at: row.created_at,
      items: [],
    };
    order.items.push({
      item_id: row.item_id,
      code: row.code,
      description: row.description,
      finish: row.finish,
      unit_value_usd_cents: row.unit_value_usd_cents,
      total_quantity: row.total_quantity,
      china_quantity: row.china_quantity,
      transit_quantity: row.transit_quantity,
    });
    orders.set(row.id, order);
  }
  return [...orders.values()];
}

export async function GET() {
  await ensureDatabase();
  const [inventory, shipmentRows, orderRows] = await Promise.all([
    env.DB.prepare("SELECT * FROM inventory ORDER BY code").all(),
    env.DB.prepare(`SELECT s.id, s.purchase_order_id, COALESCE(po.shipment_identifier, s.shipment_identifier) AS shipment_identifier,
      s.code, i.description, i.finish, s.quantity, s.unit_value_usd_cents, s.source, s.stage, s.due_date
      FROM shipments s
      JOIN inventory i ON i.code = s.code
      LEFT JOIN purchase_orders po ON po.id = s.purchase_order_id
      WHERE s.stage != 'completed'
      ORDER BY s.due_date, s.id`).all<ShipmentRow>(),
    env.DB.prepare(`SELECT po.id, po.shipment_identifier, po.invoice_code, po.dollar_rate_cents, po.freight_usd_cents, po.created_at, poi.id AS item_id,
      poi.code, i.description, i.finish, poi.unit_value_usd_cents,
      poi.total_quantity, poi.china_quantity, poi.transit_quantity
      FROM purchase_orders po
      JOIN purchase_order_items poi ON poi.purchase_order_id = po.id
      JOIN inventory i ON i.code = poi.code
      ORDER BY po.id DESC, poi.id
      LIMIT 300`).all<PurchaseOrderRow>(),
  ]);
  return Response.json({
    inventory: inventory.results,
    shipments: groupShipments(shipmentRows.results),
    orders: groupOrders(orderRows.results).slice(0, 30),
  });
}

async function purchase(payload: Record<string, unknown>) {
  const shipmentIdentifier = String(payload.shipmentIdentifier ?? "").trim();
  const invoiceCode = String(payload.invoiceCode ?? "").trim() || null;
  const dollarRateCents = payload.dollarRate ? unitValueUsdCents(payload.dollarRate) : null;
  const freightUsdCents = payload.freightUsd ? unitValueUsdCents(payload.freightUsd) : null;
  const rawItems = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];
  const dueDate = validDate(payload.dueDate);
  if (!shipmentIdentifier) return Response.json({ error: "Informe o embarque." }, { status: 400 });
  if (!rawItems.length) return Response.json({ error: "Adicione ao menos um item ao pedido." }, { status: 400 });
  if (await shipmentIdentifierExists(shipmentIdentifier)) {
    return Response.json({ error: "Já existe um embarque com este identificador." }, { status: 409 });
  }

  const items: PurchaseItemInput[] = [];
  for (const rawItem of rawItems) {
    const code = String(rawItem.code ?? "").trim().toUpperCase();
    const totalQuantity = positiveInteger(rawItem.totalQuantity);
    const chinaQuantity = nonNegativeInteger(rawItem.chinaQuantity);
    const valueCents = unitValueUsdCents(rawItem.unitValueUsd);
    const inventory = await getInventory(code);
    if (!inventory) return Response.json({ error: `${code || "Item"}: código não encontrado no banco de dados.` }, { status: 400 });
    if (!totalQuantity || chinaQuantity === null || chinaQuantity > totalQuantity) {
      return Response.json({ error: `${code}: informe quantidades inteiras válidas; a quantidade na China não pode superar o total.` }, { status: 400 });
    }
    if (!valueCents) return Response.json({ error: `${code}: informe um Valor FOB maior que zero, com até duas casas decimais.` }, { status: 400 });
    items.push({ code, totalQuantity, chinaQuantity, transitQuantity: totalQuantity - chinaQuantity, unitValueUsdCents: valueCents });
  }
  if (items.some((item) => item.transitQuantity > 0) && !dueDate) {
    return Response.json({ error: "Informe a previsão de chegada ao Porto para o embarque." }, { status: 400 });
  }

  let purchaseOrderId: number | null = null;
  try {
    const orderResult = await env.DB.prepare("INSERT INTO purchase_orders (shipment_identifier, invoice_code, dollar_rate_cents, freight_usd_cents) VALUES (?, ?, ?, ?)")
      .bind(shipmentIdentifier, invoiceCode, dollarRateCents, freightUsdCents).run();
    purchaseOrderId = Number(orderResult.meta.last_row_id);
    const statements = items.flatMap((item) => {
      const itemStatements = [
        env.DB.prepare(`INSERT INTO purchase_order_items
          (purchase_order_id, code, unit_value_usd_cents, total_quantity, china_quantity, transit_quantity)
          VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(purchaseOrderId, item.code, item.unitValueUsdCents, item.totalQuantity, item.chinaQuantity, item.transitQuantity),
        env.DB.prepare("UPDATE inventory SET china = china + ?, transit = transit + ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?")
          .bind(item.chinaQuantity, item.transitQuantity, item.code),
      ];
      if (item.transitQuantity > 0) {
        itemStatements.push(
          env.DB.prepare("INSERT INTO shipments (purchase_order_id, shipment_identifier, code, quantity, unit_value_usd_cents, source, stage, due_date) VALUES (?, ?, ?, ?, ?, 'purchase', 'transit', ?)")
            .bind(purchaseOrderId, shipmentIdentifier, item.code, item.transitQuantity, item.unitValueUsdCents, dueDate),
        );
      }
      return itemStatements;
    });
    await env.DB.batch(statements);
  } catch (error) {
    if (purchaseOrderId) await env.DB.prepare("DELETE FROM purchase_orders WHERE id = ?").bind(purchaseOrderId).run();
    throw error;
  }
  return null;
}

async function dispatchChina(payload: Record<string, unknown>) {
  const shipmentIdentifier = String(payload.shipmentIdentifier ?? "").trim();
  const dueDate = validDate(payload.dueDate);
  const rawItems = Array.isArray(payload.items)
    ? payload.items as Array<Record<string, unknown>>
    : payload.code
      ? [{ code: payload.code, quantity: payload.quantity, unitValueUsd: payload.unitValueUsd }]
      : [];

  if (!shipmentIdentifier) return Response.json({ error: "Informe o embarque." }, { status: 400 });
  if (!dueDate) return Response.json({ error: "Informe a data de chegada ao Porto." }, { status: 400 });
  if (!rawItems.length) return Response.json({ error: "Adicione ao menos um item para retirada." }, { status: 400 });
  if (await shipmentIdentifierExists(shipmentIdentifier)) {
    return Response.json({ error: "Já existe um embarque com este identificador." }, { status: 409 });
  }

  const seenCodes = new Set<string>();
  const items: Array<{ code: string; quantity: number; unitValueUsdCents: number }> = [];
  for (const rawItem of rawItems) {
    const code = String(rawItem.code ?? "").trim().toUpperCase();
    const inventory = await getInventory(code);
    if (!inventory) return Response.json({ error: `${code || "Item"}: código inválido.` }, { status: 400 });
    if (seenCodes.has(code)) return Response.json({ error: `${code}: o produto aparece mais de uma vez na retirada.` }, { status: 400 });
    const quantity = positiveInteger(rawItem.quantity);
    const valueCents = unitValueUsdCents(rawItem.unitValueUsd);
    if (!quantity) return Response.json({ error: `${code}: informe uma quantidade a retirar válida.` }, { status: 400 });
    if (quantity > inventory.china) {
      return Response.json({ error: `${code}: quantidade maior que o disponível na China. Saldo atual: ${inventory.china}.` }, { status: 400 });
    }
    if (!valueCents) {
      return Response.json({ error: `${code}: informe um valor unitário em dólar maior que zero, com até duas casas decimais.` }, { status: 400 });
    }
    seenCodes.add(code);
    items.push({ code, quantity, unitValueUsdCents: valueCents });
  }

  await env.DB.batch(items.flatMap((item) => [
    env.DB.prepare("UPDATE inventory SET china = china - ?, transit = transit + ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?")
      .bind(item.quantity, item.quantity, item.code),
    env.DB.prepare("INSERT INTO shipments (shipment_identifier, code, quantity, unit_value_usd_cents, source, stage, due_date) VALUES (?, ?, ?, ?, 'china', 'transit', ?)")
      .bind(shipmentIdentifier, item.code, item.quantity, item.unitValueUsdCents, dueDate),
  ]));
  return null;
}

async function shipmentRowsFor(payload: Record<string, unknown>) {
  const purchaseOrderId = positiveInteger(payload.purchaseOrderId);
  if (purchaseOrderId) {
    return env.DB.prepare("SELECT id, purchase_order_id, code, quantity, stage FROM shipments WHERE purchase_order_id = ? AND stage != 'completed' ORDER BY id")
      .bind(purchaseOrderId).all<{ id: number; purchase_order_id: number | null; code: string; quantity: number; stage: string }>();
  }
  const shipmentIdentifier = String(payload.shipmentIdentifier ?? "").trim();
  if (shipmentIdentifier) {
    const byIdentifier = await env.DB.prepare("SELECT id, purchase_order_id, code, quantity, stage FROM shipments WHERE shipment_identifier = ? COLLATE NOCASE AND stage != 'completed' ORDER BY id")
      .bind(shipmentIdentifier).all<{ id: number; purchase_order_id: number | null; code: string; quantity: number; stage: string }>();
    if (byIdentifier.results.length) return byIdentifier;
  }
  const shipmentId = positiveInteger(payload.shipmentId);
  if (!shipmentId) return null;
  return env.DB.prepare("SELECT id, purchase_order_id, code, quantity, stage FROM shipments WHERE id = ? AND stage != 'completed'")
    .bind(shipmentId).all<{ id: number; purchase_order_id: number | null; code: string; quantity: number; stage: string }>();
}

export async function POST(request: Request) {
  await ensureDatabase();
  const payload = await request.json() as Record<string, unknown>;
  const action = String(payload.action ?? "");

  if (action === "purchase") {
    const errorResponse = await purchase(payload);
    if (errorResponse) return errorResponse;
  } else if (action === "dispatch_china") {
    const errorResponse = await dispatchChina(payload);
    if (errorResponse) return errorResponse;
  } else if (action === "reschedule") {
    const dueDate = validDate(payload.dueDate);
    const shipmentRows = await shipmentRowsFor(payload);
    if (!shipmentRows?.results.length || !dueDate) return Response.json({ error: "Informe uma remessa válida e a nova data prevista." }, { status: 400 });
    await env.DB.batch(shipmentRows.results.map((shipment) => env.DB.prepare("UPDATE shipments SET due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
      .bind(dueDate, shipment.id)));
  } else if (action === "confirm_arrival") {
    const shipmentRows = await shipmentRowsFor(payload);
    if (!shipmentRows?.results.length) return Response.json({ error: "Embarque não encontrado." }, { status: 404 });
    const stages = new Set(shipmentRows.results.map((shipment) => shipment.stage));
    if (stages.size !== 1) return Response.json({ error: "Os itens deste embarque estão em etapas diferentes e não podem ser movimentados juntos." }, { status: 409 });
    const stage = shipmentRows.results[0].stage;
    const statements: D1PreparedStatement[] = [];
    if (stage === "transit") {
      const ghDueDate = validDate(payload.dueDate);
      if (!ghDueDate) return Response.json({ error: "Informe a previsão de chegada ao Estoque GH." }, { status: 400 });
      for (const shipment of shipmentRows.results) {
        statements.push(
          env.DB.prepare("UPDATE inventory SET transit = transit - ?, port = port + ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?")
            .bind(shipment.quantity, shipment.quantity, shipment.code),
          env.DB.prepare("UPDATE shipments SET stage = 'port', due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(ghDueDate, shipment.id),
        );
      }
    } else if (stage === "port") {
      for (const shipment of shipmentRows.results) {
        statements.push(
          env.DB.prepare("UPDATE inventory SET port = port - ?, gh = gh + ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?")
            .bind(shipment.quantity, shipment.quantity, shipment.code),
          env.DB.prepare("UPDATE shipments SET stage = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
            .bind(shipment.id),
          env.DB.prepare(`INSERT INTO allocation_tasks (shipment_id, code, quantity)
            SELECT ?, ?, ? WHERE NOT EXISTS (SELECT 1 FROM allocation_tasks WHERE shipment_id = ?)`)
            .bind(shipment.id, shipment.code, shipment.quantity, shipment.id),
        );
      }
    } else {
      return Response.json({ error: "Etapa de embarque inválida." }, { status: 409 });
    }
    await env.DB.batch(statements);
  } else if (action === "reset_test_data") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM return_allocations"),
      env.DB.prepare("DELETE FROM logistics_order_sources"),
      env.DB.prepare("DELETE FROM logistics_order_items"),
      env.DB.prepare("DELETE FROM logistics_orders"),
      env.DB.prepare("DELETE FROM commitment_document_items"),
      env.DB.prepare("DELETE FROM commitment_documents"),
      env.DB.prepare("DELETE FROM commitments"),
      env.DB.prepare("DELETE FROM logistics_events"),
      env.DB.prepare("DELETE FROM allocations"),
      env.DB.prepare("DELETE FROM allocation_tasks"),
      env.DB.prepare("DELETE FROM shipments"),
      env.DB.prepare("DELETE FROM purchase_order_items"),
      env.DB.prepare("DELETE FROM purchase_orders"),
      env.DB.prepare("UPDATE inventory SET china = 0, transit = 0, port = 0, gh = 0, returns = 0, updated_at = CURRENT_TIMESTAMP"),
      env.DB.prepare("DELETE FROM sqlite_sequence WHERE name IN ('return_allocations', 'logistics_order_sources', 'logistics_order_items', 'logistics_orders', 'commitment_documents', 'commitment_document_items', 'commitments', 'logistics_events', 'allocations', 'allocation_tasks', 'shipments', 'purchase_order_items', 'purchase_orders')"),
    ]);
  } else {
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  }

  return GET();
}

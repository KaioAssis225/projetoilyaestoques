import { env } from "cloudflare:workers";

type InventoryRow = {
  code: string;
  description: string;
  finish: string;
  china: number;
  transit: number;
  port: number;
  gh: number;
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
      updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      total_quantity INTEGER NOT NULL,
      china_quantity INTEGER NOT NULL,
      transit_quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    db.prepare(`CREATE TABLE IF NOT EXISTS shipments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      purchase_order_id INTEGER,
      code TEXT NOT NULL,
      quantity INTEGER NOT NULL,
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

  const shipmentColumns = await db.prepare("PRAGMA table_info(shipments)").all<{ name: string }>();
  if (!shipmentColumns.results.some((column) => column.name === "purchase_order_id")) {
    await db.prepare("ALTER TABLE shipments ADD COLUMN purchase_order_id INTEGER").run();
  }

  await db.batch([
    db.prepare("INSERT OR IGNORE INTO inventory (code, description, finish, china, transit, port, gh) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind("CD0100", "Cadeira", "Taupe", 0, 0, 0, 0),
    db.prepare("INSERT OR IGNORE INTO inventory (code, description, finish, china, transit, port, gh) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind("SF0100", "Sofá", "Areia", 0, 0, 0, 0),
    db.prepare("INSERT OR IGNORE INTO inventory (code, description, finish, china, transit, port, gh) VALUES (?, ?, ?, ?, ?, ?, ?)")
      .bind("MJ0100", "Mesa", "Rose", 0, 0, 0, 0),
  ]);
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

function validDate(value: unknown) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

async function getInventory(code: string) {
  return env.DB.prepare("SELECT * FROM inventory WHERE code = ?").bind(code).first<InventoryRow>();
}

export async function GET() {
  await ensureDatabase();
  const [inventory, shipments, orders] = await Promise.all([
    env.DB.prepare("SELECT * FROM inventory ORDER BY code").all(),
    env.DB.prepare("SELECT * FROM shipments WHERE stage != 'completed' ORDER BY due_date, id").all(),
    env.DB.prepare("SELECT * FROM purchase_orders ORDER BY id DESC LIMIT 30").all(),
  ]);
  return Response.json({
    inventory: inventory.results,
    shipments: shipments.results,
    orders: orders.results,
  });
}

export async function POST(request: Request) {
  await ensureDatabase();
  const payload = await request.json() as Record<string, unknown>;
  const action = String(payload.action ?? "");
  const code = String(payload.code ?? "");
  const item = await getInventory(code);

  if (!item) {
    return Response.json({ error: "Código de item inválido." }, { status: 400 });
  }

  if (action === "purchase") {
    const total = positiveInteger(payload.totalQuantity);
    const china = Number(payload.chinaQuantity);
    const transit = Number(payload.transitQuantity);
    const dueDate = transit > 0 ? validDate(payload.dueDate) : null;
    if (!total || !Number.isInteger(china) || china < 0 || !Number.isInteger(transit) || transit < 0 || china + transit !== total) {
      return Response.json({ error: "A distribuição entre China e trânsito deve somar a quantidade total comprada." }, { status: 400 });
    }
    if (transit > 0 && !dueDate) {
      return Response.json({ error: "Informe a previsão de chegada ao Porto." }, { status: 400 });
    }

    await env.DB.prepare("UPDATE inventory SET china = china + ?, transit = transit + ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?")
      .bind(china, transit, code).run();
    const orderResult = await env.DB.prepare("INSERT INTO purchase_orders (code, total_quantity, china_quantity, transit_quantity) VALUES (?, ?, ?, ?)")
      .bind(code, total, china, transit).run();
    const purchaseOrderId = Number(orderResult.meta.last_row_id);
    if (transit > 0) {
      await env.DB.prepare("INSERT INTO shipments (purchase_order_id, code, quantity, source, stage, due_date) VALUES (?, ?, ?, 'purchase', 'transit', ?)")
        .bind(purchaseOrderId, code, transit, dueDate).run();
    } else {
      await env.DB.prepare("DELETE FROM purchase_orders WHERE id = ?").bind(purchaseOrderId).run();
    }
  } else if (action === "dispatch_china") {
    const quantity = positiveInteger(payload.quantity);
    const dueDate = validDate(payload.dueDate);
    if (!quantity || !dueDate) {
      return Response.json({ error: "Informe quantidade e previsão de chegada ao Porto." }, { status: 400 });
    }
    if (quantity > item.china) {
      return Response.json({ error: `Quantidade maior que o disponível na China. Saldo atual: ${item.china}.` }, { status: 400 });
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE inventory SET china = china - ?, transit = transit + ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?")
        .bind(quantity, quantity, code),
      env.DB.prepare("INSERT INTO shipments (code, quantity, source, stage, due_date) VALUES (?, ?, 'china', 'transit', ?)")
        .bind(code, quantity, dueDate),
    ]);
  } else if (action === "reschedule") {
    const shipmentId = positiveInteger(payload.shipmentId);
    const dueDate = validDate(payload.dueDate);
    if (!shipmentId || !dueDate) {
      return Response.json({ error: "Informe a nova data prevista." }, { status: 400 });
    }
    await env.DB.prepare("UPDATE shipments SET due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND stage != 'completed'")
      .bind(dueDate, shipmentId).run();
  } else if (action === "confirm_arrival") {
    const shipmentId = positiveInteger(payload.shipmentId);
    if (!shipmentId) {
      return Response.json({ error: "Remessa inválida." }, { status: 400 });
    }
    const shipment = await env.DB.prepare("SELECT * FROM shipments WHERE id = ? AND stage != 'completed'")
      .bind(shipmentId).first<{ id: number; purchase_order_id: number | null; code: string; quantity: number; stage: string }>();
    if (!shipment) {
      return Response.json({ error: "Remessa não encontrada." }, { status: 404 });
    }

    if (shipment.stage === "transit") {
      const ghDueDate = validDate(payload.dueDate);
      if (!ghDueDate) {
        return Response.json({ error: "Informe a previsão de chegada ao Estoque GH." }, { status: 400 });
      }
      await env.DB.batch([
        env.DB.prepare("UPDATE inventory SET transit = transit - ?, port = port + ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?")
          .bind(shipment.quantity, shipment.quantity, shipment.code),
        env.DB.prepare("UPDATE shipments SET stage = 'port', due_date = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(ghDueDate, shipment.id),
      ]);
    } else if (shipment.stage === "port") {
      const statements = [
        env.DB.prepare("UPDATE inventory SET port = port - ?, gh = gh + ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?")
          .bind(shipment.quantity, shipment.quantity, shipment.code),
        env.DB.prepare("UPDATE shipments SET stage = 'completed', updated_at = CURRENT_TIMESTAMP WHERE id = ?")
          .bind(shipment.id),
        env.DB.prepare(`INSERT INTO allocation_tasks (shipment_id, code, quantity)
          SELECT ?, ?, ?
          WHERE NOT EXISTS (SELECT 1 FROM allocation_tasks WHERE shipment_id = ?)`)
          .bind(shipment.id, shipment.code, shipment.quantity, shipment.id),
      ];
      if (shipment.purchase_order_id) {
        statements.push(
          env.DB.prepare("DELETE FROM purchase_orders WHERE id = ?").bind(shipment.purchase_order_id),
        );
      }
      await env.DB.batch(statements);
    }
  } else if (action === "reset_test_data") {
    await env.DB.batch([
      env.DB.prepare("DELETE FROM shipments"),
      env.DB.prepare("DELETE FROM purchase_orders"),
      env.DB.prepare("UPDATE inventory SET china = 0, transit = 0, port = 0, gh = 0, updated_at = CURRENT_TIMESTAMP"),
    ]);
  } else {
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  }

  return GET();
}

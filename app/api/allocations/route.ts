import { env } from "cloudflare:workers";

type IncomingRow = {
  id: number;
  purchase_order_id: number | null;
  shipment_identifier: string | null;
  code: string;
  description: string;
  finish: string;
  quantity: number;
  source: string;
  stage: "transit" | "port";
  due_date: string;
};

async function ensureAllocationsTable() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
      shipment_identifier TEXT,
      street TEXT NOT NULL,
      "column" TEXT NOT NULL,
      level TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS allocation_tasks (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_id INTEGER,
      code TEXT NOT NULL,
      quantity INTEGER NOT NULL,
      allocated_quantity INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'pending',
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS purchase_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      shipment_identifier TEXT NOT NULL COLLATE NOCASE UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS shipments (
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
  ]);

  const allocationColumns = await env.DB.prepare("PRAGMA table_info(allocations)").all<{ name: string }>();
  if (!allocationColumns.results.some((column) => column.name === "shipment_identifier")) {
    await env.DB.prepare("ALTER TABLE allocations ADD COLUMN shipment_identifier TEXT").run();
  }
}

function groupIncomingShipments(rows: IncomingRow[]) {
  const groups = new Map<string, {
    id: string;
    shipment_identifier: string;
    stage: "transit" | "port";
    due_date: string;
    items: Array<{ shipment_id: number; code: string; description: string; finish: string; quantity: number }>;
  }>();

  for (const row of rows) {
    const key = row.purchase_order_id
      ? `purchase-${row.purchase_order_id}`
      : row.shipment_identifier
        ? `china-${row.shipment_identifier.toLowerCase()}`
        : `shipment-${row.id}`;
    const group = groups.get(key) ?? {
      id: key,
      shipment_identifier: row.shipment_identifier ?? `Transferência ${row.id}`,
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
    });
    groups.set(key, group);
  }
  return [...groups.values()];
}

async function readData() {
  const [inventory, allocations, tasks, incomingRows] = await Promise.all([
    env.DB.prepare("SELECT * FROM inventory ORDER BY code").all(),
    env.DB.prepare(`SELECT a.*, i.description, i.finish
      FROM allocations a
      JOIN inventory i ON i.code = a.code
      ORDER BY a.id DESC`).all(),
    env.DB.prepare(`SELECT t.*, i.description, i.finish,
      COALESCE(po.shipment_identifier, s.shipment_identifier, CASE WHEN t.shipment_id IS NOT NULL THEN 'Embarque #' || t.shipment_id ELSE 'Entrada avulsa #' || t.id END) AS shipment_identifier,
      s.due_date,
      s.source
      FROM allocation_tasks t
      JOIN inventory i ON i.code = t.code
      LEFT JOIN shipments s ON s.id = t.shipment_id
      LEFT JOIN purchase_orders po ON po.id = s.purchase_order_id
      WHERE t.status = 'pending'
      ORDER BY t.id`).all(),
    env.DB.prepare(`SELECT s.id, s.purchase_order_id,
      COALESCE(po.shipment_identifier, s.shipment_identifier) AS shipment_identifier,
      s.code, i.description, i.finish, s.quantity, s.source, s.stage, s.due_date
      FROM shipments s
      JOIN inventory i ON i.code = s.code
      LEFT JOIN purchase_orders po ON po.id = s.purchase_order_id
      WHERE s.stage != 'completed'
      ORDER BY s.due_date, s.id`).all<IncomingRow>(),
  ]);
  return Response.json({
    inventory: inventory.results,
    allocations: allocations.results,
    tasks: tasks.results,
    incomingShipments: groupIncomingShipments(incomingRows.results),
  });
}

async function transferAllocation(payload: Record<string, unknown>) {
  const allocationId = Number(payload.allocationId);
  const street = String(payload.street ?? "").trim();
  const column = String(payload.column ?? "").trim();
  const level = String(payload.level ?? "").trim();
  const quantity = Number(payload.quantity);

  if (!Number.isInteger(allocationId) || allocationId <= 0 || !street || !column || !level || !Number.isInteger(quantity) || quantity <= 0) {
    return Response.json({ error: "Informe posição de destino (rua, coluna, nível) e quantidade válida para transferência." }, { status: 400 });
  }

  const source = await env.DB.prepare(`SELECT id, code, shipment_identifier, street, "column", level, quantity FROM allocations WHERE id = ?`)
    .bind(allocationId)
    .first<{ id: number; code: string; shipment_identifier: string | null; street: string; column: string; level: string; quantity: number }>();

  if (!source) {
    return Response.json({ error: "Posição de origem não encontrada." }, { status: 404 });
  }
  if (quantity > source.quantity) {
    return Response.json({ error: `Quantidade maior que o saldo da posição (${source.quantity} un.).` }, { status: 400 });
  }
  if (
    source.street.toLowerCase() === street.toLowerCase()
    && source.column.toLowerCase() === column.toLowerCase()
    && source.level.toLowerCase() === level.toLowerCase()
  ) {
    return Response.json({ error: "A posição de destino deve ser diferente da posição atual." }, { status: 400 });
  }

  const statements = quantity === source.quantity
    ? [
        env.DB.prepare(`UPDATE allocations SET street = ?, "column" = ?, level = ? WHERE id = ?`)
          .bind(street, column, level, source.id),
      ]
    : [
        env.DB.prepare("UPDATE allocations SET quantity = quantity - ? WHERE id = ?")
          .bind(quantity, source.id),
        env.DB.prepare(`INSERT INTO allocations (code, shipment_identifier, street, "column", level, quantity) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(source.code, source.shipment_identifier, street, column, level, quantity),
      ];

  await env.DB.batch(statements);
  return null;
}

export async function GET() {
  await ensureAllocationsTable();
  return readData();
}

export async function POST(request: Request) {
  await ensureAllocationsTable();
  const payload = await request.json() as Record<string, unknown>;
  const action = String(payload.action ?? "");

  if (action === "transfer") {
    const errorResponse = await transferAllocation(payload);
    if (errorResponse) return errorResponse;
    return readData();
  }

  const code = String(payload.code ?? "");
  const street = String(payload.street ?? "").trim();
  const column = String(payload.column ?? "").trim();
  const level = String(payload.level ?? "").trim();
  const quantity = Number(payload.quantity);
  const taskId = Number(payload.taskId);

  if (!street || !column || !level || !Number.isInteger(quantity) || quantity <= 0) {
    return Response.json({ error: "Produto, rua, coluna, nível e quantidade são obrigatórios." }, { status: 400 });
  }

  const item = await env.DB.prepare("SELECT gh FROM inventory WHERE code = ?")
    .bind(code).first<{ gh: number }>();
  if (!item) {
    return Response.json({ error: "Código de produto inválido." }, { status: 400 });
  }

  const [allocated, pendingRows] = await Promise.all([
    env.DB.prepare("SELECT COALESCE(SUM(quantity), 0) AS total FROM allocations WHERE code = ?")
      .bind(code).first<{ total: number }>(),
    env.DB.prepare(`SELECT t.id, t.quantity, t.allocated_quantity,
      COALESCE(po.shipment_identifier, s.shipment_identifier, CASE WHEN t.shipment_id IS NOT NULL THEN 'Embarque #' || t.shipment_id ELSE NULL END) AS shipment_identifier
      FROM allocation_tasks t
      LEFT JOIN shipments s ON s.id = t.shipment_id
      LEFT JOIN purchase_orders po ON po.id = s.purchase_order_id
      WHERE t.code = ? AND t.status = 'pending'
      ORDER BY CASE WHEN t.id = ? THEN 0 ELSE 1 END, t.id`)
      .bind(code, Number.isInteger(taskId) && taskId > 0 ? taskId : -1)
      .all<{ id: number; quantity: number; allocated_quantity: number; shipment_identifier: string | null }>(),
  ]);

  const allocatedTotal = Number(allocated?.total ?? 0);
  const pendingTasks = pendingRows.results;
  const totalPending = pendingTasks.reduce((sum, task) => sum + Math.max(task.quantity - task.allocated_quantity, 0), 0);
  const available = Math.max(item.gh - allocatedTotal, totalPending, 0);
  if (quantity > available) {
    return Response.json({ error: `Quantidade maior que a disponível para alocação. Restam ${available} unidades.` }, { status: 400 });
  }

  const fallbackIdentifier = String(payload.shipmentIdentifier ?? "").trim() || null;
  const statements: D1PreparedStatement[] = [];
  let remainingToAssign = quantity;

  for (const task of pendingTasks) {
    if (remainingToAssign <= 0) break;
    const taskRemaining = Math.max(task.quantity - task.allocated_quantity, 0);
    if (taskRemaining <= 0) continue;
    const take = Math.min(remainingToAssign, taskRemaining);
    const nextAllocated = task.allocated_quantity + take;
    statements.push(
      env.DB.prepare(`INSERT INTO allocations (code, shipment_identifier, street, "column", level, quantity) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(code, task.shipment_identifier ?? fallbackIdentifier, street, column, level, take),
      env.DB.prepare(`UPDATE allocation_tasks
        SET allocated_quantity = ?, status = CASE WHEN ? >= quantity THEN 'completed' ELSE 'pending' END
        WHERE id = ?`)
        .bind(nextAllocated, nextAllocated, task.id),
    );
    remainingToAssign -= take;
  }

  if (remainingToAssign > 0) {
    statements.push(
      env.DB.prepare(`INSERT INTO allocations (code, shipment_identifier, street, "column", level, quantity) VALUES (?, ?, ?, ?, ?, ?)`)
        .bind(code, fallbackIdentifier, street, column, level, remainingToAssign),
    );
  }

  if (item.gh < allocatedTotal + quantity) {
    statements.push(
      env.DB.prepare("UPDATE inventory SET gh = ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?")
        .bind(allocatedTotal + quantity, code),
    );
  }

  await env.DB.batch(statements);
  return readData();
}

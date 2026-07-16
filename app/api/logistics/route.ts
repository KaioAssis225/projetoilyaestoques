import { env } from "cloudflare:workers";

async function ensureLogisticsTable() {
  await env.DB.prepare(`CREATE TABLE IF NOT EXISTS logistics_events (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL,
    code TEXT NOT NULL,
    quantity INTEGER NOT NULL,
    previous_quantity INTEGER,
    new_quantity INTEGER,
    invoice_number TEXT,
    order_number TEXT,
    street TEXT,
    "column" TEXT,
    level TEXT,
    note TEXT NOT NULL DEFAULT '',
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  )`).run();
  const columns = await env.DB.prepare("PRAGMA table_info(logistics_events)").all<{ name: string }>();
  const names = new Set(columns.results.map((column) => column.name));
  const missing = [
    ["street", "ALTER TABLE logistics_events ADD COLUMN street TEXT"],
    ["column", "ALTER TABLE logistics_events ADD COLUMN \"column\" TEXT"],
    ["level", "ALTER TABLE logistics_events ADD COLUMN level TEXT"],
  ] as const;
  for (const [name, statement] of missing) {
    if (!names.has(name)) await env.DB.prepare(statement).run();
  }
}

async function readData() {
  const [inventory, events] = await Promise.all([
    env.DB.prepare("SELECT * FROM inventory ORDER BY code").all(),
    env.DB.prepare("SELECT * FROM logistics_events ORDER BY id DESC LIMIT 100").all(),
  ]);
  return Response.json({ inventory: inventory.results, events: events.results });
}

function nonNegativeInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 ? number : null;
}

export async function GET() {
  await ensureLogisticsTable();
  return readData();
}

export async function POST(request: Request) {
  await ensureLogisticsTable();
  const payload = await request.json() as Record<string, unknown>;
  const action = String(payload.action ?? "");
  const code = String(payload.code ?? "");
  const item = await env.DB.prepare("SELECT code, gh FROM inventory WHERE code = ?")
    .bind(code).first<{ code: string; gh: number }>();

  if (!item) {
    return Response.json({ error: "Código de item inválido." }, { status: 400 });
  }

  if (action === "exit") {
    const quantity = nonNegativeInteger(payload.quantity);
    const allocationId = nonNegativeInteger(payload.allocationId);
    const invoiceNumber = String(payload.invoiceNumber ?? "").trim();
    const orderNumber = String(payload.orderNumber ?? "").trim();
    if (!quantity || !allocationId || !invoiceNumber || !orderNumber) {
      return Response.json({ error: "Nota fiscal, número do pedido, posição e quantidade são obrigatórios." }, { status: 400 });
    }
    if (quantity > item.gh) {
      return Response.json({ error: `Quantidade maior que o Estoque GH. Saldo atual: ${item.gh}.` }, { status: 400 });
    }
    const allocation = await env.DB.prepare(`SELECT id, quantity, street, "column", level
      FROM allocations WHERE id = ? AND code = ?`)
      .bind(allocationId, code).first<{ id: number; quantity: number; street: string; column: string; level: string }>();
    if (!allocation) {
      return Response.json({ error: "Selecione uma posição válida para a saída." }, { status: 400 });
    }
    if (quantity > allocation.quantity) {
      return Response.json({ error: `Quantidade maior que a disponível nessa posição. Saldo da posição: ${allocation.quantity}.` }, { status: 400 });
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE inventory SET gh = gh - ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?")
        .bind(quantity, code),
      quantity === allocation.quantity
        ? env.DB.prepare("DELETE FROM allocations WHERE id = ?").bind(allocation.id)
        : env.DB.prepare("UPDATE allocations SET quantity = quantity - ? WHERE id = ?").bind(quantity, allocation.id),
      env.DB.prepare(`INSERT INTO logistics_events
        (type, code, quantity, previous_quantity, new_quantity, invoice_number, order_number, street, "column", level, note)
        VALUES ('exit', ?, ?, ?, ?, ?, ?, ?, ?, ?, '')`)
        .bind(code, quantity, item.gh, item.gh - quantity, invoiceNumber, orderNumber, allocation.street, allocation.column, allocation.level),
    ]);
  } else if (action === "adjustment") {
    const newQuantity = nonNegativeInteger(payload.newQuantity);
    const note = String(payload.note ?? "").trim();
    if (newQuantity === null || !note) {
      return Response.json({ error: "Informe a nova quantidade e o motivo do ajuste." }, { status: 400 });
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE inventory SET gh = ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?")
        .bind(newQuantity, code),
      env.DB.prepare(`INSERT INTO logistics_events
        (type, code, quantity, previous_quantity, new_quantity, note)
        VALUES ('adjustment', ?, ?, ?, ?, ?)`)
        .bind(code, newQuantity - item.gh, item.gh, newQuantity, note),
    ]);
  } else {
    return Response.json({ error: "Ação inválida." }, { status: 400 });
  }

  return readData();
}

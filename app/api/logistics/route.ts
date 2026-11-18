import { env } from "cloudflare:workers";
import { ensureStockGuards, runGuardedBatch } from "../../../lib/stock-guards";

async function ensureTables() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS logistics_events (
      id INTEGER PRIMARY KEY AUTOINCREMENT, type TEXT NOT NULL, code TEXT NOT NULL, quantity INTEGER NOT NULL,
      previous_quantity INTEGER, new_quantity INTEGER, invoice_number TEXT, order_number TEXT, street TEXT,
      "column" TEXT, level TEXT, note TEXT NOT NULL DEFAULT '', created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS logistics_orders (
      id INTEGER PRIMARY KEY AUTOINCREMENT, commitment_document_id INTEGER NOT NULL UNIQUE, order_number TEXT NOT NULL,
      loan_items INTEGER NOT NULL DEFAULT 0, status TEXT NOT NULL DEFAULT 'awaiting_invoice', invoice_number TEXT,
      separated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP, departed_at TEXT, returned_at TEXT)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS logistics_order_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT, logistics_order_id INTEGER NOT NULL, code TEXT NOT NULL, quantity INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS logistics_order_sources (
      id INTEGER PRIMARY KEY AUTOINCREMENT, logistics_order_item_id INTEGER NOT NULL, allocation_id INTEGER NOT NULL,
      street TEXT NOT NULL, "column" TEXT NOT NULL, level TEXT NOT NULL, quantity INTEGER NOT NULL)`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS return_allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT, logistics_order_item_id INTEGER NOT NULL, code TEXT NOT NULL,
      street TEXT NOT NULL, "column" TEXT NOT NULL, level TEXT NOT NULL, quantity INTEGER NOT NULL,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)`),
  ]);
  await ensureStockGuards();
  await backfillExitEvents();
}

const backfilledDatabases = new WeakSet<object>();

/**
 * Até a correção da Baixa por NF, a NF não gravava eventos de saída, e o histórico
 * e o Dashboard Saída ficavam vazios. Recria uma vez por instância as saídas que faltam
 * para pedidos que já têm NF, usando a data da baixa. Pedidos que já têm saídas não são tocados.
 */
async function backfillExitEvents() {
  if (backfilledDatabases.has(env.DB)) return;
  await env.DB.batch([
    env.DB.prepare(`INSERT INTO logistics_events (type, code, quantity, invoice_number, order_number, street, "column", level, note, created_at)
      SELECT 'exit', oi.code, s.quantity, o.invoice_number, o.order_number, s.street, s."column", s.level,
        CASE WHEN o.loan_items = 1 THEN 'Itens de empréstimo' ELSE '' END, COALESCE(o.departed_at, CURRENT_TIMESTAMP)
      FROM logistics_orders o
      JOIN logistics_order_items oi ON oi.logistics_order_id = o.id
      JOIN logistics_order_sources s ON s.logistics_order_item_id = oi.id
      WHERE o.invoice_number IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM logistics_events e WHERE e.type = 'exit' AND e.order_number = o.order_number AND e.invoice_number = o.invoice_number)
      ORDER BY o.id, oi.id, s.id`),
    env.DB.prepare(`INSERT INTO logistics_events (type, code, quantity, invoice_number, order_number, note, created_at)
      SELECT 'exit', oi.code, oi.quantity, o.invoice_number, o.order_number,
        CASE WHEN o.loan_items = 1 THEN 'Itens de empréstimo' ELSE '' END, COALESCE(o.departed_at, CURRENT_TIMESTAMP)
      FROM logistics_orders o
      JOIN logistics_order_items oi ON oi.logistics_order_id = o.id
      WHERE o.invoice_number IS NOT NULL
        AND NOT EXISTS (SELECT 1 FROM logistics_order_sources s WHERE s.logistics_order_item_id = oi.id)
        AND NOT EXISTS (SELECT 1 FROM logistics_events e WHERE e.type = 'exit' AND e.order_number = o.order_number
          AND e.invoice_number = o.invoice_number AND e.code = oi.code)`),
  ]);
  backfilledDatabases.add(env.DB);
}

async function readData() {
  const [inventory, events, exitSummary, openRows, processRows, sources, returns] = await Promise.all([
    env.DB.prepare("SELECT * FROM inventory ORDER BY code").all(),
    env.DB.prepare("SELECT * FROM logistics_events ORDER BY id DESC LIMIT 100").all(),
    // Total acumulado de saídas por produto (o histórico acima traz só os 100 últimos eventos).
    env.DB.prepare(`SELECT e.code, SUM(e.quantity) AS quantity, COUNT(DISTINCT COALESCE(e.invoice_number, e.id)) AS count,
      (SELECT last.invoice_number FROM logistics_events last WHERE last.type = 'exit' AND last.code = e.code ORDER BY last.id DESC LIMIT 1) AS last_invoice
      FROM logistics_events e WHERE e.type = 'exit' GROUP BY e.code`).all(),
    env.DB.prepare(`SELECT d.id, d.order_number, d.loan_items, d.created_at, li.id AS item_id, li.code, li.quantity,
      i.description, i.finish FROM commitment_documents d JOIN commitment_document_items li ON li.document_id = d.id
      JOIN inventory i ON i.code = li.code WHERE d.type = 'order' ORDER BY d.id DESC, li.id`).all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT o.*, oi.id AS item_id, oi.code, oi.quantity, i.description, i.finish
      FROM logistics_orders o JOIN logistics_order_items oi ON oi.logistics_order_id = o.id
      JOIN inventory i ON i.code = oi.code ORDER BY o.id DESC, oi.id`).all<Record<string, unknown>>(),
    env.DB.prepare("SELECT * FROM logistics_order_sources ORDER BY id").all<Record<string, unknown>>(),
    env.DB.prepare(`SELECT ra.*, i.description, i.finish, lo.order_number
      FROM return_allocations ra JOIN inventory i ON i.code = ra.code
      JOIN logistics_order_items oi ON oi.id = ra.logistics_order_item_id
      JOIN logistics_orders lo ON lo.id = oi.logistics_order_id ORDER BY ra.id DESC`).all<Record<string, unknown>>(),
  ]);
  const group = (rows: Record<string, unknown>[], processed: boolean) => {
    const map = new Map<number, Record<string, unknown> & { items: Record<string, unknown>[] }>();
    for (const row of rows) {
      const id = Number(row.id);
      if (!map.has(id)) map.set(id, processed
        ? { id, order_number: row.order_number, loan_items: row.loan_items, status: row.status, invoice_number: row.invoice_number,
            separated_at: row.separated_at, departed_at: row.departed_at, returned_at: row.returned_at, items: [] }
        : { id, order_number: row.order_number, loan_items: row.loan_items, created_at: row.created_at, items: [] });
      map.get(id)?.items.push({ id: row.item_id, code: row.code, quantity: row.quantity,
        description: row.description, finish: row.finish,
        sources: processed ? sources.results.filter((source) => Number(source.logistics_order_item_id) === Number(row.item_id)) : [],
        return_positions: processed ? returns.results.filter((position) => Number(position.logistics_order_item_id) === Number(row.item_id)) : [] });
    }
    return [...map.values()];
  };
  return { inventory: inventory.results, events: events.results, exitSummary: exitSummary.results, openOrders: group(openRows.results, false), logisticsOrders: group(processRows.results, true), returnAllocations: returns.results };
}

function positiveInteger(value: unknown) {
  const number = Number(value);
  return Number.isInteger(number) && number > 0 ? number : null;
}

export async function GET() {
  await ensureTables();
  return Response.json(await readData());
}

export async function POST(request: Request) {
  await ensureTables();
  const payload = await request.json() as Record<string, unknown>;
  const action = String(payload.action ?? "");

  if (action === "separate_order") {
    const documentId = positiveInteger(payload.documentId);
    const selections = Array.isArray(payload.selections) ? payload.selections as Array<Record<string, unknown>> : [];
    const document = documentId ? await env.DB.prepare("SELECT id, order_number, loan_items FROM commitment_documents WHERE id = ? AND type = 'order'")
      .bind(documentId).first<{ id: number; order_number: string; loan_items: number }>() : null;
    if (!document) return Response.json({ error: "Pedido não encontrado ou já separado." }, { status: 400 });
    const items = await env.DB.prepare("SELECT id, code, quantity FROM commitment_document_items WHERE document_id = ? ORDER BY id")
      .bind(document.id).all<{ id: number; code: string; quantity: number }>();
    const prepared: Array<{ item: typeof items.results[number]; sources: Array<{ allocationId: number; quantity: number; allocation: { id: number; quantity: number; street: string; column: string; level: string } }> }> = [];
    const usedByAllocation = new Map<number, number>();
    for (const item of items.results) {
      const sources = selections.filter((entry) => Number(entry.itemId) === item.id).map((entry) => ({ allocationId: Number(entry.allocationId), quantity: Number(entry.quantity) }));
      if (!sources.length || sources.some((source) => !positiveInteger(source.allocationId) || !positiveInteger(source.quantity)) || sources.reduce((sum, source) => sum + source.quantity, 0) !== item.quantity) {
        return Response.json({ error: `${item.code}: distribua exatamente ${item.quantity} unidades entre as posições.` }, { status: 400 });
      }
      const checked = [];
      for (const source of sources) {
        const allocation = await env.DB.prepare(`SELECT id, quantity, street, "column", level FROM allocations WHERE id = ? AND code = ?`)
          .bind(source.allocationId, item.code).first<{ id: number; quantity: number; street: string; column: string; level: string }>();
        const accumulated = (usedByAllocation.get(source.allocationId) ?? 0) + source.quantity;
        if (!allocation || accumulated > allocation.quantity) return Response.json({ error: `${item.code}: uma das posições não possui saldo suficiente.` }, { status: 400 });
        usedByAllocation.set(source.allocationId, accumulated);
        checked.push({ ...source, allocation });
      }
      prepared.push({ item, sources: checked });
    }
    const orderInsert = await env.DB.prepare(`INSERT INTO logistics_orders (commitment_document_id, order_number, loan_items)
      VALUES (?, ?, ?)`).bind(document.id, document.order_number, document.loan_items).run();
    const statements = [];
    for (const entry of prepared) {
      const inserted = await env.DB.prepare("INSERT INTO logistics_order_items (logistics_order_id, code, quantity) VALUES (?, ?, ?)")
        .bind(orderInsert.meta.last_row_id, entry.item.code, entry.item.quantity).run();
      statements.push(env.DB.prepare("UPDATE inventory SET gh = gh - ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?").bind(entry.item.quantity, entry.item.code));
      for (const source of entry.sources) {
        // Decrementa sempre (o trigger impede saldo negativo); a posição só é apagada se zerar de fato.
        statements.push(env.DB.prepare("UPDATE allocations SET quantity = quantity - ? WHERE id = ?").bind(source.quantity, source.allocation.id));
        statements.push(env.DB.prepare("DELETE FROM allocations WHERE id = ? AND quantity = 0").bind(source.allocation.id));
        statements.push(env.DB.prepare(`INSERT INTO logistics_order_sources
          (logistics_order_item_id, allocation_id, street, "column", level, quantity) VALUES (?, ?, ?, ?, ?, ?)`)
          .bind(inserted.meta.last_row_id, source.allocation.id, source.allocation.street, source.allocation.column, source.allocation.level, source.quantity));
      }
    }
    statements.push(env.DB.prepare("DELETE FROM commitment_document_items WHERE document_id = ?").bind(document.id));
    statements.push(env.DB.prepare("DELETE FROM commitment_documents WHERE id = ?").bind(document.id));
    const errorResponse = await runGuardedBatch(statements);
    if (errorResponse) {
      // Desfaz o cabeçalho gravado antes do lote para o pedido poder ser separado de novo.
      await env.DB.batch([
        env.DB.prepare("DELETE FROM logistics_order_items WHERE logistics_order_id = ?").bind(orderInsert.meta.last_row_id),
        env.DB.prepare("DELETE FROM logistics_orders WHERE id = ?").bind(orderInsert.meta.last_row_id),
      ]);
      return errorResponse;
    }
  } else if (action === "invoice") {
    const orderId = positiveInteger(payload.orderId);
    const invoiceNumber = String(payload.invoiceNumber ?? "").trim();
    if (!orderId || !invoiceNumber) return Response.json({ error: "Informe a nota fiscal." }, { status: 400 });
    const order = await env.DB.prepare("SELECT loan_items, status FROM logistics_orders WHERE id = ?").bind(orderId).first<{ loan_items: number; status: string }>();
    if (!order || order.status !== "awaiting_invoice") return Response.json({ error: "Este pedido não está aguardando nota fiscal." }, { status: 400 });
    // A baixa por NF registra uma saída por posição de origem; é isso que alimenta o histórico e o Dashboard Saída.
    const errorResponse = await runGuardedBatch([
      env.DB.prepare(`UPDATE logistics_orders SET invoice_number = ?, departed_at = CURRENT_TIMESTAMP,
        status = ? WHERE id = ?`).bind(invoiceNumber, order.loan_items ? "awaiting_return" : "completed", orderId),
      env.DB.prepare(`INSERT INTO logistics_events (type, code, quantity, invoice_number, order_number, street, "column", level, note)
        SELECT 'exit', oi.code, s.quantity, ?, o.order_number, s.street, s."column", s.level,
          CASE WHEN o.loan_items = 1 THEN 'Itens de empréstimo' ELSE '' END
        FROM logistics_orders o
        JOIN logistics_order_items oi ON oi.logistics_order_id = o.id
        JOIN logistics_order_sources s ON s.logistics_order_item_id = oi.id
        WHERE o.id = ? ORDER BY oi.id, s.id`).bind(invoiceNumber, orderId),
      env.DB.prepare(`INSERT INTO logistics_events (type, code, quantity, invoice_number, order_number, note)
        SELECT 'exit', oi.code, oi.quantity, ?, o.order_number,
          CASE WHEN o.loan_items = 1 THEN 'Itens de empréstimo' ELSE '' END
        FROM logistics_orders o
        JOIN logistics_order_items oi ON oi.logistics_order_id = o.id
        WHERE o.id = ? AND NOT EXISTS (SELECT 1 FROM logistics_order_sources s WHERE s.logistics_order_item_id = oi.id)`).bind(invoiceNumber, orderId),
    ]);
    if (errorResponse) return errorResponse;
  } else if (action === "return_order") {
    const orderId = positiveInteger(payload.orderId);
    const positions = Array.isArray(payload.positions) ? payload.positions as Array<Record<string, unknown>> : [];
    const order = orderId ? await env.DB.prepare("SELECT status FROM logistics_orders WHERE id = ? AND loan_items = 1").bind(orderId).first<{ status: string }>() : null;
    if (!order || order.status !== "awaiting_return") return Response.json({ error: "Este pedido não está aguardando devolução." }, { status: 400 });
    const items = await env.DB.prepare("SELECT id, code, quantity FROM logistics_order_items WHERE logistics_order_id = ?").bind(orderId).all<{ id: number; code: string; quantity: number }>();
    const statements = [];
    for (const item of items.results) {
      const position = positions.find((entry) => Number(entry.itemId) === item.id);
      const street = String(position?.street ?? "").trim(), column = String(position?.column ?? "").trim(), level = String(position?.level ?? "").trim();
      if (!street || !column || !level) return Response.json({ error: `Informe rua, coluna e nível para ${item.code}.` }, { status: 400 });
      statements.push(env.DB.prepare("UPDATE inventory SET returns = returns + ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?").bind(item.quantity, item.code));
      statements.push(env.DB.prepare(`INSERT INTO return_allocations (logistics_order_item_id, code, street, "column", level, quantity)
        VALUES (?, ?, ?, ?, ?, ?)`).bind(item.id, item.code, street, column, level, item.quantity));
    }
    // O status vai primeiro: numa segunda confirmação o trigger aborta o lote e a devolução não é somada duas vezes.
    statements.unshift(env.DB.prepare("UPDATE logistics_orders SET status = 'returned', returned_at = CURRENT_TIMESTAMP WHERE id = ?").bind(orderId));
    const errorResponse = await runGuardedBatch(statements);
    if (errorResponse) return errorResponse;
  } else if (action === "adjustment") {
    const code = String(payload.code ?? "");
    const newQuantity = Number(payload.newQuantity);
    const note = String(payload.note ?? "").trim();
    const item = await env.DB.prepare("SELECT gh FROM inventory WHERE code = ?").bind(code).first<{ gh: number }>();
    if (!item || !Number.isInteger(newQuantity) || newQuantity < 0 || !note) return Response.json({ error: "Informe produto, nova quantidade e motivo do ajuste." }, { status: 400 });
    const [allocated, committed] = await Promise.all([
      env.DB.prepare("SELECT COALESCE(SUM(quantity), 0) AS total FROM allocations WHERE code = ?").bind(code).first<{ total: number }>(),
      env.DB.prepare("SELECT COALESCE(SUM(quantity), 0) AS total FROM commitment_document_items WHERE code = ?").bind(code).first<{ total: number }>(),
    ]);
    const allocatedTotal = Number(allocated?.total ?? 0);
    const committedTotal = Number(committed?.total ?? 0);
    if (newQuantity < allocatedTotal || newQuantity < committedTotal) {
      return Response.json({ error: `O Estoque GH não pode ficar abaixo de ${Math.max(allocatedTotal, committedTotal)} unidades (${allocatedTotal} alocadas, ${committedTotal} empenhadas).` }, { status: 400 });
    }
    await env.DB.batch([
      env.DB.prepare("UPDATE inventory SET gh = ?, updated_at = CURRENT_TIMESTAMP WHERE code = ?").bind(newQuantity, code),
      env.DB.prepare(`INSERT INTO logistics_events (type, code, quantity, previous_quantity, new_quantity, note)
        VALUES ('adjustment', ?, ?, ?, ?, ?)`).bind(code, newQuantity - item.gh, item.gh, newQuantity, note),
    ]);
  } else return Response.json({ error: "Ação inválida." }, { status: 400 });

  return Response.json(await readData());
}

import { env } from "cloudflare:workers";
import { ensureStockGuards, runGuardedBatch } from "../../../lib/stock-guards";

async function ensureTables() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS commitment_documents (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      type TEXT NOT NULL,
      reservation_code TEXT UNIQUE,
      order_number TEXT,
      note TEXT NOT NULL DEFAULT '',
      loan_items INTEGER NOT NULL DEFAULT 0,
      legacy_commitment_id INTEGER UNIQUE,
      created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )`),
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS commitment_document_items (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      document_id INTEGER NOT NULL,
      code TEXT NOT NULL,
      quantity INTEGER NOT NULL
    )`),
  ]);

  const legacyTable = await env.DB.prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'commitments'").first();
  if (legacyTable) {
    const legacy = await env.DB.prepare(`SELECT c.* FROM commitments c
      LEFT JOIN commitment_documents d ON d.legacy_commitment_id = c.id
      WHERE d.id IS NULL ORDER BY c.id`).all<Record<string, unknown>>();
    for (const row of legacy.results) {
      const type = String(row.type);
      const reservationCode = type === "reservation" ? await nextReservationCode() : null;
      const result = await env.DB.prepare(`INSERT INTO commitment_documents
        (type, reservation_code, order_number, note, loan_items, legacy_commitment_id, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)`)
        .bind(type, reservationCode, row.order_number ?? null, row.note ?? "", row.loan_items ?? 0, row.id, row.created_at).run();
      await env.DB.prepare("INSERT INTO commitment_document_items (document_id, code, quantity) VALUES (?, ?, ?)")
        .bind(result.meta.last_row_id, row.code, row.quantity).run();
    }
  }
  await ensureStockGuards();
}

async function nextReservationCode() {
  const row = await env.DB.prepare(`SELECT MAX(CAST(SUBSTR(reservation_code, 2) AS INTEGER)) AS last_number
    FROM commitment_documents WHERE reservation_code LIKE 'R%'`).first<{ last_number: number | null }>();
  return `R${String(Number(row?.last_number ?? 0) + 1).padStart(3, "0")}`;
}

async function readDocuments() {
  const rows = await env.DB.prepare(`SELECT d.*, li.id AS item_id, li.code, li.quantity, i.description, i.finish
    FROM commitment_documents d
    JOIN commitment_document_items li ON li.document_id = d.id
    JOIN inventory i ON i.code = li.code
    ORDER BY d.id DESC, li.id`).all<Record<string, unknown>>();
  const documents = new Map<number, Record<string, unknown> & { items: Record<string, unknown>[] }>();
  for (const row of rows.results) {
    const id = Number(row.id);
    if (!documents.has(id)) documents.set(id, {
      id, type: row.type, reservation_code: row.reservation_code, order_number: row.order_number,
      note: row.note, loan_items: row.loan_items, created_at: row.created_at, items: [],
    });
    documents.get(id)?.items.push({ id: row.item_id, code: row.code, quantity: row.quantity, description: row.description, finish: row.finish });
  }
  return [...documents.values()];
}

export async function GET() {
  await ensureTables();
  return Response.json({ documents: await readDocuments() });
}

export async function POST(request: Request) {
  await ensureTables();
  const payload = await request.json() as Record<string, unknown>;
  const type = String(payload.type ?? "");
  const note = String(payload.note ?? "").trim();
  const orderNumber = String(payload.orderNumber ?? "").trim();
  const loanItems = type === "order" && payload.loanItems === true;
  const items = Array.isArray(payload.items) ? payload.items as Array<Record<string, unknown>> : [];
  if (!['reservation', 'order'].includes(type) || items.length === 0 || (type === "reservation" && !note)) {
    return Response.json({ error: "Informe o tipo e pelo menos um item; reservas também exigem observação." }, { status: 400 });
  }
  if (type === "order" && !orderNumber) return Response.json({ error: "O número do pedido é obrigatório." }, { status: 400 });

  const normalized = items.map((item) => ({ code: String(item.code ?? ""), quantity: Number(item.quantity) }));
  if (normalized.some((item) => !item.code || !Number.isInteger(item.quantity) || item.quantity <= 0)) {
    return Response.json({ error: "Todos os itens precisam de produto e quantidade inteira positiva." }, { status: 400 });
  }
  const grouped = new Map<string, number>();
  for (const item of normalized) grouped.set(item.code, (grouped.get(item.code) ?? 0) + item.quantity);
  for (const [code, requested] of grouped) {
    const inventory = await env.DB.prepare("SELECT gh FROM inventory WHERE code = ?").bind(code).first<{ gh: number }>();
    if (!inventory) return Response.json({ error: `Produto ${code} inválido.` }, { status: 400 });
    const committed = await env.DB.prepare(`SELECT COALESCE(SUM(li.quantity), 0) AS total
      FROM commitment_document_items li WHERE li.code = ?`).bind(code).first<{ total: number }>();
    const available = Math.max(inventory.gh - Number(committed?.total ?? 0), 0);
    if (requested > available) return Response.json({ error: `${code}: solicitado ${requested}, mas há ${available} unidades disponíveis no Estoque GH.` }, { status: 400 });
  }

  const reservationCode = type === "reservation" ? await nextReservationCode() : null;
  const result = await env.DB.prepare(`INSERT INTO commitment_documents
    (type, reservation_code, order_number, note, loan_items) VALUES (?, ?, ?, ?, ?)`)
    .bind(type, reservationCode, type === "order" ? orderNumber : null, note, loanItems ? 1 : 0).run();
  // O trigger guard_commitments_within_gh aborta o lote se outro empenho consumiu o saldo nesse meio tempo.
  const errorResponse = await runGuardedBatch(normalized.map((item) => env.DB.prepare(
    "INSERT INTO commitment_document_items (document_id, code, quantity) VALUES (?, ?, ?)"
  ).bind(result.meta.last_row_id, item.code, item.quantity)));
  if (errorResponse) {
    await env.DB.prepare("DELETE FROM commitment_documents WHERE id = ?").bind(result.meta.last_row_id).run();
    return errorResponse;
  }
  return Response.json({ documents: await readDocuments() }, { status: 201 });
}

export async function DELETE(request: Request) {
  await ensureTables();
  const id = Number(new URL(request.url).searchParams.get("id"));
  if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "Documento inválido." }, { status: 400 });
  await env.DB.batch([
    env.DB.prepare("DELETE FROM commitment_document_items WHERE document_id = ?").bind(id),
    env.DB.prepare("DELETE FROM commitment_documents WHERE id = ?").bind(id),
  ]);
  return Response.json({ documents: await readDocuments() });
}

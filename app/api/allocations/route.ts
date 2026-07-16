import { env } from "cloudflare:workers";

async function ensureAllocationsTable() {
  await env.DB.batch([
    env.DB.prepare(`CREATE TABLE IF NOT EXISTS allocations (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL,
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
  ]);
}

async function readData() {
  const [inventory, allocations, tasks] = await Promise.all([
    env.DB.prepare("SELECT * FROM inventory ORDER BY code").all(),
    env.DB.prepare(`SELECT a.*, i.description, i.finish
      FROM allocations a
      JOIN inventory i ON i.code = a.code
      ORDER BY a.id DESC`).all(),
    env.DB.prepare(`SELECT t.*, i.description, i.finish
      FROM allocation_tasks t
      JOIN inventory i ON i.code = t.code
      WHERE t.status = 'pending'
      ORDER BY t.id`).all(),
  ]);
  return Response.json({ inventory: inventory.results, allocations: allocations.results, tasks: tasks.results });
}

export async function GET() {
  await ensureAllocationsTable();
  return readData();
}

export async function POST(request: Request) {
  await ensureAllocationsTable();
  const payload = await request.json() as Record<string, unknown>;
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

  const allocated = await env.DB.prepare("SELECT COALESCE(SUM(quantity), 0) AS total FROM allocations WHERE code = ?")
    .bind(code).first<{ total: number }>();
  const available = Math.max(item.gh - Number(allocated?.total ?? 0), 0);
  if (quantity > available) {
    return Response.json({ error: `Quantidade maior que a disponível para alocação. Restam ${available} unidades.` }, { status: 400 });
  }

  if (Number.isInteger(taskId) && taskId > 0) {
    const task = await env.DB.prepare("SELECT quantity, allocated_quantity FROM allocation_tasks WHERE id = ? AND code = ? AND status = 'pending'")
      .bind(taskId, code).first<{ quantity: number; allocated_quantity: number }>();
    const taskRemaining = task ? task.quantity - task.allocated_quantity : 0;
    if (!task || quantity > taskRemaining) {
      return Response.json({ error: `Quantidade maior que a pendência de alocação. Restam ${taskRemaining} unidades desta chegada.` }, { status: 400 });
    }
  }

  const existingPosition = await env.DB.prepare(`SELECT id FROM allocations
    WHERE code = ? AND street = ? COLLATE NOCASE AND "column" = ? COLLATE NOCASE AND level = ? COLLATE NOCASE
    LIMIT 1`)
    .bind(code, street, column, level).first<{ id: number }>();
  if (existingPosition) {
    await env.DB.prepare("UPDATE allocations SET quantity = quantity + ? WHERE id = ?")
      .bind(quantity, existingPosition.id).run();
  } else {
    await env.DB.prepare(`INSERT INTO allocations (code, street, "column", level, quantity) VALUES (?, ?, ?, ?, ?)`)
      .bind(code, street, column, level, quantity).run();
  }
  if (Number.isInteger(taskId) && taskId > 0) {
    const task = await env.DB.prepare("SELECT quantity, allocated_quantity FROM allocation_tasks WHERE id = ? AND code = ? AND status = 'pending'")
      .bind(taskId, code).first<{ quantity: number; allocated_quantity: number }>();
    if (task) {
      const nextAllocated = Math.min(task.allocated_quantity + quantity, task.quantity);
      await env.DB.prepare(`UPDATE allocation_tasks
        SET allocated_quantity = ?, status = CASE WHEN ? >= quantity THEN 'completed' ELSE 'pending' END
        WHERE id = ?`)
        .bind(nextAllocated, nextAllocated, taskId).run();
    }
  }
  return readData();
}

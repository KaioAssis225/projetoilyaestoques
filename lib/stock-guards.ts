import { env } from "cloudflare:workers";

/**
 * Invariantes de saldo garantidas pelo próprio banco.
 *
 * Cada `env.DB.batch()` do D1 é uma transação: quando um destes triggers chama
 * `RAISE(ABORT, ...)`, o lote inteiro é desfeito. Isso protege o estoque contra
 * cliques duplos e requisições concorrentes que validam o mesmo saldo antes de gravar.
 *
 * As mensagens começam com `GUARD:` e não podem conter `:` depois do prefixo,
 * para que `guardErrorResponse` consiga extraí-las da mensagem de erro do D1.
 */
type GuardTrigger = { name: string; tables: string[]; sql: string };

const GUARD_TRIGGERS: GuardTrigger[] = [
  {
    name: "guard_inventory_non_negative",
    tables: ["inventory"],
    sql: `CREATE TRIGGER IF NOT EXISTS guard_inventory_non_negative
      BEFORE UPDATE ON inventory
      WHEN (NEW.china < 0 AND NEW.china < OLD.china)
        OR (NEW.transit < 0 AND NEW.transit < OLD.transit)
        OR (NEW.port < 0 AND NEW.port < OLD.port)
        OR (NEW.gh < 0 AND NEW.gh < OLD.gh)
        OR (NEW.returns < 0 AND NEW.returns < OLD.returns)
      BEGIN SELECT RAISE(ABORT, 'GUARD:Saldo insuficiente. A operação deixaria o estoque negativo'); END`,
  },
  {
    name: "guard_allocations_non_negative",
    tables: ["allocations"],
    sql: `CREATE TRIGGER IF NOT EXISTS guard_allocations_non_negative
      BEFORE UPDATE OF quantity ON allocations
      WHEN NEW.quantity < 0
      BEGIN SELECT RAISE(ABORT, 'GUARD:A posição de origem não possui saldo suficiente'); END`,
  },
  {
    name: "guard_return_allocations_non_negative",
    tables: ["return_allocations"],
    sql: `CREATE TRIGGER IF NOT EXISTS guard_return_allocations_non_negative
      BEFORE UPDATE OF quantity ON return_allocations
      WHEN NEW.quantity < 0
      BEGIN SELECT RAISE(ABORT, 'GUARD:A posição de devolução não possui saldo suficiente'); END`,
  },
  {
    name: "guard_allocation_tasks_limit",
    tables: ["allocation_tasks"],
    sql: `CREATE TRIGGER IF NOT EXISTS guard_allocation_tasks_limit
      BEFORE UPDATE OF allocated_quantity ON allocation_tasks
      WHEN NEW.allocated_quantity > NEW.quantity OR NEW.allocated_quantity < 0
      BEGIN SELECT RAISE(ABORT, 'GUARD:Quantidade maior que o saldo pendente deste embarque'); END`,
  },
  {
    name: "guard_shipments_stage_flow",
    tables: ["shipments"],
    sql: `CREATE TRIGGER IF NOT EXISTS guard_shipments_stage_flow
      BEFORE UPDATE OF stage ON shipments
      WHEN NOT ((OLD.stage = 'transit' AND NEW.stage = 'port') OR (OLD.stage = 'port' AND NEW.stage = 'completed'))
      BEGIN SELECT RAISE(ABORT, 'GUARD:Este embarque já foi movimentado para outra etapa. Atualize a tela'); END`,
  },
  {
    name: "guard_logistics_orders_status_flow",
    tables: ["logistics_orders"],
    sql: `CREATE TRIGGER IF NOT EXISTS guard_logistics_orders_status_flow
      BEFORE UPDATE OF status ON logistics_orders
      WHEN NOT ((OLD.status = 'awaiting_invoice' AND NEW.status IN ('awaiting_return', 'completed'))
        OR (OLD.status = 'awaiting_return' AND NEW.status = 'returned'))
      BEGIN SELECT RAISE(ABORT, 'GUARD:Este pedido já foi processado. Atualize a tela'); END`,
  },
  {
    name: "guard_logistics_orders_source_document",
    tables: ["logistics_orders", "commitment_documents"],
    sql: `CREATE TRIGGER IF NOT EXISTS guard_logistics_orders_source_document
      BEFORE INSERT ON logistics_orders
      WHEN NOT EXISTS (SELECT 1 FROM commitment_documents WHERE id = NEW.commitment_document_id AND type = 'order')
      BEGIN SELECT RAISE(ABORT, 'GUARD:Pedido não encontrado ou já separado'); END`,
  },
  {
    name: "guard_commitments_within_gh",
    tables: ["commitment_document_items", "inventory"],
    sql: `CREATE TRIGGER IF NOT EXISTS guard_commitments_within_gh
      AFTER INSERT ON commitment_document_items
      WHEN (SELECT COALESCE(SUM(quantity), 0) FROM commitment_document_items WHERE code = NEW.code)
        > COALESCE((SELECT gh FROM inventory WHERE code = NEW.code), 0)
      BEGIN SELECT RAISE(ABORT, 'GUARD:Quantidade maior que o disponível no Estoque GH'); END`,
  },
];

const readyDatabases = new WeakSet<object>();

/** Cria os triggers que ainda faltam. Depois que todos existem, não consulta mais o banco. */
export async function ensureStockGuards() {
  const db = env.DB;
  if (readyDatabases.has(db)) return;

  const existing = await db.prepare("SELECT type, name FROM sqlite_master WHERE type IN ('table', 'trigger')")
    .all<{ type: string; name: string }>();
  const tables = new Set(existing.results.filter((row) => row.type === "table").map((row) => row.name));
  const triggers = new Set(existing.results.filter((row) => row.type === "trigger").map((row) => row.name));

  let complete = true;
  for (const guard of GUARD_TRIGGERS) {
    if (triggers.has(guard.name)) continue;
    if (!guard.tables.every((table) => tables.has(table))) {
      complete = false;
      continue;
    }
    try {
      await db.prepare(guard.sql).run();
    } catch {
      // Tabela em formato legado (ex.: sem a coluna `returns`); tenta de novo na próxima requisição.
      complete = false;
    }
  }
  if (complete) readyDatabases.add(db);
}

const KNOWN_CONSTRAINTS: Array<[RegExp, string]> = [
  [/UNIQUE constraint failed: (shipment_identifier_registry|purchase_orders)\.(identifier|shipment_identifier)/i, "Já existe um embarque com este identificador."],
  [/UNIQUE constraint failed: logistics_orders\.commitment_document_id/i, "Pedido não encontrado ou já separado."],
  [/UNIQUE constraint failed: commitment_documents\.reservation_code/i, "Outra reserva foi criada ao mesmo tempo. Tente novamente."],
  [/NOT NULL constraint failed: logistics_order_sources\./i, "Uma das posições selecionadas mudou. Atualize a tela e selecione novamente."],
];

/** Converte uma violação de invariante em resposta 409; devolve `null` para erros inesperados. */
export function guardErrorResponse(error: unknown): Response | null {
  const message = error instanceof Error ? error.message : String(error);
  const guard = /GUARD:([^:]+)/.exec(message);
  if (guard) return Response.json({ error: `${guard[1].trim()}.` }, { status: 409 });
  for (const [pattern, friendly] of KNOWN_CONSTRAINTS) {
    if (pattern.test(message)) return Response.json({ error: friendly }, { status: 409 });
  }
  return null;
}

/** Executa o lote como transação; violações conhecidas viram 409 em vez de 500. */
export async function runGuardedBatch(statements: D1PreparedStatement[]): Promise<Response | null> {
  if (!statements.length) return null;
  try {
    await env.DB.batch(statements);
    return null;
  } catch (error) {
    const response = guardErrorResponse(error);
    if (response) return response;
    throw error;
  }
}

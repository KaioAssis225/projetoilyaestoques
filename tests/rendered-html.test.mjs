import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const root = new URL("../", import.meta.url);

test("contains the five operational areas and both allocation views", async () => {
  const page = await readFile(new URL("app/page.tsx", root), "utf8");
  for (const label of ["Estoque", "Comercial", "Comércio Exterior", "Logística", "Alocação"]) {
    assert.match(page, new RegExp(label));
  }
  assert.match(page, /Produtos alocados — Devolução/);
  assert.match(page, /Separação de item por pedido/);
  assert.match(page, /Baixa por NF/);
});

test("keeps the integrated logistics workflow and return stock in the API", async () => {
  const [logistics, commitments, schema] = await Promise.all([
    readFile(new URL("app/api/logistics/route.ts", root), "utf8"),
    readFile(new URL("app/api/commitments/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
  ]);
  for (const action of ["separate_order", "invoice", "return_order", "adjustment"]) {
    assert.match(logistics, new RegExp(`action === "${action}"`));
  }
  assert.match(logistics, /returns = returns \+ \?/);
  assert.match(commitments, /loan_items/);
  assert.match(schema, /returnAllocations/);
  assert.match(schema, /logisticsOrderSources/);
});

test("supports multi-item embarque orders and China withdrawals in Foreign Trade", async () => {
  const [page, foreignTrade, schema, mockApi] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/foreign-trade/route.ts", root), "utf8"),
    readFile(new URL("db/schema.ts", root), "utf8"),
    readFile(new URL("github-pages/mock-api.ts", root), "utf8"),
  ]);
  assert.match(page, /Embarque \(nº do pedido \/ contêiner\)/);
  assert.match(page, /Código da Nota Fiscal/);
  assert.match(foreignTrade, /invoice_code/);
  assert.match(page, /\+ Adicionar produto/);
  assert.match(page, /Qtd\. disponível/);
  assert.match(page, /Qtd\. a retirar/);
  assert.match(foreignTrade, /shipment_identifier/);
  assert.match(foreignTrade, /purchase_order_items/);
  assert.match(foreignTrade, /dispatchChina/);
  assert.match(schema, /purchaseOrderItems/);
  assert.match(schema, /shipmentIdentifier/);
  assert.match(mockApi, /shipment_identifier/);
});

test("links embarque tasks and position transfers in Allocation", async () => {
  const [page, allocationsRoute, mockApi] = await Promise.all([
    readFile(new URL("app/page.tsx", root), "utf8"),
    readFile(new URL("app/api/allocations/route.ts", root), "utf8"),
    readFile(new URL("github-pages/mock-api.ts", root), "utf8"),
  ]);
  assert.match(page, /Embarques a caminho do GH/);
  assert.match(page, /Editar produtos/);
  assert.match(page, /Transferir posição/);
  assert.match(page, /groupedAllocationTasks/);
  assert.match(allocationsRoute, /shipment_identifier/);
  assert.match(allocationsRoute, /action === "transfer"/);
  assert.match(allocationsRoute, /incomingShipments/);
  assert.match(mockApi, /incomingShipments/);
});

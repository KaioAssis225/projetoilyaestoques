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

// Testes de comportamento da leitura de planilha de importação (app/import-sheet.ts).
// Rodar com: npm run test:import  (Node 22.18+ executa TypeScript direto)
import assert from "node:assert/strict";
import test from "node:test";
import * as XLSX from "xlsx";
import { parsePurchaseSheet, parseSheetNumber, resolveCatalogCode, SHEET_READ_OPTIONS, SHEET_ROWS_OPTIONS } from "../app/import-sheet.ts";

const SPECS = [
  { key: "code", label: "Código", headers: ["CODIGO INTERNO PRODUTO", "CODIGO INTERNO", "CODIGO"], fallback: 4 },
  { key: "quantity", label: "Quantidade", headers: ["QUANTIDADE"], fallback: 6 },
  { key: "unitValue", label: "Valor FOB", headers: ["VALOR UNITARIO", "VALOR FOB"], fallback: 21 },
  { key: "dollar", label: "Câmbio", headers: ["DOLAR"], fallback: 28 },
  { key: "freight", label: "Frete", headers: ["FRETE"], fallback: 29 },
];
const CATALOG = ["ICS0001", "CD0100", "00030781", "MP000659"];

/** Gera uma planilha .xlsx real e a lê como o navegador lê (raw: true). */
function readThroughExcel(aoa, formats = {}) {
  const sheet = XLSX.utils.aoa_to_sheet(aoa);
  for (const [cell, format] of Object.entries(formats)) sheet[cell].z = format;
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, sheet, "Pedido");
  const buffer = XLSX.write(book, { type: "array", bookType: "xlsx" });
  return readLikeThePage(buffer);
}

/** Mesmas opções que app/page.tsx usa ao ler o arquivo escolhido. */
function readLikeThePage(buffer) {
  const parsed = XLSX.read(buffer, SHEET_READ_OPTIONS);
  return XLSX.utils.sheet_to_json(parsed.Sheets[parsed.SheetNames[0]], SHEET_ROWS_OPTIONS);
}

const csvRow = (values) => {
  const cells = Array(30).fill("");
  for (const [index, value] of Object.entries(values)) cells[index] = value;
  return cells.map((value) => (/[",;]/.test(String(value)) ? `"${String(value).replace(/"/g, '""')}"` : value)).join(",");
};

test("CSV: o SheetJS não converte o texto antes da leitura (1.000 e 5,12)", () => {
  const csv = [
    csvRow({ 4: "CODIGO INTERNO PRODUTO", 6: "QUANTIDADE", 21: "VALOR UNITARIO", 28: "Dolar", 29: "Frete" }),
    csvRow({ 4: "ICS0001", 6: "1.000", 21: "45.50", 28: "5,12", 29: "2500" }),
    csvRow({ 4: "30781", 6: "1,200", 21: "0,035" }),
  ].join("\n");
  const rows = readLikeThePage(new TextEncoder().encode(csv));
  const result = parsePurchaseSheet(rows, SPECS, CATALOG);
  assert.equal(result.dollarRate, "5.12", "câmbio 5,12 não pode virar 512");
  const byCode = Object.fromEntries(result.lines.map((line) => [line.code, line]));
  assert.equal(byCode.ICS0001.totalQuantity, 1000, "1.000 no CSV não pode virar 1");
  assert.equal(byCode["00030781"].totalQuantity, 1200);
  assert.equal(byCode["00030781"].unitValueUsd, "0.04");
});

test("números de texto: milhar, decimal e moeda", () => {
  assert.equal(parseSheetNumber("1.000", "integer"), 1000);
  assert.equal(parseSheetNumber("1,000", "integer"), 1000);
  assert.equal(parseSheetNumber("12.500", "integer"), 12500);
  assert.equal(parseSheetNumber("1.234,56", "decimal"), 1234.56);
  assert.equal(parseSheetNumber("1,234.56", "decimal"), 1234.56);
  assert.equal(parseSheetNumber("0,035", "decimal"), 0.035);
  assert.equal(parseSheetNumber("US$ 12.50", "decimal"), 12.5);
  assert.equal(parseSheetNumber(1000, "integer"), 1000);
  assert.equal(parseSheetNumber("", "integer"), null);
  assert.equal(parseSheetNumber("abc", "decimal"), null);
});

test("código numérico recupera zeros à esquerda", () => {
  assert.deepEqual(resolveCatalogCode("30781", CATALOG), { code: "00030781", adjusted: true });
  assert.deepEqual(resolveCatalogCode("cd0100", CATALOG), { code: "CD0100", adjusted: false });
  assert.equal(resolveCatalogCode("XYZ999", CATALOG), null);
});

test("planilha xlsx real: quantidade com milhar, FOB de 4 casas, código sem zeros e linhas ignoradas", () => {
  const header = Array(30).fill("");
  header[4] = "CODIGO INTERNO PRODUTO"; header[6] = "QUANTIDADE"; header[21] = "VALOR UNITARIO"; header[28] = "Dólar"; header[29] = "Frete";
  const row = (code, qty, fob, dollar = "", freight = "") => {
    const cells = Array(30).fill("");
    cells[4] = code; cells[6] = qty; cells[21] = fob; cells[28] = dollar; cells[29] = freight;
    return cells;
  };
  const rows = readThroughExcel([
    ["PEDIDO DE IMPORTAÇÃO 028.26"],
    header,
    row("ICS0001", 1000, 45.5, 5.12, 2500),
    row(30781, 200, 0.035),
    row("MP000659", "1.500", "0,80"),
    row("CD0100", "", ""),
    row("XYZ999", 10, 3),
    row("CD0100", "dez", 3),
    row("TOTAL", 2710, ""),
  ], { G3: "#,##0" });

  const result = parsePurchaseSheet(rows, SPECS, CATALOG);
  assert.equal(result.dollarRate, "5.12");
  assert.equal(result.freightUsd, "2500.00");
  assert.deepEqual(result.columns.map((column) => `${column.key}:${column.letter}`), ["code:E", "quantity:G", "unitValue:V", "dollar:AC", "freight:AD"]);

  const byCode = Object.fromEntries(result.lines.map((line) => [line.code, line]));
  assert.equal(byCode.ICS0001.totalQuantity, 1000, "1000 formatado como #,##0 não pode virar 1");
  assert.equal(byCode.ICS0001.unitValueUsd, "45.50");
  assert.equal(byCode["00030781"].unitValueUsd, "0.04");
  assert.match(byCode["00030781"].issues.join(" "), /lido como 00030781/);
  assert.match(byCode["00030781"].issues.join(" "), /arredondado para US\$ 0,04/);
  assert.equal(byCode.MP000659.totalQuantity, 1500);
  assert.equal(byCode.MP000659.unitValueUsd, "0.80");
  assert.ok(byCode.XYZ999, "código desconhecido entra na conferência para ser corrigido");
  assert.equal(result.lines.length, 4);
  assert.deepEqual(result.skipped.map((entry) => entry.rawCode), ["CD0100"]);
  assert.match(result.skipped[0].reason, /quantidade "dez"/);
});

test("sem cabeçalho reconhecido usa as posições padrão e avisa", () => {
  const cells = Array(30).fill("");
  cells[4] = "CD0100"; cells[6] = 3; cells[21] = 10;
  const result = parsePurchaseSheet([cells], SPECS, CATALOG);
  assert.equal(result.lines.length, 1);
  assert.equal(result.columns.find((column) => column.key === "code").header, null);
});

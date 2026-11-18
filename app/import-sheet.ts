/**
 * Leitura da planilha de importação de pedidos de compra (sem React, testável em Node).
 *
 * Recebe as linhas já extraídas pelo SheetJS com `raw: true` (células numéricas chegam como number,
 * texto como string) e devolve as linhas do pedido com o que precisa de conferência:
 * código ajustado, FOB arredondado, quantidade lida de texto, linhas ignoradas e colunas usadas.
 */

export type ImportColumnKey = "code" | "quantity" | "unitValue" | "dollar" | "freight";

export type ImportColumnSpec = {
  key: ImportColumnKey;
  label: string;
  /** Cabeçalhos aceitos, já sem acento e em maiúsculas. Igualdade exata vence "contém". */
  headers: string[];
  /** Posição usada quando nenhum cabeçalho é encontrado (0 = coluna A). */
  fallback: number;
};

export type ImportedColumn = { key: ImportColumnKey; label: string; letter: string; header: string | null };

export type ImportedLine = {
  sourceRow: number;
  code: string;
  rawCode: string;
  totalQuantity: number;
  unitValueUsd: string;
  issues: string[];
};

export type SkippedRow = { sourceRow: number; rawCode: string; reason: string };

export type SheetImportResult = {
  lines: ImportedLine[];
  skipped: SkippedRow[];
  columns: ImportedColumn[];
  dollarRate: string;
  freightUsd: string;
};

/**
 * Opções do `XLSX.read`. `raw: true` impede o SheetJS de converter o texto de CSV sozinho
 * (ele leria "1.000" como 1 e "5,12" como 512); a conversão fica com `parseSheetNumber`.
 * Em .xlsx/.xls as células numéricas continuam chegando como número.
 */
export const SHEET_READ_OPTIONS = { type: "array", raw: true } as const;

/** Opções do `sheet_to_json`: matriz de linhas, valores sem formatação e células vazias como "". */
export const SHEET_ROWS_OPTIONS = { header: 1, raw: true, defval: "" } as const;

const IGNORED_CODE_CELLS = new Set(["IMPORTADOR", "EXCELLENCE", "TOTAL", "TOTAIS", "SUBTOTAL"]);
const HEADER_SCAN_ROWS = 15;

export function normalizeHeader(value: unknown) {
  return String(value ?? "").normalize("NFD").replace(/[̀-ͯ]/g, "").toUpperCase().replace(/\s+/g, " ").trim();
}

export function columnLetter(index: number) {
  let letter = "";
  for (let n = index + 1; n > 0; n = Math.floor((n - 1) / 26)) letter = String.fromCharCode(65 + ((n - 1) % 26)) + letter;
  return letter;
}

/**
 * Converte uma célula em número. Números do Excel passam direto; texto aceita "1.000", "1,000",
 * "1.234,56", "1,234.56", "12,5" e "US$ 12.50".
 * - `integer`: "1.000" e "1,000" (grupos de 3 dígitos) são milhar.
 * - `decimal`: um separador sozinho é a casa decimal ("0,035" = 0.035).
 */
export function parseSheetNumber(value: unknown, kind: "integer" | "decimal"): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const raw = String(value ?? "").replace(/[^\d.,-]/g, "");
  if (!raw || !/\d/.test(raw)) return null;
  let normalized: string;
  if (raw.includes(",") && raw.includes(".")) {
    normalized = raw.lastIndexOf(",") > raw.lastIndexOf(".") ? raw.replace(/\./g, "").replace(",", ".") : raw.replace(/,/g, "");
  } else if (raw.includes(",")) {
    normalized = kind === "integer" && /^-?\d{1,3}(,\d{3})+$/.test(raw) ? raw.replace(/,/g, "") : raw.replace(",", ".");
  } else if (raw.includes(".")) {
    normalized = kind === "integer" && /^-?\d{1,3}(\.\d{3})+$/.test(raw) ? raw.replace(/\./g, "") : raw;
  } else {
    normalized = raw;
  }
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

/** Código do banco para o texto lido. Recupera zeros à esquerda perdidos pelo Excel ("30781" → "00030781"). */
export function resolveCatalogCode(rawCode: string, catalogCodes: string[]): { code: string; adjusted: boolean } | null {
  const wanted = rawCode.trim().toUpperCase();
  if (!wanted) return null;
  if (catalogCodes.includes(wanted)) return { code: wanted, adjusted: false };
  if (/^\d+$/.test(wanted)) {
    const digits = wanted.replace(/^0+/, "");
    const match = catalogCodes.find((code) => /^\d+$/.test(code) && code.replace(/^0+/, "") === digits);
    if (match) return { code: match, adjusted: true };
  }
  return null;
}

const usd = (value: number, digits: number) => value.toLocaleString("pt-BR", { minimumFractionDigits: digits, maximumFractionDigits: digits });

function locateColumns(rows: unknown[][], specs: ImportColumnSpec[]) {
  const scan = rows.slice(0, HEADER_SCAN_ROWS).map((row) => (row ?? []).map(normalizeHeader));
  let headerRow = -1;
  const found = new Map<ImportColumnKey, { index: number; header: string }>();
  for (const spec of specs) {
    let best: { index: number; header: string; row: number; exact: boolean } | null = null;
    for (let rowIndex = 0; rowIndex < scan.length; rowIndex++) {
      const cells = scan[rowIndex];
      for (let index = 0; index < cells.length; index++) {
        const cell = cells[index];
        if (!cell) continue;
        const exact = spec.headers.includes(cell);
        const contains = !exact && spec.headers.some((header) => cell.includes(header));
        if ((exact && (!best || !best.exact)) || (contains && !best)) best = { index, header: cell, row: rowIndex, exact };
      }
    }
    if (best) {
      found.set(spec.key, { index: best.index, header: best.header });
      if (spec.key === "code") headerRow = best.row;
    }
  }
  const fallbackOf = (key: ImportColumnKey) => specs.find((spec) => spec.key === key)?.fallback ?? 0;
  const indexOf = (key: ImportColumnKey) => found.get(key)?.index ?? fallbackOf(key);
  const columns: ImportedColumn[] = specs.map((spec) => ({
    key: spec.key,
    label: spec.label,
    letter: columnLetter(indexOf(spec.key)),
    header: found.get(spec.key)?.header ?? null,
  }));
  return { columns, headerRow, indexOf };
}

export function parsePurchaseSheet(rows: unknown[][], specs: ImportColumnSpec[], catalogCodes: string[]): SheetImportResult {
  const { columns, headerRow, indexOf } = locateColumns(rows, specs);
  const codeHeaders = new Set(specs.find((spec) => spec.key === "code")?.headers ?? []);
  const lines: ImportedLine[] = [];
  const skipped: SkippedRow[] = [];
  let dollarRate = "";
  let freightUsd = "";

  for (let index = headerRow + 1; index < rows.length; index++) {
    const row = rows[index] ?? [];
    const sourceRow = index + 1;
    const rawCode = String(row[indexOf("code")] ?? "").trim();
    const normalizedCode = normalizeHeader(rawCode);

    // Câmbio e frete: primeiro valor positivo nas colunas próprias, abaixo do cabeçalho.
    const dollar = parseSheetNumber(row[indexOf("dollar")], "decimal");
    if (!dollarRate && dollar && dollar > 0) dollarRate = dollar.toFixed(2);
    const freight = parseSheetNumber(row[indexOf("freight")], "decimal");
    if (!freightUsd && freight && freight > 0) freightUsd = freight.toFixed(2);

    if (!rawCode || IGNORED_CODE_CELLS.has(normalizedCode) || codeHeaders.has(normalizedCode)) continue;

    const quantityCell = row[indexOf("quantity")];
    const unitCell = row[indexOf("unitValue")];
    const quantity = parseSheetNumber(quantityCell, "integer");
    const unitValue = parseSheetNumber(unitCell, "decimal");
    const blankQuantity = String(quantityCell ?? "").trim() === "";
    const blankUnit = String(unitCell ?? "").trim() === "";
    if (blankQuantity && blankUnit) continue; // título, observação ou linha de agrupamento

    if (quantity === null || quantity <= 0) {
      skipped.push({ sourceRow, rawCode, reason: `quantidade "${String(quantityCell ?? "").trim() || "vazia"}" inválida` });
      continue;
    }
    if (unitValue === null || unitValue <= 0) {
      skipped.push({ sourceRow, rawCode, reason: `valor unitário "${String(unitCell ?? "").trim() || "vazio"}" inválido` });
      continue;
    }

    const issues: string[] = [];
    const resolved = resolveCatalogCode(rawCode, catalogCodes);
    if (resolved?.adjusted) issues.push(`código ${rawCode} lido como ${resolved.code} (zeros à esquerda recuperados)`);

    let totalQuantity = quantity;
    if (!Number.isInteger(quantity)) {
      totalQuantity = Math.round(quantity);
      issues.push(`quantidade ${usd(quantity, 3)} arredondada para ${totalQuantity}`);
    } else if (typeof quantityCell === "string" && /[.,]/.test(quantityCell)) {
      issues.push(`quantidade "${quantityCell.trim()}" lida como ${totalQuantity}`);
    }

    const rounded = Math.round(unitValue * 100) / 100;
    if (Math.abs(rounded - unitValue) > 1e-9) {
      issues.push(rounded > 0
        ? `FOB US$ ${usd(unitValue, 4)} arredondado para US$ ${usd(rounded, 2)} (o sistema guarda 2 casas)`
        : `FOB US$ ${usd(unitValue, 4)} fica abaixo de US$ 0,01 e precisa ser revisto`);
    }

    lines.push({
      sourceRow,
      code: resolved?.code ?? rawCode.toUpperCase(),
      rawCode,
      totalQuantity,
      unitValueUsd: rounded > 0 ? rounded.toFixed(2) : "",
      issues,
    });
  }

  return { lines, skipped, columns, dollarRate, freightUsd };
}

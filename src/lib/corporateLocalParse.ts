import type { CorporateQuoteMatchType } from "../types";

/**
 * Korporativ sifariş və təchizatçı fayllarının AI-sız oxunması.
 * Excel / CSV / Word cədvəllərində başlıq sətri və sütunlar açar sözlərlə tapılır,
 * təklif sətirləri sifariş məhsullarına ad və model koduna görə bağlanır.
 * (Məntiq docflow layihəsindən götürülüb.)
 */

export type Cell = string | number | null | undefined;
export type Matrix = Cell[][];

export type LocalOrderItem = { name: string; qty: number | null; unit: string; note: string };

export type LocalQuoteLine = {
  orderItemId: string | null;
  matchType: CorporateQuoteMatchType;
  offeredName: string;
  qty: number | null;
  unitPrice: number | null;
  totalPrice: number | null;
  note: string;
};

type OrderItemRef = { id: string; name: string };

const KEYWORDS = {
  name: ["məhsul", "mal material", "malın adı", "material", "nomenklatura", "təsvir", "ad", "adı", "product", "description", "item", "name", "наименование", "товар", "описание"],
  requestedName: ["tələb olunan məhsulun adı", "tələb olunan məhsul", "sifariş məhsulu", "requested product", "requested item"],
  alternativeName: ["əvəz təklif olunan məhsulun adı", "əvəz məhsul", "təklif olunan məhsul", "alternative product", "offered product", "substitute product", "аналог"],
  quantity: ["tələb olunan say", "tələb olunan miqdar", "say", "miqdar", "quantity", "qty", "amount", "количество", "кол во"],
  unit: ["vahid", "ölçü vahidi", "ölçü vah", "ölçü", "vah", "unit", "uom", "единица", "ед изм"],
  unitPrice: ["vahid qiyməti", "vahid qiymət", "bir ədədin qiyməti", "qiymət", "qiymet", "unit price", "price", "цена за единицу", "цена"],
  totalPrice: ["cəmi", "ümumi məbləğ", "məbləğ", "toplam", "total price", "total", "sum", "итого", "сумма"],
  note: ["qeyd", "şərh", "izah", "note", "comment", "remark", "примечание"],
};

const TOTAL_ROW = /^(cəmi|cemi|yekun|ümumi|umumi|toplam|total|итого|всего)\b/i;

const clean = (value: string) =>
  value
    .trim()
    .toLocaleLowerCase("az")
    .replace(/[№#]/g, " ")
    .replace(/[._/()\-]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();

const text = (value: Cell) => (value == null ? "" : String(value).replace(/\s+/g, " ").trim());

function keywordScore(header: string, values: string[]): number {
  const normalized = clean(header);
  if (!normalized) return 0;
  return values.reduce((score, keyword) => {
    const k = clean(keyword);
    if (normalized === k) return Math.max(score, 100 + k.length);
    // Qısa açar sözlər (məs. “ad”) yalnız ayrıca söz kimi sayılır
    if (k.length <= 3) return new RegExp(`(^| )${k}( |$)`).test(normalized) ? Math.max(score, 40 + k.length) : score;
    if (normalized.includes(k)) return Math.max(score, 50 + k.length);
    return score;
  }, 0);
}

/** Vergül və ya nöqtə ilə yazılmış qiymət / say. */
export function parseLocalizedNumber(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  const source = String(value ?? "").trim();
  if (!source) return null;
  const raw = source.replace(/[^0-9,.-]/g, "");
  if (!raw || raw === "-" || !/\d/.test(raw)) return null;
  const negative = raw.startsWith("-");
  const unsigned = raw.replace(/-/g, "");
  const comma = unsigned.lastIndexOf(",");
  const dot = unsigned.lastIndexOf(".");
  let normalized: string;
  if (comma >= 0 && dot >= 0) {
    const decimal = comma > dot ? "," : ".";
    const grouping = decimal === "," ? "." : ",";
    normalized = unsigned.split(grouping).join("").replace(decimal, ".");
  } else {
    const separator = comma >= 0 ? "," : dot >= 0 ? "." : "";
    if (!separator) {
      normalized = unsigned;
    } else {
      const parts = unsigned.split(separator);
      const last = parts[parts.length - 1] ?? "";
      const groupingOnly = last.length === 3 && parts.slice(1).every((p) => p.length === 3);
      normalized = groupingOnly ? parts.join("") : `${parts.slice(0, -1).join("")}.${last}`;
    }
  }
  const result = Number(`${negative ? "-" : ""}${normalized}`);
  return Number.isFinite(result) ? result : null;
}

const isNumeric = (value: Cell) => {
  const s = text(value).replace(/\b(?:AZN|USD|EUR|manat|₼)\b/gi, "").trim();
  return s !== "" && !/\p{L}/u.test(s) && parseLocalizedNumber(s) != null;
};

/** Başlıq sətrinin indeksi; heç bir sətirdə açar söz yoxdursa -1 (başlıqsız cədvəl). */
function findHeaderRow(matrix: Matrix): number {
  let best = { index: -1, score: 0, hits: 0 };
  matrix.slice(0, 25).forEach((row, index) => {
    const nonEmpty = row.filter((c) => text(c)).length;
    const hits = row.reduce<number>((sum, c) => {
      const h = text(c);
      return (
        sum +
        (keywordScore(h, KEYWORDS.name) > 0 ? 2 : 0) +
        (keywordScore(h, KEYWORDS.quantity) > 0 ? 2 : 0) +
        (keywordScore(h, KEYWORDS.unitPrice) > 0 ? 1 : 0) +
        (keywordScore(h, KEYWORDS.unit) > 0 ? 1 : 0)
      );
    }, 0);
    const score = hits * 10 + Math.min(nonEmpty, 8);
    if (hits > 0 && score > best.score) best = { index, score, hits };
  });
  return best.index;
}

type Table = { headers: string[]; rows: Cell[][] };

function toTable(matrix: Matrix): Table {
  const headerIndex = findHeaderRow(matrix);
  const width = Math.max(0, ...matrix.map((r) => r.length));
  const headerRow = headerIndex >= 0 ? matrix[headerIndex] : [];
  const headers = Array.from({ length: width }, (_, i) => text(headerRow[i]));
  const rows = matrix.slice(headerIndex + 1).filter((r) => r.some((c) => text(c)));
  return { headers, rows };
}

function pickColumn(headers: string[], keywords: string[], excluded: number[] = []): number {
  let best = { index: -1, score: 0 };
  headers.forEach((h, index) => {
    if (excluded.includes(index)) return;
    const score = keywordScore(h, keywords);
    if (score > best.score) best = { index, score };
  });
  return best.index;
}

function columnValues(rows: Cell[][], col: number): Cell[] {
  return rows.slice(0, 30).map((r) => r[col]).filter((c) => text(c));
}

/** Başlıq tapılmayanda: ən uzun mətnli sütun = məhsul adı. */
function guessNameColumn(table: Table, excluded: number[]): number {
  let best = { index: -1, score: 0 };
  table.headers.forEach((_, index) => {
    if (excluded.includes(index)) return;
    const values = columnValues(table.rows, index);
    const textual = values.filter((v) => !isNumeric(v));
    if (textual.length === 0) return;
    const avg = textual.reduce<number>((s, v) => s + text(v).length, 0) / textual.length;
    const score = (textual.length / Math.max(values.length, 1)) * 50 + Math.min(avg, 40);
    if (score > best.score) best = { index, score };
  });
  return best.index;
}

function guessNumberColumn(table: Table, excluded: number[], preferDecimals: boolean): number {
  let best = { index: -1, score: 0 };
  table.headers.forEach((h, index) => {
    if (excluded.includes(index)) return;
    if (/(^| )(kod|code|id|sıra|sira|no|n)( |$)/.test(clean(h))) return;
    const values = columnValues(table.rows, index);
    const numbers = values.filter(isNumeric).map((v) => parseLocalizedNumber(v) ?? 0);
    if (numbers.length === 0) return;
    const decimals = numbers.some((n) => !Number.isInteger(n));
    const score = (numbers.length / Math.max(values.length, 1)) * 100 + (preferDecimals === decimals ? 20 : 0);
    if (score > best.score) best = { index, score };
  });
  return best.index;
}

const cell = (row: Cell[], col: number) => (col >= 0 ? row[col] : undefined);
const num = (row: Cell[], col: number) => (col >= 0 ? parseLocalizedNumber(row[col]) : null);

/** Müştəri sifarişi cədvəlindən məhsul sətirləri. */
export function parseOrderMatrix(matrix: Matrix): LocalOrderItem[] {
  const table = toTable(matrix);
  const used: number[] = [];
  let name = pickColumn(table.headers, KEYWORDS.name);
  if (name < 0) name = guessNameColumn(table, used);
  if (name < 0) return [];
  used.push(name);
  let qty = pickColumn(table.headers, KEYWORDS.quantity, used);
  if (qty < 0) qty = guessNumberColumn(table, used, false);
  if (qty >= 0) used.push(qty);
  // “Vahid qiyməti” sütunu vahid kimi götürülməsin
  const price = pickColumn(table.headers, KEYWORDS.unitPrice, used);
  const unit = pickColumn(table.headers, KEYWORDS.unit, price >= 0 ? [...used, price] : used);
  if (unit >= 0) used.push(unit);
  const note = pickColumn(table.headers, KEYWORDS.note, used);

  return table.rows
    .map((row) => ({
      name: text(cell(row, name)),
      qty: num(row, qty),
      unit: text(cell(row, unit)),
      note: text(cell(row, note)),
    }))
    .filter((it) => it.name && !isNumeric(it.name) && !(TOTAL_ROW.test(it.name) && it.qty == null));
}

/* ---------- Məhsul uyğunlaşdırma ---------- */

const normalize = (value: string) =>
  value
    .toLocaleLowerCase("az")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();

const compact = (value: string) => normalize(value).replace(/\s/g, "");
const tokens = (value: string) => new Set(normalize(value).split(" ").filter((t) => t.length > 1));
const SPEC_TOKEN = /^\d+(?:[.,]\d+)?(?:gb|tb|mb|ghz|mhz|w|v|a|mm|cm|m|kg|port)$/i;

/** Model kodları (DS-6916UDI kimi) adi sözlərdən daha güclü siqnaldır. */
function modelCodes(value: string): Set<string> {
  const result = new Set<string>();
  const add = (candidate: string) => {
    const code = compact(candidate);
    if (code.length >= 5 && /\p{L}/u.test(code) && /\d/.test(code) && !SPEC_TOKEN.test(code)) result.add(code);
  };
  for (const m of value.matchAll(/[\p{L}\p{N}]+(?:[-_/][\p{L}\p{N}]+)+/gu)) add(m[0]);
  for (const t of normalize(value).split(" ")) add(t);
  return result;
}

export function autoMatchProduct(
  productName: string,
  items: OrderItemRef[],
): { orderItemId: string | null; matchType: CorporateQuoteMatchType } {
  const normalized = normalize(productName);
  if (!normalized) return { orderItemId: null, matchType: "unmatched" };
  const exact = items.find((it) => normalize(it.name) === normalized);
  if (exact) return { orderItemId: exact.id, matchType: "exact" };

  const source = tokens(productName);
  const sourceCodes = modelCodes(productName);
  const ranked = items
    .map((item) => {
      const target = tokens(item.name);
      const intersection = [...source].filter((t) => target.has(t)).length;
      const union = new Set([...source, ...target]).size;
      const tokenScore = union ? intersection / union : 0;
      const targetCodes = modelCodes(item.name);
      const shared = [...sourceCodes].filter((c) => targetCodes.has(c));
      const longest = shared.sort((a, b) => b.length - a.length)[0];
      const modelScore = longest ? Math.min(1, 0.82 + longest.length / 100) : 0;
      return { item, score: Math.max(tokenScore, modelScore), shared };
    })
    .sort((a, b) => b.score - a.score);

  const best = ranked[0];
  if (!best) return { orderItemId: null, matchType: "unmatched" };
  const competing = ranked.slice(1).some((c) => c.shared.some((code) => best.shared.includes(code)));
  if (best.shared.length > 0 && !competing) return { orderItemId: best.item.id, matchType: "exact" };
  if (best.score >= 0.35) return { orderItemId: best.item.id, matchType: "uncertain" };
  return { orderItemId: null, matchType: "unmatched" };
}

/** Təchizatçı təklifi cədvəlindən qiymət sətirləri, sifarişə bağlanmış şəkildə. */
export function parseQuoteMatrix(matrix: Matrix, items: OrderItemRef[]): LocalQuoteLine[] {
  const table = toTable(matrix);
  const used: number[] = [];
  const requested = pickColumn(table.headers, KEYWORDS.requestedName);
  let name = requested >= 0 ? requested : pickColumn(table.headers, KEYWORDS.name);
  if (name < 0) name = guessNameColumn(table, used);
  if (name < 0) return [];
  used.push(name);
  const alternative = pickColumn(table.headers, KEYWORDS.alternativeName, used);
  if (alternative >= 0) used.push(alternative);
  let unitPrice = pickColumn(table.headers, KEYWORDS.unitPrice, used);
  if (unitPrice >= 0) used.push(unitPrice);
  const total = pickColumn(table.headers, KEYWORDS.totalPrice, used);
  if (total >= 0) used.push(total);
  const qty = pickColumn(table.headers, KEYWORDS.quantity, used);
  if (qty >= 0) used.push(qty);
  const unit = pickColumn(table.headers, KEYWORDS.unit, used);
  if (unit >= 0) used.push(unit);
  if (unitPrice < 0) unitPrice = guessNumberColumn(table, used, true);
  if (unitPrice >= 0) used.push(unitPrice);
  const note = pickColumn(table.headers, KEYWORDS.note, used);

  return table.rows
    .map((row): LocalQuoteLine | null => {
      const requestedName = text(cell(row, name));
      const alternativeName = text(cell(row, alternative));
      if (!requestedName && !alternativeName) return null;
      if (TOTAL_ROW.test(requestedName) && !alternativeName) return null;
      if (requestedName && isNumeric(requestedName)) return null;
      const q = num(row, qty);
      let price = num(row, unitPrice);
      const lineTotal = num(row, total);
      if (price == null && lineTotal != null && q) price = lineTotal / q;

      const match = autoMatchProduct(requestedName || alternativeName, items);
      const isAlternative =
        Boolean(alternativeName) && normalize(alternativeName) !== normalize(requestedName) && match.orderItemId != null;
      return {
        orderItemId: match.orderItemId,
        matchType: isAlternative ? "alternative" : match.matchType,
        offeredName: alternativeName || requestedName,
        qty: q,
        unitPrice: price,
        totalPrice: lineTotal,
        note: text(cell(row, note)),
      };
    })
    .filter((l): l is LocalQuoteLine => l !== null);
}

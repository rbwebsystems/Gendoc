import { useRef, useState } from "react";
import { readSheet } from "read-excel-file/browser";
import type { LabelProductRecord } from "../types";

type LabelProductDraft = {
  id: string;
  name: string;
  qty: string;
  salePrice: string;
  createdAt: number;
};

type LabelsModuleProps = {
  products: LabelProductRecord[];
  onSave: (products: LabelProductRecord[]) => void;
};

const quantityFormatter = new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 3 });
const moneyFormatter = new Intl.NumberFormat("az-AZ", {
  style: "currency",
  currency: "AZN",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const PRODUCT_HEADER_ALIASES = new Set(["mehsul adi", "mehsul", "product name", "product", "name", "ad"]);
const QTY_HEADER_ALIASES = new Set(["say", "miqdar", "eded", "qty", "quantity"]);
const PRICE_HEADER_ALIASES = new Set([
  "satis qiymeti",
  "satis qiymet",
  "sale price",
  "selling price",
  "qiymet",
  "price",
]);

function createDraftRow(): LabelProductDraft {
  return {
    id: crypto.randomUUID(),
    name: "",
    qty: "1",
    salePrice: "",
    createdAt: Date.now(),
  };
}

function toNumber(value: string): number {
  return Number(value.trim().replace(",", "."));
}

function normalizeHeader(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("az-AZ")
    .replace(/[əƏ]/g, "e")
    .replace(/[ıİ]/g, "i")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function parseImportedNumber(value: unknown): number {
  if (typeof value === "number") return value;
  let raw = String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .replace(/AZN/gi, "")
    .replace(/₼/g, "")
    .replace(/[^0-9,.-]/g, "");
  if (!raw) return Number.NaN;

  const comma = raw.lastIndexOf(",");
  const dot = raw.lastIndexOf(".");
  if (comma >= 0 && dot >= 0) {
    const decimalSeparator = comma > dot ? "," : ".";
    const thousandsSeparator = decimalSeparator === "," ? "." : ",";
    raw = raw.replaceAll(thousandsSeparator, "").replace(decimalSeparator, ".");
  } else if (comma >= 0) {
    raw = raw.replace(",", ".");
  }
  return Number(raw);
}

function detectCsvDelimiter(text: string): string {
  const firstMeaningfulLine = text.split(/\r?\n/).find((line) => line.trim()) ?? "";
  const candidates = [";", "\t", ","];
  return candidates.reduce((best, candidate) => {
    const count = firstMeaningfulLine.split(candidate).length;
    return count > best.count ? { delimiter: candidate, count } : best;
  }, { delimiter: ",", count: 1 }).delimiter;
}

function parseCsv(text: string): unknown[][] {
  const source = text.replace(/^\uFEFF/, "");
  const delimiter = detectCsvDelimiter(source);
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const char = source[index];
    if (char === '"') {
      if (quoted && source[index + 1] === '"') {
        cell += '"';
        index += 1;
      } else {
        quoted = !quoted;
      }
    } else if (char === delimiter && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && source[index + 1] === "\n") index += 1;
      row.push(cell);
      if (row.some((value) => value.trim())) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  row.push(cell);
  if (row.some((value) => value.trim())) rows.push(row);
  return rows;
}

function rowsToProducts(rows: unknown[][]): { products: LabelProductRecord[]; skipped: number } {
  let headerRowIndex = -1;
  let nameIndex = -1;
  let qtyIndex = -1;
  let priceIndex = -1;

  for (let rowIndex = 0; rowIndex < Math.min(rows.length, 10); rowIndex += 1) {
    const headers = rows[rowIndex].map(normalizeHeader);
    const nextNameIndex = headers.findIndex((header) => PRODUCT_HEADER_ALIASES.has(header));
    const nextQtyIndex = headers.findIndex((header) => QTY_HEADER_ALIASES.has(header));
    const nextPriceIndex = headers.findIndex((header) => PRICE_HEADER_ALIASES.has(header));
    if (nextNameIndex >= 0 && nextQtyIndex >= 0 && nextPriceIndex >= 0) {
      headerRowIndex = rowIndex;
      nameIndex = nextNameIndex;
      qtyIndex = nextQtyIndex;
      priceIndex = nextPriceIndex;
      break;
    }
  }

  if (headerRowIndex < 0) {
    throw new Error("Sütun başlıqları tapılmadı. “Məhsul adı”, “Say” və “Satış qiyməti” sütunlarından istifadə edin.");
  }

  const now = Date.now();
  const products: LabelProductRecord[] = [];
  let skipped = 0;

  for (const row of rows.slice(headerRowIndex + 1)) {
    if (!row.some((value) => String(value ?? "").trim())) continue;
    const name = String(row[nameIndex] ?? "").trim();
    const qty = parseImportedNumber(row[qtyIndex]);
    const salePrice = parseImportedNumber(row[priceIndex]);
    if (!name || !Number.isFinite(qty) || qty <= 0 || !Number.isFinite(salePrice) || salePrice < 0) {
      skipped += 1;
      continue;
    }
    products.push({
      id: crypto.randomUUID(),
      name,
      qty,
      salePrice,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (products.length === 0) {
    throw new Error("Faylda əlavə edilə bilən düzgün məhsul sətri tapılmadı.");
  }
  return { products, skipped };
}

function productsToDraft(products: LabelProductRecord[]): LabelProductDraft[] {
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    qty: String(product.qty),
    salePrice: String(product.salePrice),
    createdAt: product.createdAt,
  }));
}

export function LabelsModule({ products, onSave }: LabelsModuleProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LabelProductDraft[]>([]);
  const [error, setError] = useState("");
  const [importInfo, setImportInfo] = useState("");
  const [importMode, setImportMode] = useState<"append" | "replace">("append");

  const startEditing = () => {
    setDraft(
      products.length > 0
        ? productsToDraft(products)
        : [createDraftRow()],
    );
    setError("");
    setImportInfo("");
    setEditing(true);
  };

  const cancelEditing = () => {
    setDraft([]);
    setError("");
    setImportInfo("");
    setEditing(false);
  };

  const importFile = async (file: File) => {
    setError("");
    setImportInfo("");
    try {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("Fayl 10 MB-dan böyük olmamalıdır.");
      }
      const lowerName = file.name.toLocaleLowerCase("az-AZ");
      let rows: unknown[][];
      if (lowerName.endsWith(".xlsx")) {
        rows = await readSheet(file);
      } else if (lowerName.endsWith(".csv")) {
        rows = parseCsv(await file.text());
      } else {
        throw new Error("Yalnız .xlsx və .csv faylları dəstəklənir.");
      }

      const imported = rowsToProducts(rows);
      const importedDraft = productsToDraft(imported.products);
      const currentDraft = editing ? draft : productsToDraft(products);
      setDraft(importMode === "replace" ? importedDraft : [...currentDraft, ...importedDraft]);
      setEditing(true);
      setImportInfo(
        `${imported.products.length} məhsul yükləndi${imported.skipped > 0 ? `, ${imported.skipped} səhv sətir ötürüldü` : ""}. Yoxlayıb yadda saxlayın.`,
      );
    } catch (importError: unknown) {
      setError(importError instanceof Error ? importError.message : "Faylı oxumaq alınmadı.");
    }
  };

  const patchRow = (id: string, patch: Partial<Pick<LabelProductDraft, "name" | "qty" | "salePrice">>) => {
    setDraft((rows) => rows.map((row) => (row.id === id ? { ...row, ...patch } : row)));
    setError("");
  };

  const save = () => {
    const now = Date.now();
    const normalized: LabelProductRecord[] = [];

    for (const row of draft) {
      const name = row.name.trim();
      const qty = toNumber(row.qty);
      const salePrice = toNumber(row.salePrice);

      if (!name) {
        setError("Hər sətirdə məhsul adı yazılmalıdır.");
        return;
      }
      if (!Number.isFinite(qty) || qty <= 0) {
        setError("Say sıfırdan böyük olmalıdır.");
        return;
      }
      if (!Number.isFinite(salePrice) || salePrice < 0) {
        setError("Satış qiyməti düzgün daxil edilməlidir.");
        return;
      }

      normalized.push({
        id: row.id,
        name,
        qty,
        salePrice,
        createdAt: row.createdAt || now,
        updatedAt: now,
      });
    }

    onSave(normalized);
    setDraft([]);
    setError("");
    setImportInfo("");
    setEditing(false);
  };

  return (
    <div className="dg-form-page pg-panel dg-labels-module" aria-label="Etiket məhsul siyahısı">
      <div className="dg-labels-toolbar">
        <div>
          <h2 className="dg-labels-title">Məhsul siyahısı</h2>
          <p className="dg-muted dg-labels-subtitle">
            {editing ? "Məhsulları redaktə edin və siyahını yadda saxlayın." : `${products.length} məhsul`}
          </p>
        </div>

        <div className="dg-labels-actions">
          <label className="dg-labels-import-mode">
            <span>Import rejimi</span>
            <select
              className="dg-input"
              value={importMode}
              onChange={(event) => setImportMode(event.target.value as "append" | "replace")}
            >
              <option value="append">Siyahıya əlavə et</option>
              <option value="replace">Siyahını əvəz et</option>
            </select>
          </label>
          <input
            ref={fileInputRef}
            className="dg-labels-file-input"
            type="file"
            accept=".xlsx,.csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,text/csv"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (file) void importFile(file);
            }}
          />
          <button type="button" className="dg-btn dg-btn-secondary" onClick={() => fileInputRef.current?.click()}>
            Excel/CSV-dən yüklə
          </button>
          {editing ? (
            <>
              <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelEditing}>
                Ləğv et
              </button>
              <button
                type="button"
                className="dg-btn dg-btn-secondary"
                onClick={() => setDraft((rows) => [...rows, createDraftRow()])}
              >
                Sətir əlavə et
              </button>
              <button type="button" className="dg-btn dg-btn-primary" onClick={save}>
                Yadda saxla
              </button>
            </>
          ) : (
            <button type="button" className="dg-btn dg-btn-primary" onClick={startEditing}>
              Düzəliş et
            </button>
          )}
        </div>
      </div>

      {error ? (
        <div className="dg-labels-error" role="alert">
          {error}
        </div>
      ) : null}

      {importInfo ? (
        <div className="dg-labels-import-info" role="status">
          {importInfo}
        </div>
      ) : null}

      {!editing && products.length === 0 ? (
        <div className="dg-empty-state-card" role="status">
          <div className="dg-empty-state-title">Məhsul əlavə edilməyib</div>
          <div className="dg-empty-state-desc">“Düzəliş et” düyməsi ilə ilk məhsul sətrini yaradın.</div>
        </div>
      ) : (
        <div className="dg-table-wrap pg-grid-host dg-labels-table-wrap">
          <table className="dg-table dg-table--labels">
            <colgroup>
              <col className="dg-labels-col-number" />
              <col />
              <col className="dg-labels-col-qty" />
              <col className="dg-labels-col-price" />
              {editing ? <col className="dg-labels-col-actions" /> : null}
            </colgroup>
            <thead>
              <tr>
                <th>№</th>
                <th>Məhsul adı</th>
                <th className="dg-num">Say</th>
                <th className="dg-num">Satış qiyməti</th>
                {editing ? <th className="dg-labels-action-head">Əməliyyat</th> : null}
              </tr>
            </thead>
            <tbody>
              {(editing ? draft : products).map((row, index) => (
                <tr key={row.id}>
                  <td className="dg-labels-row-number">{index + 1}</td>
                  <td>
                    {editing ? (
                      <input
                        className="dg-input dg-input--table"
                        value={row.name}
                        onChange={(event) => patchRow(row.id, { name: event.target.value })}
                        placeholder="Məhsul adını yazın"
                        aria-label={`${index + 1}-ci məhsulun adı`}
                      />
                    ) : (
                      row.name
                    )}
                  </td>
                  <td className="dg-num">
                    {editing ? (
                      <input
                        className="dg-input dg-input--table dg-labels-number-input"
                        inputMode="decimal"
                        value={row.qty}
                        onChange={(event) => patchRow(row.id, { qty: event.target.value })}
                        aria-label={`${index + 1}-ci məhsulun sayı`}
                      />
                    ) : (
                      quantityFormatter.format(Number(row.qty))
                    )}
                  </td>
                  <td className="dg-num">
                    {editing ? (
                      <input
                        className="dg-input dg-input--table dg-labels-number-input"
                        inputMode="decimal"
                        value={row.salePrice}
                        onChange={(event) => patchRow(row.id, { salePrice: event.target.value })}
                        placeholder="0.00"
                        aria-label={`${index + 1}-ci məhsulun satış qiyməti`}
                      />
                    ) : (
                      moneyFormatter.format(Number(row.salePrice))
                    )}
                  </td>
                  {editing ? (
                    <td className="dg-labels-row-actions">
                      <button
                        type="button"
                        className="dg-btn dg-btn-danger dg-btn--compact"
                        onClick={() => setDraft((rows) => rows.filter((item) => item.id !== row.id))}
                        aria-label={`${index + 1}-ci məhsulu sil`}
                      >
                        Sil
                      </button>
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

import type { CashReportRow, CashReportSnapshot, CashReportState } from "../types";

export const CASH_REPORT_SLOT_COUNT = 5;

export function formatCashAmount(n: number): string {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 0 }).format(v);
}

export function cashAmountClass(n: number): string {
  if (n > 0) return "dg-cash-amount--pos";
  if (n < 0) return "dg-cash-amount--neg";
  return "dg-cash-amount--zero";
}

export function parseCashInput(raw: string): number {
  const cleaned = raw.replace(/\s/g, "").replace(",", ".");
  if (!cleaned || cleaned === "-" || cleaned === ".") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function newCashReportRow(name = ""): CashReportRow {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    slots: [0, 0, 0, 0, 0],
    createdAt: now,
    updatedAt: now,
  };
}

export function cloneCashRow(row: CashReportRow): CashReportRow {
  return {
    ...row,
    slots: [...row.slots] as CashReportRow["slots"],
  };
}

export function rowPostedBalance(row: CashReportRow): number {
  return row.slots[0] ?? 0;
}

export function rowPendingSum(row: CashReportRow): number {
  return row.slots.slice(1).reduce((sum, v) => sum + (Number(v) || 0), 0);
}

export function rowDisplayTotal(row: CashReportRow): number {
  return rowPostedBalance(row) + rowPendingSum(row);
}

export function totalCashBalance(rows: CashReportRow[]): number {
  return rows.reduce((sum, row) => sum + rowPostedBalance(row), 0);
}

/** Sütun 2–5 dəyərlərini sütun 1-ə cəmləyir və gözləyənləri sıfırlayır */
export function mergeCashRowSlots(row: CashReportRow): CashReportRow {
  const pending = rowPendingSum(row);
  if (pending === 0) return row;
  const slots = [...row.slots] as CashReportRow["slots"];
  slots[0] = (slots[0] ?? 0) + pending;
  for (let i = 1; i < CASH_REPORT_SLOT_COUNT; i += 1) slots[i] = 0;
  return { ...row, slots, updatedAt: Date.now() };
}

export function emptyCashReportState(): CashReportState {
  return { rows: [], history: [] };
}

const DEFAULT_SEED: { name: string; balance: number }[] = [
  { name: "Nağd AZN", balance: 799 },
  { name: "Nağd USD (Ekv)", balance: 8275 },
  { name: "Leo 4438", balance: 1307 },
  { name: "ABB 1983", balance: 1870 },
  { name: "Kapital 9255", balance: 1315 },
  { name: "AFB 0474", balance: 1443 },
  { name: "Kassa", balance: 0 },
  { name: "Elşən", balance: -106 },
  { name: "Artıq", balance: -2832 },
  { name: "Niyazi Bakfon", balance: 4570 },
  { name: "Sənan Orxan", balance: 11545 },
  { name: "İlqar", balance: 15906 },
  { name: "ATİAHİRK", balance: 9196 },
];

export function defaultCashReportRows(): CashReportRow[] {
  return DEFAULT_SEED.map((item) => {
    const row = newCashReportRow(item.name);
    row.slots[0] = item.balance;
    return row;
  });
}

export function createCashSnapshot(rows: CashReportRow[], label?: string): CashReportSnapshot {
  const now = Date.now();
  const cloned = rows.map(cloneCashRow);
  return {
    id: crypto.randomUUID(),
    label: label?.trim() || new Date(now).toLocaleString("az-AZ"),
    savedAt: now,
    balance: totalCashBalance(cloned),
    rows: cloned,
  };
}

export function normalizeCashReportSlots(raw: unknown): CashReportRow["slots"] {
  const slots: number[] = [];
  if (Array.isArray(raw)) {
    for (let i = 0; i < CASH_REPORT_SLOT_COUNT; i += 1) {
      const v = raw[i];
      slots.push(typeof v === "number" && Number.isFinite(v) ? v : Number(v) || 0);
    }
  } else {
    for (let i = 0; i < CASH_REPORT_SLOT_COUNT; i += 1) slots.push(0);
  }
  return slots as CashReportRow["slots"];
}

export function normalizeCashReportRows(raw: unknown): CashReportRow[] {
  if (!Array.isArray(raw)) return [];
  const rows = raw
    .filter((r) => r && typeof (r as { id?: unknown }).id === "string")
    .map((r) => {
      const name =
        typeof (r as { name?: unknown }).name === "string" ? String((r as { name: string }).name).trim() : "";
      return {
        id: String((r as { id: string }).id),
        name,
        slots: normalizeCashReportSlots((r as { slots?: unknown }).slots),
        createdAt:
          typeof (r as { createdAt?: unknown }).createdAt === "number"
            ? Number((r as { createdAt: number }).createdAt)
            : Date.now(),
        updatedAt:
          typeof (r as { updatedAt?: unknown }).updatedAt === "number"
            ? Number((r as { updatedAt: number }).updatedAt)
            : Date.now(),
      };
    })
    .filter((r) => r.name.length > 0);
  return rows;
}

export function normalizeCashReportHistory(raw: unknown): CashReportSnapshot[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .filter((h) => h && typeof (h as { id?: unknown }).id === "string")
    .map((h) => {
      const label =
        typeof (h as { label?: unknown }).label === "string" ? String((h as { label: string }).label).trim() : "";
      const savedAt =
        typeof (h as { savedAt?: unknown }).savedAt === "number" ? Number((h as { savedAt: number }).savedAt) : Date.now();
      const rows = normalizeCashReportRows((h as { rows?: unknown }).rows);
      const balance =
        typeof (h as { balance?: unknown }).balance === "number"
          ? Number((h as { balance: number }).balance)
          : totalCashBalance(rows);
      return {
        id: String((h as { id: string }).id),
        label: label || new Date(savedAt).toLocaleString("az-AZ"),
        savedAt,
        balance,
        rows,
      };
    })
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, 50);
}

export function normalizeCashReportState(raw: unknown): CashReportState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rows = normalizeCashReportRows((raw as { rows?: unknown }).rows);
  const history = normalizeCashReportHistory((raw as { history?: unknown }).history);
  return { rows, history };
}

import type { CashReportRow, CashReportSnapshot, CashReportState } from "../types";

export const CASH_REPORT_SLOT_COUNT = 8;

export function formatCashAmount(n: number): string {
  const v = Number.isFinite(n) ? Math.round(n) : 0;
  return new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 0 }).format(v);
}

export function cashAmountClass(n: number): string {
  if (n < 0) return "dg-cash-amount--neg";
  return "dg-cash-amount--pos";
}

export function parseCashInput(raw: string): number {
  return commitCashInput(raw);
}

/** Yazılan mətn mənfi və ya natamam rəqəm ola bilərmi */
export function isPartialCashInput(raw: string): boolean {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (cleaned === "" || cleaned === "-") return true;
  return /^-?\d*\.?\d*$/.test(cleaned);
}

export function cashSlotKey(rowId: string, slotIndex: number): string {
  return `${rowId}:${slotIndex}`;
}

export function cashSlotDisplayValue(value: number, draft?: string): string {
  if (draft !== undefined) return draft;
  return value === 0 ? "" : String(value);
}

export function cashAmountClassForInput(value: number, draft?: string): string {
  if (draft !== undefined) {
    const trimmed = draft.trim().replace(/\s/g, "").replace(",", ".");
    if (!trimmed || trimmed === "-") return "dg-cash-amount--pos";
    return cashAmountClass(commitCashInput(draft));
  }
  return cashAmountClass(value);
}

export function commitCashInput(raw: string): number {
  const cleaned = raw.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned || cleaned === "-") return 0;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : 0;
}

export function newCashReportRow(name = ""): CashReportRow {
  const now = Date.now();
  return {
    id: crypto.randomUUID(),
    name,
    slots: [0, 0, 0, 0, 0, 0, 0, 0],
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
  return rows.reduce((sum, row) => sum + rowDisplayTotal(row), 0);
}

export function totalCashBalanceWithDrafts(
  rows: CashReportRow[],
  drafts: Record<string, string>,
): number {
  return rows.reduce((sum, row) => {
    let rowTotal = 0;
    for (let slotIndex = 0; slotIndex < CASH_REPORT_SLOT_COUNT; slotIndex += 1) {
      const draft = drafts[cashSlotKey(row.id, slotIndex)];
      const slotVal = draft !== undefined ? commitCashInput(draft) : (row.slots[slotIndex] ?? 0);
      rowTotal += slotVal;
    }
    return sum + rowTotal;
  }, 0);
}

/** Sütun 2–8 dəyərlərini sütun 1-ə cəmləyir və gözləyənləri sıfırlayır */
export function mergeCashRowSlots(row: CashReportRow): CashReportRow {
  const pending = rowPendingSum(row);
  if (pending === 0) return row;
  const slots = [...row.slots] as CashReportRow["slots"];
  slots[0] = (slots[0] ?? 0) + pending;
  for (let i = 1; i < CASH_REPORT_SLOT_COUNT; i += 1) slots[i] = 0;
  return { ...row, slots, updatedAt: Date.now() };
}

export function applyCashRowDrafts(row: CashReportRow, drafts: Record<string, string>): CashReportRow {
  const slots = [...row.slots] as CashReportRow["slots"];
  let changed = false;
  for (let slotIndex = 0; slotIndex < CASH_REPORT_SLOT_COUNT; slotIndex += 1) {
    const draft = drafts[cashSlotKey(row.id, slotIndex)];
    if (draft === undefined) continue;
    slots[slotIndex] = commitCashInput(draft);
    changed = true;
  }
  return changed ? { ...row, slots } : row;
}

export function clearCashRowDraftKeys(drafts: Record<string, string>, rowId: string): Record<string, string> {
  const next = { ...drafts };
  for (let slotIndex = 0; slotIndex < CASH_REPORT_SLOT_COUNT; slotIndex += 1) {
    delete next[cashSlotKey(rowId, slotIndex)];
  }
  return next;
}

/** Remote sinxronizasiyadan sonra köhnə draft-ları təmizləyir */
export function pruneCashSlotEdits(
  rows: CashReportRow[],
  drafts: Record<string, string>,
): Record<string, string> {
  if (Object.keys(drafts).length === 0) return drafts;
  const rowById = new Map(rows.map((row) => [row.id, row]));
  let changed = false;
  const next = { ...drafts };
  for (const key of Object.keys(next)) {
    const sep = key.lastIndexOf(":");
    if (sep < 0) {
      delete next[key];
      changed = true;
      continue;
    }
    const rowId = key.slice(0, sep);
    const slotIndex = Number(key.slice(sep + 1));
    const row = rowById.get(rowId);
    if (!row || !Number.isFinite(slotIndex) || slotIndex < 0 || slotIndex >= CASH_REPORT_SLOT_COUNT) {
      delete next[key];
      changed = true;
      continue;
    }
    if (commitCashInput(next[key]) === (row.slots[slotIndex] ?? 0)) {
      delete next[key];
      changed = true;
    }
  }
  return changed ? next : drafts;
}

function cashRowNameKey(name: string): string {
  return name.trim().toLowerCase();
}

function cloneCashRowForMerge(row: CashReportRow): CashReportRow {
  return { ...row, slots: [...row.slots] as CashReportRow["slots"] };
}

/**
 * Sətir seçimi: son yenilənən (updatedAt) qalib gəlir.
 * Pending sütunları heç vaxt "cəmlənmiş" köhnə versiya ilə silinmir —
 * bu, xanalara yazılan məbləğlərin refresh-də itməsinin qarşısını alır.
 */
export function reconcileCashRow(a: CashReportRow, b: CashReportRow): CashReportRow {
  const winner = a.updatedAt >= b.updatedAt ? a : b;
  const loser = a.updatedAt >= b.updatedAt ? b : a;
  return {
    ...cloneCashRowForMerge(winner),
    updatedAt: Math.max(winner.updatedAt, loser.updatedAt),
  };
}

/** Eyni hesab adı ilə təkrarlanan sətirləri birləşdirir (müxtəlif ID-lərdən yaranan dublikatlar) */
export function dedupeCashReportRows(rows: CashReportRow[]): CashReportRow[] {
  const byName = new Map<string, CashReportRow>();
  const extras: CashReportRow[] = [];

  for (const row of rows) {
    const key = cashRowNameKey(row.name);
    if (!key) {
      extras.push(row);
      continue;
    }
    const existing = byName.get(key);
    byName.set(key, existing ? reconcileCashRow(existing, row) : cloneCashRowForMerge(row));
  }

  return [...byName.values(), ...extras];
}

export function mergeCashReportRowsByUpdatedAt(
  localRows: CashReportRow[],
  remoteRows: CashReportRow[],
): CashReportRow[] {
  const remoteById = new Map(remoteRows.map((row) => [row.id, row]));
  const usedRemoteIds = new Set<string>();
  const merged: CashReportRow[] = [];

  for (const local of localRows) {
    const remote = remoteById.get(local.id);
    if (!remote) {
      merged.push(local);
      continue;
    }
    usedRemoteIds.add(local.id);
    merged.push(reconcileCashRow(local, remote));
  }

  for (const remote of remoteRows) {
    if (!usedRemoteIds.has(remote.id)) merged.push(remote);
  }

  return dedupeCashReportRows(merged);
}

/** Bir neçə mənbədən (remote, lokal, ehtiyat) kassa sətirlərini birləşdirir */
export function mergeCashReportRowsFromSources(...sources: CashReportRow[][]): CashReportRow[] {
  let merged: CashReportRow[] = [];
  for (const rows of sources) {
    if (!rows.length) continue;
    merged = mergeCashReportRowsByUpdatedAt(merged, rows);
  }
  return dedupeCashReportRows(merged);
}

export function mergeCashReportStates(
  ...states: Array<CashReportState | undefined>
): CashReportState | undefined {
  const valid = states.filter((s): s is CashReportState => Boolean(s?.rows?.length || s?.history?.length));
  if (valid.length === 0) return undefined;

  const rowSources = valid.map((s) => s.rows ?? []);
  const rows = mergeCashReportRowsFromSources(...rowSources);

  const historyMap = new Map<string, CashReportSnapshot>();
  for (const state of valid) {
    for (const entry of state.history ?? []) historyMap.set(entry.id, entry);
  }
  const history = [...historyMap.values()]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, CASH_REPORT_HISTORY_LIMIT);

  return { rows, history };
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

export const CASH_REPORT_HISTORY_LIMIT = 100;

export function mergeCashReportHistories(
  ...histories: Array<CashReportSnapshot[] | undefined>
): CashReportSnapshot[] {
  const historyMap = new Map<string, CashReportSnapshot>();
  for (const list of histories) {
    for (const entry of list ?? []) historyMap.set(entry.id, entry);
  }
  return [...historyMap.values()]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, CASH_REPORT_HISTORY_LIMIT);
}

/** Tarixçə anlık görüntüsündən cədvəl sətirlərini hazırlayır */
export function rowsFromCashSnapshot(snapshot: CashReportSnapshot): CashReportRow[] {
  return dedupeCashReportRows(normalizeCashReportRows(snapshot.rows));
}

function cashReportRowsLatestTouch(rows: CashReportRow[]): number {
  return rows.reduce((max, row) => Math.max(max, row.updatedAt || 0), 0);
}

/**
 * Bir neçə mənbədən kassanı həll edir.
 * Tarixçəni heç vaxt cari sətirlərin üzərinə yazmır —
 * cari cədvəl həmişə ən yeni `updatedAt` olan mənbədən götürülür.
 */
export function resolveCashReportState(
  ...states: Array<CashReportState | undefined>
): CashReportState | undefined {
  const valid = states.filter((s): s is CashReportState =>
    Boolean(s && ((s.rows?.length ?? 0) > 0 || (s.history?.length ?? 0) > 0)),
  );
  if (valid.length === 0) return undefined;

  const history = mergeCashReportHistories(...valid.map((s) => s.history));

  // İlk arqument üstünlük (adətən remote) — eyni updatedAt-də o seçilir
  let best = valid[0];
  let bestTouch = cashReportRowsLatestTouch(best.rows ?? []);
  for (const state of valid.slice(1)) {
    const touch = cashReportRowsLatestTouch(state.rows ?? []);
    if (touch > bestTouch) {
      best = state;
      bestTouch = touch;
    }
  }
  return {
    rows: dedupeCashReportRows(best.rows ?? []),
    history,
  };
}

export function createCashHistoryEntry(
  rows: CashReportRow[],
  label: string,
  authorName: string,
): CashReportSnapshot {
  const now = Date.now();
  const cloned = rows.map(cloneCashRow);
  return {
    id: crypto.randomUUID(),
    label: label.trim() || "Dəyişiklik",
    authorName: authorName.trim() || "İstifadəçi",
    savedAt: now,
    balance: totalCashBalance(cloned),
    rows: cloned,
  };
}

export function appendCashReportHistory(
  history: CashReportSnapshot[],
  rows: CashReportRow[],
  label: string,
  authorName: string,
): CashReportSnapshot[] {
  return [createCashHistoryEntry(rows, label, authorName), ...history].slice(0, CASH_REPORT_HISTORY_LIMIT);
}

/** Remote sinxronizasiyasında sətir və tarixçəni birləşdirir */
export function mergeCashReportOnSync(
  local: CashReportState | undefined,
  remote: CashReportState | undefined,
  opts?: { preferLocalRows?: boolean },
): CashReportState | undefined {
  if (!local && !remote) return undefined;
  if (!remote) return local;
  if (!local) return remote;

  const remoteRows = remote.rows ?? [];
  const localRows = local.rows ?? [];
  const rows =
    opts?.preferLocalRows && localRows.length > 0
      ? localRows
      : mergeCashReportRowsByUpdatedAt(localRows, remoteRows);

  const historyMap = new Map<string, CashReportSnapshot>();
  for (const entry of remote.history ?? []) historyMap.set(entry.id, entry);
  for (const entry of local.history ?? []) historyMap.set(entry.id, entry);
  const history = [...historyMap.values()]
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, CASH_REPORT_HISTORY_LIMIT);

  return { rows, history };
}

/** @deprecated createCashHistoryEntry istifadə edin */
export function createCashSnapshot(rows: CashReportRow[], label?: string): CashReportSnapshot {
  return createCashHistoryEntry(rows, label?.trim() || new Date().toLocaleString("az-AZ"), "İstifadəçi");
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
      const authorName =
        typeof (h as { authorName?: unknown }).authorName === "string"
          ? String((h as { authorName: string }).authorName).trim()
          : "";
      return {
        id: String((h as { id: string }).id),
        label: label || new Date(savedAt).toLocaleString("az-AZ"),
        authorName,
        savedAt,
        balance,
        rows,
      };
    })
    .sort((a, b) => b.savedAt - a.savedAt)
    .slice(0, CASH_REPORT_HISTORY_LIMIT);
}

export function normalizeCashReportState(raw: unknown): CashReportState | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rows = dedupeCashReportRows(normalizeCashReportRows((raw as { rows?: unknown }).rows));
  const history = normalizeCashReportHistory((raw as { history?: unknown }).history);
  return { rows, history };
}

import type { CashReportRow, CashReportState } from "../types";

/** Apply only edits made since base, retaining other devices' cells and rows.
 * If both devices edited the same cell, the last transaction wins that cell.
 */
export function rebaseCashReport(
  base: CashReportState | undefined,
  local: CashReportState | undefined,
  remote: CashReportState | undefined,
): CashReportState {
  const before = new Map((base?.rows ?? []).map((row) => [row.id, row]));
  const edited = new Map((local?.rows ?? []).map((row) => [row.id, row]));
  const rows = (remote?.rows ?? []).flatMap<CashReportRow>((row) => {
    const old = before.get(row.id);
    const next = edited.get(row.id);
    if (!old || !next) {
      // A local deletion must not discard another device's concurrent edits.
      if (old && !next && JSON.stringify(old) === JSON.stringify(row)) return [];
      return [{ ...row, slots: [...row.slots] }];
    }
    return [{
      ...row,
      name: next.name !== old.name ? next.name : row.name,
      slots: row.slots.map((value, index) =>
        next.slots[index] !== old.slots[index] ? next.slots[index] : value) as CashReportRow["slots"],
      updatedAt: Math.max(row.updatedAt, next.updatedAt),
    }];
  });
  const remoteIds = new Set((remote?.rows ?? []).map((row) => row.id));
  for (const row of local?.rows ?? []) {
    // Only genuinely new rows may be added; do not resurrect remote deletions.
    if (!before.has(row.id) && !remoteIds.has(row.id)) {
      rows.push({ ...row, slots: [...row.slots] });
    }
  }
  const history = new Map((remote?.history ?? []).map((entry) => [entry.id, entry]));
  for (const entry of local?.history ?? []) history.set(entry.id, entry);
  return { rows, history: [...history.values()].sort((a, b) => b.savedAt - a.savedAt).slice(0, 100) };
}

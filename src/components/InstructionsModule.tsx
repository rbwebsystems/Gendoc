import { useMemo, useState } from "react";
import type {
  InstructionCashSaleRow,
  InstructionCorporateSaleRow,
  InstructionCreditRateRow,
  InstructionCreditSaleRow,
  InstructionPosFeeRow,
  InstructionRowStatus,
  InstructionsState,
} from "../types";
import {
  newInstructionCashSaleRow,
  newInstructionCorporateSaleRow,
  newInstructionCreditRateRow,
  newInstructionCreditSaleRow,
  newInstructionPosFeeRow,
  normalizePosTerminal,
  POS_TERMINAL_ORDER,
} from "../lib/instructions";

type InstructionTab = "cash" | "credit" | "corporate" | "pos" | "creditRates";
type StatusFilter = "all" | InstructionRowStatus;

const TABS: { id: InstructionTab; label: string }[] = [
  { id: "cash", label: "Nəğd satış" },
  { id: "credit", label: "Kredit satış" },
  { id: "corporate", label: "Korporativ satış" },
  { id: "pos", label: "POS / Kart komissiyaları" },
  { id: "creditRates", label: "Kredit faizləri" },
];

const STATUS_OPTIONS: { value: InstructionRowStatus; label: string }[] = [
  { value: "active", label: "Aktiv" },
  { value: "inactive", label: "Deaktiv" },
];

const STATUS_FILTER_OPTIONS: { value: StatusFilter; label: string }[] = [
  { value: "all", label: "Hamısı" },
  { value: "active", label: "Aktiv" },
  { value: "inactive", label: "Deaktiv" },
];

type Props = {
  state: InstructionsState;
  onChange: (next: InstructionsState) => void;
};

function matchesSearch(values: string[], query: string): boolean {
  if (!query.trim()) return true;
  const q = query.trim().toLowerCase();
  return values.some((v) => v.toLowerCase().includes(q));
}

function matchesStatus(status: InstructionRowStatus, filter: StatusFilter): boolean {
  return filter === "all" || status === filter;
}

function StatusSelect(props: {
  value: InstructionRowStatus;
  onChange: (value: InstructionRowStatus) => void;
  disabled?: boolean;
}) {
  return (
    <select
      className="dg-input dg-input--table"
      value={props.value}
      disabled={props.disabled}
      onChange={(e) => props.onChange(e.target.value as InstructionRowStatus)}
      aria-label="Status"
    >
      {STATUS_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function DeleteButton(props: { onClick: () => void; disabled?: boolean }) {
  return (
    <button
      type="button"
      className="dg-btn dg-btn-danger dg-btn--compact"
      onClick={props.onClick}
      disabled={props.disabled}
    >
      Sil
    </button>
  );
}

function CreditRateActionButtons(props: {
  editing: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="dg-icon-row dg-instructions-rate-actions">
      <button
        type="button"
        className={`dg-icon-btn ${props.editing ? "dg-icon-btn--primary" : ""}`}
        onClick={props.onEdit}
        title={props.editing ? "Hazır" : "Redaktə"}
        aria-label={props.editing ? "Hazır" : "Redaktə"}
      >
        {props.editing ? (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
          </svg>
        ) : (
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
            <path
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 20h9M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4L16.5 3.5z"
            />
          </svg>
        )}
      </button>
      <button
        type="button"
        className="dg-icon-btn dg-icon-btn--danger"
        onClick={props.onDelete}
        title="Sil"
        aria-label="Sil"
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 6h18M8 6V4h8v2m-1 0v14a2 2 0 01-2 2H9a2 2 0 01-2-2V6h10z"
          />
        </svg>
      </button>
    </div>
  );
}

export function InstructionsModule({ state, onChange }: Props) {
  const [tab, setTab] = useState<InstructionTab>("cash");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [editingCreditRateIds, setEditingCreditRateIds] = useState<Record<string, true>>({});

  const toggleCreditRateEdit = (id: string) => {
    setEditingCreditRateIds((prev) => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: true };
    });
  };

  const patchCash = (id: string, patch: Partial<InstructionCashSaleRow>) => {
    onChange({
      ...state,
      cashSales: state.cashSales.map((row) =>
        row.id === id ? { ...row, ...patch, updatedAt: Date.now() } : row,
      ),
    });
  };

  const patchCredit = (id: string, patch: Partial<InstructionCreditSaleRow>) => {
    onChange({
      ...state,
      creditSales: state.creditSales.map((row) =>
        row.id === id ? { ...row, ...patch, updatedAt: Date.now() } : row,
      ),
    });
  };

  const patchCorporate = (id: string, patch: Partial<InstructionCorporateSaleRow>) => {
    onChange({
      ...state,
      corporateSales: state.corporateSales.map((row) =>
        row.id === id ? { ...row, ...patch, updatedAt: Date.now() } : row,
      ),
    });
  };

  const patchPos = (id: string, patch: Partial<InstructionPosFeeRow>) => {
    onChange({
      ...state,
      posFees: state.posFees.map((row) => (row.id === id ? { ...row, ...patch, updatedAt: Date.now() } : row)),
    });
  };

  const patchCreditRate = (id: string, patch: Partial<InstructionCreditRateRow>) => {
    onChange({
      ...state,
      creditRates: (state.creditRates ?? []).map((row) =>
        row.id === id ? { ...row, ...patch, updatedAt: Date.now() } : row,
      ),
    });
  };

  const cashRows = useMemo(
    () =>
      state.cashSales.filter(
        (row) =>
          matchesStatus(row.status, statusFilter) &&
          matchesSearch([row.category, row.condition, row.priceRule, row.rate], search),
      ),
    [state.cashSales, search, statusFilter],
  );

  const creditRows = useMemo(
    () =>
      state.creditSales.filter(
        (row) =>
          matchesStatus(row.status, statusFilter) &&
          matchesSearch([row.productGroup, row.term, row.creditRate], search),
      ),
    [state.creditSales, search, statusFilter],
  );

  const corporateRows = useMemo(
    () =>
      state.corporateSales.filter(
        (row) =>
          matchesStatus(row.status, statusFilter) &&
          matchesSearch([row.customerType, row.priceRule, row.rate], search),
      ),
    [state.corporateSales, search, statusFilter],
  );

  const posRows = useMemo(
    () =>
      state.posFees.filter(
        (row) =>
          matchesStatus(row.status, statusFilter) &&
          matchesSearch([row.terminal, row.operationType, row.commissionRate, row.note], search),
      ),
    [state.posFees, search, statusFilter],
  );

  const creditRateRows = useMemo(
    () =>
      (state.creditRates ?? [])
        .filter(
          (row) =>
            matchesStatus(row.status, statusFilter) &&
            matchesSearch([row.label, String(row.months), String(row.percent)], search),
        )
        .sort((a, b) => a.months - b.months || a.label.localeCompare(b.label, "az")),
    [state.creditRates, search, statusFilter],
  );

  const posSections = useMemo(() => {
    const grouped = new Map<string, InstructionPosFeeRow[]>();
    for (const terminal of POS_TERMINAL_ORDER) grouped.set(terminal, []);
    const extras: { terminal: string; rows: InstructionPosFeeRow[] }[] = [];

    for (const row of posRows) {
      const terminal = normalizePosTerminal(row.terminal);
      if (grouped.has(terminal)) {
        grouped.get(terminal)!.push(row);
      } else if (extras.some((section) => section.terminal === terminal)) {
        extras.find((section) => section.terminal === terminal)!.rows.push(row);
      } else {
        extras.push({ terminal, rows: [row] });
      }
    }

    const ordered = POS_TERMINAL_ORDER.map((terminal) => ({
      terminal,
      rows: grouped.get(terminal) ?? [],
    }));
    return [...ordered, ...extras];
  }, [posRows]);

  const addPosRow = (terminal: string) => {
    onChange({
      ...state,
      posFees: [...state.posFees, newInstructionPosFeeRow({ terminal: normalizePosTerminal(terminal) })],
    });
  };

  const addRow = () => {
    if (tab === "cash") {
      onChange({ ...state, cashSales: [...state.cashSales, newInstructionCashSaleRow()] });
      return;
    }
    if (tab === "credit") {
      onChange({ ...state, creditSales: [...state.creditSales, newInstructionCreditSaleRow()] });
      return;
    }
    if (tab === "corporate") {
      onChange({ ...state, corporateSales: [...state.corporateSales, newInstructionCorporateSaleRow()] });
      return;
    }
    if (tab === "creditRates") {
      const row = newInstructionCreditRateRow();
      onChange({
        ...state,
        creditRates: [...(state.creditRates ?? []), row],
      });
      setEditingCreditRateIds((prev) => ({ ...prev, [row.id]: true }));
    }
  };

  const renderToolbar = () => (
    <div className="dg-instructions-toolbar" aria-label="Təlimat alətləri">
      <div className="dg-instructions-toolbar-left">
        <div className="dg-instructions-tabs" role="tablist" aria-label="Təlimat bölmələri">
          {TABS.map((item) => (
            <button
              key={item.id}
              type="button"
              role="tab"
              aria-selected={tab === item.id}
              className={`dg-instructions-tab ${tab === item.id ? "is-active" : ""}`}
              onClick={() => setTab(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      <div className="dg-instructions-toolbar-right">
        <input
          className="dg-input dg-instructions-search"
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Axtarış..."
          aria-label="Axtarış"
        />
        <select
          className="dg-input dg-instructions-filter"
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as StatusFilter)}
          aria-label="Status filtri"
        >
          {STATUS_FILTER_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {tab !== "pos" ? (
          <button type="button" className="dg-btn dg-btn-primary" onClick={addRow}>
            Yeni sətir
          </button>
        ) : null}
      </div>
    </div>
  );

  const renderEmpty = (label: string) => (
    <div className="dg-empty-state-card" role="status">
      <div className="dg-empty-state-title">{label}</div>
      <div className="dg-empty-state-desc">«Yeni sətir» ilə məlumat əlavə edin.</div>
    </div>
  );

  return (
    <div className="dg-instructions pg-panel" aria-label="Təlimat">
      {renderToolbar()}

      {tab === "cash" ? (
        cashRows.length === 0 ? (
          renderEmpty("Nəğd satış sətri tapılmadı")
        ) : (
          <div className="dg-instructions-table-wrap dg-table-wrap pg-grid-host">
            <table className="dg-table dg-table--sales dg-table--instructions">
              <thead>
                <tr>
                  <th className="dg-th-num">№</th>
                  <th>Kateqoriya</th>
                  <th>Şərt</th>
                  <th>Qiymət qaydası</th>
                  <th>Faiz</th>
                  <th>Status</th>
                  <th className="dg-th-actions">Əməliyyat</th>
                </tr>
              </thead>
              <tbody>
                {cashRows.map((row, index) => (
                  <tr key={row.id} className={row.status === "inactive" ? "is-inactive" : ""}>
                    <td className="dg-td-num">{index + 1}</td>
                    <td>
                      <input
                        className="dg-input dg-input--table"
                        value={row.category}
                        onChange={(e) => patchCash(row.id, { category: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="dg-input dg-input--table"
                        value={row.condition}
                        onChange={(e) => patchCash(row.id, { condition: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="dg-input dg-input--table"
                        value={row.priceRule}
                        onChange={(e) => patchCash(row.id, { priceRule: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="dg-input dg-input--table"
                        value={row.rate}
                        onChange={(e) => patchCash(row.id, { rate: e.target.value })}
                      />
                    </td>
                    <td>
                      <StatusSelect value={row.status} onChange={(status) => patchCash(row.id, { status })} />
                    </td>
                    <td className="dg-td-actions">
                      <DeleteButton
                        onClick={() =>
                          onChange({ ...state, cashSales: state.cashSales.filter((r) => r.id !== row.id) })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === "credit" ? (
        creditRows.length === 0 ? (
          renderEmpty("Kredit satış sətri tapılmadı")
        ) : (
          <div className="dg-instructions-table-wrap dg-table-wrap pg-grid-host">
            <table className="dg-table dg-table--sales dg-table--instructions">
              <thead>
                <tr>
                  <th className="dg-th-num">№</th>
                  <th>Məhsul qrupu</th>
                  <th>Müddət</th>
                  <th>Kredit faizi</th>
                  <th>Status</th>
                  <th className="dg-th-actions">Əməliyyat</th>
                </tr>
              </thead>
              <tbody>
                {creditRows.map((row, index) => (
                  <tr key={row.id} className={row.status === "inactive" ? "is-inactive" : ""}>
                    <td className="dg-td-num">{index + 1}</td>
                    <td>
                      <input
                        className="dg-input dg-input--table"
                        value={row.productGroup}
                        onChange={(e) => patchCredit(row.id, { productGroup: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="dg-input dg-input--table"
                        value={row.term}
                        onChange={(e) => patchCredit(row.id, { term: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="dg-input dg-input--table"
                        value={row.creditRate}
                        onChange={(e) => patchCredit(row.id, { creditRate: e.target.value })}
                      />
                    </td>
                    <td>
                      <StatusSelect value={row.status} onChange={(status) => patchCredit(row.id, { status })} />
                    </td>
                    <td className="dg-td-actions">
                      <DeleteButton
                        onClick={() =>
                          onChange({ ...state, creditSales: state.creditSales.filter((r) => r.id !== row.id) })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === "corporate" ? (
        corporateRows.length === 0 ? (
          renderEmpty("Korporativ satış sətri tapılmadı")
        ) : (
          <div className="dg-instructions-table-wrap dg-table-wrap pg-grid-host">
            <table className="dg-table dg-table--sales dg-table--instructions">
              <thead>
                <tr>
                  <th className="dg-th-num">№</th>
                  <th>Müştəri tipi</th>
                  <th>Qiymət qaydası</th>
                  <th>Faiz</th>
                  <th>Status</th>
                  <th className="dg-th-actions">Əməliyyat</th>
                </tr>
              </thead>
              <tbody>
                {corporateRows.map((row, index) => (
                  <tr key={row.id} className={row.status === "inactive" ? "is-inactive" : ""}>
                    <td className="dg-td-num">{index + 1}</td>
                    <td>
                      <input
                        className="dg-input dg-input--table"
                        value={row.customerType}
                        onChange={(e) => patchCorporate(row.id, { customerType: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="dg-input dg-input--table"
                        value={row.priceRule}
                        onChange={(e) => patchCorporate(row.id, { priceRule: e.target.value })}
                      />
                    </td>
                    <td>
                      <input
                        className="dg-input dg-input--table"
                        value={row.rate}
                        onChange={(e) => patchCorporate(row.id, { rate: e.target.value })}
                      />
                    </td>
                    <td>
                      <StatusSelect value={row.status} onChange={(status) => patchCorporate(row.id, { status })} />
                    </td>
                    <td className="dg-td-actions">
                      <DeleteButton
                        onClick={() =>
                          onChange({
                            ...state,
                            corporateSales: state.corporateSales.filter((r) => r.id !== row.id),
                          })
                        }
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}

      {tab === "pos" ? (
        posRows.length === 0 ? (
          renderEmpty("POS komissiya sətri tapılmadı")
        ) : (
          <div className="dg-instructions-pos-wrap">
            <h2 className="dg-instructions-pos-title">POS / KART KOMİSSİYALARI</h2>
            {posSections.map((section) =>
              section.rows.length === 0 ? null : (
                <section key={section.terminal} className="dg-instructions-pos-section" aria-label={section.terminal}>
                  <div className="dg-instructions-pos-section-head">
                    <h3 className="dg-instructions-pos-section-title">{section.terminal}</h3>
                    <button
                      type="button"
                      className="dg-btn dg-btn-secondary dg-btn--compact"
                      onClick={() => addPosRow(section.terminal)}
                    >
                      Yeni sətir
                    </button>
                  </div>
                  <div className="dg-instructions-table-wrap dg-table-wrap pg-grid-host">
                    <table className="dg-table dg-table--sales dg-table--instructions dg-table--instructions-pos">
                      <thead>
                        <tr>
                          <th className="dg-th-num">№</th>
                          <th>Ödəniş növü</th>
                          <th>Tutulan komissiya</th>
                          <th>Status</th>
                          <th className="dg-th-actions">Əməliyyat</th>
                        </tr>
                      </thead>
                      <tbody>
                        {section.rows.map((row, index) => (
                          <tr key={row.id} className={row.status === "inactive" ? "is-inactive" : ""}>
                            <td className="dg-td-num">{index + 1}</td>
                            <td>
                              <input
                                className="dg-input dg-input--table"
                                value={row.operationType}
                                onChange={(e) => patchPos(row.id, { operationType: e.target.value })}
                              />
                            </td>
                            <td>
                              <input
                                className="dg-input dg-input--table"
                                value={row.commissionRate}
                                onChange={(e) => patchPos(row.id, { commissionRate: e.target.value })}
                              />
                            </td>
                            <td>
                              <StatusSelect
                                value={row.status}
                                onChange={(status) => patchPos(row.id, { status })}
                              />
                            </td>
                            <td className="dg-td-actions">
                              <DeleteButton
                                onClick={() =>
                                  onChange({ ...state, posFees: state.posFees.filter((r) => r.id !== row.id) })
                                }
                              />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ),
            )}
          </div>
        )
      ) : null}

      {tab === "creditRates" ? (
        creditRateRows.length === 0 ? (
          renderEmpty("Kredit faiz sətri tapılmadı")
        ) : (
          <div className="dg-instructions-table-wrap dg-table-wrap pg-grid-host">
            <table className="dg-table dg-table--sales dg-table--instructions">
              <thead>
                <tr>
                  <th className="dg-th-num">№</th>
                  <th>Müddət</th>
                  <th>Ay sayı</th>
                  <th>Faiz (%)</th>
                  <th>Status</th>
                  <th className="dg-th-actions">Əməliyyat</th>
                </tr>
              </thead>
              <tbody>
                {creditRateRows.map((row, index) => {
                  const editing = Boolean(editingCreditRateIds[row.id]);
                  return (
                    <tr
                      key={row.id}
                      className={`${row.status === "inactive" ? "is-inactive" : ""}${editing ? "" : " is-locked"}`}
                    >
                      <td className="dg-td-num">{index + 1}</td>
                      <td>
                        <input
                          className="dg-input dg-input--table"
                          value={row.label}
                          disabled={!editing}
                          onChange={(e) => patchCreditRate(row.id, { label: e.target.value })}
                          placeholder="məs. 12 ay"
                        />
                      </td>
                      <td>
                        <input
                          className="dg-input dg-input--table"
                          type="number"
                          min="1"
                          step="1"
                          value={row.months}
                          disabled={!editing}
                          onChange={(e) =>
                            patchCreditRate(row.id, { months: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td>
                        <input
                          className="dg-input dg-input--table"
                          type="number"
                          min="0"
                          step="0.1"
                          value={row.percent}
                          disabled={!editing}
                          onChange={(e) =>
                            patchCreditRate(row.id, { percent: Number(e.target.value) || 0 })
                          }
                        />
                      </td>
                      <td>
                        <StatusSelect
                          value={row.status}
                          disabled={!editing}
                          onChange={(status) => patchCreditRate(row.id, { status })}
                        />
                      </td>
                      <td className="dg-td-actions">
                        <CreditRateActionButtons
                          editing={editing}
                          onEdit={() => toggleCreditRateEdit(row.id)}
                          onDelete={() => {
                            setEditingCreditRateIds((prev) => {
                              if (!prev[row.id]) return prev;
                              const next = { ...prev };
                              delete next[row.id];
                              return next;
                            });
                            onChange({
                              ...state,
                              creditRates: (state.creditRates ?? []).filter((r) => r.id !== row.id),
                            });
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}

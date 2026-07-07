import { useMemo, useState } from "react";
import type {
  InstructionCashSaleRow,
  InstructionCorporateSaleRow,
  InstructionCreditSaleRow,
  InstructionPosFeeRow,
  InstructionRowStatus,
  InstructionsState,
} from "../types";
import {
  newInstructionCashSaleRow,
  newInstructionCorporateSaleRow,
  newInstructionCreditSaleRow,
  newInstructionPosFeeRow,
} from "../lib/instructions";

type InstructionTab = "cash" | "credit" | "corporate" | "pos";
type StatusFilter = "all" | InstructionRowStatus;

const TABS: { id: InstructionTab; label: string }[] = [
  { id: "cash", label: "Nəğd satış" },
  { id: "credit", label: "Kredit satış" },
  { id: "corporate", label: "Korporativ satış" },
  { id: "pos", label: "POS faizləri" },
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
}) {
  return (
    <select
      className="dg-input dg-input--table"
      value={props.value}
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

function DeleteButton(props: { onClick: () => void }) {
  return (
    <button type="button" className="dg-btn dg-btn-danger dg-btn--compact" onClick={props.onClick}>
      Sil
    </button>
  );
}

export function InstructionsModule({ state, onChange }: Props) {
  const [tab, setTab] = useState<InstructionTab>("cash");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");

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
    onChange({ ...state, posFees: [...state.posFees, newInstructionPosFeeRow()] });
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
        <button type="button" className="dg-btn dg-btn-primary" onClick={addRow}>
          Yeni sətir
        </button>
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
          renderEmpty("POS faizi sətri tapılmadı")
        ) : (
          <div className="dg-instructions-table-wrap dg-table-wrap pg-grid-host">
            <table className="dg-table dg-table--sales dg-table--instructions">
              <thead>
                <tr>
                  <th className="dg-th-num">№</th>
                  <th>Terminal</th>
                  <th>Əməliyyat növü</th>
                  <th>Komissiya faizi</th>
                  <th>Qeyd</th>
                  <th>Status</th>
                  <th className="dg-th-actions">Əməliyyat</th>
                </tr>
              </thead>
              <tbody>
                {posRows.map((row, index) => (
                  <tr key={row.id} className={row.status === "inactive" ? "is-inactive" : ""}>
                    <td className="dg-td-num">{index + 1}</td>
                    <td>
                      <input
                        className="dg-input dg-input--table"
                        value={row.terminal}
                        onChange={(e) => patchPos(row.id, { terminal: e.target.value })}
                      />
                    </td>
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
                      <input
                        className="dg-input dg-input--table"
                        value={row.note}
                        onChange={(e) => patchPos(row.id, { note: e.target.value })}
                      />
                    </td>
                    <td>
                      <StatusSelect value={row.status} onChange={(status) => patchPos(row.id, { status })} />
                    </td>
                    <td className="dg-td-actions">
                      <DeleteButton
                        onClick={() => onChange({ ...state, posFees: state.posFees.filter((r) => r.id !== row.id) })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      ) : null}
    </div>
  );
}

import { useState } from "react";
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

export function LabelsModule({ products, onSave }: LabelsModuleProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState<LabelProductDraft[]>([]);
  const [error, setError] = useState("");

  const startEditing = () => {
    setDraft(
      products.length > 0
        ? products.map((product) => ({
            id: product.id,
            name: product.name,
            qty: String(product.qty),
            salePrice: String(product.salePrice),
            createdAt: product.createdAt,
          }))
        : [createDraftRow()],
    );
    setError("");
    setEditing(true);
  };

  const cancelEditing = () => {
    setDraft([]);
    setError("");
    setEditing(false);
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

import { useMemo, useRef, useState, type ReactNode } from "react";
import type {
  CorporateOrderItem,
  CorporateOrderRecord,
  CorporateOrderStatus,
  CorporateQuoteLine,
  CorporateQuoteMatchType,
  CorporateSupplierQuote,
  SavedCompanyRecord,
  SupplierRecord,
} from "../types";
import {
  ACCEPTED_FILES_LABEL,
  ACCEPTED_ORDER_FILES,
  extractOrderFromFile,
  extractQuoteFromFile,
} from "../lib/corporateExtract";
import { TableActionMenu } from "./TableActionMenu";

type CorporateOrdersModuleProps = {
  orders: CorporateOrderRecord[];
  companies: SavedCompanyRecord[];
  suppliers: SupplierRecord[];
  onChange: (orders: CorporateOrderRecord[]) => void;
};

type ItemDraft = { id: string; name: string; qty: string; unit: string; note: string };

type OrderDraft = {
  id: string | null;
  title: string;
  companyId: string;
  orderDate: string;
  sourceFileName: string;
  items: ItemDraft[];
};

type LineDraft = {
  id: string;
  orderItemId: string;
  matchType: CorporateQuoteMatchType;
  offeredName: string;
  qty: string;
  unitPrice: string;
  totalPrice: string;
  note: string;
};

type QuoteDraft = {
  id: string | null;
  supplierName: string;
  currency: string;
  sourceFileName: string;
  lines: LineDraft[];
};

type View = { kind: "list" } | { kind: "orderForm" } | { kind: "detail"; orderId: string };

const STATUS_LABELS: Record<CorporateOrderStatus, string> = {
  new: "Yeni",
  collecting: "Təklif toplanır",
  done: "Tamamlandı",
};

const MATCH_LABELS: Record<CorporateQuoteMatchType, string> = {
  exact: "Uyğun",
  alternative: "Əvəz məhsul",
  uncertain: "Yoxlanmalı",
  unmatched: "Uyğun deyil",
};

const qtyFormatter = new Intl.NumberFormat("az-AZ", { maximumFractionDigits: 3 });
const priceFormatter = new Intl.NumberFormat("az-AZ", { minimumFractionDigits: 2, maximumFractionDigits: 2 });

const today = () => new Date().toISOString().slice(0, 10);

function parseNum(value: string): number | null {
  const cleaned = value.trim().replace(/\s/g, "").replace(",", ".");
  if (!cleaned) return null;
  const n = Number(cleaned);
  return Number.isFinite(n) ? n : null;
}

const numToStr = (n: number | null | undefined) => (n == null ? "" : String(n));

function lineTotal(line: CorporateQuoteLine, item: CorporateOrderItem | undefined): number | null {
  if (line.totalPrice != null) return line.totalPrice;
  const qty = line.qty ?? item?.qty ?? null;
  return line.unitPrice != null && qty != null ? line.unitPrice * qty : null;
}

function emptyItem(): ItemDraft {
  return { id: crypto.randomUUID(), name: "", qty: "", unit: "ədəd", note: "" };
}

export function CorporateOrdersModule({ orders, companies, suppliers, onChange }: CorporateOrdersModuleProps) {
  const [view, setView] = useState<View>({ kind: "list" });
  const [orderDraft, setOrderDraft] = useState<OrderDraft | null>(null);
  const [quoteDraft, setQuoteDraft] = useState<QuoteDraft | null>(null);
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const orderFileRef = useRef<HTMLInputElement>(null);
  const quoteFileRef = useRef<HTMLInputElement>(null);

  const companyName = useMemo(() => {
    const map = new Map(companies.map((c) => [c.id, c.profile.name]));
    return (id: string) => map.get(id) || "—";
  }, [companies]);

  const sortedOrders = useMemo(() => [...orders].sort((a, b) => b.createdAt - a.createdAt), [orders]);
  const currentOrder = view.kind === "detail" ? orders.find((o) => o.id === view.orderId) ?? null : null;

  const updateOrder = (id: string, patch: (o: CorporateOrderRecord) => CorporateOrderRecord) => {
    onChange(orders.map((o) => (o.id === id ? { ...patch(o), updatedAt: Date.now() } : o)));
  };

  const openList = () => {
    setView({ kind: "list" });
    setOrderDraft(null);
    setQuoteDraft(null);
    setError("");
  };

  const openDetail = (orderId: string) => {
    setView({ kind: "detail", orderId });
    setOrderDraft(null);
    setQuoteDraft(null);
    setError("");
  };

  /* ---------- Sifariş forması ---------- */

  const startNewOrder = () => {
    setOrderDraft({ id: null, title: "", companyId: "", orderDate: today(), sourceFileName: "", items: [] });
    setView({ kind: "orderForm" });
    setError("");
  };

  const startEditOrder = (order: CorporateOrderRecord) => {
    setOrderDraft({
      id: order.id,
      title: order.title,
      companyId: order.companyId,
      orderDate: order.orderDate,
      sourceFileName: order.sourceFileName ?? "",
      items: order.items.map((it) => ({
        id: it.id,
        name: it.name,
        qty: numToStr(it.qty),
        unit: it.unit,
        note: it.note ?? "",
      })),
    });
    setView({ kind: "orderForm" });
    setError("");
  };

  const readOrderFile = async (file: File) => {
    setBusy(`“${file.name}” oxunur…`);
    setError("");
    try {
      const result = await extractOrderFromFile(file);
      if (result.items.length === 0) throw new Error("Faylda məhsul sətri tapılmadı.");
      setOrderDraft((d) =>
        d
          ? {
              ...d,
              title: d.title || file.name.replace(/\.[^.]+$/, ""),
              sourceFileName: file.name,
              items: [
                ...d.items.filter((it) => it.name.trim()),
                ...result.items.map((it) => ({
                  id: crypto.randomUUID(),
                  name: it.name,
                  qty: numToStr(it.qty),
                  unit: it.unit,
                  note: it.note,
                })),
              ],
            }
          : d,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fayl oxunmadı.");
    } finally {
      setBusy("");
    }
  };

  const patchItem = (id: string, patch: Partial<ItemDraft>) =>
    setOrderDraft((d) => (d ? { ...d, items: d.items.map((it) => (it.id === id ? { ...it, ...patch } : it)) } : d));

  const saveOrder = () => {
    if (!orderDraft) return;
    const items: CorporateOrderItem[] = orderDraft.items
      .filter((it) => it.name.trim())
      .map((it) => {
        const note = it.note.trim();
        return { id: it.id, name: it.name.trim(), qty: parseNum(it.qty), unit: it.unit.trim(), ...(note ? { note } : {}) };
      });
    if (items.length === 0) {
      setError("Ən azı bir məhsul sətri olmalıdır.");
      return;
    }
    const now = Date.now();
    const base = {
      title: orderDraft.title.trim() || "Sifariş",
      companyId: orderDraft.companyId,
      orderDate: orderDraft.orderDate || today(),
      ...(orderDraft.sourceFileName ? { sourceFileName: orderDraft.sourceFileName } : {}),
      items,
    };
    if (orderDraft.id) {
      const itemIds = new Set(items.map((it) => it.id));
      const id = orderDraft.id;
      updateOrder(id, (o) => ({
        ...o,
        ...base,
        // Silinmiş sətirlərə bağlı təklif sətirləri “uyğun deyil” olur
        quotes: o.quotes.map((q) => ({
          ...q,
          lines: q.lines.map((l) =>
            l.orderItemId && !itemIds.has(l.orderItemId) ? { ...l, orderItemId: null, matchType: "unmatched" } : l,
          ),
        })),
      }));
      openDetail(id);
    } else {
      const order: CorporateOrderRecord = {
        id: crypto.randomUUID(),
        ...base,
        status: "new",
        quotes: [],
        createdAt: now,
        updatedAt: now,
      };
      onChange([order, ...orders]);
      openDetail(order.id);
    }
  };

  const deleteOrder = (order: CorporateOrderRecord) => {
    if (!window.confirm(`“${order.title}” sifarişi silinsin?`)) return;
    onChange(orders.filter((o) => o.id !== order.id));
    openList();
  };

  /* ---------- Təchizatçı təklifi ---------- */

  const startNewQuote = () => {
    setQuoteDraft({ id: null, supplierName: "", currency: "AZN", sourceFileName: "", lines: [] });
    setError("");
  };

  const startEditQuote = (quote: CorporateSupplierQuote) => {
    setQuoteDraft({
      id: quote.id,
      supplierName: quote.supplierName,
      currency: quote.currency,
      sourceFileName: quote.sourceFileName ?? "",
      lines: quote.lines.map((l) => ({
        id: l.id,
        orderItemId: l.orderItemId ?? "",
        matchType: l.matchType,
        offeredName: l.offeredName,
        qty: numToStr(l.qty),
        unitPrice: numToStr(l.unitPrice),
        totalPrice: numToStr(l.totalPrice),
        note: l.note ?? "",
      })),
    });
    setError("");
  };

  const readQuoteFile = async (file: File, order: CorporateOrderRecord) => {
    setBusy(`“${file.name}” oxunur və sifarişlə tutuşdurulur…`);
    setError("");
    try {
      const result = await extractQuoteFromFile(file, order.items);
      if (result.lines.length === 0) throw new Error("Faylda qiymət sətri tapılmadı.");
      const itemIds = new Set(order.items.map((it) => it.id));
      setQuoteDraft((d) =>
        d
          ? {
              ...d,
              supplierName: d.supplierName || result.supplierName,
              currency: result.currency || d.currency,
              sourceFileName: file.name,
              lines: result.lines.map((l) => {
                const orderItemId = l.orderItemId && itemIds.has(l.orderItemId) ? l.orderItemId : "";
                return {
                  id: crypto.randomUUID(),
                  orderItemId,
                  matchType: orderItemId ? l.matchType : "unmatched",
                  offeredName: l.offeredName,
                  qty: numToStr(l.qty),
                  unitPrice: numToStr(l.unitPrice),
                  totalPrice: numToStr(l.totalPrice),
                  note: l.note,
                };
              }),
            }
          : d,
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : "Fayl oxunmadı.");
    } finally {
      setBusy("");
    }
  };

  const patchLine = (id: string, patch: Partial<LineDraft>) =>
    setQuoteDraft((d) => (d ? { ...d, lines: d.lines.map((l) => (l.id === id ? { ...l, ...patch } : l)) } : d));

  const saveQuote = (order: CorporateOrderRecord) => {
    if (!quoteDraft) return;
    const supplierName = quoteDraft.supplierName.trim();
    if (!supplierName) {
      setError("Təchizatçının adını yazın.");
      return;
    }
    const lines: CorporateQuoteLine[] = quoteDraft.lines
      .filter((l) => l.offeredName.trim() || l.orderItemId)
      .map((l) => {
        const note = l.note.trim();
        return {
          id: l.id,
          orderItemId: l.orderItemId || null,
          matchType: l.orderItemId ? (l.matchType === "unmatched" ? "exact" : l.matchType) : "unmatched",
          offeredName: l.offeredName.trim(),
          qty: parseNum(l.qty),
          unitPrice: parseNum(l.unitPrice),
          totalPrice: parseNum(l.totalPrice),
          ...(note ? { note } : {}),
        };
      });
    if (lines.length === 0) {
      setError("Təklifdə ən azı bir sətir olmalıdır.");
      return;
    }
    const quote: CorporateSupplierQuote = {
      id: quoteDraft.id ?? crypto.randomUUID(),
      supplierName,
      currency: quoteDraft.currency.trim().toUpperCase() || "AZN",
      ...(quoteDraft.sourceFileName ? { sourceFileName: quoteDraft.sourceFileName } : {}),
      lines,
      createdAt: Date.now(),
    };
    updateOrder(order.id, (o) => ({
      ...o,
      status: o.status === "new" ? "collecting" : o.status,
      quotes: quoteDraft.id
        ? o.quotes.map((q) => (q.id === quoteDraft.id ? { ...quote, createdAt: q.createdAt } : q))
        : [...o.quotes, quote],
    }));
    setQuoteDraft(null);
    setError("");
  };

  const deleteQuote = (order: CorporateOrderRecord, quote: CorporateSupplierQuote) => {
    if (!window.confirm(`“${quote.supplierName}” təklifi silinsin?`)) return;
    updateOrder(order.id, (o) => ({ ...o, quotes: o.quotes.filter((q) => q.id !== quote.id) }));
  };

  /* ---------- Render ---------- */

  const notice = (
    <>
      {busy ? (
        <div className="dg-labels-import-info dg-corp-busy" role="status">
          <span className="dg-corp-spinner" aria-hidden /> {busy}
        </div>
      ) : null}
      {error ? (
        <div className="dg-labels-error" role="alert">
          {error}
        </div>
      ) : null}
    </>
  );

  if (view.kind === "orderForm" && orderDraft) {
    return (
      <div className="dg-form-page pg-panel dg-corp" aria-label="Korporativ sifariş forması">
        <div className="dg-labels-toolbar">
          <div>
            <h2 className="dg-labels-title">{orderDraft.id ? "Sifarişi redaktə et" : "Yeni korporativ sifariş"}</h2>
            <p className="dg-muted dg-labels-subtitle">
              Müştərinin göndərdiyi faylı ({ACCEPTED_FILES_LABEL}) əlavə edin — məhsullar avtomatik oxunacaq.
            </p>
          </div>
          <div className="dg-labels-actions">
            <button
              type="button"
              className="dg-btn dg-btn-secondary"
              onClick={() => (orderDraft.id ? openDetail(orderDraft.id) : openList())}
            >
              Ləğv et
            </button>
            <button type="button" className="dg-btn dg-btn-primary" onClick={saveOrder} disabled={Boolean(busy)}>
              Yadda saxla
            </button>
          </div>
        </div>

        {notice}

        <div className="dg-corp-fields">
          <label className="dg-corp-field">
            <span>Şirkət</span>
            <select
              className="dg-input"
              value={orderDraft.companyId}
              onChange={(e) => setOrderDraft({ ...orderDraft, companyId: e.target.value })}
            >
              <option value="">— Şirkət seçin —</option>
              {companies.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.profile.name || "Adsız şirkət"}
                </option>
              ))}
            </select>
          </label>
          <label className="dg-corp-field">
            <span>Sifariş adı</span>
            <input
              className="dg-input"
              value={orderDraft.title}
              placeholder="Məs: Noyabr ofis avadanlığı"
              onChange={(e) => setOrderDraft({ ...orderDraft, title: e.target.value })}
            />
          </label>
          <label className="dg-corp-field dg-corp-field--date">
            <span>Tarix</span>
            <input
              className="dg-input"
              type="date"
              value={orderDraft.orderDate}
              onChange={(e) => setOrderDraft({ ...orderDraft, orderDate: e.target.value })}
            />
          </label>
        </div>

        <div className="dg-corp-section-head">
          <h3 className="dg-corp-section-title">
            Məhsullar <span className="dg-muted">({orderDraft.items.length})</span>
            {orderDraft.sourceFileName ? <span className="dg-corp-file">📎 {orderDraft.sourceFileName}</span> : null}
          </h3>
          <div className="dg-labels-actions">
            <input
              ref={orderFileRef}
              className="dg-labels-file-input"
              type="file"
              accept={ACCEPTED_ORDER_FILES}
              onChange={(e) => {
                const file = e.target.files?.[0];
                e.target.value = "";
                if (file) void readOrderFile(file);
              }}
            />
            <button
              type="button"
              className="dg-btn dg-btn-primary"
              disabled={Boolean(busy)}
              onClick={() => orderFileRef.current?.click()}
            >
              Fayldan oxu
            </button>
            <button
              type="button"
              className="dg-btn dg-btn-secondary"
              onClick={() => setOrderDraft({ ...orderDraft, items: [...orderDraft.items, emptyItem()] })}
            >
              Sətir əlavə et
            </button>
          </div>
        </div>

        {orderDraft.items.length === 0 ? (
          <div className="dg-empty-state-card" role="status">
            <div className="dg-empty-state-title">Hələ məhsul yoxdur</div>
            <div className="dg-empty-state-desc">“Fayldan oxu” ilə müştəri faylını əlavə edin və ya sətirləri əllə yazın.</div>
          </div>
        ) : (
          <div className="dg-table-wrap pg-grid-host">
            <table className="dg-table dg-corp-table">
              <thead>
                <tr>
                  <th className="dg-th-num">№</th>
                  <th>Məhsul adı</th>
                  <th className="dg-th-amount dg-corp-col-qty">Say</th>
                  <th className="dg-corp-col-unit">Vahid</th>
                  <th>Qeyd</th>
                  <th className="dg-corp-col-actions" aria-label="Əməliyyat" />
                </tr>
              </thead>
              <tbody>
                {orderDraft.items.map((it, index) => (
                  <tr key={it.id}>
                    <td className="dg-td-num">{index + 1}</td>
                    <td>
                      <input
                        className="dg-input dg-input--table"
                        value={it.name}
                        onChange={(e) => patchItem(it.id, { name: e.target.value })}
                        aria-label={`${index + 1}-ci məhsulun adı`}
                      />
                    </td>
                    <td>
                      <input
                        className="dg-input dg-input--table dg-corp-num"
                        inputMode="decimal"
                        value={it.qty}
                        onChange={(e) => patchItem(it.id, { qty: e.target.value })}
                        aria-label={`${index + 1}-ci məhsulun sayı`}
                      />
                    </td>
                    <td>
                      <input
                        className="dg-input dg-input--table"
                        value={it.unit}
                        onChange={(e) => patchItem(it.id, { unit: e.target.value })}
                        aria-label={`${index + 1}-ci məhsulun vahidi`}
                      />
                    </td>
                    <td>
                      <input
                        className="dg-input dg-input--table"
                        value={it.note}
                        onChange={(e) => patchItem(it.id, { note: e.target.value })}
                        aria-label={`${index + 1}-ci məhsulun qeydi`}
                      />
                    </td>
                    <td className="dg-corp-col-actions">
                      <button
                        type="button"
                        className="dg-btn dg-btn-danger dg-btn--compact"
                        onClick={() =>
                          setOrderDraft({ ...orderDraft, items: orderDraft.items.filter((x) => x.id !== it.id) })
                        }
                        aria-label={`${index + 1}-ci məhsulu sil`}
                      >
                        Sil
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  if (view.kind === "detail" && currentOrder) {
    const order = currentOrder;
    const itemById = new Map(order.items.map((it) => [it.id, it]));

    if (quoteDraft) {
      return (
        <div className="dg-form-page pg-panel dg-corp" aria-label="Təchizatçı təklifi">
          <div className="dg-labels-toolbar">
            <div>
              <h2 className="dg-labels-title">{quoteDraft.id ? "Təklifi redaktə et" : "Təchizatçı təklifi əlavə et"}</h2>
              <p className="dg-muted dg-labels-subtitle">
                {order.title} — təchizatçının qiymət faylını əlavə edin, qiymətlər sifariş sətirlərinə avtomatik düşəcək.
              </p>
            </div>
            <div className="dg-labels-actions">
              <button type="button" className="dg-btn dg-btn-secondary" onClick={() => setQuoteDraft(null)}>
                Ləğv et
              </button>
              <button
                type="button"
                className="dg-btn dg-btn-primary"
                onClick={() => saveQuote(order)}
                disabled={Boolean(busy)}
              >
                Yadda saxla
              </button>
            </div>
          </div>

          {notice}

          <div className="dg-corp-fields">
            <label className="dg-corp-field">
              <span>Təchizatçı</span>
              <input
                className="dg-input"
                list="dg-corp-suppliers"
                value={quoteDraft.supplierName}
                placeholder="Təchizatçının adı"
                onChange={(e) => setQuoteDraft({ ...quoteDraft, supplierName: e.target.value })}
              />
              <datalist id="dg-corp-suppliers">
                {suppliers.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </label>
            <label className="dg-corp-field dg-corp-field--date">
              <span>Valyuta</span>
              <input
                className="dg-input"
                value={quoteDraft.currency}
                onChange={(e) => setQuoteDraft({ ...quoteDraft, currency: e.target.value })}
              />
            </label>
          </div>

          <div className="dg-corp-section-head">
            <h3 className="dg-corp-section-title">
              Təklif sətirləri <span className="dg-muted">({quoteDraft.lines.length})</span>
              {quoteDraft.sourceFileName ? <span className="dg-corp-file">📎 {quoteDraft.sourceFileName}</span> : null}
            </h3>
            <div className="dg-labels-actions">
              <input
                ref={quoteFileRef}
                className="dg-labels-file-input"
                type="file"
                accept={ACCEPTED_ORDER_FILES}
                onChange={(e) => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void readQuoteFile(file, order);
                }}
              />
              <button
                type="button"
                className="dg-btn dg-btn-primary"
                disabled={Boolean(busy)}
                onClick={() => quoteFileRef.current?.click()}
              >
                Fayldan oxu
              </button>
              <button
                type="button"
                className="dg-btn dg-btn-secondary"
                onClick={() =>
                  setQuoteDraft({
                    ...quoteDraft,
                    lines: [
                      ...quoteDraft.lines,
                      {
                        id: crypto.randomUUID(),
                        orderItemId: "",
                        matchType: "exact",
                        offeredName: "",
                        qty: "",
                        unitPrice: "",
                        totalPrice: "",
                        note: "",
                      },
                    ],
                  })
                }
              >
                Sətir əlavə et
              </button>
            </div>
          </div>

          {quoteDraft.lines.length === 0 ? (
            <div className="dg-empty-state-card" role="status">
              <div className="dg-empty-state-title">Hələ təklif sətri yoxdur</div>
              <div className="dg-empty-state-desc">“Fayldan oxu” ilə təchizatçının faylını əlavə edin.</div>
            </div>
          ) : (
            <div className="dg-table-wrap pg-grid-host">
              <table className="dg-table dg-corp-table dg-corp-table--quote">
                <thead>
                  <tr>
                    <th className="dg-th-num">№</th>
                    <th>Sifariş məhsulu</th>
                    <th>Təklif olunan məhsul</th>
                    <th className="dg-corp-col-match">Uyğunluq</th>
                    <th className="dg-th-amount dg-corp-col-qty">Say</th>
                    <th className="dg-th-amount dg-corp-col-price">Vahid qiyməti</th>
                    <th className="dg-th-amount dg-corp-col-price">Cəmi</th>
                    <th>Qeyd</th>
                    <th className="dg-corp-col-actions" aria-label="Əməliyyat" />
                  </tr>
                </thead>
                <tbody>
                  {quoteDraft.lines.map((l, index) => (
                    <tr key={l.id} className={`dg-corp-match-row--${l.orderItemId ? l.matchType : "unmatched"}`}>
                      <td className="dg-td-num">{index + 1}</td>
                      <td>
                        <select
                          className="dg-input dg-input--table"
                          value={l.orderItemId}
                          onChange={(e) =>
                            patchLine(l.id, {
                              orderItemId: e.target.value,
                              matchType: e.target.value
                                ? l.matchType === "unmatched"
                                  ? "exact"
                                  : l.matchType
                                : "unmatched",
                            })
                          }
                          aria-label={`${index + 1}-ci sətrin sifariş məhsulu`}
                        >
                          <option value="">— Uyğun deyil —</option>
                          {order.items.map((it, i) => (
                            <option key={it.id} value={it.id}>
                              {i + 1}. {it.name}
                            </option>
                          ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="dg-input dg-input--table"
                          value={l.offeredName}
                          onChange={(e) => patchLine(l.id, { offeredName: e.target.value })}
                          aria-label={`${index + 1}-ci sətrin təklif olunan məhsulu`}
                        />
                      </td>
                      <td>
                        <select
                          className="dg-input dg-input--table"
                          value={l.orderItemId ? l.matchType : "unmatched"}
                          disabled={!l.orderItemId}
                          onChange={(e) => patchLine(l.id, { matchType: e.target.value as CorporateQuoteMatchType })}
                          aria-label={`${index + 1}-ci sətrin uyğunluğu`}
                        >
                          {(Object.keys(MATCH_LABELS) as CorporateQuoteMatchType[])
                            .filter((m) => (l.orderItemId ? m !== "unmatched" : m === "unmatched"))
                            .map((m) => (
                              <option key={m} value={m}>
                                {MATCH_LABELS[m]}
                              </option>
                            ))}
                        </select>
                      </td>
                      <td>
                        <input
                          className="dg-input dg-input--table dg-corp-num"
                          inputMode="decimal"
                          value={l.qty}
                          onChange={(e) => patchLine(l.id, { qty: e.target.value })}
                          aria-label={`${index + 1}-ci sətrin sayı`}
                        />
                      </td>
                      <td>
                        <input
                          className="dg-input dg-input--table dg-corp-num"
                          inputMode="decimal"
                          value={l.unitPrice}
                          onChange={(e) => patchLine(l.id, { unitPrice: e.target.value })}
                          aria-label={`${index + 1}-ci sətrin vahid qiyməti`}
                        />
                      </td>
                      <td>
                        <input
                          className="dg-input dg-input--table dg-corp-num"
                          inputMode="decimal"
                          value={l.totalPrice}
                          onChange={(e) => patchLine(l.id, { totalPrice: e.target.value })}
                          aria-label={`${index + 1}-ci sətrin cəmi`}
                        />
                      </td>
                      <td>
                        <input
                          className="dg-input dg-input--table"
                          value={l.note}
                          onChange={(e) => patchLine(l.id, { note: e.target.value })}
                          aria-label={`${index + 1}-ci sətrin qeydi`}
                        />
                      </td>
                      <td className="dg-corp-col-actions">
                        <button
                          type="button"
                          className="dg-btn dg-btn-danger dg-btn--compact"
                          onClick={() =>
                            setQuoteDraft({ ...quoteDraft, lines: quoteDraft.lines.filter((x) => x.id !== l.id) })
                          }
                          aria-label={`${index + 1}-ci sətri sil`}
                        >
                          Sil
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      );
    }

    // Hər sifariş sətri üçün ən aşağı qiymət (yoxlanmalı sətirlər nəzərə alınmır)
    const bestPrice = new Map<string, number>();
    for (const q of order.quotes) {
      for (const l of q.lines) {
        if (!l.orderItemId || l.unitPrice == null || l.unitPrice <= 0) continue;
        if (l.matchType !== "exact" && l.matchType !== "alternative") continue;
        const prev = bestPrice.get(l.orderItemId);
        if (prev == null || l.unitPrice < prev) bestPrice.set(l.orderItemId, l.unitPrice);
      }
    }
    const showsOffered = (q: CorporateSupplierQuote) =>
      q.lines.some((l) => l.orderItemId && (l.matchType === "alternative" || l.matchType === "uncertain"));
    const unmatchedLines = order.quotes.flatMap((q) =>
      q.lines.filter((l) => !l.orderItemId).map((l) => ({ quote: q, line: l })),
    );

    return (
      <div className="dg-form-page pg-panel dg-corp" aria-label="Korporativ sifariş">
        <div className="dg-labels-toolbar">
          <div>
            <button type="button" className="dg-corp-back" onClick={openList}>
              ← Bütün sifarişlər
            </button>
            <h2 className="dg-labels-title">{order.title}</h2>
            <p className="dg-muted dg-labels-subtitle">
              {companyName(order.companyId)} · {order.orderDate} · {order.items.length} məhsul · {order.quotes.length} təklif
              {order.sourceFileName ? ` · 📎 ${order.sourceFileName}` : ""}
            </p>
          </div>
          <div className="dg-labels-actions">
            <select
              className="dg-input dg-corp-status-select"
              value={order.status}
              aria-label="Status"
              onChange={(e) => updateOrder(order.id, (o) => ({ ...o, status: e.target.value as CorporateOrderStatus }))}
            >
              {(Object.keys(STATUS_LABELS) as CorporateOrderStatus[]).map((s) => (
                <option key={s} value={s}>
                  {STATUS_LABELS[s]}
                </option>
              ))}
            </select>
            <button type="button" className="dg-btn dg-btn-secondary" onClick={() => startEditOrder(order)}>
              Sifarişi redaktə et
            </button>
            <button type="button" className="dg-btn dg-btn-danger" onClick={() => deleteOrder(order)}>
              Sil
            </button>
            <button type="button" className="dg-btn dg-btn-primary" onClick={startNewQuote}>
              Təchizatçı təklifi əlavə et
            </button>
          </div>
        </div>

        {notice}

        <div className="dg-table-wrap pg-grid-host dg-corp-compare-wrap">
          <table className="dg-table dg-corp-compare">
            <thead>
              <tr>
                <th className="dg-th-num" rowSpan={2}>
                  №
                </th>
                <th rowSpan={2}>Tələb olunan məhsul</th>
                <th className="dg-th-amount" rowSpan={2}>
                  Say
                </th>
                <th rowSpan={2}>Vahid</th>
                {order.quotes.map((q) => (
                  <th key={q.id} colSpan={showsOffered(q) ? 4 : 3} className="dg-corp-supplier-head">
                    <div className="dg-corp-supplier-name">
                      <span>
                        {q.supplierName} <span className="dg-muted">({q.currency})</span>
                      </span>
                      <TableActionMenu>
                        <button type="button" className="dg-btn dg-btn-secondary dg-btn--compact" onClick={() => startEditQuote(q)}>
                          Redaktə et
                        </button>
                        <button type="button" className="dg-btn dg-btn-danger dg-btn--compact" onClick={() => deleteQuote(order, q)}>
                          Sil
                        </button>
                      </TableActionMenu>
                    </div>
                  </th>
                ))}
              </tr>
              <tr>
                {order.quotes.map((q) => (
                  <SupplierSubHeads key={q.id} showOffered={showsOffered(q)} />
                ))}
              </tr>
            </thead>
            <tbody>
              {order.items.map((it, index) => (
                <tr key={it.id}>
                  <td className="dg-td-num">{index + 1}</td>
                  <td className="dg-corp-item-name">
                    {it.name}
                    {it.note ? <div className="dg-muted dg-corp-note">{it.note}</div> : null}
                  </td>
                  <td className="dg-td-amount">{it.qty == null ? "—" : qtyFormatter.format(it.qty)}</td>
                  <td>{it.unit}</td>
                  {order.quotes.map((q) => {
                    const lines = q.lines.filter((l) => l.orderItemId === it.id);
                    const offered = showsOffered(q);
                    if (lines.length === 0) {
                      return (
                        <td key={q.id} colSpan={offered ? 4 : 3} className="dg-corp-empty-cell dg-corp-group-start">
                          Təklif yoxdur
                        </td>
                      );
                    }
                    const best = bestPrice.get(it.id);
                    return (
                      <QuoteCells
                        key={q.id}
                        lines={lines}
                        item={it}
                        showOffered={offered}
                        bestPrice={best}
                      />
                    );
                  })}
                </tr>
              ))}
            </tbody>
            {order.quotes.length > 0 ? (
              <tfoot>
                <tr>
                  <td colSpan={4} className="dg-corp-total-label">
                    Cəmi
                  </td>
                  {order.quotes.map((q) => {
                    const total = q.lines.reduce((sum, l) => {
                      if (!l.orderItemId) return sum;
                      return sum + (lineTotal(l, itemById.get(l.orderItemId)) ?? 0);
                    }, 0);
                    return (
                      <td key={q.id} colSpan={showsOffered(q) ? 4 : 3} className="dg-td-amount dg-corp-group-start dg-corp-total">
                        {priceFormatter.format(total)} {q.currency}
                      </td>
                    );
                  })}
                </tr>
              </tfoot>
            ) : null}
          </table>
        </div>

        {order.quotes.length === 0 ? (
          <div className="dg-empty-state-card" role="status">
            <div className="dg-empty-state-title">Hələ təchizatçı təklifi yoxdur</div>
            <div className="dg-empty-state-desc">
              “Təchizatçı təklifi əlavə et” ilə təchizatçının qiymət faylını yükləyin — qiymətlər bu cədvələ düşəcək.
            </div>
          </div>
        ) : null}

        {unmatchedLines.length > 0 ? (
          <div className="dg-corp-unmatched">
            <h3 className="dg-corp-section-title">Sifarişə uyğun gəlməyən təklif sətirləri</h3>
            <ul>
              {unmatchedLines.map(({ quote, line }) => (
                <li key={line.id}>
                  <strong>{quote.supplierName}:</strong> {line.offeredName}
                  {line.unitPrice != null ? ` — ${priceFormatter.format(line.unitPrice)} ${quote.currency}` : ""}
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="dg-form-page pg-panel dg-corp" aria-label="Korporativ sifarişlər">
      <div className="dg-labels-toolbar">
        <div>
          <h2 className="dg-labels-title">Korporativ sifarişlər</h2>
          <p className="dg-muted dg-labels-subtitle">{orders.length} sifariş</p>
        </div>
        <div className="dg-labels-actions">
          <button type="button" className="dg-btn dg-btn-primary" onClick={startNewOrder}>
            Yeni sifariş
          </button>
        </div>
      </div>

      {sortedOrders.length === 0 ? (
        <div className="dg-empty-state-card" role="status">
          <div className="dg-empty-state-title">Hələ korporativ sifariş yoxdur</div>
          <div className="dg-empty-state-desc">“Yeni sifariş” ilə müştərinin göndərdiyi sifariş faylını əlavə edin.</div>
        </div>
      ) : (
        <div className="dg-table-wrap pg-grid-host">
          <table className="dg-table dg-corp-table">
            <thead>
              <tr>
                <th className="dg-th-num">№</th>
                <th>Sifariş</th>
                <th>Şirkət</th>
                <th className="dg-corp-col-date">Tarix</th>
                <th className="dg-th-amount dg-corp-col-qty">Məhsul</th>
                <th className="dg-th-amount dg-corp-col-qty">Təklif</th>
                <th className="dg-corp-col-status">Status</th>
              </tr>
            </thead>
            <tbody>
              {sortedOrders.map((o, index) => (
                <tr key={o.id} className="dg-corp-row-link" onClick={() => openDetail(o.id)}>
                  <td className="dg-td-num">{index + 1}</td>
                  <td>
                    <button type="button" className="dg-corp-link" onClick={() => openDetail(o.id)}>
                      {o.title}
                    </button>
                  </td>
                  <td>{companyName(o.companyId)}</td>
                  <td>{o.orderDate}</td>
                  <td className="dg-td-amount">{o.items.length}</td>
                  <td className="dg-td-amount">{o.quotes.length}</td>
                  <td>
                    <span className={`dg-corp-status dg-corp-status--${o.status}`}>{STATUS_LABELS[o.status]}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SupplierSubHeads({ showOffered }: { showOffered: boolean }) {
  return (
    <>
      {showOffered ? <th className="dg-corp-group-start">Təklif olunan məhsul</th> : null}
      <th className={`dg-th-amount${showOffered ? "" : " dg-corp-group-start"}`}>Say</th>
      <th className="dg-th-amount">Qiymət</th>
      <th className="dg-th-amount">Cəmi</th>
    </>
  );
}

function QuoteCells({
  lines,
  item,
  showOffered,
  bestPrice,
}: {
  lines: CorporateQuoteLine[];
  item: CorporateOrderItem;
  showOffered: boolean;
  bestPrice: number | undefined;
}) {
  const isBest = (l: CorporateQuoteLine) =>
    bestPrice != null && l.unitPrice === bestPrice && (l.matchType === "exact" || l.matchType === "alternative");
  const stack = (render: (l: CorporateQuoteLine) => ReactNode, className = "") =>
    lines.map((l) => (
      <div key={l.id} className={`dg-corp-stack ${className}${isBest(l) ? " is-best" : ""}`}>
        {render(l)}
      </div>
    ));
  return (
    <>
      {showOffered ? (
        <td className="dg-corp-group-start dg-corp-offered">
          {stack((l) =>
            l.matchType === "exact" ? (
              <span className="dg-muted">Eyni məhsul</span>
            ) : (
              <>
                <span className={`dg-corp-badge dg-corp-badge--${l.matchType}`}>{MATCH_LABELS[l.matchType]}</span>{" "}
                {l.offeredName}
              </>
            ),
          )}
        </td>
      ) : null}
      <td className={`dg-td-amount${showOffered ? "" : " dg-corp-group-start"}`}>
        {stack((l) => (l.qty == null ? "—" : qtyFormatter.format(l.qty)))}
      </td>
      <td className="dg-td-amount">
        {stack((l) => (l.unitPrice == null ? "—" : priceFormatter.format(l.unitPrice)), "dg-corp-price")}
      </td>
      <td className="dg-td-amount">
        {stack((l) => {
          const total = lineTotal(l, item);
          return total == null ? "—" : priceFormatter.format(total);
        })}
      </td>
    </>
  );
}

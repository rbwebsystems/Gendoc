import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import "./App.css";
import "./rbsoft-theme.css";
import { InstructionsModule } from "./components/InstructionsModule";
import {
  buildDeliveryActHtml,
  buildDeliveryActNoPriceHtml,
  buildInvoiceHtml,
  buildPriceQuoteHtml,
  buildProtocolHtml,
  openPrintableDocument,
  computeTotals,
} from "./documents/generateDocuments";
import {
  backupLocalWorkspace,
  clearLocalWorkspace,
  clearWorkspaceLiveCache,
  hasLocalWorkspace,
  hasLocalWorkspaceBackup,
  loadLocalWorkspaceBackup,
  loadWorkspaceLiveCache,
  loadWorkspaceLocal,
  normalizeCompany,
  normalizeProductRows,
  normalizeWorkspace,
  pickPreferredWorkspace,
  projectsUsingCompany,
  saveWorkspaceLiveCache,
  saveWorkspaceLocal,
  sortProjectsByDate,
  workspaceHasUserData,
  workspaceToGeneratorState,
  resolveProjectVatPercent,
} from "./lib/docStorage";
import {
  emptyCompany,
  emptyMeta,
  newOrderLineRow,
  newProductRow,
  OFFICIAL_VAT_PERCENT,
  ORDER_STATUS_OPTIONS,
  orderStatusLabel,
  orderStatusModifier,
  PERMISSION_MODULE_OPTIONS,
  APP_USER_ROLE_OPTIONS,
  appUserRoleLabel,
  LEAVE_TYPE_OPTIONS,
  leaveTypeLabel,
  leaveStatusLabel,
  leaveStatusModifier,
  defaultModulesForRole,
} from "./lib/defaults";
import { escapeHtml, formatDateAzLong, formatMoney } from "./lib/text";
import {
  CASH_REPORT_SLOT_COUNT,
  cashAmountClass,
  cloneCashRow,
  commitCashInput,
  appendCashReportHistory,
  mergeCashReportOnSync,
  mergeCashReportStates,
  formatCashAmount,
  cashAmountClassForInput,
  cashSlotDisplayValue,
  cashSlotKey,
  isPartialCashInput,
  applyCashRowDrafts,
  clearCashRowDraftKeys,
  mergeCashRowSlots,
  newCashReportRow,
  pruneCashSlotEdits,
  rowPendingSum,
  totalCashBalanceWithDrafts,
  defaultCashReportRows,
  normalizeCashReportSlots,
} from "./lib/cashReport";
import type {
  CompanyProfile,
  DocWorkspace,
  DocumentMeta,
  FolderFileRecord,
  NoteRecord,
  ProductRow,
  ProjectRecord,
  SavedCompanyRecord,
  SupplierOfferRecord,
  SupplierOfferRow,
  SupplierRecord,
  StoreOrderRecord,
  CustomerOrderRecord,
  OrderLineRow,
  OrderStatus,
  SystemUserRecord,
  LeaveRequestRecord,
  LeaveRequestStatus,
  AppUserRole,
  PermissionModuleId,
  WorkspaceFolderRecord,
  CashReportRow,
  CashReportSnapshot,
} from "./types";
import html2pdf from "html2pdf.js";
import { auth, firebaseConfigError, firebaseEnabled, firebaseProjectId } from "./lib/firebase";
import {
  createAppUserAuthAccount,
  isAppUserAuthEmail,
  isDeveloperAuthEmail,
  resetAppUserPassword,
  resolveLoginEmail,
  validateUsername,
  usernameToAuthEmail,
} from "./lib/orgAuth";
import {
  deleteOrgMember,
  fetchOrgMemberOnce,
  fetchOrgWorkspaceOnce,
  isUsernameTaken,
  seedOrgWorkspaceFromUser,
  subscribeOrgMembers,
  subscribeOrgMember,
  subscribeOrgWorkspace,
  syncUsernameIndex,
  deleteUsernameIndex,
  writeOrgMember,
  setMemberMustChangePassword,
  writeOrgWorkspace,
} from "./lib/orgSync";
import {
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  updatePassword,
  type User,
} from "firebase/auth";
import {
  fetchWorkspaceOnce,
  subscribeWorkspace,
  writeWorkspace,
  workspaceFingerprint,
} from "./lib/workspaceSync";
import {
  calculatePricePlan,
  PRICE_CALC_CREDIT_PERIODS,
  PRICE_CALC_PRODUCT_OPTIONS,
  type PriceCalcProductType,
} from "./lib/priceCalculation";

async function downloadPdfFromHtml(html: string, filename: string): Promise<void> {
  const iframe = document.createElement("iframe");
  iframe.style.position = "fixed";
  iframe.style.left = "-2000px";
  iframe.style.top = "0";
  // PDF üçün layout düzgün hesablansın deyə real ölçü veririk
  iframe.style.width = "1200px";
  iframe.style.height = "900px";
  iframe.style.border = "0";
  iframe.style.opacity = "0";
  iframe.style.pointerEvents = "none";
  iframe.setAttribute("aria-hidden", "true");
  document.body.appendChild(iframe);

  const doc = iframe.contentDocument;
  if (!doc) {
    iframe.remove();
    return;
  }
  doc.open();
  doc.write(html);
  doc.close();

  const waitFor = async (cond: () => boolean, timeoutMs: number) => {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (cond()) return;
      await new Promise((r) => setTimeout(r, 80));
    }
  };

  await new Promise<void>((resolve) => {
    const w = iframe.contentWindow;
    if (!w) return resolve();
    if (doc.readyState === "complete") return resolve();
    w.addEventListener("load", () => resolve(), { once: true });
    setTimeout(() => resolve(), 1500);
  });

  // Tailwind CDN + şrift + şəkillər yüklənsin (PDF-də "qarışıq" olmasın)
  await waitFor(() => {
    const styles = Array.from(doc.querySelectorAll("style"));
    return styles.some((s) => (s.textContent || "").toLowerCase().includes("tailwindcss"));
  }, 5000);

  try {
    const anyDoc = doc as unknown as { fonts?: { ready?: Promise<void> } };
    if (anyDoc.fonts?.ready) await anyDoc.fonts.ready;
  } catch {
    /* ignore */
  }

  await waitFor(() => {
    const imgs = Array.from(doc.images ?? []);
    return imgs.every((im) => (im as HTMLImageElement).complete);
  }, 4000);

  await new Promise((r) => setTimeout(r, 500));

  try {
    const rootEl = (doc.querySelector(".page-container") as HTMLElement | null) ?? doc.body;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (html2pdf as any)()
      .set({
        margin: 0,
        filename,
        image: { type: "jpeg", quality: 0.98 },
        html2canvas: {
          scale: 2,
          useCORS: true,
          letterRendering: true,
          backgroundColor: "#ffffff",
          windowWidth: 1200,
        },
        jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
        pagebreak: { mode: ["css", "legacy"] },
      })
      .from(rootEl)
      .save();
  } finally {
    iframe.remove();
  }
}

function pad3(n: number): string {
  const v = Math.max(0, Math.trunc(n));
  return String(v).padStart(3, "0");
}

function yy(iso: string): string {
  const y = (iso || "").slice(2, 4);
  return y && y.length === 2 ? y : new Date().getFullYear().toString().slice(2);
}

function mm(iso: string): string {
  const m = (iso || "").slice(5, 7);
  return m && m.length === 2 ? m : String(new Date().getMonth() + 1).padStart(2, "0");
}

type SidebarModule =
  | "companies"
  | "projects"
  | "folders"
  | "notes"
  | "suppliers"
  | "storeOrders"
  | "customerOrders"
  | "priceCalculations"
  | "instructions"
  | "cashReport"
  | "appUsers"
  | "systemPermissions"
  | "workLeave"
  | "settings";

type CompanyFormMode = "list" | "form";
type ProjectFormMode = "list" | "form";
type OfferFormMode = "list" | "form";
type OrderFormMode = "list" | "form";
type SystemUserFormMode = "list" | "form";
type LeaveFormMode = "list" | "form";
type AppUserFormMode = "list" | "form";

type AppUserDraft = {
  username: string;
  name: string;
  password: string;
  currentPassword: string;
  role: AppUserRole;
};

type PermissionEditDraft = {
  memberId: string;
  modules: PermissionModuleId[];
};

type LeaveRequestDraft = {
  employeeId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
};

function emptyAppUserDraft(): AppUserDraft {
  return { username: "", name: "", password: "", currentPassword: "", role: "employee" };
}

function emptyLeaveRequestDraft(employeeId = ""): LeaveRequestDraft {
  return {
    employeeId,
    leaveType: "annual",
    startDate: new Date().toISOString().slice(0, 10),
    endDate: new Date().toISOString().slice(0, 10),
    reason: "",
  };
}

type StoreOrderDraft = {
  orderDate: string;
  status: OrderStatus;
  note: string;
  rows: OrderLineRow[];
};

type CustomerOrderDraft = {
  customerName: string;
  customerPhone: string;
  orderDate: string;
  status: OrderStatus;
  note: string;
  rows: OrderLineRow[];
};

function emptyStoreOrderDraft(): StoreOrderDraft {
  return {
    orderDate: new Date().toISOString().slice(0, 10),
    status: "draft",
    note: "",
    rows: [newOrderLineRow()],
  };
}

function emptyCustomerOrderDraft(): CustomerOrderDraft {
  return {
    customerName: "",
    customerPhone: "",
    orderDate: new Date().toISOString().slice(0, 10),
    status: "draft",
    note: "",
    rows: [newOrderLineRow()],
  };
}

type OrderModuleKind = "storeOrder" | "customerOrder";

function normalizeOrderDraftRows(rows: OrderLineRow[]): OrderLineRow[] {
  return rows
    .map((r) => ({
      ...r,
      name: r.name.trim(),
      supplierName: r.supplierName.trim(),
      qty: Number(r.qty) || 0,
      purchasePrice: Number(r.purchasePrice) || 0,
    }))
    .filter((r) => r.name.length > 0 && r.supplierName.length > 0 && r.qty > 0 && r.purchasePrice > 0);
}

function orderPurchaseTotal(rows: OrderLineRow[]): number {
  return rows.reduce((sum, r) => sum + r.qty * r.purchasePrice, 0);
}

function orderSuppliers(rows: OrderLineRow[]): string[] {
  const names = new Map<string, string>();
  for (const row of rows) {
    const trimmed = row.supplierName.trim();
    if (!trimmed) continue;
    const key = trimmed.toLowerCase();
    if (!names.has(key)) names.set(key, trimmed);
  }
  return [...names.values()];
}

function buildOrderSupplierPdfHtml(params: {
  title: string;
  orderDate: string;
  supplierName: string;
  rows: OrderLineRow[];
  customerName?: string;
}): string {
  const rowsHtml = params.rows
    .map((r, i) => {
      const qty = Number(r.qty) || 0;
      const unit = Number(r.purchasePrice) || 0;
      const lineTotal = qty * unit;
      return `<tr>
        <td class="num">${i + 1}</td>
        <td>${escapeHtml(r.name || "—")}</td>
        <td class="num">${qty.toLocaleString("az-AZ", { maximumFractionDigits: 2 })}</td>
        <td class="num">${escapeHtml(formatMoney(unit))}</td>
        <td class="num">${escapeHtml(formatMoney(lineTotal))}</td>
      </tr>`;
    })
    .join("");

  const total = orderPurchaseTotal(params.rows);
  const customerRow = params.customerName
    ? `<tr><td class="meta-key">Müştəri</td><td class="meta-value">${escapeHtml(params.customerName)}</td></tr>`
    : "";

  return `<!doctype html>
<html lang="az">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(params.title)}</title>
  <style>
    @page { size: A4; margin: 10mm; }
    body {
      margin: 0;
      font-family: Arial, Helvetica, sans-serif;
      color: #111827;
      font-size: 12px;
      line-height: 1.35;
      -webkit-print-color-adjust: exact;
      print-color-adjust: exact;
      background: #fff;
    }
    .doc { width: 100%; margin: 0 auto; }
    .title {
      margin: 0 0 10px;
      padding: 8px 10px;
      background: #343434;
      color: #fff;
      font-size: 16px;
      font-weight: 700;
      letter-spacing: 0.02em;
      text-transform: uppercase;
      border: 1px solid #2b2b2b;
    }
    .meta-table,
    .items-table {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }
    .meta-table {
      margin-bottom: 10px;
      border: 1px solid #cfd4dc;
    }
    .meta-table td {
      padding: 6px 8px;
      border-bottom: 1px solid #e5e7eb;
    }
    .meta-table tr:last-child td { border-bottom: none; }
    .meta-key {
      width: 110px;
      font-weight: 700;
      background: #f8fafc;
      border-right: 1px solid #e5e7eb;
    }
    .meta-value { color: #1f2937; }
    .items-table {
      border: 1px solid #cfd4dc;
    }
    .items-table th {
      background: #343434;
      color: #fff;
      text-align: left;
      font-weight: 700;
      padding: 7px 8px;
      border-right: 1px solid #5a5a5a;
      text-transform: uppercase;
      letter-spacing: 0.03em;
      font-size: 11px;
    }
    .items-table th:last-child { border-right: none; }
    .items-table td {
      padding: 7px 8px;
      border-top: 1px solid #e5e7eb;
      border-right: 1px solid #eef1f4;
      vertical-align: top;
      word-wrap: break-word;
    }
    .items-table td:last-child { border-right: none; }
    .items-table tbody tr:nth-child(even) td { background: #fafafa; }
    .num { text-align: right; font-variant-numeric: tabular-nums; }
    .total-row td {
      font-weight: 700;
      background: #f3f4f6 !important;
      border-top: 2px solid #cfd4dc;
    }
    .total-label { text-align: right; }
    .foot {
      margin-top: 12px;
      display: table;
      width: 100%;
    }
    .foot-cell {
      display: table-cell;
      width: 50%;
      vertical-align: top;
      padding-top: 18px;
      font-size: 11px;
      color: #374151;
    }
    .sign-line {
      margin-top: 26px;
      border-top: 1px solid #9ca3af;
      width: 80%;
      padding-top: 4px;
      color: #4b5563;
    }
  </style>
</head>
<body>
  <div class="doc">
    <h1 class="title">${escapeHtml(params.title)}</h1>
    <table class="meta-table" aria-label="Sifariş məlumatı">
      <tbody>
        <tr><td class="meta-key">Tarix</td><td class="meta-value">${escapeHtml(formatDateAzLong(params.orderDate))}</td></tr>
        <tr><td class="meta-key">Təchizatçı</td><td class="meta-value">${escapeHtml(params.supplierName)}</td></tr>
        ${customerRow}
        <tr><td class="meta-key">Sətir sayı</td><td class="meta-value">${params.rows.length}</td></tr>
      </tbody>
    </table>

    <table class="items-table" aria-label="Məhsul cədvəli">
      <thead>
        <tr>
          <th style="width: 44px;" class="num">№</th>
          <th>Məhsul</th>
          <th style="width: 90px;" class="num">Miqdar</th>
          <th style="width: 130px;" class="num">Alış qiyməti</th>
          <th style="width: 130px;" class="num">Cəm</th>
        </tr>
      </thead>
      <tbody>${rowsHtml}</tbody>
      <tfoot>
        <tr class="total-row">
          <td colspan="4" class="total-label">YEKUN</td>
          <td class="num">${escapeHtml(formatMoney(total))}</td>
        </tr>
      </tfoot>
    </table>

    <div class="foot">
      <div class="foot-cell">
        Hazırladı:
        <div class="sign-line">İmza</div>
      </div>
      <div class="foot-cell">
        Təhvil aldı:
        <div class="sign-line">İmza</div>
      </div>
    </div>
  </div>
</body>
</html>`;
}

type ProjectDraft = {
  title: string;
  companyId: string;
  rows: ProductRow[];
  meta: DocumentMeta;
  vatPercent: number;
  billingMode?: "official" | "cash";
};

function emptyProjectDraft(): ProjectDraft {
  return {
    title: "",
    companyId: "",
    rows: [],
    meta: emptyMeta(),
    vatPercent: 0,
  };
}

type ReqFieldSpec = {
  key: keyof CompanyProfile;
  label: string;
  placeholder?: string;
  /** İki sütunda tam en və ya yarım */
  span?: "full" | "half";
};

const COMPANY_FIELD_GROUPS: { title: string; fields: ReqFieldSpec[] }[] = [
  {
    title: "Bank rekvizitləri",
    fields: [
      { key: "currency", label: "Valyuta", placeholder: "AZN", span: "half" },
      { key: "branchCode", label: "Filialın kodu", span: "half" },
      { key: "bankVoen", label: "Bankın VÖEN-i", placeholder: "9900003611", span: "half" },
      { key: "bankSwift", label: "SWIFT kodu", placeholder: "AIIBAZ2XXXX", span: "half" },
      { key: "bankName", label: "Benefisiarın bankı", span: "full" },
      { key: "correspondentAccount", label: "Müxbir hesab", placeholder: "İBAN", span: "full" },
    ],
  },
  {
    title: "Benefisiar",
    fields: [
      { key: "name", label: "Benefisiarın adı", placeholder: '"ABC" MMC', span: "full" },
      { key: "voen", label: "Benefisiarın VÖEN-i", placeholder: "1234567891", span: "half" },
      { key: "accountManat", label: "Benefisiarın hesabı", placeholder: "İBAN", span: "half" },
      { key: "address", label: "Ünvan", span: "full" },
    ],
  },
  {
    title: "Əlaqə və direktor",
    fields: [
      { key: "phone", label: "Telefon", span: "half" },
      { key: "fax", label: "Faks", span: "half" },
      { key: "email", label: "E-poçt", span: "half" },
      { key: "director", label: "Direktor", placeholder: "Tam ad (imza)", span: "half" },
    ],
  },
];

const SIDEBAR_MODULES: { id: SidebarModule; label: string }[] = [
  { id: "cashReport", label: "Kassa hesabatı" },
  { id: "companies", label: "Şirkətlər" },
  { id: "projects", label: "Təkliflər" },
  { id: "folders", label: "Qovluqlar" },
  { id: "notes", label: "Qeydlər" },
  { id: "suppliers", label: "Təchizatçı təklifləri" },
  { id: "storeOrders", label: "Mağaza sifarişi" },
  { id: "customerOrders", label: "Müştəri sifarişi" },
  { id: "priceCalculations", label: "Qiymət hesablanması" },
  { id: "instructions", label: "Təlimat" },
  { id: "appUsers", label: "İstifadəçilər" },
  { id: "systemPermissions", label: "Sistem icazələri" },
  { id: "workLeave", label: "İş icazələri" },
  { id: "settings", label: "Ayarlar" },
];

const SIDEBAR_SYSTEM_IDS: SidebarModule[] = ["appUsers", "systemPermissions", "workLeave", "settings"];

const SIDEBAR_MAIN_IDS: SidebarModule[] = [
  "cashReport",
  "companies",
  "projects",
  "folders",
  "notes",
  "suppliers",
  "storeOrders",
  "customerOrders",
  "priceCalculations",
  "instructions",
];

const MODULE_TAGLINE: Record<SidebarModule, string> = {
  companies: "",
  projects: "Sənəd təklifləri siyahısı",
  folders: "",
  notes: "",
  suppliers: "Təchizatçı qiymət təklifləri",
  storeOrders: "Digər modullardan asılı olmayan mağaza sifarişləri",
  customerOrders: "Digər modullardan asılı olmayan müştəri sifarişləri",
  priceCalculations: "Qiymət hesablanması — tezliklə",
  instructions: "Qiymət və faiz qaydalarının idarə edilməsi",
  cashReport: "Nağd və kart hesablarının gündəlik balansı",
  appUsers: "Giriş hesablarının idarə edilməsi",
  systemPermissions: "Modul giriş icazələri",
  workLeave: "İşçi sorğuları və direktor təsdiqi",
  settings: "",
};

function preferredModuleForSession(
  _member: SystemUserRecord | null,
  access: Set<PermissionModuleId> | null,
): SidebarModule {
  if (!access || access.has("cashReport")) return "cashReport";
  for (const id of SIDEBAR_MAIN_IDS) {
    if (access.has(id as PermissionModuleId)) return id;
  }
  if (access.has("workLeave")) return "workLeave";
  return "companies";
}

function isModuleAccessible(
  mod: SidebarModule,
  access: Set<PermissionModuleId> | null,
  opts: { canManageUsers: boolean; canManageSystemUsers: boolean; canReviewLeave: boolean },
): boolean {
  if (!access) return true;
  if (mod === "settings") return false;
  if (mod === "appUsers") return opts.canManageUsers;
  if (mod === "systemPermissions") return opts.canManageSystemUsers;
  if (mod === "workLeave") return opts.canReviewLeave || access.has("workLeave");
  if (SIDEBAR_MAIN_IDS.includes(mod)) return access.has(mod as PermissionModuleId);
  return false;
}

type ToastKind = "success" | "error";

function flash(
  setter: (s: { kind: ToastKind; msg: string } | null) => void,
  msg: string,
  kind: ToastKind = "success",
) {
  setter({ kind, msg });
  window.setTimeout(() => setter(null), 2600);
}

function softBeep(): void {
  try {
    const Ctx =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 880;
    gain.gain.value = 0.0001;
    osc.connect(gain);
    gain.connect(ctx.destination);
    const t = ctx.currentTime;
    gain.gain.setValueAtTime(0.0001, t);
    gain.gain.exponentialRampToValueAtTime(0.05, t + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.11);
    osc.start(t);
    osc.stop(t + 0.12);
    osc.onended = () => ctx.close().catch(() => {});
  } catch {
    /* ignore */
  }
}

function SvgIcon(props: { children: ReactNode }) {
  return (
    <svg
      className="dg-icon-svg"
      width="17"
      height="17"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      {props.children}
    </svg>
  );
}

function IconInfo() {
  return (
    <SvgIcon>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4" />
      <path d="M12 8h.01" />
    </SvgIcon>
  );
}

function IconEdit() {
  return (
    <SvgIcon>
      <path d="M17 3a2.85 2.83 0 1 1 4 4L7 21l-4 1 1-4 12.5-12.5Z" />
      <path d="m15 5 4 4" />
    </SvgIcon>
  );
}

function IconTrash() {
  return (
    <SvgIcon>
      <path d="M3 6h18" />
      <path d="M8 6V4h8v2" />
      <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
      <path d="M10 11v6M14 11v6" />
    </SvgIcon>
  );
}

function IconKey() {
  return (
    <SvgIcon>
      <circle cx="8" cy="15" r="4" />
      <path d="m11 12 9-9" />
      <path d="M16 5h3v3" />
    </SvgIcon>
  );
}

function OrderStatusBadge(props: { status: OrderStatus }) {
  return (
    <span className={`dg-order-status ${orderStatusModifier(props.status)}`}>{orderStatusLabel(props.status)}</span>
  );
}

function OrderStatusPicker(props: { status: OrderStatus; onChange: (status: OrderStatus) => void }) {
  return (
    <select
      className={`dg-order-status dg-order-status-select ${orderStatusModifier(props.status)}`}
      value={props.status}
      onChange={(e) => props.onChange(e.target.value as OrderStatus)}
      aria-label="Status dəyiş"
      title="Statusu dəyişmək üçün seçin"
    >
      {ORDER_STATUS_OPTIONS.map((o) => (
        <option key={o.value} value={o.value}>
          {o.label}
        </option>
      ))}
    </select>
  );
}

function LeaveStatusBadge(props: { status: LeaveRequestStatus }) {
  return (
    <span className={`dg-leave-status ${leaveStatusModifier(props.status)}`}>{leaveStatusLabel(props.status)}</span>
  );
}

function IconPrint() {
  return (
    <SvgIcon>
      <path d="M6 9V3h12v6" />
      <path d="M6 18H4a2 2 0 0 1-2-2v-4a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v4a2 2 0 0 1-2 2h-2" />
      <path d="M6 14h12v7H6z" />
    </SvgIcon>
  );
}

function SidebarNavIcon(props: { mod: SidebarModule }) {
  const cls = "dg-nav-icon";
  switch (props.mod) {
    case "companies":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M17 20h5v-2a3 3 0 00-5.356-1.857M17 20H7m10 0v-2c0-.656-.126-1.283-.356-1.857M7 20H2v-2a3 3 0 015.356-1.857M7 20v-2c0-.656.126-1.283.356-1.857m0 0a5.002 5.002 0 019.288 0M15 7a3 3 0 11-6 0 3 3 0 016 0zm6 3a2 2 0 11-4 0 2 2 0 014 0zM7 10a2 2 0 11-4 0 2 2 0 014 0z"
          />
        </svg>
      );
    case "projects":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"
          />
        </svg>
      );
    case "folders":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v8a3 3 0 0 1-3 3H6a3 3 0 0 1-3-3V7z"
          />
          <path strokeWidth="2" strokeLinecap="round" d="M3 10h18" />
        </svg>
      );
    case "notes":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 3h6a2 2 0 0 1 2 2v16l-2-1-2 1-2-1-2 1-2-1-2 1V5a2 2 0 0 1 2-2z"
          />
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 8h6M9 12h6M9 16h6" />
        </svg>
      );
    case "suppliers":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 7h11v10H3V7zm11 3h4l3 3v4h-7v-7z"
          />
          <circle cx="7.5" cy="18" r="1.5" strokeWidth="2" />
          <circle cx="17.5" cy="18" r="1.5" strokeWidth="2" />
        </svg>
      );
    case "storeOrders":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 9l9-7 9 7v11a2 2 0 01-2 2H5a2 2 0 01-2-2V9z"
          />
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 22V12h6v10" />
        </svg>
      );
    case "customerOrders":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
          />
        </svg>
      );
    case "priceCalculations":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M9 7h6m-6 4h6m-6 4h3M7 3h10a2 2 0 012 2v14l-4-2-4 2-4-2-4 2V5a2 2 0 012-2z"
          />
        </svg>
      );
    case "instructions":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253"
          />
        </svg>
      );
    case "cashReport":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <rect x="3" y="6" width="18" height="13" rx="2" strokeWidth="2" />
          <path strokeWidth="2" strokeLinecap="round" d="M3 10h18" />
          <circle cx="12" cy="15" r="2.5" strokeWidth="2" />
          <path strokeWidth="2" strokeLinecap="round" d="M7 3v3M17 3v3" />
        </svg>
      );
    case "systemPermissions":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M12 3l7 4v5c0 4.418-3.134 8.149-7 9-3.866-.851-7-4.582-7-9V7l7-4z"
          />
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M9 12l2 2 4-4" />
        </svg>
      );
    case "appUsers":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M16 21v-2a4 4 0 00-4-4H6a4 4 0 00-4 4v2M9 7a4 4 0 100 8 4 4 0 000-8zM19 8v6M22 11h-6"
          />
        </svg>
      );
    case "workLeave":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 7V3m8 4V3M4 11h16M5 21h14a2 2 0 002-2V7H3v12a2 2 0 002 2z"
          />
        </svg>
      );
    case "settings":
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" aria-hidden>
          <path
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"
          />
          <path strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
        </svg>
      );
    default:
      return null;
  }
}

function IconMenuBars() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
    </svg>
  );
}

function IconSearchSidebar() {
  return (
    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <circle cx="11" cy="11" r="7" />
      <path strokeLinecap="round" d="M21 21l-4.35-4.35" />
    </svg>
  );
}

function IconLogout() {
  return (
    <SvgIcon>
      <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
      <path d="M16 17l5-5-5-5" />
      <path d="M21 12H9" />
    </SvgIcon>
  );
}

function IconBell() {
  return (
    <SvgIcon>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </SvgIcon>
  );
}

function IconFolder() {
  return (
    <svg width="62" height="50" viewBox="0 0 62 50" fill="none" aria-hidden>
      <path
        d="M6 10.5C6 7.74 8.24 5.5 11 5.5H25.4c1.2 0 2.35.48 3.2 1.33l2.55 2.55c.7.7 1.65 1.1 2.64 1.1H51c2.76 0 5 2.24 5 5v21c0 4.14-3.36 7.5-7.5 7.5H13.5C9.36 44 6 40.64 6 36.5v-26Z"
        fill="#F4C542"
      />
      <path
        d="M6 16.5c0-2.76 2.24-5 5-5h40c2.76 0 5 2.24 5 5v20c0 4.14-3.36 7.5-7.5 7.5H13.5C9.36 44 6 40.64 6 36.5v-20Z"
        fill="#F6D365"
      />
      <path
        d="M10.5 14.5h41"
        stroke="#D3A22B"
        strokeWidth="1.4"
        strokeLinecap="round"
        opacity="0.85"
      />
    </svg>
  );
}

function companyInfoLines(c: CompanyProfile): { label: string; value: string }[] {
  return [
    { label: "Valyuta", value: c.currency },
    { label: "Benefisiarın bankı", value: c.bankName },
    { label: "Filialın kodu", value: c.branchCode },
    { label: "Bankın VÖEN-i", value: c.bankVoen },
    { label: "SWIFT kodu", value: c.bankSwift },
    { label: "Müxbir hesab", value: c.correspondentAccount },
    { label: "Benefisiarın adı", value: c.name },
    { label: "Benefisiarın hesabı", value: c.accountManat },
    { label: "Benefisiarın VÖEN-i", value: c.voen },
    { label: "Ünvan", value: c.address },
    { label: "Telefon", value: c.phone },
    { label: "Faks", value: c.fax },
    { label: "E-poçt", value: c.email },
    { label: "Direktor", value: c.director },
  ].filter((x) => x.value.trim());
}

function parseDatetimeLocal(s: string): number | null {
  const v = (s || "").trim();
  if (!v) return null;
  // datetime-local: YYYY-MM-DDTHH:mm (seconds optional)
  const m = v.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2}))?$/);
  if (!m) return null;
  const [, yyS, mmS, ddS, hhS, minS, secS] = m;
  const y = Number(yyS);
  const mo = Number(mmS) - 1;
  const d = Number(ddS);
  const h = Number(hhS);
  const mi = Number(minS);
  const se = secS ? Number(secS) : 0;
  if (![y, mo, d, h, mi, se].every((x) => Number.isFinite(x))) return null;
  const dt = new Date(y, mo, d, h, mi, se, 0);
  const t = dt.getTime();
  return Number.isFinite(t) ? t : null;
}

type AuthState =
  | { status: "loading" }
  | { status: "signedOut" }
  | { status: "signedIn"; user: User }
  | { status: "disabled" };

function calcSaleFromMargin(purchase: number, marginPercent: number): number {
  if (!Number.isFinite(purchase) || purchase <= 0) return 0;
  if (!Number.isFinite(marginPercent)) return purchase;
  return Math.round(purchase * (1 + marginPercent / 100) * 100) / 100;
}

const SUPPLIER_OFFER_PROJECT_VAT_PERCENT = OFFICIAL_VAT_PERCENT;

function attachOfficialSaleVat<T extends { saleOfficial: number }>(totals: T) {
  const saleOfficialVat = roundMoney(totals.saleOfficial * (OFFICIAL_VAT_PERCENT / 100));
  return {
    ...totals,
    saleOfficialVat,
    saleOfficialGrand: roundMoney(totals.saleOfficial + saleOfficialVat),
  };
}

function roundMoney(n: number): number {
  return Math.round(n * 100) / 100;
}

function offerVatMultiplier(): number {
  return 1 + SUPPLIER_OFFER_PROJECT_VAT_PERCENT / 100;
}

type OfferRowDraft = {
  id: string;
  supplierName: string;
  name: string;
  replacementName: string;
  purchasePrice: string;
  purchasePriceWithVat: string;
  /** Son redaktə olunan alış sahəsi — faiz hesabı üçün */
  purchasePriceSource: "ex" | "inc";
  qty: string;
  marginPercent: string;
  salePrice: string;
  saleManual: boolean;
};

function resolvePurchaseExVat(row: { purchasePrice?: number; purchasePriceWithVat?: number }): number {
  const ex = Number(row.purchasePrice) || 0;
  if (ex > 0) return ex;
  const inc = Number(row.purchasePriceWithVat) || 0;
  if (inc > 0) return roundMoney(inc / offerVatMultiplier());
  return 0;
}

function resolvePurchaseIncVat(row: { purchasePrice?: number; purchasePriceWithVat?: number }): number {
  const inc = Number(row.purchasePriceWithVat) || 0;
  if (inc > 0) return inc;
  const ex = Number(row.purchasePrice) || 0;
  if (ex > 0) return roundMoney(ex * offerVatMultiplier());
  return 0;
}

function resolveOfferPurchaseFromDraft(row: OfferRowDraft): number {
  const ex = Number(String(row.purchasePrice).replace(",", ".")) || 0;
  if (ex > 0) return ex;
  const inc = Number(String(row.purchasePriceWithVat).replace(",", ".")) || 0;
  if (inc > 0) return roundMoney(inc / offerVatMultiplier());
  return 0;
}

function resolveOfferPurchaseIncFromDraft(row: OfferRowDraft): number {
  const inc = Number(String(row.purchasePriceWithVat).replace(",", ".")) || 0;
  if (inc > 0) return inc;
  const ex = Number(String(row.purchasePrice).replace(",", ".")) || 0;
  if (ex > 0) return roundMoney(ex * offerVatMultiplier());
  return 0;
}

function draftPurchaseForMargin(row: OfferRowDraft): number {
  if (row.purchasePriceSource === "inc") {
    const inc = Number(String(row.purchasePriceWithVat).replace(",", ".")) || 0;
    if (inc > 0) return inc;
    return resolveOfferPurchaseIncFromDraft(row);
  }
  const ex = Number(String(row.purchasePrice).replace(",", ".")) || 0;
  if (ex > 0) return ex;
  return resolveOfferPurchaseFromDraft(row);
}

type OfferDraft = {
  companyId: string;
  offerDate: string;
  rows: OfferRowDraft[];
};

function emptyOfferRow(): OfferRowDraft {
  return {
    id: crypto.randomUUID(),
    supplierName: "",
    name: "",
    replacementName: "",
    purchasePrice: "",
    purchasePriceWithVat: "",
    purchasePriceSource: "ex",
    qty: "1",
    marginPercent: "",
    salePrice: "",
    saleManual: false,
  };
}

function emptyOfferDraft(): OfferDraft {
  return {
    companyId: "",
    offerDate: new Date().toISOString().slice(0, 10),
    rows: [emptyOfferRow()],
  };
}

function resolveOfferSalePriceSource(row: {
  purchasePrice?: number;
  purchasePriceWithVat?: number;
  purchasePriceSource?: "ex" | "inc";
}): "ex" | "inc" {
  if (row.purchasePriceSource === "inc" || row.purchasePriceSource === "ex") return row.purchasePriceSource;
  const ex = Number(row.purchasePrice) || 0;
  const inc = Number(row.purchasePriceWithVat) || 0;
  if (inc > 0 && ex <= 0) return "inc";
  return "ex";
}

function resolveOfferSalePriceSourceFromDraft(row: OfferRowDraft): "ex" | "inc" {
  return resolveOfferSalePriceSource({
    purchasePrice: Number(String(row.purchasePrice).replace(",", ".")) || 0,
    purchasePriceWithVat: Number(String(row.purchasePriceWithVat).replace(",", ".")) || 0,
    purchasePriceSource: row.purchasePriceSource,
  });
}

function resolveOfferSaleUnitPrice(row: SupplierOfferRow, billingMode: "official" | "cash" = "official"): number {
  const margin = parseMarginPercent(row.marginPercent);
  const ex = resolvePurchaseExVat(row);
  const inc = resolvePurchaseIncVat(row);
  const sale = Number(row.salePrice) || 0;
  const source = resolveOfferSalePriceSource(row);

  if (billingMode === "cash") {
    if (offerRowHasIncPurchase(row)) {
      if (sale > 0 && source === "inc") return sale;
      if (margin != null && inc > 0) return calcSaleFromMargin(inc, margin);
      if (inc > 0) return inc;
    }
    if (margin != null && inc > 0) return calcSaleFromMargin(inc, margin);
    if (sale > 0 && source === "ex") return roundMoney(sale * offerVatMultiplier());
    if (sale > 0) return sale;
    return 0;
  }

  if (margin != null && ex > 0) return calcSaleFromMargin(ex, margin);
  if (sale > 0 && source === "ex") return sale;
  if (sale > 0 && source === "inc") return roundMoney(sale / offerVatMultiplier());
  if (ex > 0) return ex;
  return 0;
}

function resolveOfferSaleFromDraft(row: OfferRowDraft, billingMode: "official" | "cash" = "official"): number {
  const margin = parseMarginPercent(row.marginPercent);
  const ex = resolveOfferPurchaseFromDraft(row);
  const inc = resolveOfferPurchaseIncFromDraft(row);
  const sale = Number(String(row.salePrice).replace(",", ".")) || 0;
  const source = resolveOfferSalePriceSourceFromDraft(row);

  if (billingMode === "cash") {
    if (offerDraftHasIncPurchase(row)) {
      if (sale > 0 && source === "inc") return sale;
      if (margin != null && inc > 0) return calcSaleFromMargin(inc, margin);
      if (inc > 0) return inc;
    }
    if (margin != null && inc > 0) return calcSaleFromMargin(inc, margin);
    if (sale > 0 && source === "ex") return roundMoney(sale * offerVatMultiplier());
    if (sale > 0) return sale;
    return 0;
  }

  if (margin != null && ex > 0) return calcSaleFromMargin(ex, margin);
  if (sale > 0 && source === "ex") return sale;
  if (sale > 0 && source === "inc") return roundMoney(sale / offerVatMultiplier());
  if (ex > 0) return ex;
  return 0;
}

function offerDraftTotals(rows: OfferRowDraft[]) {
  const base = rows.reduce(
    (acc, r) => {
      const qty = Number(String(r.qty).replace(",", ".")) || 0;
      acc.purchaseEx += resolveOfferPurchaseFromDraft(r) * qty;
      acc.purchaseInc += resolveOfferPurchaseIncFromDraft(r) * qty;
      acc.saleOfficial += resolveOfferSaleFromDraft(r, "official") * qty;
      acc.saleCash += resolveOfferSaleFromDraft(r, "cash") * qty;
      return acc;
    },
    { purchaseEx: 0, purchaseInc: 0, saleOfficial: 0, saleCash: 0 },
  );
  return attachOfficialSaleVat(base);
}

function offerRowTotals(rows: SupplierOfferRow[]) {
  let purchaseEx = 0;
  let purchaseInc = 0;
  let saleOfficial = 0;
  let saleCash = 0;
  for (const r of rows) {
    const q = Number(r.qty) || 0;
    purchaseEx += resolvePurchaseExVat(r) * q;
    purchaseInc += resolvePurchaseIncVat(r) * q;
    saleOfficial += resolveOfferSaleUnitPrice(r, "official") * q;
    saleCash += resolveOfferSaleUnitPrice(r, "cash") * q;
  }
  return attachOfficialSaleVat({
    purchaseEx,
    purchaseInc,
    purchase: purchaseEx,
    sale: saleOfficial,
    saleCash,
    saleOfficial,
  });
}

function offerSuppliersLabel(rows: SupplierOfferRow[]): string {
  const names = [...new Set(rows.map((r) => r.supplierName.trim()).filter(Boolean))];
  if (names.length === 0) return "—";
  if (names.length === 1) return names[0];
  if (names.length === 2) return names.join(", ");
  return `${names.slice(0, 2).join(", ")} +${names.length - 2}`;
}

function resolveOfferProductName(row: { name: string; replacementName?: string }): string {
  const replacement = (row.replacementName ?? "").trim();
  if (replacement) return replacement;
  return row.name.trim();
}

function resolveOfferProductNameFromDraft(row: OfferRowDraft): string {
  const replacement = row.replacementName.trim();
  if (replacement) return replacement;
  return row.name.trim();
}

function parseMarginPercent(value: string | number | undefined): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return null;
    const n = Number(trimmed.replace(",", "."));
    return Number.isFinite(n) ? n : null;
  }
  return null;
}

function offerRowHasIncPurchase(row: { purchasePriceWithVat?: number }): boolean {
  return (Number(row.purchasePriceWithVat) || 0) > 0;
}

function offerDraftHasIncPurchase(row: OfferRowDraft): boolean {
  return (Number(String(row.purchasePriceWithVat).replace(",", ".")) || 0) > 0;
}

function buildOfferProductRows(
  rows: SupplierOfferRow[],
  billingMode: "official" | "cash",
): ProductRow[] {
  const out: ProductRow[] = [];
  for (const r of rows) {
    const unitPrice = resolveOfferSaleUnitPrice(r, billingMode);
    const name = resolveOfferProductName(r);
    if (unitPrice <= 0 || !name) continue;
    out.push({
      id: crypto.randomUUID(),
      name,
      unit: "ədəd",
      qty: r.qty,
      unitPrice,
    });
  }
  return out;
}

function buildOfferProductRowsFromDraft(
  rows: OfferRowDraft[],
  billingMode: "official" | "cash",
): ProductRow[] {
  const out: ProductRow[] = [];
  for (const row of rows) {
    const supplierName = row.supplierName.trim();
    const name = resolveOfferProductNameFromDraft(row);
    const qty = Number(String(row.qty).replace(",", "."));
    const unitPrice = resolveOfferSaleFromDraft(row, billingMode);
    if (!supplierName || !name || !Number.isFinite(qty) || qty <= 0 || unitPrice <= 0) continue;
    out.push({
      id: crypto.randomUUID(),
      name,
      unit: "ədəd",
      qty,
      unitPrice,
    });
  }
  return out;
}

export default function App() {
  // Firebase yoxdursa lokal localStorage rejimində qalırıq.
  const initialAuth: AuthState = firebaseEnabled ? { status: "loading" } : { status: "disabled" };
  const [authState, setAuthState] = useState<AuthState>(initialAuth);
  const [authError, setAuthError] = useState<string>("");
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [loginIdentifier, setLoginIdentifier] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");

  const [sessionKind, setSessionKind] = useState<"developer" | "member" | "local">("local");
  const [currentMember, setCurrentMember] = useState<SystemUserRecord | null>(null);
  const [orgMembers, setOrgMembers] = useState<SystemUserRecord[]>([]);
  const [forcePasswordChange, setForcePasswordChange] = useState(false);
  const [newPasswordDraft, setNewPasswordDraft] = useState("");
  const [newPasswordConfirm, setNewPasswordConfirm] = useState("");
  const forcePasswordDialogRef = useRef<HTMLDialogElement>(null);

  const [workspace, setWorkspace] = useState<DocWorkspace>(() => normalizeWorkspace(loadWorkspaceLocal()));
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;
  // Remote ilə yerli arasında "echo" yazıların qarşısını almaq üçün son sinxronlaşmış JSON
  const lastSyncedJsonRef = useRef<string>("");
  /** Serverə göndərilmiş, snapshot ilə təsdiqlənməyi gözləyən yazı */
  const lastWrittenJsonRef = useRef<string>("");
  // Yerli dəyişiklik remote-a yazılmamışdırsa snapshot köhnə məlumatı geri qaytarmasın
  const pendingLocalWriteRef = useRef(false);
  const remoteWriteTimerRef = useRef<number | null>(null);
  const remoteWriteRetryTimerRef = useRef<number | null>(null);
  const remoteWriteInFlightRef = useRef(false);
  // İlk snapshot gəlmədən yazmaq olmaz (yoxsa migration ilə yaza bilərik)
  const remoteReadyRef = useRef<boolean>(false);
  /** Kassa dəyişikliyi remote-a yazılmamışdırsa snapshot köhnə məlumatı geri qaytarmasın */
  const cashReportDirtyRef = useRef(false);
  /** Remote/workspace sinxronizasiyasından sonra köhnə kassa draft-larını sıfırlamaq */
  const cashExternalSyncRef = useRef(false);
  /** İlk workspace bootstrap bitənə qədər snapshot tətbiq etmə */
  const workspaceSyncReadyRef = useRef(!firebaseEnabled);
  const [cashReportHydrated, setCashReportHydrated] = useState(!firebaseEnabled);
  /** remoteReadyRef dəyişəndə debounced yazını yenidən işə salmaq üçün */
  const [remoteSyncEpoch, setRemoteSyncEpoch] = useState(0);
  const sessionModuleAppliedRef = useRef(false);
  const prevMemberModulesRef = useRef<PermissionModuleId[]>([]);
  const [module, setModule] = useState<SidebarModule>("cashReport");
  const [toast, setToast] = useState<{ kind: ToastKind; msg: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navSearch, setNavSearch] = useState("");
  const navSearchRef = useRef<HTMLInputElement>(null);
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const notificationsRef = useRef<HTMLDivElement>(null);
  const [projectProductSearch, setProjectProductSearch] = useState("");

  const [noteEditId, setNoteEditId] = useState<string | null>(null);
  const [noteDraft, setNoteDraft] = useState<Pick<NoteRecord, "title" | "body" | "remindAt">>(() => ({
    title: "",
    body: "",
    remindAt: "",
  }));
  const noteDialogRef = useRef<HTMLDialogElement>(null);
  const [noteDialogOpen, setNoteDialogOpen] = useState(false);
  const [noteDraftStartedAt, setNoteDraftStartedAt] = useState<number>(() => Date.now());

  const [offerEditId, setOfferEditId] = useState<string | null>(null);
  const [offerDraft, setOfferDraft] = useState<OfferDraft>(() => emptyOfferDraft());
  const [offerMode, setOfferMode] = useState<OfferFormMode>("list");

  const [storeOrderEditId, setStoreOrderEditId] = useState<string | null>(null);
  const [storeOrderDraft, setStoreOrderDraft] = useState<StoreOrderDraft>(() => emptyStoreOrderDraft());
  const [storeOrderMode, setStoreOrderMode] = useState<OrderFormMode>("list");

  const [customerOrderEditId, setCustomerOrderEditId] = useState<string | null>(null);
  const [customerOrderDraft, setCustomerOrderDraft] = useState<CustomerOrderDraft>(() => emptyCustomerOrderDraft());
  const [customerOrderMode, setCustomerOrderMode] = useState<OrderFormMode>("list");
  const [priceCalcProductType, setPriceCalcProductType] = useState<PriceCalcProductType>("mobileNew");
  const [priceCalcCostInput, setPriceCalcCostInput] = useState("");
  const [cashHistoryOpen, setCashHistoryOpen] = useState(false);
  const [cashSlotEdits, setCashSlotEdits] = useState<Record<string, string>>({});
  const cashUndoRef = useRef<Map<string, CashReportRow[]>>(new Map());
  const cashNameFocusRef = useRef<Map<string, string>>(new Map());

  const [permissionDraft, setPermissionDraft] = useState<PermissionEditDraft>({ memberId: "", modules: [] });
  const [permissionMode, setPermissionMode] = useState<SystemUserFormMode>("list");

  const [appUserEditId, setAppUserEditId] = useState<string | null>(null);
  const [appUserDraft, setAppUserDraft] = useState<AppUserDraft>(() => emptyAppUserDraft());
  const [appUserMode, setAppUserMode] = useState<AppUserFormMode>("list");

  const [leaveEditId, setLeaveEditId] = useState<string | null>(null);
  const [leaveDraft, setLeaveDraft] = useState<LeaveRequestDraft>(() => emptyLeaveRequestDraft());
  const [leaveMode, setLeaveMode] = useState<LeaveFormMode>("list");
  const [leaveInfoId, setLeaveInfoId] = useState<string | null>(null);
  const leaveInfoDialogRef = useRef<HTMLDialogElement>(null);

  const [companyMode, setCompanyMode] = useState<CompanyFormMode>("list");
  const [companyEditId, setCompanyEditId] = useState<string | null>(null);
  const [companyDraft, setCompanyDraft] = useState<CompanyProfile>(() => emptyCompany());

  const [projectMode, setProjectMode] = useState<ProjectFormMode>("list");
  const [projectEditId, setProjectEditId] = useState<string | null>(null);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(() => emptyProjectDraft());

  const [infoDialog, setInfoDialog] = useState<{
    kind: "company" | "project" | "offer" | "storeOrder" | "customerOrder";
    id: string;
  } | null>(null);
  const printDialogRef = useRef<HTMLDialogElement>(null);
  const [printProjectId, setPrintProjectId] = useState<string | null>(null);
  const orderSupplierPdfDialogRef = useRef<HTMLDialogElement>(null);
  const [orderSupplierPdfTarget, setOrderSupplierPdfTarget] = useState<{ kind: OrderModuleKind; id: string } | null>(null);
  const [orderSupplierPdfSupplier, setOrderSupplierPdfSupplier] = useState("");
  const infoDialogRef = useRef<HTMLDialogElement>(null);
  const confirmDialogRef = useRef<HTMLDialogElement>(null);
  const [confirmDialog, setConfirmDialog] = useState<{
    title: string;
    message: string;
    confirmLabel?: string;
    cancelLabel?: string;
    danger?: boolean;
  } | null>(null);
  const confirmResolverRef = useRef<((v: boolean) => void) | null>(null);
  const promptDialogRef = useRef<HTMLDialogElement>(null);
  const [promptDialog, setPromptDialog] = useState<{
    title: string;
    label: string;
    defaultValue?: string;
    confirmLabel?: string;
    cancelLabel?: string;
    multiline?: boolean;
  } | null>(null);
  const promptResolverRef = useRef<((v: string | null) => void) | null>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);
  const promptTextareaRef = useRef<HTMLTextAreaElement>(null);
  const reminderDialogRef = useRef<HTMLDialogElement>(null);
  const [reminderNote, setReminderNote] = useState<NoteRecord | null>(null);
  const noteInfoDialogRef = useRef<HTMLDialogElement>(null);
  const [noteInfoId, setNoteInfoId] = useState<string | null>(null);

  // 1) Firebase Auth dövriyyəsi
  useEffect(() => {
    if (!firebaseEnabled || !auth) {
      setAuthState({ status: "disabled" });
      setSessionKind("local");
      setCurrentMember(null);
      return;
    }
    const unsub = onAuthStateChanged(auth, async (user) => {
      if (user) {
        const email = user.email ?? "";
        if (isDeveloperAuthEmail(email, firebaseProjectId)) {
          setSessionKind("developer");
          setCurrentMember(null);
          setForcePasswordChange(false);
          try {
            await seedOrgWorkspaceFromUser(user.uid);
          } catch {
            /* ignore */
          }
        } else if (isAppUserAuthEmail(email, firebaseProjectId)) {
          try {
            const member = await fetchOrgMemberOnce(user.uid);
            if (!member || member.disabled) {
              if (auth) await signOut(auth);
              setAuthState({ status: "signedOut" });
              setAuthError("Hesab deaktiv edilib və ya tapılmadı.");
              return;
            }
            setSessionKind("member");
            setCurrentMember(member);
            prevMemberModulesRef.current = [...member.modules];
            setForcePasswordChange(Boolean(member.mustChangePassword));
          } catch {
            setSessionKind("member");
            setCurrentMember(null);
          }
        } else {
          setSessionKind("developer");
          setCurrentMember(null);
        }
        setAuthState({ status: "signedIn", user });
      } else {
        setAuthState({ status: "signedOut" });
        setSessionKind("local");
        setCurrentMember(null);
        setOrgMembers([]);
        setForcePasswordChange(false);
        remoteReadyRef.current = false;
        lastSyncedJsonRef.current = "";
        lastWrittenJsonRef.current = "";
        pendingLocalWriteRef.current = false;
        cashReportDirtyRef.current = false;
        workspaceSyncReadyRef.current = !firebaseEnabled;
        setCashReportHydrated(!firebaseEnabled);
        if (remoteWriteTimerRef.current != null) {
          window.clearTimeout(remoteWriteTimerRef.current);
          remoteWriteTimerRef.current = null;
        }
        if (remoteWriteRetryTimerRef.current != null) {
          window.clearTimeout(remoteWriteRetryTimerRef.current);
          remoteWriteRetryTimerRef.current = null;
        }
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!firebaseEnabled || authState.status !== "signedIn") return;
    const uid = authState.user.uid;
    const unsubs: Array<() => void> = [];

    if (sessionKind === "member") {
      unsubs.push(
        subscribeOrgMember(uid, (member) => {
          if (!member || member.disabled) {
            setCurrentMember(null);
            return;
          }

          const prevModules = prevMemberModulesRef.current;
          const added = member.modules.filter((m) => !prevModules.includes(m));

          setCurrentMember(member);
          prevMemberModulesRef.current = [...member.modules];

          if (member.role === "employee") {
            setOrgMembers([member]);
          }

          if (
            member.role === "employee" &&
            sessionModuleAppliedRef.current &&
            prevModules.length > 0 &&
            added.length > 0
          ) {
            setModule(added[added.length - 1] as SidebarModule);
          }
        }),
      );
    }

    if (sessionKind === "developer") {
      unsubs.push(subscribeOrgMembers((members) => setOrgMembers(members.filter((m) => !m.disabled))));
    }

    return () => {
      for (const unsub of unsubs) unsub();
    };
  }, [authState.status, sessionKind, authState]);

  // Direktor/admin: bütün istifadəçilər siyahısı (kolleksiya sorğusu yalnız onlara icazəlidir)
  useEffect(() => {
    if (!firebaseEnabled || authState.status !== "signedIn") return;
    if (sessionKind !== "member") return;
    if (currentMember?.role !== "admin" && currentMember?.role !== "director") return;

    return subscribeOrgMembers((members) => setOrgMembers(members.filter((m) => !m.disabled)));
  }, [authState.status, sessionKind, currentMember?.role]);

  useEffect(() => {
    const el = forcePasswordDialogRef.current;
    if (!el) return;
    if (forcePasswordChange) el.showModal();
    else if (el.open) el.close();
  }, [forcePasswordChange]);

  const flushRemoteWrite = useCallback(
    async (opts?: { retryMs?: number }) => {
      if (!firebaseEnabled || authState.status !== "signedIn" || !remoteReadyRef.current) return;
      if (remoteWriteInFlightRef.current) return;

      const uid = authState.user.uid;
      const payload = workspaceRef.current;
      const json = workspaceFingerprint(payload);

      // workspaceRef köhnə ola bilər — pending-i burada sıfırlama (snapshot geri qaytarmasın)
      if (json === lastSyncedJsonRef.current) return;

      pendingLocalWriteRef.current = true;
      remoteWriteInFlightRef.current = true;

      try {
        if (firebaseEnabled) {
          await writeOrgWorkspace(payload);
        } else {
          await writeWorkspace(uid, payload);
        }
        lastWrittenJsonRef.current = json;
        if (remoteWriteRetryTimerRef.current != null) {
          window.clearTimeout(remoteWriteRetryTimerRef.current);
          remoteWriteRetryTimerRef.current = null;
        }
      } catch (e: unknown) {
        pendingLocalWriteRef.current = true;
        const msg =
          e instanceof Error && e.message.includes("Workspace çox böyükdür")
            ? e.message
            : "Sinxronlaşma alınmadı";
        flash(setToast, msg, "error");

        if (remoteWriteRetryTimerRef.current == null) {
          const retryMs = opts?.retryMs ?? 2500;
          remoteWriteRetryTimerRef.current = window.setTimeout(() => {
            remoteWriteRetryTimerRef.current = null;
            void flushRemoteWrite({ retryMs: Math.min(retryMs * 2, 30_000) });
          }, retryMs);
        }
      } finally {
        remoteWriteInFlightRef.current = false;
      }
    },
    [authState],
  );

  // 2) Workspace abunəliyi (yalnız autentifikasiyadan sonra)
  useEffect(() => {
    if (authState.status !== "signedIn") return;
    const uid = authState.user.uid;
    let cancelled = false;
    workspaceSyncReadyRef.current = false;
    setCashReportHydrated(false);

    (async () => {
      try {
        const remote = firebaseEnabled ? await fetchOrgWorkspaceOnce() : await fetchWorkspaceOnce(uid);
        if (cancelled) return;

        const localMain = hasLocalWorkspace() ? loadWorkspaceLocal() : null;
        const localBackup = loadLocalWorkspaceBackup();
        const liveCache = loadWorkspaceLiveCache();
        const remoteNorm = remote ? normalizeWorkspace(remote) : null;
        const local = pickPreferredWorkspace(localMain, localBackup);
        const base = pickPreferredWorkspace(local, remote);
        const mergedCash = mergeCashReportStates(
          remoteNorm?.cashReport,
          liveCache?.cashReport,
          localMain?.cashReport,
          localBackup?.cashReport,
          base.cashReport,
        );
        const merged = mergedCash ? { ...base, cashReport: mergedCash } : base;
        const needsUpload =
          !remoteNorm ||
          !workspaceHasUserData(remoteNorm) ||
          workspaceFingerprint(merged) !== workspaceFingerprint(remoteNorm);

        if (needsUpload) {
          if (firebaseEnabled) await writeOrgWorkspace(merged);
          else await writeWorkspace(uid, merged);
        }

        backupLocalWorkspace();
        clearLocalWorkspace();

        if (!cancelled) {
          remoteReadyRef.current = true;
          let resolved = merged;
          if (cashReportDirtyRef.current) {
            const mergedCash = mergeCashReportOnSync(workspaceRef.current.cashReport, merged.cashReport, {
              preferLocalRows: true,
            });
            if (mergedCash) resolved = { ...merged, cashReport: mergedCash };
          }
          if (!pendingLocalWriteRef.current) {
            lastSyncedJsonRef.current = workspaceFingerprint(resolved);
            cashExternalSyncRef.current = true;
            setCashSlotEdits({});
            setWorkspace(resolved);
          } else {
            const mergedCash = mergeCashReportOnSync(workspaceRef.current.cashReport, resolved.cashReport, {
              preferLocalRows: true,
            });
            if (mergedCash) {
              const withLocalCash = { ...workspaceRef.current, cashReport: mergedCash };
              cashExternalSyncRef.current = true;
              setCashSlotEdits({});
              setWorkspace(withLocalCash);
            }
          }
          workspaceSyncReadyRef.current = true;
          setCashReportHydrated(true);
          setRemoteSyncEpoch((e) => e + 1);
        }
      } catch {
        if (!cancelled) {
          workspaceSyncReadyRef.current = true;
          setCashReportHydrated(true);
        }
      }
    })();

    const onRemoteWorkspace = ({
      exists,
      workspace: remoteWs,
    }: {
      exists: boolean;
      workspace: DocWorkspace | null;
      remoteUpdatedAt?: number | null;
    }) => {
      if (!exists || !remoteWs) {
        return;
      }
      if (!workspaceSyncReadyRef.current) {
        remoteReadyRef.current = true;
        return;
      }
      const normalizedBase = normalizeWorkspace(remoteWs);
      const mergedCash = mergeCashReportOnSync(workspaceRef.current.cashReport, normalizedBase.cashReport, {
        preferLocalRows: cashReportDirtyRef.current || pendingLocalWriteRef.current,
      });
      const normalized = mergedCash ? { ...normalizedBase, cashReport: mergedCash } : normalizedBase;
      const json = workspaceFingerprint(normalized);
      if (json === lastSyncedJsonRef.current) {
        remoteReadyRef.current = true;
        setRemoteSyncEpoch((e) => e + 1);
        return;
      }
      if (json === lastWrittenJsonRef.current) {
        lastSyncedJsonRef.current = json;
        pendingLocalWriteRef.current = false;
        cashReportDirtyRef.current = false;
        cashExternalSyncRef.current = true;
        setCashSlotEdits({});
        remoteReadyRef.current = true;
        setRemoteSyncEpoch((e) => e + 1);
        return;
      }
      if (pendingLocalWriteRef.current || remoteWriteInFlightRef.current || cashReportDirtyRef.current) {
        remoteReadyRef.current = true;
        setRemoteSyncEpoch((e) => e + 1);
        return;
      }
      lastSyncedJsonRef.current = json;
      remoteReadyRef.current = true;
      setRemoteSyncEpoch((e) => e + 1);
      cashExternalSyncRef.current = true;
      setCashSlotEdits({});
      setWorkspace(normalized);
    };

    const unsub = firebaseEnabled
      ? subscribeOrgWorkspace(onRemoteWorkspace)
      : subscribeWorkspace(uid, onRemoteWorkspace);

    return () => {
      cancelled = true;
      unsub();
    };
  }, [authState]);

  // 3) Workspace dəyişəndə debounced yazı (remote və ya lokal)
  useEffect(() => {
    const json = workspaceFingerprint(workspace);

    // Remote rejim
    if (firebaseEnabled && authState.status === "signedIn") {
      if (!remoteReadyRef.current) return; // hələ ilk snapshot gəlməyib
      if (json === lastSyncedJsonRef.current) {
        return;
      }

      pendingLocalWriteRef.current = true;
      if (remoteWriteTimerRef.current != null) {
        window.clearTimeout(remoteWriteTimerRef.current);
      }
      // Kassa dəyişiklikləri (Cəmlə, sil, geri al) refresh zamanı itməsin deyə tez yazılır;
      // adi mətn sahələri üçün normal debounce saxlanılır.
      const writeDelay = cashReportDirtyRef.current ? 120 : 600;
      remoteWriteTimerRef.current = window.setTimeout(() => {
        remoteWriteTimerRef.current = null;
        void flushRemoteWrite();
      }, writeDelay);

      return () => {
        if (remoteWriteTimerRef.current != null) {
          window.clearTimeout(remoteWriteTimerRef.current);
          remoteWriteTimerRef.current = null;
        }
      };
    }

    // Lokal rejim — yalnız Firebase ümumiyyətlə deaktivdirsə
    if (!firebaseEnabled || authState.status === "disabled") {
      const id = window.setTimeout(() => saveWorkspaceLocal(workspace), 420);
      return () => window.clearTimeout(id);
    }
    // signedOut / loading — yazma (istifadəçilər arası qarışıqlıq olmasın)
    return;
  }, [workspace, authState, flushRemoteWrite, remoteSyncEpoch]);

  // 3b) Remote rejimdə hər dəyişiklikdə lokal ehtiyat nüsxəni yenilə — hard refresh zamanı
  // Firestore-a hələ çatmamış son dəyişikliyin itməməsi üçün (yalnız oxuma zamanı istifadə olunur)
  useEffect(() => {
    if (!firebaseEnabled || authState.status !== "signedIn") return;
    if (!workspaceSyncReadyRef.current) return;
    const id = window.setTimeout(() => saveWorkspaceLiveCache(workspace), 200);
    return () => window.clearTimeout(id);
  }, [workspace, authState]);

  useEffect(() => {
    const onBeforeUnload = () => {
      if (!firebaseEnabled || authState.status !== "signedIn") return;
      if (!cashReportDirtyRef.current && !pendingLocalWriteRef.current) return;
      saveWorkspaceLiveCache(workspaceRef.current);
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [authState.status]);

  // Reminder: vaxt çatanda bir dəfə səsli xəbərdarlıq et
  useEffect(() => {
    const tick = () => {
      const now = Date.now();
      const due = (workspace.notes ?? []).filter((n) => {
        if (!n || n.done) return false;
        if (!n.remindAt) return false;
        const t = parseDatetimeLocal(n.remindAt);
        if (!t) return false;
        if (t > now) return false;
        return !n.remindedAt;
      });
      if (due.length === 0) return;
      const first = due[0];
      setReminderNote(first);
      const markIds = new Set(due.map((d) => d.id));
      setWorkspace((w) => ({
        ...w,
        notes: (w.notes ?? []).map((n) => (markIds.has(n.id) ? { ...n, remindedAt: now } : n)),
      }));
    };
    tick();
    const t = window.setInterval(tick, 30_000);
    return () => window.clearInterval(t);
  }, [workspace.notes]);

  // Hər şirkət üçün avtomatik qovluq olsun
  useEffect(() => {
    const existing = new Set((workspace.folders ?? []).filter((f) => (f as WorkspaceFolderRecord).kind === "company").map((f) => (f as WorkspaceFolderRecord).companyId));
    const missing = workspace.companies.filter((c) => !existing.has(c.id));
    if (missing.length === 0) return;
    setWorkspace((w) => ({
      ...w,
      folders: [
        ...(w.folders ?? []),
        ...missing.map((c) => ({
          id: crypto.randomUUID(),
          kind: "company" as const,
          companyId: c.id,
          name: c.profile.name || "Şirkət",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          files: [],
        })),
      ],
    }));
  }, [workspace.companies, workspace.folders]);

  // Hər təchizatçı üçün avtomatik qovluq olsun
  useEffect(() => {
    const existing = new Set(
      (workspace.folders ?? []).filter((f) => (f as WorkspaceFolderRecord).kind === "supplier").map((f) => (f as WorkspaceFolderRecord).supplierId),
    );
    const missing = (workspace.suppliers ?? []).filter((s) => !existing.has(s.id));
    if (missing.length === 0) return;
    setWorkspace((w) => ({
      ...w,
      folders: [
        ...(w.folders ?? []),
        ...missing.map((s) => ({
          id: crypto.randomUUID(),
          kind: "supplier" as const,
          supplierId: s.id,
          name: s.name || "Təchizatçı",
          createdAt: Date.now(),
          updatedAt: Date.now(),
          files: [],
        })),
      ],
    }));
  }, [workspace.suppliers, workspace.folders]);

  useEffect(() => {
    const el = printDialogRef.current;
    if (!el) return;
    if (printProjectId) el.showModal();
    else el.close();
  }, [printProjectId]);

  useEffect(() => {
    const el = infoDialogRef.current;
    if (!el) return;
    if (infoDialog) el.showModal();
    else el.close();
  }, [infoDialog]);

  useEffect(() => {
    const el = confirmDialogRef.current;
    if (!el) return;
    if (confirmDialog) {
      softBeep();
      el.showModal();
    } else el.close();
  }, [confirmDialog]);

  useEffect(() => {
    const el = promptDialogRef.current;
    if (!el) return;
    if (promptDialog) {
      softBeep();
      el.showModal();
      window.setTimeout(() => promptInputRef.current?.focus(), 0);
    } else el.close();
  }, [promptDialog]);

  useEffect(() => {
    const el = noteDialogRef.current;
    if (!el) return;
    if (noteDialogOpen) {
      softBeep();
      el.showModal();
    } else el.close();
  }, [noteDialogOpen]);

  useEffect(() => {
    const el = reminderDialogRef.current;
    if (!el) return;
    if (reminderNote) {
      softBeep();
      el.showModal();
    } else el.close();
  }, [reminderNote]);

  useEffect(() => {
    const el = noteInfoDialogRef.current;
    if (!el) return;
    if (noteInfoId) el.showModal();
    else el.close();
  }, [noteInfoId]);

  useEffect(() => {
    const el = leaveInfoDialogRef.current;
    if (!el) return;
    if (leaveInfoId) el.showModal();
    else el.close();
  }, [leaveInfoId]);

  useEffect(() => {
    const onResize = () => {
      if (window.innerWidth >= 768) setSidebarOpen(false);
    };
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!sidebarOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setSidebarOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [sidebarOpen]);

  useEffect(() => {
    const fn = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "f") {
        e.preventDefault();
        navSearchRef.current?.focus();
      }
    };
    window.addEventListener("keydown", fn);
    return () => window.removeEventListener("keydown", fn);
  }, []);

  const sortedCompanies = useMemo(() => {
    return [...workspace.companies].sort((a, b) =>
      (a.profile.name || "").localeCompare(b.profile.name || "", "az", { sensitivity: "base" }),
    );
  }, [workspace.companies]);

  const sortedProjects = useMemo(() => sortProjectsByDate(workspace.projects), [workspace.projects]);

  const sortedSuppliers = useMemo(() => {
    return [...(workspace.suppliers ?? [])].sort((a, b) =>
      (a.name || "").localeCompare(b.name || "", "az", { sensitivity: "base" }),
    );
  }, [workspace.suppliers]);

  const supplierById = useMemo(() => {
    const m = new Map<string, SupplierRecord>();
    for (const s of workspace.suppliers ?? []) m.set(s.id, s);
    return m;
  }, [workspace.suppliers]);

  const sortedSupplierOffers = useMemo(() => {
    return [...(workspace.supplierOffers ?? [])].sort((a, b) => {
      const da = a.offerDate || "";
      const db = b.offerDate || "";
      if (da !== db) return db.localeCompare(da);
      return b.updatedAt - a.updatedAt;
    });
  }, [workspace.supplierOffers]);

  const companyById = useMemo(() => {
    const m = new Map<string, (typeof workspace.companies)[0]>();
    for (const c of workspace.companies) m.set(c.id, c);
    return m;
  }, [workspace.companies]);

  const isDeveloper = sessionKind === "developer";

  const activeUsers = useMemo(() => {
    if (firebaseEnabled && authState.status === "signedIn") {
      return orgMembers;
    }
    return workspace.systemUsers ?? [];
  }, [firebaseEnabled, authState.status, orgMembers, workspace.systemUsers]);

  const moduleAccessSet = useMemo(() => {
    if (isDeveloper || sessionKind === "local") return null;
    if (!currentMember) return new Set<PermissionModuleId>();
    if (currentMember.role === "admin" || currentMember.role === "director") return null;
    return new Set(currentMember.modules);
  }, [isDeveloper, sessionKind, currentMember]);

  const canManageUsers = useMemo(() => {
    if (isDeveloper || sessionKind === "local") return true;
    return currentMember?.role === "admin" || currentMember?.role === "director";
  }, [isDeveloper, sessionKind, currentMember]);

  const canReviewLeave = useMemo(() => {
    if (isDeveloper || sessionKind === "local") return true;
    return currentMember?.role === "director" || currentMember?.role === "admin";
  }, [isDeveloper, sessionKind, currentMember]);

  const canManageSystemUsers = canManageUsers;

  const reviewerUid = authState.status === "signedIn" ? authState.user.uid : null;

  const leaveReviewSeenAt = workspace.settings.leaveReviewSeenAt?.[reviewerUid ?? ""] ?? 0;

  const unviewedLeaveRequests = useMemo(() => {
    if (!canReviewLeave) return [];
    return (workspace.leaveRequests ?? [])
      .filter((r) => r.status === "pending" && r.createdAt > leaveReviewSeenAt)
      .sort((a, b) => b.createdAt - a.createdAt);
  }, [canReviewLeave, workspace.leaveRequests, leaveReviewSeenAt]);

  const unviewedLeaveCount = unviewedLeaveRequests.length;

  const markLeaveNotificationsSeen = useCallback(() => {
    if (!canReviewLeave || !reviewerUid) return;
    const now = Date.now();
    setWorkspace((w) => ({
      ...w,
      settings: {
        ...w.settings,
        leaveReviewSeenAt: {
          ...(w.settings.leaveReviewSeenAt ?? {}),
          [reviewerUid]: now,
        },
      },
    }));
  }, [canReviewLeave, reviewerUid]);

  useEffect(() => {
    if (module === "workLeave" && canReviewLeave) {
      markLeaveNotificationsSeen();
      setNotificationsOpen(false);
    }
  }, [module, canReviewLeave, markLeaveNotificationsSeen]);

  useEffect(() => {
    if (!notificationsOpen) return;
    const onDocClick = (e: MouseEvent) => {
      if (!notificationsRef.current?.contains(e.target as Node)) {
        setNotificationsOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [notificationsOpen]);

  const systemUsersById = useMemo(() => {
    const m = new Map<string, SystemUserRecord>();
    for (const u of activeUsers) m.set(u.id, u);
    return m;
  }, [activeUsers]);

  const filteredMainNavIds = useMemo(() => {
    const q = navSearch.trim().toLowerCase();
    return SIDEBAR_MAIN_IDS.filter((id) => {
      if (moduleAccessSet && !moduleAccessSet.has(id as PermissionModuleId)) return false;
      const label = SIDEBAR_MODULES.find((m) => m.id === id)?.label ?? "";
      return !q || label.toLowerCase().includes(q);
    });
  }, [navSearch, moduleAccessSet]);

  const filteredSystemNavIds = useMemo(() => {
    const q = navSearch.trim().toLowerCase();
    return SIDEBAR_SYSTEM_IDS.filter((id) => {
      if (id === "settings" && moduleAccessSet) return false;
      if (id === "systemPermissions" && !canManageSystemUsers) return false;
      if (id === "appUsers" && !canManageUsers) return false;
      if (id === "workLeave") {
        const allowed = canReviewLeave || !moduleAccessSet || moduleAccessSet.has("workLeave");
        if (!allowed) return false;
      }
      const label = SIDEBAR_MODULES.find((m) => m.id === id)?.label ?? "";
      return !q || label.toLowerCase().includes(q);
    });
  }, [navSearch, canManageSystemUsers, canManageUsers, canReviewLeave, moduleAccessSet]);

  useEffect(() => {
    if (authState.status !== "signedIn") {
      sessionModuleAppliedRef.current = false;
      return;
    }
    if (sessionKind === "developer" || sessionKind === "local") return;
    if (!currentMember) return;

    const navOpts = {
      canManageUsers,
      canManageSystemUsers,
      canReviewLeave,
    };

    if (!sessionModuleAppliedRef.current) {
      sessionModuleAppliedRef.current = true;
      setModule(preferredModuleForSession(currentMember, moduleAccessSet));
      return;
    }

    if (moduleAccessSet && !isModuleAccessible(module, moduleAccessSet, navOpts)) {
      const next = preferredModuleForSession(currentMember, moduleAccessSet);
      if (module === "companies") cancelCompanyForm();
      else if (module === "projects") cancelProjectForm();
      else if (module === "suppliers") cancelOfferForm();
      else if (module === "storeOrders") cancelStoreOrderForm();
      else if (module === "customerOrders") cancelCustomerOrderForm();
      else if (module === "systemPermissions") cancelPermissionForm();
      else if (module === "appUsers") cancelAppUserForm();
      else if (module === "workLeave") cancelLeaveForm();
      setModule(next);
    }
  }, [
    authState.status,
    sessionKind,
    currentMember,
    moduleAccessSet,
    module,
    canManageUsers,
    canManageSystemUsers,
    canReviewLeave,
  ]);

  const workspaceHeader = useMemo(() => {
    if (module === "settings") return { title: "Ayarlar", sub: MODULE_TAGLINE.settings };
    if (module === "companies") {
      if (companyMode === "list") return { title: "Şirkətlər", sub: MODULE_TAGLINE.companies };
      return {
        title: companyEditId ? "Şirkət redaktəsi" : "Yeni şirkət",
        sub: companyEditId ? "Mövcud şirkət kartını yeniləyin" : "Yeni alıcı və ya tərəf şirkəti əlavə edin",
      };
    }
    if (module === "projects") {
      if (projectMode === "list") return { title: "Təkliflər", sub: MODULE_TAGLINE.projects };
      return {
        title: projectEditId ? "Təklif redaktəsi" : "Yeni təklif",
        sub: projectEditId ? "Mövcud təklifi yeniləyin" : "Yeni təklif əlavə edin",
      };
    }
    if (module === "folders") {
      return { title: "Qovluqlar", sub: MODULE_TAGLINE.folders };
    }
    if (module === "notes") {
      return { title: "Qeydlər", sub: MODULE_TAGLINE.notes };
    }
    if (module === "suppliers") {
      if (offerMode === "list") return { title: "Təchizatçı təklifləri", sub: MODULE_TAGLINE.suppliers };
      return {
        title: offerEditId ? "Təklif redaktəsi" : "Yeni təklif",
        sub: offerEditId ? "Mövcud təchizatçı təklifini yeniləyin" : "Yeni təchizatçı təklifi əlavə edin",
      };
    }
    if (module === "storeOrders") {
      if (storeOrderMode === "list") return { title: "Mağaza sifarişi", sub: MODULE_TAGLINE.storeOrders };
      return {
        title: storeOrderEditId ? "Mağaza sifarişi redaktəsi" : "Yeni mağaza sifarişi",
        sub: storeOrderEditId ? "Mövcud sifarişi yeniləyin" : "Yeni mağaza sifarişi əlavə edin",
      };
    }
    if (module === "customerOrders") {
      if (customerOrderMode === "list") return { title: "Müştəri sifarişi", sub: MODULE_TAGLINE.customerOrders };
      return {
        title: customerOrderEditId ? "Müştəri sifarişi redaktəsi" : "Yeni müştəri sifarişi",
        sub: customerOrderEditId ? "Mövcud sifarişi yeniləyin" : "Yeni müştəri sifarişi əlavə edin",
      };
    }
    if (module === "priceCalculations") {
      return { title: "Qiymət hesablanması", sub: MODULE_TAGLINE.priceCalculations };
    }
    if (module === "instructions") {
      return { title: "Təlimat", sub: MODULE_TAGLINE.instructions };
    }
    if (module === "cashReport") {
      return { title: "Kassa hesabatı", sub: MODULE_TAGLINE.cashReport };
    }
    if (module === "appUsers") {
      if (appUserMode === "list") return { title: "İstifadəçilər", sub: MODULE_TAGLINE.appUsers };
      return {
        title: appUserEditId ? "İstifadəçi redaktəsi" : "Yeni istifadəçi",
        sub: appUserEditId ? "Hesab məlumatlarını yeniləyin" : "Giriş üçün istifadəçi adı və müvəqqəti şifrə təyin edin",
      };
    }
    if (module === "systemPermissions") {
      if (permissionMode === "list") return { title: "Sistem icazələri", sub: MODULE_TAGLINE.systemPermissions };
      return {
        title: "Modul icazələri",
        sub: "İşçinin sistemdə görə biləcəyi bölmələri seçin",
      };
    }
    if (module === "workLeave") {
      if (leaveMode === "list") return { title: "İş icazələri", sub: MODULE_TAGLINE.workLeave };
      return {
        title: leaveEditId ? "Sorğu redaktəsi" : "Yeni sorğu",
        sub: leaveEditId ? "İş icazəsi sorğusunu yeniləyin" : "İş icazəsi sorğusu göndərin",
      };
    }
    return { title: "", sub: "" };
  }, [
    module,
    companyMode,
    projectMode,
    companyEditId,
    projectEditId,
    offerMode,
    offerEditId,
    storeOrderMode,
    storeOrderEditId,
    customerOrderMode,
    customerOrderEditId,
    appUserMode,
    appUserEditId,
    permissionMode,
    leaveMode,
    leaveEditId,
  ]);

  const priceCalcCostValue = useMemo(() => {
    const raw = Number(priceCalcCostInput.replace(",", "."));
    return Number.isFinite(raw) ? raw : 0;
  }, [priceCalcCostInput]);

  const priceCalcResult = useMemo(
    () => calculatePricePlan(priceCalcProductType, priceCalcCostValue),
    [priceCalcProductType, priceCalcCostValue],
  );

  const cashReportRows = useMemo(() => workspace.cashReport?.rows ?? [], [workspace.cashReport?.rows]);
  const cashReportHistory = useMemo(() => workspace.cashReport?.history ?? [], [workspace.cashReport?.history]);
  const cashReportBalance = useMemo(
    () => totalCashBalanceWithDrafts(cashReportRows, cashSlotEdits),
    [cashReportRows, cashSlotEdits],
  );

  useEffect(() => {
    if (module !== "cashReport") {
      setCashHistoryOpen(false);
      setCashSlotEdits({});
    }
  }, [module]);

  useEffect(() => {
    const rows = workspace.cashReport?.rows ?? [];
    setCashSlotEdits((prev) => {
      if (cashExternalSyncRef.current) {
        cashExternalSyncRef.current = false;
        return Object.keys(prev).length === 0 ? prev : {};
      }
      return pruneCashSlotEdits(rows, prev);
    });
  }, [workspace.cashReport?.rows, remoteSyncEpoch]);

  useEffect(() => {
    if (module !== "cashReport") return;
    // Remote-lu sessiyada həqiqi məlumat gəlməmiş defolt sətirlər yaratma —
    // əks halda yeni təsadüfi ID-li sətirlər sonradan gələn real sətirlərlə üst-üstə düşüb ikiləşə bilər.
    if (firebaseEnabled && authState.status === "signedIn" && !cashReportHydrated) return;
    if ((workspace.cashReport?.rows?.length ?? 0) > 0) return;
    setWorkspace((w) => ({
      ...w,
      cashReport: { rows: defaultCashReportRows(), history: w.cashReport?.history ?? [] },
    }));
  }, [module, workspace.cashReport?.rows?.length, authState.status, cashReportHydrated]);

  useEffect(() => {
    const rows = workspace.cashReport?.rows;
    if (!rows?.length) return;
    if (!rows.some((r) => r.slots.length < CASH_REPORT_SLOT_COUNT)) return;
    setWorkspace((w) => {
      const prev = w.cashReport?.rows ?? [];
      return {
        ...w,
        cashReport: {
          rows: prev.map((r) => ({ ...r, slots: normalizeCashReportSlots(r.slots) })),
          history: (w.cashReport?.history ?? []).map((snap) => ({
            ...snap,
            rows: snap.rows.map((r) => ({ ...r, slots: normalizeCashReportSlots(r.slots) })),
          })),
        },
      };
    });
  }, [workspace.cashReport?.rows]);

  const cashHistoryAuthorName = useMemo(() => {
    if (sessionKind === "developer") {
      if (authState.status === "signedIn") return authState.user.email?.trim() || "Developer";
      return "Developer";
    }
    const memberName = currentMember?.name?.trim();
    if (memberName) return memberName;
    if (authState.status === "signedIn") return authState.user.email?.trim() || "İstifadəçi";
    return "Direktor";
  }, [sessionKind, currentMember?.name, authState]);

  const patchCashReport = useCallback(
    (
      patch: (prev: { rows: CashReportRow[]; history: CashReportSnapshot[] }) => {
        rows: CashReportRow[];
        history?: CashReportSnapshot[];
      },
      historyLabel?: string,
    ) => {
      cashReportDirtyRef.current = true;
      if (firebaseEnabled && authState.status === "signedIn") {
        pendingLocalWriteRef.current = true;
      }
      setWorkspace((w) => {
        const prev = {
          rows: w.cashReport?.rows ?? [],
          history: w.cashReport?.history ?? [],
        };
        const patched = patch(prev);
        const rows = patched.rows;
        const history = historyLabel
          ? appendCashReportHistory(
              patched.history ?? prev.history,
              rows,
              historyLabel,
              cashHistoryAuthorName,
            )
          : (patched.history ?? prev.history);
        return { ...w, cashReport: { rows, history } };
      });
    },
    [cashHistoryAuthorName, authState.status],
  );

  const pushCashRowUndo = useCallback((row: CashReportRow) => {
    const map = cashUndoRef.current;
    const stack = map.get(row.id) ?? [];
    stack.push(cloneCashRow(row));
    if (stack.length > 12) stack.shift();
    map.set(row.id, stack);
  }, []);

  const popCashRowUndo = useCallback((rowId: string): CashReportRow | null => {
    const map = cashUndoRef.current;
    const stack = map.get(rowId);
    if (!stack || stack.length === 0) return null;
    const prev = stack.pop()!;
    if (stack.length === 0) map.delete(rowId);
    return prev;
  }, []);

  const updateCashRow = useCallback(
    (
      rowId: string,
      updater: (row: CashReportRow) => CashReportRow,
      opts?: { trackUndo?: boolean; historyLabel?: string },
    ) => {
      patchCashReport((prev) => {
        const rows = prev.rows.map((row) => {
          if (row.id !== rowId) return row;
          if (opts?.trackUndo) pushCashRowUndo(row);
          return updater(row);
        });
        return { rows };
      }, opts?.historyLabel);
    },
    [patchCashReport, pushCashRowUndo],
  );

  const addCashReportRow = useCallback(() => {
    patchCashReport(
      (prev) => ({
        ...prev,
        rows: [...prev.rows, newCashReportRow("Yeni hesab")],
      }),
      "Yeni hesab sətri əlavə edildi",
    );
  }, [patchCashReport]);

  const mergeCashReportRow = useCallback(
    (rowId: string) => {
      const row = cashReportRows.find((r) => r.id === rowId);
      if (!row) return;
      const rowWithDrafts = applyCashRowDrafts(row, cashSlotEdits);
      if (rowPendingSum(rowWithDrafts) === 0) {
        flash(setToast, "Cəmlənəcək dəyər yoxdur (sütun 2–8).", "error");
        return;
      }
      const draftsSnapshot = cashSlotEdits;
      setCashSlotEdits((prev) => clearCashRowDraftKeys(prev, rowId));
      updateCashRow(
        rowId,
        (current) => mergeCashRowSlots(applyCashRowDrafts(current, draftsSnapshot)),
        {
          trackUndo: true,
          historyLabel: `Cəmləndi: ${rowWithDrafts.name || "Hesab"}`,
        },
      );
      flash(setToast, "Cəmləndi");
      if (firebaseEnabled && authState.status === "signedIn") {
        window.setTimeout(() => void flushRemoteWrite(), 0);
      }
    },
    [cashReportRows, cashSlotEdits, updateCashRow, authState.status, flushRemoteWrite],
  );

  const undoCashReportRow = useCallback(
    (rowId: string) => {
      const prev = popCashRowUndo(rowId);
      if (!prev) {
        flash(setToast, "Geri alınacaq addım yoxdur.", "error");
        return;
      }
      patchCashReport(
        (state) => ({
          ...state,
          rows: state.rows.map((row) => (row.id === rowId ? prev : row)),
        }),
        `Geri alındı: ${prev.name || "Hesab"}`,
      );
      flash(setToast, "Geri alındı");
    },
    [patchCashReport, popCashRowUndo],
  );

  const patchSellerSettings = useCallback((key: keyof CompanyProfile, value: string) => {
    setWorkspace((w) => ({
      ...w,
      settings: { ...w.settings, seller: { ...w.settings.seller, [key]: value } },
    }));
  }, []);

  const startNewCompany = () => {
    setCompanyDraft(emptyCompany());
    setCompanyEditId(null);
    setCompanyMode("form");
  };

  const startEditCompany = (c: SavedCompanyRecord) => {
    setCompanyDraft({ ...emptyCompany(), ...c.profile });
    setCompanyEditId(c.id);
    setCompanyMode("form");
  };

  const cancelCompanyForm = () => {
    setCompanyMode("list");
    setCompanyEditId(null);
    setCompanyDraft(emptyCompany());
  };

  const saveCompanyForm = () => {
    const profile = normalizeCompany(companyDraft);
    if (!profile.name.trim() && !profile.voen.trim()) {
      flash(setToast, "Ən azı şirkət adı və ya VÖEN daxil edin.", "error");
      return;
    }
    const now = Date.now();
    if (companyEditId) {
      setWorkspace((w) => ({
        ...w,
        companies: w.companies.map((c) =>
          c.id === companyEditId ? { ...c, profile, updatedAt: now } : c,
        ),
      }));
      flash(setToast, "Şirkət yeniləndi");
    } else {
      const id = crypto.randomUUID();
      setWorkspace((w) => ({
        ...w,
        companies: [...w.companies, { id, profile, createdAt: now, updatedAt: now }],
        folders: [
          ...(w.folders ?? []),
          { id: crypto.randomUUID(), kind: "company" as const, companyId: id, name: profile.name || "Şirkət", createdAt: now, updatedAt: now, files: [] },
        ],
      }));
      flash(setToast, "Şirkət saxlanıldı");
    }
    cancelCompanyForm();
  };

  const askConfirm = useCallback(
    (opts: { title: string; message: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }) => {
      return new Promise<boolean>((resolve) => {
        confirmResolverRef.current = resolve;
        setConfirmDialog(opts);
      });
    },
    [],
  );

  const askPrompt = useCallback(
    (opts: {
      title: string;
      label: string;
      defaultValue?: string;
      confirmLabel?: string;
      cancelLabel?: string;
      multiline?: boolean;
    }) => {
      return new Promise<string | null>((resolve) => {
        promptResolverRef.current = resolve;
        setPromptDialog(opts);
      });
    },
    [],
  );

  const deleteCashReportRow = useCallback(
    async (rowId: string) => {
      const row = cashReportRows.find((r) => r.id === rowId);
      if (!row) return;
      const ok = await askConfirm({
        title: "Sətri sil",
        message: `«${row.name || "Hesab"}» silinsin?`,
        confirmLabel: "Sil",
        cancelLabel: "Ləğv et",
        danger: true,
      });
      if (!ok) return;
      cashUndoRef.current.delete(rowId);
      patchCashReport(
        (prev) => ({
          ...prev,
          rows: prev.rows.filter((r) => r.id !== rowId),
        }),
        `Sətir silindi: ${row.name || "Hesab"}`,
      );
      flash(setToast, "Sətir silindi");
    },
    [askConfirm, cashReportRows, patchCashReport],
  );

  const restoreFromLocalBackup = useCallback(async () => {
    const backup = loadLocalWorkspaceBackup();
    const local = hasLocalWorkspace() ? loadWorkspaceLocal() : null;
    const source = pickPreferredWorkspace(local, backup);
    if (!workspaceHasUserData(source)) {
      flash(setToast, "Bərpa ediləcək lokal məlumat tapılmadı.", "error");
      return;
    }
    const ok = await askConfirm({
      title: "Lokal məlumatları bərpa et",
      message: "Brauzerdə saxlanmış köhnə məlumatlar cari hesaba yazılacaq. Davam edilsin?",
      confirmLabel: "Bərpa et",
      cancelLabel: "Ləğv et",
    });
    if (!ok) return;
    const merged = normalizeWorkspace(source);
    if (firebaseEnabled && authState.status === "signedIn") {
      try {
        await writeOrgWorkspace(merged);
        lastSyncedJsonRef.current = workspaceFingerprint(merged);
        pendingLocalWriteRef.current = false;
        remoteReadyRef.current = true;
      } catch {
        flash(setToast, "Firestore-a yazılmadı", "error");
        return;
      }
    } else if (authState.status === "signedIn") {
      try {
        await writeWorkspace(authState.user.uid, merged);
        lastSyncedJsonRef.current = workspaceFingerprint(merged);
        pendingLocalWriteRef.current = false;
        remoteReadyRef.current = true;
      } catch {
        flash(setToast, "Firestore-a yazılmadı", "error");
        return;
      }
    } else {
      saveWorkspaceLocal(merged);
    }
    setWorkspace(merged);
    flash(setToast, "Məlumatlar bərpa olundu");
  }, [askConfirm, authState]);

  const resolveConfirm = (v: boolean) => {
    confirmResolverRef.current?.(v);
    confirmResolverRef.current = null;
    setConfirmDialog(null);
  };

  const resolvePrompt = (v: string | null) => {
    promptResolverRef.current?.(v);
    promptResolverRef.current = null;
    setPromptDialog(null);
  };

  const deleteCompany = async (c: SavedCompanyRecord) => {
    const n = projectsUsingCompany(workspace, c.id);
    if (n > 0) {
      softBeep();
      flash(setToast, `Bu şirkət ${n} təklifdə istifadə olunur — əvvəl təklifləri silin və ya dəyişin.`, "error");
      return;
    }
    const ok = await askConfirm({
      title: "Silmə təsdiqi",
      message: `«${c.profile.name || "Şirkət"}» silinsin?`,
      confirmLabel: "Sil",
      cancelLabel: "Ləğv et",
      danger: true,
    });
    if (!ok) return;
    const toPurge = (workspace.folders ?? []).filter((f) => f.kind === "company" && f.companyId === c.id);
    await purgeFoldersStorage(toPurge);
    setWorkspace((w) => ({ ...w, companies: w.companies.filter((x) => x.id !== c.id) }));
    setWorkspace((w) => ({ ...w, folders: (w.folders ?? []).filter((f) => f.companyId !== c.id) }));
    flash(setToast, "Şirkət silindi");
  };

  const startNewProject = () => {
    if (workspace.companies.length === 0) {
      flash(setToast, "Əvvəl «Şirkətlər» bölməsində ən azı bir şirkət əlavə edin.", "error");
      setModule("companies");
      return;
    }
    setProjectDraft({
      ...emptyProjectDraft(),
      companyId: workspace.companies[0].id,
    });
    setProjectEditId(null);
    setProjectMode("form");
  };

  const startEditProject = (p: ProjectRecord) => {
    setProjectDraft({
      title: p.title,
      companyId: p.companyId,
      rows: normalizeProductRows(p.rows),
      meta: { ...emptyMeta(), ...p.meta },
      vatPercent: p.vatPercent,
      ...(p.billingMode === "official" || p.billingMode === "cash" ? { billingMode: p.billingMode } : {}),
    });
    setProjectEditId(p.id);
    setProjectMode("form");
  };

  const cancelProjectForm = () => {
    setProjectMode("list");
    setProjectEditId(null);
    setProjectDraft(emptyProjectDraft());
    setProjectProductSearch("");
  };

  const openNewCompanyFromProject = () => {
    setModule("companies");
    startNewCompany();
  };

  const addProductRowFromSearch = () => {
    const name = projectProductSearch.trim();
    setProjectDraft((d) => ({
      ...d,
      rows: [...d.rows, { ...newProductRow(), ...(name ? { name } : {}) }],
    }));
    setProjectProductSearch("");
  };

  const saveProjectForm = () => {
    if (!projectDraft.companyId) {
      flash(setToast, "Şirkət seçin.", "error");
      return;
    }
    const now = Date.now();
    const rows = normalizeProductRows(projectDraft.rows);
    const meta = { ...emptyMeta(), ...projectDraft.meta };
    const title = projectDraft.title.trim() || "Adsız təklif";

    // Sistem nömrələri (təkrar olmamaq şərtilə) avtomatik təyin edir.
    if (!meta.invoiceNumber?.trim()) {
      const seq = workspace.settings.docSeq ?? { invoice: 1, delivery: 1, protocol: 1, quote: 1 };
      meta.invoiceNumber = `${yy(meta.invoiceDate)}${mm(meta.invoiceDate)}-${pad3(seq.invoice)}`;
      setWorkspace((w) => ({
        ...w,
        settings: { ...w.settings, docSeq: { ...(w.settings.docSeq ?? seq), invoice: (w.settings.docSeq?.invoice ?? seq.invoice) + 1 } },
      }));
    }

    if (projectEditId) {
      setWorkspace((w) => ({
        ...w,
        projects: w.projects.map((p) =>
          p.id === projectEditId
            ? {
                ...p,
                title,
                companyId: projectDraft.companyId,
                rows,
                meta,
                vatPercent: Number(projectDraft.vatPercent) || 0,
                ...(projectDraft.billingMode === "official" || projectDraft.billingMode === "cash"
                  ? { billingMode: projectDraft.billingMode }
                  : p.billingMode
                    ? { billingMode: p.billingMode }
                    : {}),
                updatedAt: now,
              }
            : p,
        ),
      }));
      flash(setToast, projectEditId ? "Təklif yeniləndi" : "Təklif saxlanıldı");
    } else {
      const id = crypto.randomUUID();
      setWorkspace((w) => ({
        ...w,
        projects: [
          ...w.projects,
          {
            id,
            title,
            companyId: projectDraft.companyId,
            rows,
            meta,
            vatPercent: Number(projectDraft.vatPercent) || 0,
            createdAt: now,
            updatedAt: now,
          },
        ],
      }));
      flash(setToast, "Təklif saxlanıldı");
    }
    cancelProjectForm();
  };

  const deleteProject = async (p: ProjectRecord) => {
    const ok = await askConfirm({
      title: "Silmə təsdiqi",
      message: `«${p.title}» silinsin?`,
      confirmLabel: "Sil",
      cancelLabel: "Ləğv et",
      danger: true,
    });
    if (!ok) return;
    setWorkspace((w) => ({ ...w, projects: w.projects.filter((x) => x.id !== p.id) }));
    flash(setToast, "Təklif silindi");
  };

  const closePrintDialog = useCallback(() => {
    printDialogRef.current?.close();
    setPrintProjectId(null);
  }, []);

  const runExport = async (
    projectId: string,
    kind: "invoice" | "delivery" | "deliveryNoPrice" | "protocol" | "priceQuote",
    mode: "print" | "pdf",
  ) => {
    const proj = workspace.projects.find((p) => p.id === projectId);
    if (!proj) {
      closePrintDialog();
      return;
    }

    // Çap zamanı nömrə dərhal HTML-də görünsün deyə burada sinxron hesablayırıq
    // və həm workspace-ə, həm də print paketin meta-sına tətbiq edirik.
    const seq = workspace.settings.docSeq ?? { invoice: 1, delivery: 1, protocol: 1, quote: 1 };
    const d = proj.meta.invoiceDate || new Date().toISOString().slice(0, 10);
    let next = { ...seq };
    let meta = { ...proj.meta };
    let changed = false;

    if (kind === "invoice" && !meta.invoiceNumber?.trim()) {
      meta = { ...meta, invoiceNumber: `${yy(d)}${mm(d)}-${pad3(next.invoice)}` };
      next.invoice += 1;
      changed = true;
    }
    if ((kind === "delivery" || kind === "deliveryNoPrice") && !meta.deliveryActNumber?.trim()) {
      meta = { ...meta, deliveryActNumber: `${pad3(next.delivery)}/${yy(d)}` };
      next.delivery += 1;
      changed = true;
    }
    if (kind === "protocol" && !meta.protocolNumber?.trim()) {
      meta = { ...meta, protocolNumber: `${pad3(next.protocol)}/${yy(d)}` };
      next.protocol += 1;
      changed = true;
    }
    if (kind === "priceQuote" && !meta.quoteNumber?.trim()) {
      meta = { ...meta, quoteNumber: `${pad3(next.quote ?? 1)}/${yy(d)}` };
      next.quote = (next.quote ?? 1) + 1;
      changed = true;
    }

    if (changed) {
      setWorkspace((w) => ({
        ...w,
        settings: { ...w.settings, docSeq: next },
        projects: w.projects.map((p) => (p.id === projectId ? { ...p, meta, updatedAt: Date.now() } : p)),
      }));
    }

    const pack = workspaceToGeneratorState(
      { ...workspace, settings: { ...workspace.settings, docSeq: changed ? next : seq } },
      { ...proj, meta },
    );
    const html =
      kind === "invoice"
        ? buildInvoiceHtml(pack)
        : kind === "delivery"
          ? buildDeliveryActHtml(pack)
          : kind === "deliveryNoPrice"
            ? buildDeliveryActNoPriceHtml(pack)
            : kind === "priceQuote"
              ? buildPriceQuoteHtml(pack)
              : buildProtocolHtml(pack);
    if (mode === "pdf") {
      const buyerName = workspace.companies.find((c) => c.id === proj.companyId)?.profile?.name?.trim();
      const base =
        kind === "invoice"
          ? "hesab-faktura"
          : kind === "protocol"
            ? "protokol"
            : kind === "priceQuote"
              ? "qiymet-teklifi"
              : "tehvil-akti";
      const no =
        kind === "invoice"
          ? meta.invoiceNumber
          : kind === "protocol"
            ? meta.protocolNumber
            : kind === "priceQuote"
              ? meta.quoteNumber
              : meta.deliveryActNumber;
      const safeBuyer = buyerName ? buyerName.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-+|-+$/g, "") : "";
      const fname = `${base}${no ? "-" + no : ""}${safeBuyer ? "-" + safeBuyer : ""}.pdf`;
      await downloadPdfFromHtml(html, fname);
    } else {
      const ok = openPrintableDocument(html);
      if (!ok) {
        softBeep();
        flash(setToast, "Pop-up bloklanıb — brauzerdə yeni pəncərəyə icazə verin.", "error");
      }
    }
    closePrintDialog();
  };

  const draftTotals = useMemo(
    () =>
      computeTotals({
        seller: emptyCompany(),
        buyer: emptyCompany(),
        rows: projectDraft.rows,
        meta: projectDraft.meta,
        vatPercent: resolveProjectVatPercent(projectDraft),
      }),
    [projectDraft.rows, projectDraft.meta, projectDraft.vatPercent, projectDraft.billingMode],
  );

  const infoCompany = infoDialog?.kind === "company" ? workspace.companies.find((c) => c.id === infoDialog.id) : undefined;
  const infoProject = infoDialog?.kind === "project" ? workspace.projects.find((p) => p.id === infoDialog.id) : undefined;
  const infoOffer =
    infoDialog?.kind === "offer" ? (workspace.supplierOffers ?? []).find((o) => o.id === infoDialog.id) : undefined;
  const infoOfferTotals = infoOffer ? offerRowTotals(infoOffer.rows) : null;
  const infoStoreOrder =
    infoDialog?.kind === "storeOrder" ? (workspace.storeOrders ?? []).find((o) => o.id === infoDialog.id) : undefined;
  const infoCustomerOrder =
    infoDialog?.kind === "customerOrder"
      ? (workspace.customerOrders ?? []).find((o) => o.id === infoDialog.id)
      : undefined;
  const pdfStoreOrder =
    orderSupplierPdfTarget?.kind === "storeOrder"
      ? (workspace.storeOrders ?? []).find((o) => o.id === orderSupplierPdfTarget.id)
      : undefined;
  const pdfCustomerOrder =
    orderSupplierPdfTarget?.kind === "customerOrder"
      ? (workspace.customerOrders ?? []).find((o) => o.id === orderSupplierPdfTarget.id)
      : undefined;
  const pdfOrder = pdfStoreOrder ?? pdfCustomerOrder;
  const pdfSuppliers = useMemo(() => orderSuppliers(pdfOrder?.rows ?? []), [pdfOrder]);
  const infoProjectBuyer =
    infoProject && workspace.companies.find((c) => c.id === infoProject.companyId)?.profile;

  useEffect(() => {
    const el = orderSupplierPdfDialogRef.current;
    if (!el) return;
    if (orderSupplierPdfTarget) {
      if (!el.open) el.showModal();
    } else if (el.open) {
      el.close();
    }
  }, [orderSupplierPdfTarget]);

  useEffect(() => {
    if (!orderSupplierPdfTarget) {
      setOrderSupplierPdfSupplier("");
      return;
    }
    setOrderSupplierPdfSupplier((prev) => {
      if (prev && pdfSuppliers.includes(prev)) return prev;
      return pdfSuppliers[0] ?? "";
    });
  }, [orderSupplierPdfTarget, pdfSuppliers]);

  const companyProfileFields = (
    profile: CompanyProfile,
    patch: (key: keyof CompanyProfile, v: string) => void,
    groups: { title: string; fields: ReqFieldSpec[] }[] = COMPANY_FIELD_GROUPS,
  ) => (
    <div className="dg-req-form">
      {groups.map((group) => (
        <fieldset key={group.title} className="pg-fieldset">
          <legend>{group.title}</legend>
          <div className="dg-req-grid">
            {group.fields.map((f) => (
              <label
                key={f.key}
                className={`dg-field dg-req-field ${f.span === "half" ? "" : "dg-req-span-full"}`}
              >
                <span className="dg-label">{f.label}</span>
                <input
                  className="dg-input dg-input-req"
                  type="text"
                  placeholder={f.placeholder}
                  value={profile[f.key]}
                  onChange={(e) => patch(f.key, e.target.value)}
                />
              </label>
            ))}
          </div>
        </fieldset>
      ))}
    </div>
  );

  const renderCompaniesModule = () => (
    <>
      {companyMode === "list" ? (
        <div className="dg-form-page pg-panel" aria-label="Şirkətlər siyahısı">
          <div className="dg-form-page-body">
            {sortedCompanies.length === 0 ? (
              <p className="dg-muted dg-form-page-empty">Hələ şirkət yoxdur — «Yeni şirkət» ilə əlavə edin.</p>
            ) : (
              <div className="dg-table-wrap pg-grid-host">
                <table className="dg-table dg-table--sales">
                  <thead>
                    <tr>
                      <th className="dg-th-num">№</th>
                      <th>Şirkət</th>
                      <th>VÖEN</th>
                      <th className="dg-th-actions">Əməliyyatlar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedCompanies.map((c, i) => (
                      <tr key={c.id}>
                        <td className="dg-td-num">{i + 1}</td>
                        <td>{c.profile.name || "—"}</td>
                        <td>{c.profile.voen || "—"}</td>
                        <td className="dg-td-actions">
                          <div className="dg-icon-row">
                            <button
                              type="button"
                              className="dg-icon-btn"
                              title="Məlumat"
                              aria-label="Məlumat"
                              onClick={() => setInfoDialog({ kind: "company", id: c.id })}
                            >
                              <IconInfo />
                            </button>
                            <button
                              type="button"
                              className="dg-icon-btn"
                              title="Redaktə"
                              aria-label="Redaktə"
                              onClick={() => startEditCompany(c)}
                            >
                              <IconEdit />
                            </button>
                            <button
                              type="button"
                              className="dg-icon-btn dg-icon-btn-danger"
                              title="Sil"
                              aria-label="Sil"
                              onClick={() => deleteCompany(c)}
                            >
                              <IconTrash />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="dg-form-page pg-panel" aria-label={companyEditId ? "Şirkət redaktəsi" : "Yeni şirkət"}>
          <header className="dg-form-page-head">
            <div>
              <h1 className="dg-form-page-title">Şirkətlər</h1>
              <nav className="dg-form-bc" aria-label="Yol">
                <span>Sənəd generatoru</span>
                <span className="dg-form-bc-sep" aria-hidden>
                  ›
                </span>
                <span>Şirkətlər</span>
                <span className="dg-form-bc-sep" aria-hidden>
                  ›
                </span>
                <span className="dg-form-bc-current">{companyEditId ? "Redaktə" : "Yeni şirkət"}</span>
              </nav>
            </div>
            <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelCompanyForm}>
              Siyahı
            </button>
          </header>
          <div className="dg-form-page-body">
            <h2 className="rb-company-form-caption">
              {companyEditId ? "Şirkəti redaktə et" : "Yeni şirkət"}
            </h2>
            <div className="rb-company-form-grid">
              <section className="dg-form-inner-panel rb-company-form-card" aria-label="Rekvizitlər 1">
                {companyProfileFields(
                  companyDraft,
                  (k, v) => setCompanyDraft((d) => ({ ...d, [k]: v })),
                  COMPANY_FIELD_GROUPS.slice(0, 2),
                )}
              </section>
              <section className="dg-form-inner-panel rb-company-form-card" aria-label="Rekvizitlər 2">
                {companyProfileFields(
                  companyDraft,
                  (k, v) => setCompanyDraft((d) => ({ ...d, [k]: v })),
                  COMPANY_FIELD_GROUPS.slice(2),
                )}
              </section>
            </div>
            <footer className="dg-form-footer-actions">
              <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelCompanyForm}>
                Bağla
              </button>
              <button type="button" className="dg-btn dg-btn-primary" onClick={saveCompanyForm}>
                Yadda saxla
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );

  const patchProjectDraftMeta = (key: keyof DocumentMeta, value: string) => {
    setProjectDraft((d) => ({ ...d, meta: { ...d.meta, [key]: value } }));
  };

  const updateDraftRow = (id: string, patch: Partial<ProductRow>) => {
    setProjectDraft((d) => ({
      ...d,
      rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const removeDraftRow = (id: string) => {
    setProjectDraft((d) => ({ ...d, rows: d.rows.filter((r) => r.id !== id) }));
  };

  const renderProjectsModule = () => (
    <>
      {projectMode === "list" ? (
        <div className="dg-form-page pg-panel" aria-label="Təkliflər siyahısı">
          <div className="dg-form-page-body">
            {sortedProjects.length === 0 ? (
              <p className="dg-muted dg-form-page-empty">Hələ təklif yoxdur — «Yeni təklif» ilə yaradın.</p>
            ) : (
              <div className="dg-table-wrap pg-grid-host">
                <table className="dg-table dg-table--sales">
                  <thead>
                    <tr>
                      <th className="dg-th-num">№</th>
                      <th>Tarix</th>
                      <th>Şirkət</th>
                      <th>Növ</th>
                      <th>Təklif</th>
                      <th className="dg-th-actions">Əməliyyatlar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedProjects.map((p, i) => {
                      const co = workspace.companies.find((c) => c.id === p.companyId);
                      return (
                        <tr key={p.id}>
                          <td className="dg-td-num">{i + 1}</td>
                          <td>{formatDateAzLong(p.meta.invoiceDate)}</td>
                          <td>{co?.profile.name ?? "—"}</td>
                          <td>
                            {p.billingMode === "cash"
                              ? "Nağd"
                              : p.billingMode === "official"
                                ? "Rəsmi"
                                : p.vatPercent > 0
                                  ? `ƏDV ${p.vatPercent}%`
                                  : "—"}
                          </td>
                          <td>{p.title.trim() || "—"}</td>
                          <td className="dg-td-actions">
                            <div className="dg-icon-row">
                              <button
                                type="button"
                                className="dg-icon-btn"
                                title="Məlumat"
                                aria-label="Məlumat"
                                onClick={() => setInfoDialog({ kind: "project", id: p.id })}
                              >
                                <IconInfo />
                              </button>
                              <button
                                type="button"
                                className="dg-icon-btn"
                                title="Redaktə"
                                aria-label="Redaktə"
                                onClick={() => startEditProject(p)}
                              >
                                <IconEdit />
                              </button>
                              <button
                                type="button"
                                className="dg-icon-btn dg-icon-btn-danger"
                                title="Sil"
                                aria-label="Sil"
                                onClick={() => deleteProject(p)}
                              >
                                <IconTrash />
                              </button>
                              <button
                                type="button"
                                className="dg-icon-btn"
                                title="Çap — sənəd seçin"
                                aria-label="Çap"
                                onClick={() => setPrintProjectId(p.id)}
                              >
                                <IconPrint />
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="dg-form-page pg-panel" aria-label={projectEditId ? "Təklif redaktəsi" : "Yeni təklif"}>
          <header className="dg-form-page-head">
            <div>
              <h1 className="dg-form-page-title">Təkliflər</h1>
              <nav className="dg-form-bc" aria-label="Yol">
                <span>Sənəd generatoru</span>
                <span className="dg-form-bc-sep" aria-hidden>
                  ›
                </span>
                <span>Təkliflər</span>
                <span className="dg-form-bc-sep" aria-hidden>
                  ›
                </span>
                <span className="dg-form-bc-current">{projectEditId ? "Redaktə" : "Yeni təklif"}</span>
              </nav>
            </div>
            <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelProjectForm}>
              Siyahı
            </button>
          </header>

          <div className="dg-form-page-body dg-project-form-body">
            <div className="dg-project-form-top-row dg-project-form-top-row--two">
              <section className="dg-form-inner-panel dg-project-form-top-primary" aria-labelledby="dg-project-base-heading">
                <h2 id="dg-project-base-heading" className="dg-form-inner-panel-title">
                  Şirkət və hesab-faktura
                </h2>
                <div className="dg-form-meta-grid dg-form-meta-grid--project">
                  <label className="dg-field">
                    <span className="dg-label">Şirkət</span>
                    <div className="dg-meta-with-action">
                      <select
                        className="dg-input"
                        value={projectDraft.companyId}
                        onChange={(e) => setProjectDraft((d) => ({ ...d, companyId: e.target.value }))}
                      >
                        <option value="">— seçin —</option>
                        {workspace.companies.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.profile.name || c.profile.voen || c.id}
                          </option>
                        ))}
                      </select>
                      <button
                        type="button"
                        className="dg-btn dg-btn-primary dg-btn-square"
                        title="Yeni şirkət"
                        aria-label="Yeni şirkət əlavə et"
                        onClick={openNewCompanyFromProject}
                      >
                        +
                      </button>
                    </div>
                  </label>
                  <label className="dg-field">
                    <span className="dg-label">Sənəd tarixi</span>
                    <input
                      className="dg-input"
                      type="date"
                      value={projectDraft.meta.invoiceDate}
                      onChange={(e) => patchProjectDraftMeta("invoiceDate", e.target.value)}
                    />
                  </label>
                  <label className="dg-field">
                    <span className="dg-label">Təklifin adı</span>
                    <input
                      className="dg-input"
                      value={projectDraft.title}
                      onChange={(e) => setProjectDraft((d) => ({ ...d, title: e.target.value }))}
                      placeholder="Məs: Yanvar təklifi — MMC «X»"
                    />
                  </label>
                  <label className="dg-field">
                    <span className="dg-label">Hesab-faktura № (avto)</span>
                    <input
                      className="dg-input"
                      value={projectDraft.meta.invoiceNumber}
                      readOnly
                      placeholder="Saxlayanda avtomatik veriləcək"
                    />
                  </label>
                </div>

                <div className="dg-project-subpanel">
                  <h3 className="dg-form-inner-panel-title dg-form-inner-panel-title--sm">Digər sənəd nömrələri</h3>
                  <div className="dg-grid dg-grid-2 dg-project-extra-grid">
                    <label className="dg-field">
                      <span className="dg-label">Təhvil aktı №</span>
                      <input
                        className="dg-input"
                        value={projectDraft.meta.deliveryActNumber}
                        readOnly
                        placeholder="Çap/Saxlama zamanı avtomatik veriləcək"
                      />
                    </label>
                    <label className="dg-field">
                      <span className="dg-label">Protokol №</span>
                      <input
                        className="dg-input"
                        value={projectDraft.meta.protocolNumber}
                        readOnly
                        placeholder="Çap zamanı avtomatik veriləcək"
                      />
                    </label>
                  </div>
                </div>
              </section>

              <section className="dg-form-inner-panel" aria-labelledby="dg-contract-heading">
                <h2 id="dg-contract-heading" className="dg-form-inner-panel-title dg-form-inner-panel-title--sm">
                  ƏDV, müqavilə və təhvil
                </h2>
                <div className="dg-grid dg-grid-2 dg-form-split-grid dg-project-contract-grid">
                  <label className="dg-field">
                    <span className="dg-label">ƏDV % (0 = yoxdur)</span>
                    <input
                      className="dg-input dg-input-short"
                      type="number"
                      min={0}
                      max={100}
                      step="0.01"
                      value={projectDraft.vatPercent}
                      onChange={(e) => setProjectDraft((d) => ({ ...d, vatPercent: Number(e.target.value) || 0 }))}
                    />
                  </label>
                  <label className="dg-field">
                    <span className="dg-label">Müqavilə №</span>
                    <input
                      className="dg-input"
                      value={projectDraft.meta.contractNumber}
                      onChange={(e) => patchProjectDraftMeta("contractNumber", e.target.value)}
                    />
                  </label>
                  <label className="dg-field dg-field--full-row">
                    <span className="dg-label">Müqavilə tarixi</span>
                    <input
                      className="dg-input"
                      type="date"
                      value={projectDraft.meta.contractDate}
                      onChange={(e) => patchProjectDraftMeta("contractDate", e.target.value)}
                    />
                  </label>
                </div>
                <label className="dg-field">
                  <span className="dg-label">Təhvil yeri</span>
                  <textarea
                    className="dg-input dg-input-textarea-compact"
                    rows={2}
                    value={projectDraft.meta.deliveryPlace}
                    onChange={(e) => patchProjectDraftMeta("deliveryPlace", e.target.value)}
                  />
                </label>
                <label className="dg-field">
                  <span className="dg-label">Təhvil əsası</span>
                  <textarea
                    className="dg-input dg-input-textarea-compact"
                    rows={2}
                    value={projectDraft.meta.deliveryBasis}
                    onChange={(e) => patchProjectDraftMeta("deliveryBasis", e.target.value)}
                  />
                </label>
              </section>

            </div>

            <section className="dg-form-inner-panel" aria-labelledby="dg-products-heading">
              <h2 id="dg-products-heading" className="dg-form-inner-panel-title">
                Məhsullar və qiymətlər
              </h2>
              <div className="dg-product-toolbar">
                <input
                  type="search"
                  className="dg-input dg-product-search"
                  placeholder="Məhsul adı — Enter ilə sətir əlavə edin"
                  value={projectProductSearch}
                  onChange={(e) => setProjectProductSearch(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      addProductRowFromSearch();
                    }
                  }}
                  aria-label="Məhsul adı ilə yeni sətir"
                />
                <button type="button" className="dg-btn dg-btn-primary" onClick={addProductRowFromSearch}>
                  Əlavə et
                </button>
                <button
                  type="button"
                  className="dg-btn dg-btn-secondary"
                  onClick={() => setProjectDraft((d) => ({ ...d, rows: [...d.rows, newProductRow()] }))}
                >
                  Boş sətir
                </button>
              </div>
              <div className="dg-table-wrap pg-grid-host dg-project-lines-wrap">
                <table className="dg-table dg-table--sales">
                  <thead>
                    <tr>
                      <th className="dg-th-num">№</th>
                      <th>Məhsul</th>
                      <th>Vahid</th>
                      <th>Miqdar</th>
                      <th>Vahid qiymət</th>
                      <th>Məbləğ</th>
                      <th className="dg-th-actions" title="Əməliyyatlar">
                        Sil
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {projectDraft.rows.length === 0 ? (
                      <tr>
                        <td colSpan={7} className="dg-empty-cell">
                          Sətir əlavə edin və ya yuxarıda məhsul adı yazın.
                        </td>
                      </tr>
                    ) : (
                      projectDraft.rows.map((r, idx) => (
                        <tr key={r.id}>
                          <td className="dg-td-num">{idx + 1}</td>
                          <td>
                            <input
                              className="dg-input dg-input-table"
                              value={r.name}
                              onChange={(e) => updateDraftRow(r.id, { name: e.target.value })}
                            />
                          </td>
                          <td>
                            <input
                              className="dg-input dg-input-table dg-input-narrow"
                              value={r.unit}
                              onChange={(e) => updateDraftRow(r.id, { unit: e.target.value })}
                            />
                          </td>
                          <td>
                            <div className="dg-qty-wrap">
                              <button
                                type="button"
                                className="dg-qty-btn"
                                aria-label="Azalt"
                                onClick={() =>
                                  updateDraftRow(r.id, { qty: Math.max(0, Number(r.qty) - 1) })
                                }
                              >
                                −
                              </button>
                              <input
                                className="dg-input dg-qty-input"
                                type="number"
                                min={0}
                                step="any"
                                value={r.qty}
                                onChange={(e) =>
                                  updateDraftRow(r.id, { qty: Number(e.target.value) || 0 })
                                }
                              />
                              <button
                                type="button"
                                className="dg-qty-btn"
                                aria-label="Artır"
                                onClick={() =>
                                  updateDraftRow(r.id, { qty: Number(r.qty) + 1 })
                                }
                              >
                                +
                              </button>
                            </div>
                          </td>
                          <td>
                            <input
                              className="dg-input dg-input-table dg-input-num"
                              type="number"
                              min={0}
                              step="0.01"
                              value={r.unitPrice}
                              onChange={(e) =>
                                updateDraftRow(r.id, { unitPrice: Number(e.target.value) || 0 })
                              }
                            />
                          </td>
                          <td className="dg-num">{formatMoney(r.qty * r.unitPrice)}</td>
                          <td className="dg-td-actions">
                            <button
                              type="button"
                              className="dg-icon-btn dg-icon-btn-danger dg-icon-btn--compact"
                              aria-label="Sil"
                              title="Sil"
                              onClick={() => removeDraftRow(r.id)}
                            >
                              <IconTrash />
                            </button>
                          </td>
                        </tr>
                      ))
                    )}
                  </tbody>
                </table>
              </div>
            </section>

            <aside
              className="dg-project-summary-aside dg-form-inner-panel dg-project-summary-below-products"
              aria-label="Yekunlar"
            >
              <h2 className="dg-form-inner-panel-title dg-form-inner-panel-title--sm">Yekun</h2>
              <div className="dg-sales-summary">
                <div className="dg-sales-summary-row">
                  <span>Ara cəm</span>
                  <span>{formatMoney(draftTotals.subtotal)}</span>
                </div>
                {draftTotals.vatRate > 0 ? (
                  <div className="dg-sales-summary-row">
                    <span>
                      ƏDV ({draftTotals.vatRate.toLocaleString("az-AZ", { maximumFractionDigits: 2 })}%)
                    </span>
                    <span>{formatMoney(draftTotals.vatAmount)}</span>
                  </div>
                ) : null}
                <div className="dg-sales-summary-row dg-sales-summary-row--grand">
                  <span>Yekun məbləğ</span>
                  <span>
                    {formatMoney(
                      draftTotals.vatRate > 0 ? draftTotals.grandTotal : draftTotals.subtotal,
                    )}
                  </span>
                </div>
              </div>
            </aside>

            <footer className="dg-form-footer-actions">
              <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelProjectForm}>
                Bağla
              </button>
              <button type="button" className="dg-btn dg-btn-primary" onClick={saveProjectForm}>
                Yadda saxla
              </button>
            </footer>
          </div>
        </div>
      )}
    </>
  );

  const renderSettingsModule = () => (
    <div className="dg-form-page pg-panel" aria-label="Ayarlar">
      <header className="dg-form-page-head">
        <div>
          <h1 className="dg-form-page-title">Ayarlar</h1>
          <nav className="dg-form-bc" aria-label="Yol">
            <span>Sənəd generatoru</span>
            <span className="dg-form-bc-sep" aria-hidden>
              ›
            </span>
            <span className="dg-form-bc-current">Ayarlar</span>
          </nav>
        </div>
      </header>
      <div className="dg-form-page-body">
        {hasLocalWorkspaceBackup() || hasLocalWorkspace() ? (
          <section className="dg-form-inner-panel" style={{ marginBottom: 16 }}>
            <h2 className="dg-form-inner-panel-title">Məlumat bərpası</h2>
            <p className="dg-muted" style={{ marginBottom: 12, fontSize: 13 }}>
              Firebase-ə keçid zamanı köhnə brauzer məlumatları itibsə, lokal backup-dan bərpa edə bilərsiniz.
            </p>
            <button type="button" className="dg-btn dg-btn-secondary" onClick={() => restoreFromLocalBackup()}>
              Lokal məlumatları bərpa et
            </button>
          </section>
        ) : null}
        <h2 className="dg-form-inner-panel-title">Satıcı rekvizitləri</h2>
        <div className="rb-company-form-grid">
          <section className="dg-form-inner-panel rb-company-form-card" aria-label="Satıcı rekvizitləri 1">
            {companyProfileFields(workspace.settings.seller, patchSellerSettings, COMPANY_FIELD_GROUPS.slice(0, 2))}
          </section>
          <section className="dg-form-inner-panel rb-company-form-card" aria-label="Satıcı rekvizitləri 2">
            {companyProfileFields(workspace.settings.seller, patchSellerSettings, COMPANY_FIELD_GROUPS.slice(2))}
          </section>
        </div>
      </div>
    </div>
  );

  const [activeFolderId, setActiveFolderId] = useState<string>("");
  const [folderView, setFolderView] = useState<"grid" | "folder">("grid");
  const [folderMenu, setFolderMenu] = useState<{
    open: boolean;
    x: number;
    y: number;
    kind: "folder" | "root";
    folderId?: string;
    companyId?: string;
    supplierId?: string;
  }>(() => ({
    open: false,
    x: 0,
    y: 0,
    kind: "folder",
    folderId: undefined,
    companyId: undefined,
    supplierId: undefined,
  }));

  const foldersByCompany = useMemo(() => {
    const m = new Map<string, WorkspaceFolderRecord>();
    for (const f of (workspace.folders ?? []).filter((x) => x.kind === "company" && x.companyId)) {
      m.set(f.companyId!, f as WorkspaceFolderRecord);
    }
    return m;
  }, [workspace.folders]);

  const foldersBySupplier = useMemo(() => {
    const m = new Map<string, WorkspaceFolderRecord>();
    for (const f of (workspace.folders ?? []).filter((x) => x.kind === "supplier" && x.supplierId)) {
      m.set(f.supplierId!, f as WorkspaceFolderRecord);
    }
    return m;
  }, [workspace.folders]);

  const folderById = useMemo(() => {
    const m = new Map<string, WorkspaceFolderRecord>();
    for (const f of workspace.folders ?? []) m.set(f.id, f as WorkspaceFolderRecord);
    return m;
  }, [workspace.folders]);

  const customFolders = useMemo(() => {
    return (workspace.folders ?? []).filter((f) => (f as WorkspaceFolderRecord).kind === "custom") as WorkspaceFolderRecord[];
  }, [workspace.folders]);

  // Faylı oxumaq üçün vahid mənbə (Storage URL → varsa, lokal dataUrl → fallback)
  const fileSrc = (f: FolderFileRecord): string => f.url || f.dataUrl || "";

  const folderFileMime = (f: File): string => {
    const t = (f.type || "").trim();
    if (t) return t;
    const lower = f.name.toLowerCase();
    if (lower.endsWith(".pdf")) return "application/pdf";
    if (/\.(jpe?g|png|gif|webp|bmp|svg)$/.test(lower)) return "image/*";
    return "application/octet-stream";
  };

  const readFileAsDataUrlRecord = (f: File): Promise<FolderFileRecord> => {
    return new Promise<FolderFileRecord>((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error("read"));
      r.onload = () =>
        resolve({
          id: crypto.randomUUID(),
          name: f.name,
          mime: folderFileMime(f),
          size: f.size,
          createdAt: Date.now(),
          dataUrl: String(r.result || ""),
        });
      r.readAsDataURL(f);
    });
  };

  const onUploadToFolder = async (folderId: string, filesList: FileList | null) => {
    if (!folderId || !filesList || filesList.length === 0) return;
    const folderExists = (workspace.folders ?? []).some((f) => f.id === folderId);
    if (!folderExists) {
      flash(setToast, "Qovluq tapılmadı — qovluğu bağlayıb yenidən açın.", "error");
      return;
    }

    const files = Array.from(filesList);
    const useRemote = firebaseEnabled && authState.status === "signedIn";
    /** Firestore-a dataUrl ilə yazıla bilən maksimum ölçü (workspaceSync ilə eyni) */
    const firestoreInlineMaxBytes = 240_000;

    // Remote snapshot köhnə state ilə yükləməni əvəz etməsin deyə əvvəlcədən qoru
    pendingLocalWriteRef.current = true;

    try {
      let added: FolderFileRecord[] = [];
      if (useRemote) {
        for (const f of files) {
          if (f.size > firestoreInlineMaxBytes) {
            flash(
              setToast,
              `${f.name} çox böyükdür (${(f.size / (1024 * 1024)).toFixed(1)} MB). Hər fayl ən çoxu ~230 KB ola bilər.`,
              "error",
            );
            continue;
          }
          added.push(await readFileAsDataUrlRecord(f));
        }
      } else {
        added = await Promise.all(files.map(readFileAsDataUrlRecord));
      }

      if (added.length === 0) {
        pendingLocalWriteRef.current = false;
        flash(setToast, "Fayl yüklənmədi", "error");
        return;
      }

      let applied = false;
      setWorkspace((w) => {
        let touched = false;
        const nextFolders = (w.folders ?? []).map((fold) => {
          if (fold.id !== folderId) return fold;
          touched = true;
          const now = Date.now();
          return {
            ...fold,
            updatedAt: now,
            files: [...(fold.files ?? []), ...added],
          };
        });
        if (!touched) return w;
        applied = true;
        const next = { ...w, folders: nextFolders };
        workspaceRef.current = next;
        if (!useRemote && (!firebaseEnabled || authState.status === "disabled")) {
          saveWorkspaceLocal(next);
          pendingLocalWriteRef.current = false;
        }
        return next;
      });

      if (!applied) {
        pendingLocalWriteRef.current = false;
        flash(setToast, "Qovluq tapılmadı — qovluğu bağlayıb yenidən açın.", "error");
        return;
      }

      flash(setToast, added.length === 1 ? "Fayl əlavə olundu" : `${added.length} fayl əlavə olundu`);
      // Remote yazını debounced useEffect edir (workspaceRef artıq yenilənib)
    } catch {
      pendingLocalWriteRef.current = false;
      flash(setToast, "Fayl yüklənmədi", "error");
    }
  };

  const deleteFolderFile = async (folderId: string, fileId: string) => {
    const ok = await askConfirm({
      title: "Silmə təsdiqi",
      message: "Bu fayl silinsin?",
      confirmLabel: "Sil",
      cancelLabel: "Ləğv et",
      danger: true,
    });
    if (!ok) return;
    setWorkspace((w) => ({
      ...w,
      folders: (w.folders ?? []).map((fold) =>
        fold.id !== folderId ? fold : { ...fold, updatedAt: Date.now(), files: (fold.files ?? []).filter((x) => x.id !== fileId) },
      ),
    }));
    flash(setToast, "Fayl silindi");
  };

  // Qovluq silərkən fayllar workspace-dən silinir (Firestore sinxronu)
  const purgeFoldersStorage = async (_folders: WorkspaceFolderRecord[]) => {
    /* Storage istifadə olunmur */
  };

  const deleteCompanyFolder = async (cid: string) => {
    const companyName = workspace.companies.find((c) => c.id === cid)?.profile.name || "Qovluq";
    const ok = await askConfirm({
      title: "Qovluq silinsin?",
      message: `«${companyName}» qovluğu və içindəki bütün fayllar silinsin?`,
      confirmLabel: "Sil",
      cancelLabel: "Ləğv et",
      danger: true,
    });
    if (!ok) return;
    const toPurge = (workspace.folders ?? []).filter((f) => f.kind === "company" && f.companyId === cid);
    await purgeFoldersStorage(toPurge);
    setWorkspace((w) => ({ ...w, folders: (w.folders ?? []).filter((f) => !(f.kind === "company" && f.companyId === cid)) }));
    setFolderMenu({ open: false, x: 0, y: 0, kind: "folder", folderId: undefined, companyId: undefined, supplierId: undefined });
    flash(setToast, "Qovluq silindi");
  };

  const deleteCustomFolder = async (fid: string) => {
    const name = folderById.get(fid)?.name || "Qovluq";
    const ok = await askConfirm({
      title: "Qovluq silinsin?",
      message: `«${name}» qovluğu və içindəki bütün fayllar silinsin?`,
      confirmLabel: "Sil",
      cancelLabel: "Ləğv et",
      danger: true,
    });
    if (!ok) return;
    const toPurge = (workspace.folders ?? []).filter((f) => f.id === fid);
    await purgeFoldersStorage(toPurge);
    setWorkspace((w) => ({ ...w, folders: (w.folders ?? []).filter((f) => f.id !== fid) }));
    if (activeFolderId === fid) setActiveFolderId("");
    setFolderMenu({ open: false, x: 0, y: 0, kind: "folder", folderId: undefined, companyId: undefined, supplierId: undefined });
    flash(setToast, "Qovluq silindi");
  };

  const deleteSupplierFolder = async (sid: string) => {
    const supplierName = supplierById.get(sid)?.name || "Qovluq";
    const ok = await askConfirm({
      title: "Qovluq silinsin?",
      message: `«${supplierName}» qovluğu və içindəki bütün fayllar silinsin?`,
      confirmLabel: "Sil",
      cancelLabel: "Ləğv et",
      danger: true,
    });
    if (!ok) return;
    const toPurge = (workspace.folders ?? []).filter((f) => f.kind === "supplier" && f.supplierId === sid);
    await purgeFoldersStorage(toPurge);
    setWorkspace((w) => ({ ...w, folders: (w.folders ?? []).filter((f) => !(f.kind === "supplier" && f.supplierId === sid)) }));
    setFolderMenu({ open: false, x: 0, y: 0, kind: "folder", folderId: undefined, companyId: undefined, supplierId: undefined });
    flash(setToast, "Qovluq silindi");
  };

  const createCustomFolder = async () => {
    const name = (await askPrompt({
      title: "Yeni qovluq",
      label: "Qovluğun adı",
      defaultValue: "Yeni qovluq",
      confirmLabel: "Yarat",
      cancelLabel: "Ləğv et",
    }))?.trim();
    if (!name) return;
    const now = Date.now();
    setWorkspace((w) => ({
      ...w,
      folders: [...(w.folders ?? []), { id: crypto.randomUUID(), kind: "custom" as const, name, createdAt: now, updatedAt: now, files: [] }],
    }));
    flash(setToast, "Qovluq yaradıldı");
  };

  const renderFoldersModule = () => {
    const companies = sortedCompanies;
    const suppliers = sortedSuppliers;
    const folder = activeFolderId ? folderById.get(activeFolderId) : undefined;
    const anyFoldersExist = (workspace.folders ?? []).length > 0;
    const nothingToShow = companies.length === 0 && suppliers.length === 0 && customFolders.length === 0;

    const renderFolderTile = (
      key: string,
      folderRec: WorkspaceFolderRecord | undefined,
      label: string,
      ctx: { companyId?: string; supplierId?: string },
    ) => {
      if (!folderRec?.id) return null;
      const thumbs = (folderRec.files ?? [])
        .slice()
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, 4);
      return (
        <button
          key={key}
          type="button"
          className="dg-folder-tile"
          role="listitem"
          onDoubleClick={() => {
            setActiveFolderId(folderRec.id);
            setFolderView("folder");
          }}
          onClick={() => setActiveFolderId(folderRec.id)}
          onContextMenu={(e) => {
            e.preventDefault();
            setActiveFolderId(folderRec.id);
            setFolderMenu({
              open: true,
              x: e.clientX,
              y: e.clientY,
              kind: "folder",
              folderId: folderRec.id,
              companyId: ctx.companyId,
              supplierId: ctx.supplierId,
            });
          }}
          title="Açmaq üçün iki dəfə klik"
        >
          <div className="dg-folder-icon-wrap" aria-hidden>
            <IconFolder />
            {thumbs.length > 0 ? (
              <div className="dg-folder-thumbgrid">
                {thumbs.map((t) => (
                  <div key={t.id} className="dg-folder-thumbcell">
                    {t.mime.startsWith("image/") ? (
                      <img src={fileSrc(t)} alt="" loading="lazy" />
                    ) : (
                      <div className="dg-folder-thumbbadge">{t.mime === "application/pdf" || t.name.toLowerCase().endsWith(".pdf") ? "PDF" : "FILE"}</div>
                    )}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
          <div className="dg-folder-name">{label}</div>
        </button>
      );
    };

    return (
      <div className="dg-form-page pg-panel" aria-label="Qovluqlar">
        <header className="dg-form-page-head">
          <div>
            <h1 className="dg-form-page-title">Qovluqlar</h1>
          </div>
        </header>
        <div className="dg-form-page-body">
          {nothingToShow ? (
            <div className="dg-empty-state-card" role="status" aria-label="Boş vəziyyət">
              <div className="dg-empty-state-title">Hələ qovluq yoxdur</div>
              <div className="dg-empty-state-actions" style={{ display: "flex", gap: 8, flexWrap: "wrap", justifyContent: "center" }}>
                <button type="button" className="dg-btn dg-btn-secondary" onClick={() => setModule("companies")}>
                  Şirkətlər
                </button>
                <button type="button" className="dg-btn dg-btn-secondary" onClick={() => setModule("suppliers")}>
                  Təchizatçı təklifləri
                </button>
              </div>
            </div>
          ) : folderView === "grid" ? (
            <>
              <div
                className="dg-folders-toolbar"
                aria-label="Qovluqlar alət paneli"
                onContextMenu={(e) => {
                  e.preventDefault();
                  setFolderMenu({ open: true, x: e.clientX, y: e.clientY, kind: "root" });
                }}
              >
                <div className="dg-folders-toolbar-left">
                  <input className="dg-input dg-folders-search" type="search" placeholder="Qovluqlarda axtar..." aria-label="Qovluqlarda axtar" />
                </div>
                <div className="dg-folders-toolbar-right" />
              </div>

              {!anyFoldersExist ? (
                <div className="dg-empty-state-card" role="status">
                  <div className="dg-empty-state-title">Hələ qovluq yoxdur</div>
                </div>
              ) : null}

              {companies.length > 0 ? (
                <section className="dg-folders-section" aria-label="Şirkət qovluqları">
                  <h2 className="dg-folders-section-title">Şirkətlər</h2>
                  <div className="dg-folder-grid" role="list">
                    {companies.map((c) =>
                      renderFolderTile(
                        c.id,
                        foldersByCompany.get(c.id),
                        c.profile.name || c.profile.voen || "Şirkət",
                        { companyId: c.id },
                      ),
                    )}
                  </div>
                </section>
              ) : null}

              {suppliers.length > 0 ? (
                <section className="dg-folders-section" aria-label="Təchizatçı qovluqları">
                  <h2 className="dg-folders-section-title">Təchizatçılar</h2>
                  <div className="dg-folder-grid" role="list">
                    {suppliers.map((s) =>
                      renderFolderTile(s.id, foldersBySupplier.get(s.id), s.name || "Təchizatçı", { supplierId: s.id }),
                    )}
                  </div>
                </section>
              ) : null}

              {customFolders.length > 0 ? (
                <section
                  className="dg-folders-section"
                  aria-label="Digər qovluqlar"
                  onContextMenu={(e) => {
                    if (e.target !== e.currentTarget) return;
                    e.preventDefault();
                    setFolderMenu({ open: true, x: e.clientX, y: e.clientY, kind: "root" });
                  }}
                >
                  <h2 className="dg-folders-section-title">Digər qovluqlar</h2>
                  <div className="dg-folder-grid" role="list">
                    {customFolders.map((cf) => (
                      <button
                        key={cf.id}
                        type="button"
                        className="dg-folder-tile"
                        role="listitem"
                        onDoubleClick={() => {
                          setActiveFolderId(cf.id);
                          setFolderView("folder");
                        }}
                        onClick={() => setActiveFolderId(cf.id)}
                        onContextMenu={(e) => {
                          e.preventDefault();
                          setActiveFolderId(cf.id);
                          setFolderMenu({ open: true, x: e.clientX, y: e.clientY, kind: "folder", folderId: cf.id });
                        }}
                        title="Açmaq üçün iki dəfə klik"
                      >
                        <div className="dg-folder-icon-wrap" aria-hidden>
                          <IconFolder />
                        </div>
                        <div className="dg-folder-name">{cf.name || "Qovluq"}</div>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {folderMenu.open ? (
                <div
                  className="dg-context-menu-backdrop"
                  onMouseDown={() => setFolderMenu({ open: false, x: 0, y: 0, kind: "folder", folderId: undefined, companyId: undefined, supplierId: undefined })}
                  aria-hidden
                >
                  <div
                    className="dg-context-menu"
                    style={{ left: folderMenu.x, top: folderMenu.y }}
                    role="menu"
                    aria-label="Qovluq menyusu"
                    onMouseDown={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="dg-context-item"
                      role="menuitem"
                      onClick={() => {
                        if (folderMenu.kind === "root") {
                          setFolderMenu({ open: false, x: 0, y: 0, kind: "folder", folderId: undefined, companyId: undefined, supplierId: undefined });
                          createCustomFolder();
                          return;
                        }
                        if (folderMenu.folderId) setActiveFolderId(folderMenu.folderId);
                        setFolderView("folder");
                        setFolderMenu({ open: false, x: 0, y: 0, kind: "folder", folderId: undefined, companyId: undefined, supplierId: undefined });
                      }}
                    >
                      {folderMenu.kind === "root" ? "Yeni qovluq" : "Aç"}
                    </button>
                    {folderMenu.kind === "folder" ? (
                      <button
                        type="button"
                        className="dg-context-item dg-context-item-danger"
                        role="menuitem"
                        onClick={() => {
                          if (folderMenu.companyId) deleteCompanyFolder(folderMenu.companyId);
                          else if (folderMenu.supplierId) deleteSupplierFolder(folderMenu.supplierId);
                          else if (folderMenu.folderId) deleteCustomFolder(folderMenu.folderId);
                        }}
                      >
                        Sil
                      </button>
                    ) : null}
                  </div>
                </div>
              ) : null}
            </>
          ) : (
            <>
              <div className="dg-folder-head">
                <button type="button" className="dg-btn dg-btn-secondary" onClick={() => setFolderView("grid")}>
                  ← Geri
                </button>
                <div className="dg-folder-head-title">
                  {folder?.kind === "company"
                    ? sortedCompanies.find((c) => c.id === folder.companyId)?.profile.name || folder.name || "Qovluq"
                    : folder?.kind === "supplier"
                      ? supplierById.get(folder.supplierId || "")?.name || folder.name || "Qovluq"
                      : folder?.name || "Qovluq"}
                </div>
              </div>

              <div className="dg-grid dg-grid-2">
                <label className="dg-field">
                  <span className="dg-label">Fayl əlavə et (PDF/JPG/PNG)</span>
                  <input
                    className="dg-input"
                    type="file"
                    multiple
                    accept="application/pdf,image/*"
                    onChange={(e) => {
                      if (folder) onUploadToFolder(folder.id, e.target.files);
                      // eyni faylı təkrar seçəndə də change işləsin
                      e.currentTarget.value = "";
                    }}
                  />
                </label>
              </div>

              {!folder || (folder.files ?? []).length === 0 ? (
                <div className="dg-empty-card" role="status">
                  Bu qovluqda hələ fayl yoxdur.
                </div>
              ) : (
                <div className="dg-file-grid" role="list" aria-label="Qovluq faylları">
                  {[...folder.files]
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .map((f) => {
                      const isImg = f.mime.startsWith("image/");
                      const isPdf = f.mime === "application/pdf" || f.name.toLowerCase().endsWith(".pdf");
                      return (
                        <div key={f.id} className="dg-file-tile" role="listitem">
                          <a className="dg-file-thumb" href={fileSrc(f)} target="_blank" rel="noreferrer" title="Aç">
                            {isImg ? <img src={fileSrc(f)} alt={f.name} loading="lazy" /> : <span className="dg-file-thumb-badge">{isPdf ? "PDF" : "FILE"}</span>}
                          </a>
                          <div className="dg-file-meta">
                            <div className="dg-file-name" title={f.name}>
                              {f.name}
                            </div>
                            <div className="dg-file-sub">
                              {new Date(f.createdAt).toLocaleDateString("az-AZ")} · {Math.round((f.size / 1024) * 10) / 10} KB
                            </div>
                          </div>
                          <div className="dg-file-actions">
                            <a className="dg-btn dg-btn-secondary" href={fileSrc(f)} target="_blank" rel="noreferrer">
                              Aç
                            </a>
                            <a className="dg-btn dg-btn-secondary" href={fileSrc(f)} download={f.name}>
                              Endir
                            </a>
                            <button type="button" className="dg-btn dg-btn-danger" onClick={() => folder && deleteFolderFile(folder.id, f.id)}>
                              Sil
                            </button>
                          </div>
                        </div>
                      );
                    })}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    );
  };

  const startNewNote = () => {
    setNoteEditId(null);
    setNoteDraft({ title: "", body: "", remindAt: "" });
    setNoteDraftStartedAt(Date.now());
  };

  const startEditNote = (n: NoteRecord) => {
    setNoteEditId(n.id);
    setNoteDraft({ title: n.title || "", body: n.body || "", remindAt: n.remindAt || "" });
    setNoteDraftStartedAt(n.createdAt || Date.now());
    setNoteDialogOpen(true);
  };

  const openNewNoteDialog = () => {
    startNewNote();
    setNoteDialogOpen(true);
  };

  const saveNote = () => {
    const title = (noteDraft.title || "").trim();
    const body = (noteDraft.body || "").trim();
    if (!title && !body) {
      flash(setToast, "Qeyd boş ola bilməz.", "error");
      return;
    }
    const now = Date.now();
    const remindAt = (noteDraft.remindAt || "").trim() || undefined;
    if (noteEditId) {
      setWorkspace((w) => ({
        ...w,
        notes: (w.notes ?? []).map((n) =>
          n.id === noteEditId
            ? {
                ...n,
                title,
                body,
                remindAt,
                updatedAt: now,
                remindedAt: remindAt && remindAt === n.remindAt ? n.remindedAt : undefined,
              }
            : n,
        ),
      }));
      flash(setToast, "Qeyd yeniləndi");
    } else {
      const n: NoteRecord = {
        id: crypto.randomUUID(),
        title,
        body,
        remindAt,
        createdAt: now,
        updatedAt: now,
        done: false,
      };
      setWorkspace((w) => ({ ...w, notes: [...(w.notes ?? []), n] }));
      flash(setToast, "Qeyd əlavə olundu");
    }
    startNewNote();
    setNoteDialogOpen(false);
  };

  const deleteNote = async (id: string) => {
    const ok = await askConfirm({
      title: "Silmə təsdiqi",
      message: "Bu qeyd silinsin?",
      confirmLabel: "Sil",
      cancelLabel: "Ləğv et",
      danger: true,
    });
    if (!ok) return;
    setWorkspace((w) => ({ ...w, notes: (w.notes ?? []).filter((n) => n.id !== id) }));
    if (noteEditId === id) startNewNote();
    flash(setToast, "Qeyd silindi");
  };

  const toggleNoteDone = (id: string) => {
    setWorkspace((w) => ({
      ...w,
      notes: (w.notes ?? []).map((n) =>
        n.id === id ? { ...n, done: !n.done, remindedAt: !n.done ? undefined : n.remindedAt, updatedAt: Date.now() } : n,
      ),
    }));
  };

  const resetOfferDraft = () => {
    setOfferEditId(null);
    setOfferDraft(emptyOfferDraft());
  };

  const openNewOfferForm = () => {
    resetOfferDraft();
    setOfferMode("form");
  };

  const cancelOfferForm = () => {
    resetOfferDraft();
    setOfferMode("list");
  };

  const rowDraftToRecord = (r: OfferRowDraft): SupplierOfferRow | null => {
    const supplierName = r.supplierName.trim();
    const name = r.name.trim();
    const replacementName = r.replacementName.trim();
    const purchasePrice = Number(String(r.purchasePrice).replace(",", "."));
    const purchasePriceWithVat = Number(String(r.purchasePriceWithVat).replace(",", "."));
    const qty = Number(String(r.qty).replace(",", "."));
    const salePrice = Number(String(r.salePrice).replace(",", "."));
    const hasEx = Number.isFinite(purchasePrice) && purchasePrice > 0;
    const hasInc = Number.isFinite(purchasePriceWithVat) && purchasePriceWithVat > 0;
    if (
      !supplierName ||
      (!name && !replacementName) ||
      (!hasEx && !hasInc) ||
      !Number.isFinite(qty) ||
      qty <= 0
    )
      return null;
    const row: SupplierOfferRow = {
      id: r.id,
      supplierName,
      name,
      purchasePrice: hasEx ? purchasePrice : 0,
      qty,
      salePrice: Number.isFinite(salePrice) && salePrice > 0 ? salePrice : 0,
      purchasePriceSource: r.purchasePriceSource,
    };
    if (hasInc) row.purchasePriceWithVat = purchasePriceWithVat;
    if (replacementName) row.replacementName = replacementName;
    const parsedMargin = parseMarginPercent(r.marginPercent);
    if (parsedMargin != null) row.marginPercent = parsedMargin;
    return row;
  };

  const offerRowToDraft = (r: SupplierOfferRow): OfferRowDraft => ({
    id: r.id,
    supplierName: r.supplierName,
    name: r.name,
    replacementName: r.replacementName?.trim() || "",
    purchasePrice: r.purchasePrice > 0 ? String(r.purchasePrice) : "",
    purchasePriceWithVat: (r.purchasePriceWithVat ?? 0) > 0 ? String(r.purchasePriceWithVat) : "",
    purchasePriceSource:
      r.purchasePriceSource ??
      ((r.purchasePriceWithVat ?? 0) > 0 && r.purchasePrice <= 0 ? "inc" : "ex"),
    qty: r.qty > 0 ? String(r.qty) : "1",
    marginPercent: typeof r.marginPercent === "number" ? String(r.marginPercent) : "",
    salePrice: r.salePrice > 0 ? String(r.salePrice) : "",
    saleManual: true,
  });

  const updateOfferRow = (id: string, patch: Partial<OfferRowDraft>) => {
    setOfferDraft((d) => ({
      ...d,
      rows: d.rows.map((row) => {
        if (row.id !== id) return row;
        const next = { ...row, ...patch };
        if (patch.purchasePrice !== undefined) next.purchasePriceSource = "ex";
        if (patch.purchasePriceWithVat !== undefined) next.purchasePriceSource = "inc";
        const purchase = draftPurchaseForMargin(next);
        const margin = parseMarginPercent(next.marginPercent);
        const shouldRecalc =
          !next.saleManual ||
          patch.purchasePrice !== undefined ||
          patch.purchasePriceWithVat !== undefined ||
          patch.marginPercent !== undefined;
        if (shouldRecalc && purchase > 0 && margin != null) {
          next.salePrice = String(calcSaleFromMargin(purchase, margin));
          next.saleManual = false;
        } else if (patch.salePrice !== undefined) {
          next.saleManual = true;
        }
        return next;
      }),
    }));
  };

  const startEditOffer = (o: SupplierOfferRecord) => {
    setOfferEditId(o.id);
    setOfferDraft({
      companyId: o.companyId,
      offerDate: o.offerDate,
      rows: o.rows.length > 0 ? o.rows.map(offerRowToDraft) : [emptyOfferRow()],
    });
    setOfferMode("form");
  };

  const ensureSupplierByName = (w: DocWorkspace, name: string, now: number): DocWorkspace => {
    const trimmed = name.trim();
    const existing = (w.suppliers ?? []).find((s) => s.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (existing) return w;
    const id = crypto.randomUUID();
    const rec: SupplierRecord = { id, name: trimmed, createdAt: now, updatedAt: now };
    const folder: WorkspaceFolderRecord = {
      id: crypto.randomUUID(),
      kind: "supplier",
      supplierId: id,
      name: trimmed,
      createdAt: now,
      updatedAt: now,
      files: [],
    };
    return {
      ...w,
      suppliers: [...(w.suppliers ?? []), rec],
      folders: [...(w.folders ?? []), folder],
    };
  };

  const saveOffer = () => {
    const companyId = offerDraft.companyId.trim();
    if (!companyId) {
      flash(setToast, "Təklif olunan şirkəti seçin.", "error");
      return;
    }
    const rows = offerDraft.rows.map(rowDraftToRecord).filter((r): r is SupplierOfferRow => Boolean(r));
    if (rows.length === 0) {
      flash(setToast, "Hər sətirdə təchizatçı, məhsul və ya əvəz məhsul və alış qiyməti (ƏDV-siz və ya ƏDV daxil) daxil edin.", "error");
      return;
    }
    const offerDate = offerDraft.offerDate.trim() || new Date().toISOString().slice(0, 10);
    const preservedNote =
      offerEditId != null
        ? (workspace.supplierOffers ?? []).find((o) => o.id === offerEditId)?.note?.trim() || ""
        : "";
    const now = Date.now();

    setWorkspace((w) => {
      let next = w;
      const uniqueSuppliers = [...new Set(rows.map((r) => r.supplierName.trim()).filter(Boolean))];
      for (const supplierName of uniqueSuppliers) {
        next = ensureSupplierByName(next, supplierName, now);
      }
      if (offerEditId) {
        return {
          ...next,
          supplierOffers: (next.supplierOffers ?? []).map((o) => {
            if (o.id !== offerEditId) return o;
            const rec: SupplierOfferRecord = {
              id: o.id,
              companyId,
              offerDate,
              rows,
              createdAt: o.createdAt,
              updatedAt: now,
            };
            if (preservedNote) rec.note = preservedNote;
            return rec;
          }),
        };
      }
      const rec: SupplierOfferRecord = {
        id: crypto.randomUUID(),
        companyId,
        offerDate,
        rows,
        createdAt: now,
        updatedAt: now,
      };
      return { ...next, supplierOffers: [...(next.supplierOffers ?? []), rec] };
    });

    flash(setToast, offerEditId ? "Təklif yeniləndi" : "Təklif əlavə olundu");
    resetOfferDraft();
    setOfferMode("list");
  };

  const deleteOffer = async (id: string) => {
    const ok = await askConfirm({
      title: "Silmə təsdiqi",
      message: "Bu təchizatçı təklifi silinsin?",
      confirmLabel: "Sil",
      cancelLabel: "Ləğv et",
      danger: true,
    });
    if (!ok) return;
    setWorkspace((w) => ({ ...w, supplierOffers: (w.supplierOffers ?? []).filter((o) => o.id !== id) }));
    if (offerEditId === id) resetOfferDraft();
    flash(setToast, "Təklif silindi");
  };

  const resetStoreOrderDraft = () => {
    setStoreOrderEditId(null);
    setStoreOrderDraft(emptyStoreOrderDraft());
  };

  const openNewStoreOrderForm = () => {
    resetStoreOrderDraft();
    setStoreOrderMode("form");
  };

  const cancelStoreOrderForm = () => {
    resetStoreOrderDraft();
    setStoreOrderMode("list");
  };

  const startEditStoreOrder = (o: StoreOrderRecord) => {
    setStoreOrderEditId(o.id);
    setStoreOrderDraft({
      orderDate: o.orderDate,
      status: o.status,
      note: o.note || "",
      rows: o.rows.length > 0 ? o.rows.map((r) => ({ ...r })) : [newOrderLineRow()],
    });
    setStoreOrderMode("form");
  };

  const saveStoreOrder = () => {
    const rows = normalizeOrderDraftRows(storeOrderDraft.rows);
    if (rows.length === 0) {
      flash(setToast, "Hər sətirdə məhsul, miqdar, alış qiyməti və təchizatçı daxil edin.", "error");
      return;
    }
    const orderDate = storeOrderDraft.orderDate.trim() || new Date().toISOString().slice(0, 10);
    const note = storeOrderDraft.note.trim();
    const now = Date.now();
    if (storeOrderEditId) {
      setWorkspace((w) => ({
        ...w,
        storeOrders: (w.storeOrders ?? []).map((o) => {
          if (o.id !== storeOrderEditId) return o;
          const rec: StoreOrderRecord = {
            id: o.id,
            orderDate,
            status: storeOrderDraft.status,
            rows,
            createdAt: o.createdAt,
            updatedAt: now,
          };
          if (note) rec.note = note;
          return rec;
        }),
      }));
      flash(setToast, "Mağaza sifarişi yeniləndi");
    } else {
      const rec: StoreOrderRecord = {
        id: crypto.randomUUID(),
        orderDate,
        status: storeOrderDraft.status,
        rows,
        createdAt: now,
        updatedAt: now,
      };
      if (note) rec.note = note;
      setWorkspace((w) => ({ ...w, storeOrders: [...(w.storeOrders ?? []), rec] }));
      flash(setToast, "Mağaza sifarişi əlavə olundu");
    }
    cancelStoreOrderForm();
  };

  const deleteStoreOrder = async (id: string) => {
    const ok = await askConfirm({
      title: "Silmə təsdiqi",
      message: "Bu mağaza sifarişi silinsin?",
      confirmLabel: "Sil",
      cancelLabel: "Ləğv et",
      danger: true,
    });
    if (!ok) return;
    setWorkspace((w) => ({ ...w, storeOrders: (w.storeOrders ?? []).filter((o) => o.id !== id) }));
    if (storeOrderEditId === id) resetStoreOrderDraft();
    flash(setToast, "Mağaza sifarişi silindi");
  };

  const patchStoreOrderStatus = (id: string, status: OrderStatus) => {
    setWorkspace((w) => ({
      ...w,
      storeOrders: (w.storeOrders ?? []).map((o) => (o.id === id ? { ...o, status, updatedAt: Date.now() } : o)),
    }));
  };

  const resetCustomerOrderDraft = () => {
    setCustomerOrderEditId(null);
    setCustomerOrderDraft(emptyCustomerOrderDraft());
  };

  const openNewCustomerOrderForm = () => {
    resetCustomerOrderDraft();
    setCustomerOrderMode("form");
  };

  const cancelCustomerOrderForm = () => {
    resetCustomerOrderDraft();
    setCustomerOrderMode("list");
  };

  const startEditCustomerOrder = (o: CustomerOrderRecord) => {
    setCustomerOrderEditId(o.id);
    setCustomerOrderDraft({
      customerName: o.customerName,
      customerPhone: o.customerPhone || "",
      orderDate: o.orderDate,
      status: o.status,
      note: o.note || "",
      rows: o.rows.length > 0 ? o.rows.map((r) => ({ ...r })) : [newOrderLineRow()],
    });
    setCustomerOrderMode("form");
  };

  const saveCustomerOrder = () => {
    const customerName = customerOrderDraft.customerName.trim();
    const rows = normalizeOrderDraftRows(customerOrderDraft.rows);
    if (!customerName) {
      flash(setToast, "Müştəri adını daxil edin.", "error");
      return;
    }
    if (rows.length === 0) {
      flash(setToast, "Hər sətirdə məhsul, miqdar, alış qiyməti və təchizatçı daxil edin.", "error");
      return;
    }
    const orderDate = customerOrderDraft.orderDate.trim() || new Date().toISOString().slice(0, 10);
    const customerPhone = customerOrderDraft.customerPhone.trim();
    const note = customerOrderDraft.note.trim();
    const now = Date.now();
    if (customerOrderEditId) {
      setWorkspace((w) => ({
        ...w,
        customerOrders: (w.customerOrders ?? []).map((o) => {
          if (o.id !== customerOrderEditId) return o;
          const rec: CustomerOrderRecord = {
            id: o.id,
            customerName,
            orderDate,
            status: customerOrderDraft.status,
            rows,
            createdAt: o.createdAt,
            updatedAt: now,
          };
          if (customerPhone) rec.customerPhone = customerPhone;
          if (note) rec.note = note;
          return rec;
        }),
      }));
      flash(setToast, "Müştəri sifarişi yeniləndi");
    } else {
      const rec: CustomerOrderRecord = {
        id: crypto.randomUUID(),
        customerName,
        orderDate,
        status: customerOrderDraft.status,
        rows,
        createdAt: now,
        updatedAt: now,
      };
      if (customerPhone) rec.customerPhone = customerPhone;
      if (note) rec.note = note;
      setWorkspace((w) => ({ ...w, customerOrders: [...(w.customerOrders ?? []), rec] }));
      flash(setToast, "Müştəri sifarişi əlavə olundu");
    }
    cancelCustomerOrderForm();
  };

  const deleteCustomerOrder = async (id: string) => {
    const ok = await askConfirm({
      title: "Silmə təsdiqi",
      message: "Bu müştəri sifarişi silinsin?",
      confirmLabel: "Sil",
      cancelLabel: "Ləğv et",
      danger: true,
    });
    if (!ok) return;
    setWorkspace((w) => ({ ...w, customerOrders: (w.customerOrders ?? []).filter((o) => o.id !== id) }));
    if (customerOrderEditId === id) resetCustomerOrderDraft();
    flash(setToast, "Müştəri sifarişi silindi");
  };

  const patchCustomerOrderStatus = (id: string, status: OrderStatus) => {
    setWorkspace((w) => ({
      ...w,
      customerOrders: (w.customerOrders ?? []).map((o) => (o.id === id ? { ...o, status, updatedAt: Date.now() } : o)),
    }));
  };

  const openOrderSupplierPdfDialog = (kind: OrderModuleKind, id: string) => {
    setOrderSupplierPdfTarget({ kind, id });
  };

  const closeOrderSupplierPdfDialog = () => {
    setOrderSupplierPdfTarget(null);
    setOrderSupplierPdfSupplier("");
  };

  const printOrderSupplierDoc = async (): Promise<boolean> => {
    if (!pdfOrder) {
      flash(setToast, "Sifariş tapılmadı.", "error");
      return false;
    }
    const supplier = orderSupplierPdfSupplier.trim();
    if (!supplier) {
      flash(setToast, "Təchizatçı seçin.", "error");
      return false;
    }
    const rows = pdfOrder.rows.filter((r) => r.supplierName.trim().toLowerCase() === supplier.toLowerCase());
    if (rows.length === 0) {
      flash(setToast, "Seçilən təchizatçı üçün məhsul yoxdur.", "error");
      return false;
    }
    const title = orderSupplierPdfTarget?.kind === "customerOrder" ? "Müştəri sifarişi" : "Mağaza sifarişi";
    const customerName = orderSupplierPdfTarget?.kind === "customerOrder" ? pdfCustomerOrder?.customerName : undefined;
    const html = buildOrderSupplierPdfHtml({
      title,
      orderDate: pdfOrder.orderDate,
      supplierName: supplier,
      rows,
      ...(customerName ? { customerName } : {}),
    });
    openPrintableDocument(html);
    flash(setToast, "Çap pəncərəsi açıldı");
    return true;
  };

  const patchStoreOrderLine = (id: string, patch: Partial<OrderLineRow>) => {
    setStoreOrderDraft((d) => ({
      ...d,
      rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const patchCustomerOrderLine = (id: string, patch: Partial<OrderLineRow>) => {
    setCustomerOrderDraft((d) => ({
      ...d,
      rows: d.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    }));
  };

  const renderOrderLinesTable = (
    rows: OrderLineRow[],
    onPatch: (id: string, patch: Partial<OrderLineRow>) => void,
    onAdd: () => void,
    onRemove: (id: string) => void,
  ) => (
    <div className="dg-table-wrap pg-grid-host">
      <table className="dg-table dg-table--order-lines">
        <thead>
          <tr>
            <th className="dg-th-num">№</th>
              <th className="dg-order-col-product">Məhsul</th>
              <th className="dg-order-col-qty">Miqdar</th>
              <th className="dg-order-col-price">Alış qiyməti</th>
              <th className="dg-order-col-supplier">Təchizatçı</th>
              <th className="dg-order-col-total">Cəm</th>
            <th className="dg-th-actions">Sil</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr>
              <td colSpan={7} className="dg-empty-cell">
                Məhsul sətri əlavə edin.
              </td>
            </tr>
          ) : (
            rows.map((r, idx) => (
              <tr key={r.id}>
                <td className="dg-td-num">{idx + 1}</td>
                <td className="dg-order-col-product">
                  <input
                    className="dg-input dg-input-table"
                    value={r.name}
                    onChange={(e) => onPatch(r.id, { name: e.target.value })}
                  />
                </td>
                <td className="dg-order-col-qty">
                  <input
                    className="dg-input dg-input-table dg-input-num"
                    type="number"
                    min={0}
                    step="any"
                    value={r.qty}
                    onChange={(e) => onPatch(r.id, { qty: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="dg-order-col-price">
                  <input
                    className="dg-input dg-input-table dg-input-num"
                    type="number"
                    min={0}
                    step="0.01"
                    value={r.purchasePrice}
                    onChange={(e) => onPatch(r.id, { purchasePrice: Number(e.target.value) || 0 })}
                  />
                </td>
                <td className="dg-order-col-supplier">
                  <input
                    className="dg-input dg-input-table"
                    value={r.supplierName}
                    onChange={(e) => onPatch(r.id, { supplierName: e.target.value })}
                  />
                </td>
                <td className="dg-td-amount dg-order-col-total">{formatMoney(r.qty * r.purchasePrice)}</td>
                <td className="dg-td-actions">
                  <button
                    type="button"
                    className="dg-icon-btn dg-icon-btn-danger dg-icon-btn--compact"
                    aria-label="Sil"
                    title="Sil"
                    onClick={() => onRemove(r.id)}
                  >
                    <IconTrash />
                  </button>
                </td>
              </tr>
            ))
          )}
        </tbody>
      </table>
      <div className="dg-form-footer-actions" style={{ marginTop: "0.75rem" }}>
        <button type="button" className="dg-btn dg-btn-secondary" onClick={onAdd}>
          Sətir əlavə et
        </button>
      </div>
    </div>
  );

  const renderOrderListTable = <
    T extends {
      id: string;
      status: OrderStatus;
      rows: OrderLineRow[];
      orderDate?: string;
      customerName?: string;
    },
  >(
    orders: T[],
    opts: {
      showCustomer: boolean;
      showDate: boolean;
      onInfo: (order: T) => void;
      onEdit: (order: T) => void;
      onDelete: (id: string) => void;
      onDownloadPdf: (order: T) => void;
      onStatusChange: (id: string, status: OrderStatus) => void;
    },
  ) => {
    return (
      <div className="dg-table-wrap pg-grid-host">
        <table className="dg-table dg-table--order-summary">
          <thead>
            <tr>
              <th className="dg-th-num">№</th>
              {opts.showDate ? <th>Tarix</th> : null}
              {opts.showCustomer ? <th>Müştəri</th> : null}
              <th>Status</th>
              <th className="dg-order-col-products">Məhsul sayı</th>
              <th className="dg-order-col-qty">Ümumi miqdar</th>
              <th className="dg-order-col-total">Cəm</th>
              <th className="dg-th-actions">Əməliyyatlar</th>
            </tr>
          </thead>
          <tbody>
            {orders.map((o, idx) => {
              const productCount = o.rows.length;
              const totalQty = o.rows.reduce((sum, r) => sum + (Number(r.qty) || 0), 0);
              const totalAmount = o.rows.reduce((sum, r) => sum + (Number(r.qty) || 0) * (Number(r.purchasePrice) || 0), 0);
              return (
                <tr key={o.id}>
                  <td className="dg-td-num">{idx + 1}</td>
                  {opts.showDate ? <td>{o.orderDate ? formatDateAzLong(o.orderDate) : "—"}</td> : null}
                  {opts.showCustomer ? <td>{o.customerName || "—"}</td> : null}
                  <td className="dg-order-status-cell">
                    <OrderStatusPicker
                      status={o.status}
                      onChange={(status) => opts.onStatusChange(o.id, status)}
                    />
                  </td>
                  <td className="dg-td-amount dg-order-col-products">{productCount}</td>
                  <td className="dg-td-amount dg-order-col-qty">{totalQty}</td>
                  <td className="dg-td-amount dg-order-col-total">{formatMoney(totalAmount)}</td>
                  <td className="dg-td-actions">
                    <div className="dg-icon-row">
                      <button
                        type="button"
                        className="dg-icon-btn"
                        title="Məlumat"
                        aria-label="Məlumat"
                        onClick={() => opts.onInfo(o)}
                      >
                        <IconInfo />
                      </button>
                      <button
                        type="button"
                        className="dg-icon-btn"
                        title="Redaktə et"
                        aria-label="Redaktə et"
                        onClick={() => opts.onEdit(o)}
                      >
                        <IconEdit />
                      </button>
                      <button
                        type="button"
                        className="dg-icon-btn"
                        title="Çap et (təchizatçı seçimi)"
                        aria-label="Çap et"
                        onClick={() => opts.onDownloadPdf(o)}
                      >
                        <IconPrint />
                      </button>
                      <button
                        type="button"
                        className="dg-icon-btn dg-icon-btn-danger"
                        title="Sil"
                        aria-label="Sil"
                        onClick={() => opts.onDelete(o.id)}
                      >
                        <IconTrash />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    );
  };

  const renderOrderInfoLinesTable = (rows: OrderLineRow[]) => (
    <>
      <div className="dg-info-section-title">Məhsullar</div>
      <div className="dg-info-table-wrap dg-info-table-wrap--order-lines">
        <table className="dg-info-table dg-info-table--order-lines">
          <thead>
            <tr>
              <th style={{ width: 54 }} className="dg-num">
                №
              </th>
              <th>Məhsul</th>
              <th style={{ width: 90 }} className="dg-num">
                Miqdar
              </th>
              <th style={{ width: 120 }} className="dg-num">
                Alış qiyməti
              </th>
              <th style={{ width: 140 }}>Təchizatçı</th>
              <th style={{ width: 120 }} className="dg-num">
                Cəm
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={r.id}>
                <td className="dg-num">{idx + 1}</td>
                <td>{r.name || "—"}</td>
                <td className="dg-num">{r.qty}</td>
                <td className="dg-num">{formatMoney(r.purchasePrice)}</td>
                <td>{r.supplierName || "—"}</td>
                <td className="dg-num">{formatMoney(r.qty * r.purchasePrice)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={5} className="dg-num" style={{ fontWeight: 700 }}>
                Yekun
              </td>
              <td className="dg-num" style={{ fontWeight: 800 }}>
                {formatMoney(orderPurchaseTotal(rows))}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>
    </>
  );

  const companyLabel = (companyId?: string) => {
    const c = companyId ? companyById.get(companyId) : undefined;
    return c?.profile.name?.trim() || c?.profile.voen?.trim() || "—";
  };

  const appendProjectFromOfferData = (
    companyId: string,
    offerDate: string,
    officialRows: ProductRow[],
    cashRows: ProductRow[],
    titleHint?: string,
  ) => {
    const normOfficial = normalizeProductRows(officialRows).filter((r) => r.unitPrice > 0 && r.qty > 0);
    const normCash = normalizeProductRows(cashRows).filter((r) => r.unitPrice > 0 && r.qty > 0);
    if (normOfficial.length === 0 && normCash.length === 0) {
      flash(setToast, "Satış qiyməti olan ən azı bir məhsul sətri lazımdır.", "error");
      return false;
    }
    const invoiceDate = (offerDate || "").trim() || new Date().toISOString().slice(0, 10);
    const companyName = companyLabel(companyId);
    const baseTitle = titleHint?.trim() || companyName;
    const dateLabel = formatDateAzLong(invoiceDate);
    const now = Date.now();

    const makeMeta = (seq: { invoice: number; delivery: number; protocol: number; quote?: number }): DocumentMeta => ({
      ...emptyMeta(),
      invoiceDate,
      invoiceNumber: `${yy(invoiceDate)}${mm(invoiceDate)}-${pad3(seq.invoice)}`,
      deliveryActNumber: `${pad3(seq.delivery)}/${yy(invoiceDate)}`,
      protocolNumber: `${pad3(seq.protocol)}/${yy(invoiceDate)}`,
      quoteNumber: `${pad3(seq.quote ?? 1)}/${yy(invoiceDate)}`,
    });

    const hadOfficial = normOfficial.length > 0;
    const hadCash = normCash.length > 0;

    setWorkspace((w) => {
      const seq = w.settings.docSeq ?? { invoice: 1, delivery: 1, protocol: 1, quote: 1 };
      let nextSeq = { ...seq, quote: seq.quote ?? 1 };
      const nextProjects = [...w.projects];

      const bumpSeq = () => {
        nextSeq = {
          invoice: nextSeq.invoice + 1,
          delivery: nextSeq.delivery + 1,
          protocol: nextSeq.protocol + 1,
          quote: (nextSeq.quote ?? 1) + 1,
        };
      };

      const makeProject = (
        billingMode: "official" | "cash",
        vatPercent: number,
        label: string,
        metaSeq: typeof seq,
        projectRows: ProductRow[],
      ): ProjectRecord => ({
        id: crypto.randomUUID(),
        title: `${baseTitle} — ${label} — ${dateLabel}`,
        companyId,
        rows: projectRows,
        meta: makeMeta(metaSeq),
        vatPercent,
        billingMode,
        createdAt: now,
        updatedAt: now,
      });

      if (normOfficial.length > 0) {
        nextProjects.push(
          makeProject("official", SUPPLIER_OFFER_PROJECT_VAT_PERCENT, "Rəsmi", nextSeq, normOfficial),
        );
        bumpSeq();
      }
      if (normCash.length > 0) {
        nextProjects.push(makeProject("cash", 0, "Nağd", nextSeq, normCash));
        bumpSeq();
      }

      return {
        ...w,
        settings: { ...w.settings, docSeq: nextSeq },
        projects: nextProjects,
      };
    });

    const toastMsg =
      hadOfficial && hadCash
        ? "Rəsmi və nağd təkliflər yaradıldı — «Təkliflər» bölməsində çap edə bilərsiniz"
        : hadOfficial
          ? "Rəsmi təklif yaradıldı — «Təkliflər» bölməsində çap edə bilərsiniz"
          : "Nağd təklif yaradıldı — «Təkliflər» bölməsində çap edə bilərsiniz";
    flash(setToast, toastMsg);
    setModule("projects");
    return true;
  };

  const createProjectFromSupplierOffer = (offer: SupplierOfferRecord) => {
    const officialRows = buildOfferProductRows(offer.rows, "official");
    const cashRows = buildOfferProductRows(offer.rows, "cash");
    appendProjectFromOfferData(offer.companyId, offer.offerDate, officialRows, cashRows);
  };

  const createProjectFromOfferDraft = () => {
    const companyId = offerDraft.companyId.trim();
    if (!companyId) {
      flash(setToast, "Əvvəlcə şirkət seçin.", "error");
      return;
    }
    const officialRows = buildOfferProductRowsFromDraft(offerDraft.rows, "official");
    const cashRows = buildOfferProductRowsFromDraft(offerDraft.rows, "cash");
    const offerDate = offerDraft.offerDate.trim() || new Date().toISOString().slice(0, 10);
    appendProjectFromOfferData(companyId, offerDate, officialRows, cashRows);
  };

  const renderSuppliersModule = () => {
    const offers = sortedSupplierOffers;

    if (offerMode === "form") {
      const draftTotals = offerDraftTotals(offerDraft.rows);

      return (
        <div className="dg-form-page pg-panel" aria-label={offerEditId ? "Təklif redaktəsi" : "Yeni təklif"}>
          <header className="dg-form-page-head">
            <div>
              <h1 className="dg-form-page-title">Təchizatçı təklifləri</h1>
              <nav className="dg-form-bc" aria-label="Yol">
                <span>Sənəd generatoru</span>
                <span className="dg-form-bc-sep" aria-hidden>
                  ›
                </span>
                <span>Təchizatçı təklifləri</span>
                <span className="dg-form-bc-sep" aria-hidden>
                  ›
                </span>
                <span className="dg-form-bc-current">{offerEditId ? "Redaktə" : "Yeni təklif"}</span>
              </nav>
            </div>
            <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelOfferForm}>
              Siyahı
            </button>
          </header>

          <div className="dg-form-page-body dg-project-form-body">
            <section className="dg-form-inner-panel dg-offer-company-panel" aria-labelledby="dg-offer-base-heading">
              <h2 id="dg-offer-base-heading" className="dg-form-inner-panel-title">
                Təklif olunan şirkət
              </h2>
              <div className="dg-form-meta-grid dg-form-meta-grid--project">
                <label className="dg-field">
                  <span className="dg-label">Şirkət</span>
                  <select
                    className="dg-input"
                    value={offerDraft.companyId}
                    onChange={(e) => setOfferDraft((d) => ({ ...d, companyId: e.target.value }))}
                  >
                    <option value="">Seçin…</option>
                    {sortedCompanies.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.profile.name?.trim() || c.profile.voen?.trim() || "Şirkət"}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="dg-field">
                  <span className="dg-label">Təklif tarixi</span>
                  <input
                    className="dg-input"
                    type="date"
                    value={offerDraft.offerDate}
                    onChange={(e) => setOfferDraft((d) => ({ ...d, offerDate: e.target.value }))}
                  />
                </label>
              </div>
              {sortedCompanies.length === 0 ? (
                <p className="dg-muted dg-offer-company-hint">Əvvəlcə «Şirkətlər» bölməsində şirkət əlavə edin.</p>
              ) : null}
            </section>

            <section className="dg-form-inner-panel dg-offer-products-panel" aria-labelledby="dg-offer-products-heading">
              <div className="dg-offer-products-head">
                <h2 id="dg-offer-products-heading" className="dg-form-inner-panel-title">
                  Məhsullar
                </h2>
                <div className="dg-offer-products-head-right">
                  <div className="dg-offer-summary-inline" aria-label="Yekunlar">
                    <span>
                      Alış (ƏDV-siz): <strong>{formatMoney(draftTotals.purchaseEx)}</strong>
                    </span>
                    <span>
                      Alış (ƏDV daxil): <strong>{formatMoney(draftTotals.purchaseInc)}</strong>
                    </span>
                    <span>
                      Satış (rəsmi, ƏDV-siz): <strong>{formatMoney(draftTotals.saleOfficial)}</strong>
                    </span>
                    <span>
                      ƏDV ({OFFICIAL_VAT_PERCENT}%): <strong>{formatMoney(draftTotals.saleOfficialVat)}</strong>
                    </span>
                    <span>
                      Yekun (rəsmi): <strong>{formatMoney(draftTotals.saleOfficialGrand)}</strong>
                    </span>
                    <span>
                      Satış (nağd): <strong>{formatMoney(draftTotals.saleCash)}</strong>
                    </span>
                  </div>
                  <button
                    type="button"
                    className="dg-btn dg-btn-primary"
                    onClick={() => setOfferDraft((d) => ({ ...d, rows: [...d.rows, emptyOfferRow()] }))}
                  >
                    Sətir əlavə et
                  </button>
                </div>
              </div>
              <div className="dg-table-wrap pg-grid-host dg-project-lines-wrap dg-offer-table-wrap">
                <table className="dg-table dg-table--sales dg-table--offer">
                  <thead>
                    <tr>
                      <th className="dg-th-num dg-offer-col-idx">№</th>
                      <th className="dg-offer-col-supplier">Təchizatçı</th>
                      <th className="dg-offer-col-product">Məhsul adı</th>
                      <th className="dg-offer-col-replacement">Əvəz məhsul</th>
                      <th className="dg-th-num dg-offer-col-price" title="ƏDV-siz alış">
                        ƏDV-siz
                      </th>
                      <th className="dg-th-num dg-offer-col-price" title="ƏDV daxil alış">
                        ƏDV daxil
                      </th>
                      <th className="dg-th-num dg-offer-col-qty">Miqd.</th>
                      <th className="dg-th-num dg-offer-col-margin">Faiz %</th>
                      <th className="dg-th-num dg-offer-col-price" title="Əl ilə satış (aktiv alış sütununa aiddir)">
                        Satış*
                      </th>
                      <th className="dg-th-num dg-offer-col-total">Alış c.</th>
                      <th className="dg-th-num dg-offer-col-sale-computed">Sat. rəsmi</th>
                      <th className="dg-th-num dg-offer-col-sale-computed">Sat. nağd</th>
                      <th className="dg-th-actions dg-offer-col-actions">Sil</th>
                    </tr>
                  </thead>
                  <tbody>
                    {offerDraft.rows.length === 0 ? (
                      <tr>
                        <td colSpan={13} className="dg-empty-cell">
                          «Sətir əlavə et» düyməsi ilə məhsul əlavə edin.
                        </td>
                      </tr>
                    ) : (
                      offerDraft.rows.map((r, idx) => {
                        const purchaseEx = resolveOfferPurchaseFromDraft(r);
                        const purchaseInc = resolveOfferPurchaseIncFromDraft(r);
                        const qty = Number(String(r.qty).replace(",", ".")) || 0;
                        const saleOfficial = resolveOfferSaleFromDraft(r, "official");
                        const saleCash = resolveOfferSaleFromDraft(r, "cash");
                        const purchaseLineTotal =
                          r.purchasePriceSource === "inc" ? purchaseInc * qty : purchaseEx * qty;
                        const saleSource = resolveOfferSalePriceSourceFromDraft(r);
                        return (
                          <tr key={r.id}>
                            <td className="dg-td-num">{idx + 1}</td>
                            <td className="dg-offer-col-supplier">
                              <input
                                className="dg-input dg-input-table dg-input-offer-supplier"
                                list="dg-supplier-names"
                                value={r.supplierName}
                                onChange={(e) => updateOfferRow(r.id, { supplierName: e.target.value })}
                                placeholder="Təchizatçı"
                              />
                            </td>
                            <td className="dg-offer-col-product">
                              <input
                                className="dg-input dg-input-table dg-input-offer-product"
                                value={r.name}
                                onChange={(e) => updateOfferRow(r.id, { name: e.target.value })}
                                placeholder="Əsas məhsul"
                              />
                            </td>
                            <td className="dg-offer-col-replacement">
                              <input
                                className="dg-input dg-input-table dg-input-offer-product"
                                value={r.replacementName}
                                onChange={(e) => updateOfferRow(r.id, { replacementName: e.target.value })}
                                placeholder="Əvəz məhsul"
                              />
                            </td>
                            <td className="dg-offer-col-price">
                              <input
                                className="dg-input dg-input-table dg-input-num dg-input-offer-num"
                                type="number"
                                min="0"
                                step="0.01"
                                value={r.purchasePrice}
                                onChange={(e) => updateOfferRow(r.id, { purchasePrice: e.target.value })}
                                placeholder="ƏDV-siz"
                              />
                            </td>
                            <td className="dg-offer-col-price">
                              <input
                                className="dg-input dg-input-table dg-input-num dg-input-offer-num"
                                type="number"
                                min="0"
                                step="0.01"
                                value={r.purchasePriceWithVat}
                                onChange={(e) => updateOfferRow(r.id, { purchasePriceWithVat: e.target.value })}
                                placeholder="ƏDV daxil"
                              />
                            </td>
                            <td className="dg-offer-col-qty">
                              <input
                                className="dg-input dg-input-table dg-input-num dg-input-offer-num"
                                type="number"
                                min="0"
                                step="any"
                                value={r.qty}
                                onChange={(e) => updateOfferRow(r.id, { qty: e.target.value })}
                              />
                            </td>
                            <td className="dg-offer-col-margin">
                              <input
                                className="dg-input dg-input-table dg-input-num dg-input-offer-num"
                                type="number"
                                step="0.01"
                                value={r.marginPercent}
                                onChange={(e) => updateOfferRow(r.id, { marginPercent: e.target.value })}
                                placeholder="%"
                              />
                            </td>
                            <td className="dg-offer-col-price">
                              <input
                                className="dg-input dg-input-table dg-input-num dg-input-offer-num"
                                type="number"
                                min="0"
                                step="0.01"
                                value={r.salePrice}
                                onChange={(e) => updateOfferRow(r.id, { salePrice: e.target.value })}
                                placeholder={saleSource === "inc" ? "Nağd" : "Rəsmi"}
                                title={saleSource === "inc" ? "Nağd satış (əl ilə)" : "Rəsmi satış (əl ilə)"}
                              />
                            </td>
                            <td className="dg-td-num dg-offer-col-total">{formatMoney(purchaseLineTotal)}</td>
                            <td className="dg-td-num dg-offer-col-sale-computed">{formatMoney(saleOfficial)}</td>
                            <td className="dg-td-num dg-offer-col-sale-computed">{formatMoney(saleCash)}</td>
                            <td className="dg-td-actions">
                              <button
                                type="button"
                                className="dg-icon-btn dg-icon-btn-danger dg-icon-btn--compact"
                                aria-label="Sil"
                                title="Sil"
                                onClick={() =>
                                  setOfferDraft((d) => ({
                                    ...d,
                                    rows: d.rows.length <= 1 ? d.rows : d.rows.filter((x) => x.id !== r.id),
                                  }))
                                }
                                disabled={offerDraft.rows.length <= 1}
                              >
                                <IconTrash />
                              </button>
                            </td>
                          </tr>
                        );
                      })
                    )}
                  </tbody>
                </table>
              </div>
              <p className="dg-muted dg-offer-table-hint">
                Satış* — son redaktə etdiyiniz alış sütununa (ƏDV-siz və ya ƏDV daxil) aiddir. «Sat. rəsmi» və «Sat. nağd»
                sütunları avtomatik hesablanır.
              </p>
              <datalist id="dg-supplier-names">
                {sortedSuppliers.map((s) => (
                  <option key={s.id} value={s.name} />
                ))}
              </datalist>
            </section>

            <footer className="dg-form-footer-actions dg-offer-form-footer">
              <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelOfferForm}>
                Bağla
              </button>
              <button
                type="button"
                className="dg-btn dg-btn-secondary"
                onClick={createProjectFromOfferDraft}
                disabled={sortedCompanies.length === 0}
              >
                Sənəd yarat
              </button>
              <button
                type="button"
                className="dg-btn dg-btn-primary"
                onClick={saveOffer}
                disabled={sortedCompanies.length === 0}
              >
                Yadda saxla
              </button>
            </footer>
          </div>
        </div>
      );
    }

    return (
      <div className="dg-form-page pg-panel" aria-label="Təchizatçı təklifləri siyahısı">
        <div className="dg-form-page-body">
          {offers.length === 0 ? (
            <p className="dg-muted dg-form-page-empty">Hələ təklif yoxdur — «Yeni təklif» ilə əlavə edin.</p>
          ) : (
            <div className="dg-table-wrap pg-grid-host dg-table-wrap--supplier-offers">
              <table className="dg-table dg-table--supplier-offers-list">
                <colgroup>
                  <col className="dg-so-col-num" />
                  <col className="dg-so-col-date" />
                  <col className="dg-so-col-company" />
                  <col className="dg-so-col-amount" />
                  <col className="dg-so-col-amount" />
                  <col className="dg-so-col-amount" />
                  <col className="dg-so-col-amount" />
                  <col className="dg-so-col-actions" />
                </colgroup>
                <thead>
                  <tr>
                    <th className="dg-th-num" scope="col">
                      №
                    </th>
                    <th className="dg-so-col-text" scope="col">
                      Tarix
                    </th>
                    <th className="dg-so-col-text" scope="col">
                      Şirkət
                    </th>
                    <th className="dg-th-amount" scope="col">
                      Sətir
                    </th>
                    <th className="dg-th-amount" scope="col">
                      Alış (ƏDV-siz)
                    </th>
                    <th className="dg-th-amount" scope="col">
                      Yekun (rəsmi)
                    </th>
                    <th className="dg-th-amount" scope="col">
                      Satış (nağd)
                    </th>
                    <th className="dg-th-actions" scope="col">
                      Əməliyyatlar
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {offers.map((o, i) => {
                    const totals = offerRowTotals(o.rows);
                    return (
                      <tr key={o.id}>
                        <td className="dg-td-num">{i + 1}</td>
                        <td className="dg-so-col-text">{formatDateAzLong(o.offerDate)}</td>
                        <td className="dg-so-col-text">{companyLabel(o.companyId)}</td>
                        <td className="dg-td-amount">{o.rows.length}</td>
                        <td className="dg-td-amount">{formatMoney(totals.purchaseEx)}</td>
                        <td className="dg-td-amount">{formatMoney(totals.saleOfficialGrand)}</td>
                        <td className="dg-td-amount">{formatMoney(totals.saleCash)}</td>
                        <td className="dg-td-actions">
                          <div className="dg-icon-row">
                            <button
                              type="button"
                              className="dg-icon-btn"
                              title="Məlumat"
                              aria-label="Məlumat"
                              onClick={() => setInfoDialog({ kind: "offer", id: o.id })}
                            >
                              <IconInfo />
                            </button>
                            <button
                              type="button"
                              className="dg-icon-btn"
                              title="Redaktə"
                              aria-label="Redaktə"
                              onClick={() => startEditOffer(o)}
                            >
                              <IconEdit />
                            </button>
                            <button
                              type="button"
                              className="dg-icon-btn dg-icon-btn-danger"
                              title="Sil"
                              aria-label="Sil"
                              onClick={() => deleteOffer(o.id)}
                            >
                              <IconTrash />
                            </button>
                            <button
                              type="button"
                              className="dg-btn dg-btn-secondary dg-offer-create-project-btn"
                              title="Sənəd yarat"
                              onClick={() => createProjectFromSupplierOffer(o)}
                            >
                              Sənəd
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderNotesModule = () => {
    const notes = [...(workspace.notes ?? [])].sort((a, b) => b.updatedAt - a.updatedAt);
    return (
      <div className="dg-form-page pg-panel" aria-label="Qeydlər">
        <header className="dg-form-page-head">
          <div>
            <h1 className="dg-form-page-title">Qeydlər</h1>
          </div>
        </header>
        <div className="dg-form-page-body">
          <div className="dg-folders-toolbar" aria-label="Qeydlər alət paneli">
            <div className="dg-folders-toolbar-left" />
            <div className="dg-folders-toolbar-right" />
          </div>

          {notes.length === 0 ? (
            <div className="dg-empty-state-card" role="status">
              <div className="dg-empty-state-title">Hələ qeyd yoxdur</div>
              <div className="dg-empty-state-desc">Yeni qeyd yazaraq reminder vaxtı təyin edə bilərsiniz.</div>
            </div>
          ) : (
            <div className="dg-notes-list" role="list" aria-label="Qeydlər siyahısı">
              {notes.map((n) => (
                <div key={n.id} className={`dg-note-row ${n.done ? "is-done" : ""}`} role="listitem">
                  <button type="button" className="dg-icon-btn dg-icon-btn--compact" onClick={() => setNoteInfoId(n.id)} aria-label="Məlumat">
                    <IconInfo />
                  </button>
                  <button type="button" className="dg-note-check" onClick={() => toggleNoteDone(n.id)} aria-label="Tamamlandı">
                    {n.done ? "✓" : ""}
                  </button>
                  <div className="dg-note-main">
                    <div className="dg-note-title" title={n.title}>
                      {n.title || "Qeyd"}
                    </div>
                    <div className="dg-note-sub">
                      {n.remindAt ? `⏰ ${n.remindAt.replace("T", " ")}` : "—"} · {new Date(n.updatedAt).toLocaleString("az-AZ")}
                    </div>
                  </div>
                  <div className="dg-note-actions">
                    <button type="button" className="dg-btn dg-btn-secondary" onClick={() => startEditNote(n)}>
                      Düzəliş
                    </button>
                    <button type="button" className="dg-btn dg-btn-danger" onClick={() => deleteNote(n.id)}>
                      Sil
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderStoreOrdersModule = () => {
    const orders = [...(workspace.storeOrders ?? [])].sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.updatedAt - a.updatedAt);

    if (storeOrderMode === "form") {
      return (
        <div className="dg-form-page pg-panel" aria-label={storeOrderEditId ? "Mağaza sifarişi redaktəsi" : "Yeni mağaza sifarişi"}>
          <header className="dg-form-page-head">
            <div>
              <h1 className="dg-form-page-title">Mağaza sifarişi</h1>
              <nav className="dg-form-bc" aria-label="Yol">
                <span>Mağaza sifarişi</span>
                <span className="dg-form-bc-sep" aria-hidden>
                  ›
                </span>
                <span className="dg-form-bc-current">{storeOrderEditId ? "Redaktə" : "Yeni sifariş"}</span>
              </nav>
            </div>
            <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelStoreOrderForm}>
              Siyahı
            </button>
          </header>

          <div className="dg-form-page-body">
            <div className="dg-form-meta-grid">
              <label className="dg-field">
                <span className="dg-label">Tarix</span>
                <input
                  className="dg-input"
                  type="date"
                  value={storeOrderDraft.orderDate}
                  onChange={(e) => setStoreOrderDraft((d) => ({ ...d, orderDate: e.target.value }))}
                />
              </label>
              <label className="dg-field">
                <span className="dg-label">Status</span>
                <select
                  className="dg-input"
                  value={storeOrderDraft.status}
                  onChange={(e) => setStoreOrderDraft((d) => ({ ...d, status: e.target.value as OrderStatus }))}
                >
                  {ORDER_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dg-field dg-field-span-full">
                <span className="dg-label">Qeyd</span>
                <textarea
                  className="dg-input"
                  rows={2}
                  value={storeOrderDraft.note}
                  onChange={(e) => setStoreOrderDraft((d) => ({ ...d, note: e.target.value }))}
                />
              </label>
            </div>

            <h2 className="dg-form-inner-panel-title" style={{ marginTop: "1.25rem" }}>
              Məhsullar
            </h2>
            {renderOrderLinesTable(
              storeOrderDraft.rows,
              patchStoreOrderLine,
              () => setStoreOrderDraft((d) => ({ ...d, rows: [...d.rows, newOrderLineRow()] })),
              (id) =>
                setStoreOrderDraft((d) => ({
                  ...d,
                  rows: d.rows.length <= 1 ? d.rows : d.rows.filter((r) => r.id !== id),
                })),
            )}

            <footer className="dg-form-footer-actions">
              <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelStoreOrderForm}>
                Ləğv et
              </button>
              <button type="button" className="dg-btn dg-btn-primary" onClick={saveStoreOrder}>
                Yadda saxla
              </button>
            </footer>
          </div>
        </div>
      );
    }

    return (
      <div className="dg-form-page pg-panel" aria-label="Mağaza sifarişləri siyahısı">
        <div className="dg-form-page-body">
          {orders.length === 0 ? (
            <div className="dg-empty-state-card" role="status">
              <div className="dg-empty-state-title">Hələ mağaza sifarişi yoxdur</div>
              <div className="dg-empty-state-desc">«Yeni sifariş» ilə mağaza daxili sifariş əlavə edin.</div>
            </div>
          ) : (
            renderOrderListTable(orders, {
              showCustomer: false,
              showDate: true,
              onInfo: (o) => setInfoDialog({ kind: "storeOrder", id: o.id }),
              onEdit: startEditStoreOrder,
              onDelete: deleteStoreOrder,
              onDownloadPdf: (o) => openOrderSupplierPdfDialog("storeOrder", o.id),
              onStatusChange: patchStoreOrderStatus,
            })
          )}
        </div>
      </div>
    );
  };

  const renderCustomerOrdersModule = () => {
    const orders = [...(workspace.customerOrders ?? [])].sort((a, b) => b.orderDate.localeCompare(a.orderDate) || b.updatedAt - a.updatedAt);

    if (customerOrderMode === "form") {
      return (
        <div className="dg-form-page pg-panel" aria-label={customerOrderEditId ? "Müştəri sifarişi redaktəsi" : "Yeni müştəri sifarişi"}>
          <header className="dg-form-page-head">
            <div>
              <h1 className="dg-form-page-title">Müştəri sifarişi</h1>
              <nav className="dg-form-bc" aria-label="Yol">
                <span>Müştəri sifarişi</span>
                <span className="dg-form-bc-sep" aria-hidden>
                  ›
                </span>
                <span className="dg-form-bc-current">{customerOrderEditId ? "Redaktə" : "Yeni sifariş"}</span>
              </nav>
            </div>
            <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelCustomerOrderForm}>
              Siyahı
            </button>
          </header>

          <div className="dg-form-page-body">
            <div className="dg-form-meta-grid">
              <label className="dg-field">
                <span className="dg-label">Müştəri adı</span>
                <input
                  className="dg-input"
                  value={customerOrderDraft.customerName}
                  onChange={(e) => setCustomerOrderDraft((d) => ({ ...d, customerName: e.target.value }))}
                  placeholder="Ad və ya şirkət"
                />
              </label>
              <label className="dg-field">
                <span className="dg-label">Telefon</span>
                <input
                  className="dg-input"
                  value={customerOrderDraft.customerPhone}
                  onChange={(e) => setCustomerOrderDraft((d) => ({ ...d, customerPhone: e.target.value }))}
                  placeholder="+994..."
                />
              </label>
              <label className="dg-field">
                <span className="dg-label">Tarix</span>
                <input
                  className="dg-input"
                  type="date"
                  value={customerOrderDraft.orderDate}
                  onChange={(e) => setCustomerOrderDraft((d) => ({ ...d, orderDate: e.target.value }))}
                />
              </label>
              <label className="dg-field">
                <span className="dg-label">Status</span>
                <select
                  className="dg-input"
                  value={customerOrderDraft.status}
                  onChange={(e) => setCustomerOrderDraft((d) => ({ ...d, status: e.target.value as OrderStatus }))}
                >
                  {ORDER_STATUS_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dg-field dg-field-span-full">
                <span className="dg-label">Qeyd</span>
                <textarea
                  className="dg-input"
                  rows={2}
                  value={customerOrderDraft.note}
                  onChange={(e) => setCustomerOrderDraft((d) => ({ ...d, note: e.target.value }))}
                />
              </label>
            </div>

            <h2 className="dg-form-inner-panel-title" style={{ marginTop: "1.25rem" }}>
              Məhsullar
            </h2>
            {renderOrderLinesTable(
              customerOrderDraft.rows,
              patchCustomerOrderLine,
              () => setCustomerOrderDraft((d) => ({ ...d, rows: [...d.rows, newOrderLineRow()] })),
              (id) =>
                setCustomerOrderDraft((d) => ({
                  ...d,
                  rows: d.rows.length <= 1 ? d.rows : d.rows.filter((r) => r.id !== id),
                })),
            )}

            <footer className="dg-form-footer-actions">
              <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelCustomerOrderForm}>
                Ləğv et
              </button>
              <button type="button" className="dg-btn dg-btn-primary" onClick={saveCustomerOrder}>
                Yadda saxla
              </button>
            </footer>
          </div>
        </div>
      );
    }

    return (
      <div className="dg-form-page pg-panel" aria-label="Müştəri sifarişləri siyahısı">
        <div className="dg-form-page-body">
          {orders.length === 0 ? (
            <div className="dg-empty-state-card" role="status">
              <div className="dg-empty-state-title">Hələ müştəri sifarişi yoxdur</div>
              <div className="dg-empty-state-desc">«Yeni sifariş» ilə müştəri sifarişi əlavə edin.</div>
            </div>
          ) : (
            renderOrderListTable(orders, {
              showCustomer: true,
              showDate: false,
              onInfo: (o) => setInfoDialog({ kind: "customerOrder", id: o.id }),
              onEdit: startEditCustomerOrder,
              onDelete: deleteCustomerOrder,
              onDownloadPdf: (o) => openOrderSupplierPdfDialog("customerOrder", o.id),
              onStatusChange: patchCustomerOrderStatus,
            })
          )}
        </div>
      </div>
    );
  };

  const renderPriceCalculationsModule = () => (
    <div className="dg-form-page pg-panel" aria-label="Qiymət hesablanması">
      <div className="dg-form-page-body">
        <section className="dg-form-inner-panel">
          <h2 className="dg-panel-section-title">Hesablama girişləri</h2>
          <div className="dg-form-meta-grid">
            <label className="dg-field">
              <span className="dg-label">Məhsul növü</span>
              <select
                className="dg-input"
                value={priceCalcProductType}
                onChange={(e) => setPriceCalcProductType(e.target.value as PriceCalcProductType)}
              >
                {PRICE_CALC_PRODUCT_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="dg-field">
              <span className="dg-label">Maya dəyəri (AZN)</span>
              <input
                className="dg-input"
                type="number"
                min="0"
                step="0.01"
                value={priceCalcCostInput}
                onChange={(e) => setPriceCalcCostInput(e.target.value)}
                placeholder="0.00"
              />
            </label>
          </div>
          <p className="dg-muted" style={{ marginTop: "0.75rem" }}>
            Məhsul növü və maya dəyəri dəyişdikcə nəticələr avtomatik yenilənir.
          </p>
        </section>

        <section className="dg-form-inner-panel" style={{ marginTop: "1rem" }}>
          <h2 className="dg-panel-section-title">Nəticələr</h2>
          <div className="dg-pricecalc-card-grid" style={{ marginTop: "0.5rem" }}>
            <article className="dg-pricecalc-card" aria-label="Nağd satış qiyməti kartı">
              <div className="dg-pricecalc-card-label">Nağd satış qiyməti</div>
              <div className="dg-pricecalc-card-value">{formatMoney(priceCalcResult.cashPrice)}</div>
            </article>
          </div>

          <h3 className="dg-panel-section-title dg-panel-section-title--sub">Kredit qiymətləri</h3>
          <div className="dg-pricecalc-card-grid">
            {PRICE_CALC_CREDIT_PERIODS.map((period) => (
              <article key={period.key} className="dg-pricecalc-card" aria-label={`${period.label} kredit kartı`}>
                <div className="dg-pricecalc-card-label">{period.label}</div>
                <div className="dg-pricecalc-card-value">{formatMoney(priceCalcResult.creditPrices[period.key])}</div>
              </article>
            ))}
          </div>
        </section>
      </div>
    </div>
  );

  const renderCashReportModule = () => {
    if (firebaseEnabled && authState.status === "signedIn" && !cashReportHydrated) {
      return (
        <div className="dg-cash-report pg-panel dg-cash-report--loading" aria-label="Kassa hesabatı yüklənir">
          <p className="dg-muted" role="status">
            Kassa hesabatı yüklənir…
          </p>
        </div>
      );
    }

    const cashColGroup = (
      <colgroup>
        <col className="dg-cash-col-idx" />
        <col className="dg-cash-col-name" />
        {Array.from({ length: CASH_REPORT_SLOT_COUNT }, (_, i) => (
          <col key={i} className="dg-cash-col-slot" />
        ))}
        <col className="dg-cash-col-actions" />
      </colgroup>
    );

    return (
    <div className="dg-cash-report pg-panel" aria-label="Kassa hesabatı">
      <div className="dg-cash-table-shell">
        <div className="dg-cash-table-scroll dg-table-wrap">
          <table className="dg-table dg-table--cash-report">
            {cashColGroup}
            <thead>
              <tr>
                <th className="dg-cash-col-idx">#</th>
                <th className="dg-cash-col-name">Hesab</th>
                {Array.from({ length: CASH_REPORT_SLOT_COUNT }, (_, i) => (
                  <th key={i} className="dg-cash-col-slot">
                    {i + 1}
                  </th>
                ))}
                <th className="dg-cash-col-actions">Əməliyyat</th>
              </tr>
            </thead>
            <tbody>
              {cashReportRows.map((row, index) => (
                <tr key={row.id}>
                  <td className="dg-cash-col-idx">{index + 1}</td>
                  <td className="dg-cash-col-name">
                    <input
                      className="dg-input dg-cash-name-input"
                      value={row.name}
                      onFocus={() => cashNameFocusRef.current.set(row.id, row.name)}
                      onChange={(e) =>
                        updateCashRow(row.id, (r) => ({ ...r, name: e.target.value, updatedAt: Date.now() }))
                      }
                      onBlur={(e) => {
                        const prevName = (cashNameFocusRef.current.get(row.id) ?? row.name).trim();
                        const nextName = e.target.value.trim();
                        cashNameFocusRef.current.delete(row.id);
                        if (nextName && nextName !== prevName) {
                          patchCashReport((prev) => ({ rows: prev.rows }), `Hesab adı dəyişdirildi: ${nextName}`);
                        }
                      }}
                      placeholder="Hesab adı"
                    />
                  </td>
                  {row.slots.map((value, slotIndex) => {
                    const slotKey = cashSlotKey(row.id, slotIndex);
                    const slotDraft = cashSlotEdits[slotKey];
                    const slotDisplay = cashSlotDisplayValue(value, slotDraft);
                    return (
                      <td key={slotIndex} className="dg-cash-col-slot">
                        <input
                          className={`dg-input dg-cash-slot-input ${cashAmountClassForInput(value, slotDraft)}`}
                          inputMode="decimal"
                          value={slotDisplay}
                          onChange={(e) => {
                            const raw = e.target.value;
                            if (!isPartialCashInput(raw)) return;
                            setCashSlotEdits((prev) => ({ ...prev, [slotKey]: raw }));
                          }}
                          onBlur={() => {
                            const raw = cashSlotEdits[slotKey] ?? (value === 0 ? "" : String(value));
                            const next = commitCashInput(raw);
                            const committed =
                              workspaceRef.current.cashReport?.rows.find((r) => r.id === row.id)?.slots[slotIndex] ??
                              value;
                            const changed = next !== committed;
                            setCashSlotEdits((prev) => {
                              if (!(slotKey in prev)) return prev;
                              const rest = { ...prev };
                              delete rest[slotKey];
                              return rest;
                            });
                            if (!changed) return;
                            updateCashRow(
                              row.id,
                              (r) => {
                                const slots = [...r.slots] as CashReportRow["slots"];
                                slots[slotIndex] = next;
                                return { ...r, slots, updatedAt: Date.now() };
                              },
                              {
                                historyLabel: `${row.name || "Hesab"} — sütun ${slotIndex + 1}: ${next === 0 ? "boşaldı" : formatCashAmount(next)}`,
                              },
                            );
                          }}
                        />
                      </td>
                    );
                  })}
                  <td className="dg-cash-col-actions">
                    <div className="dg-icon-row dg-cash-actions">
                      <button
                        type="button"
                        className="dg-btn dg-btn-primary dg-btn-sm dg-cash-btn-merge"
                        onClick={() => mergeCashReportRow(row.id)}
                        title="Sütun 2–8-i balansa cəmlə"
                      >
                        Cəmlə
                      </button>
                      <button
                        type="button"
                        className="dg-btn dg-btn-ghost dg-btn-sm"
                        onClick={() => undoCashReportRow(row.id)}
                        title="Son əməliyyatı geri al"
                      >
                        Geri
                      </button>
                      <button
                        type="button"
                        className="dg-btn dg-btn-danger dg-btn-sm"
                        onClick={() => void deleteCashReportRow(row.id)}
                        title="Sətiri sil"
                      >
                        Sil
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr className="dg-cash-foot-row">
                <td colSpan={2} className="dg-cash-foot-label">
                  Ümumi balans
                </td>
                <td className={`dg-cash-col-slot dg-cash-foot-balance ${cashAmountClass(cashReportBalance)}`}>
                  {cashReportBalance === 0 ? "" : formatCashAmount(cashReportBalance)}
                </td>
                <td colSpan={CASH_REPORT_SLOT_COUNT - 1} className="dg-cash-foot-spacer" />
                <td className="dg-cash-col-actions dg-cash-foot-spacer" />
              </tr>
            </tfoot>
          </table>
        </div>
      </div>
    </div>
    );
  };

  const reviewerDisplayName = () => {
    if (currentMember?.name) return currentMember.name;
    if (authState.status === "signedIn") return authState.user.email || "Direktor";
    return "Direktor";
  };

  const resetAppUserDraft = () => {
    setAppUserEditId(null);
    setAppUserDraft(emptyAppUserDraft());
  };

  const openNewAppUserForm = () => {
    resetAppUserDraft();
    setAppUserMode("form");
  };

  const cancelAppUserForm = () => {
    resetAppUserDraft();
    setAppUserMode("list");
  };

  const startEditAppUser = (u: SystemUserRecord) => {
    setAppUserEditId(u.id);
    setAppUserDraft({
      username: u.username,
      name: u.name,
      password: "",
      currentPassword: "",
      role: u.role,
    });
    setAppUserMode("form");
  };

  const resetAppUserPasswordAction = async (u: SystemUserRecord) => {
    const newPassword = await askPrompt({
      title: "Şifrəni sıfırla",
      label: `@${u.username} üçün yeni müvəqqəti şifrə`,
      confirmLabel: "Davam et",
      cancelLabel: "Ləğv et",
    });
    if (newPassword == null) return;
    const nextPassword = newPassword.trim();
    if (nextPassword.length < 6) {
      flash(setToast, "Şifrə ən azı 6 simvol olmalıdır.", "error");
      return;
    }
    const currentPassword = await askPrompt({
      title: "Cari şifrə",
      label: "İstifadəçinin hazırkı şifrəsi (admin təyin etdiyi müvəqqəti)",
      confirmLabel: "Sıfırla",
      cancelLabel: "Ləğv et",
    });
    if (currentPassword == null) return;
    const authEmail = u.authEmail ?? usernameToAuthEmail(u.username, firebaseProjectId);
    try {
      await resetAppUserPassword(authEmail, nextPassword, currentPassword.trim());
      const rec: SystemUserRecord = { ...u, mustChangePassword: true, updatedAt: Date.now() };
      await writeOrgMember(rec);
      flash(setToast, "Şifrə sıfırlandı — istifadəçi növbəti girişdə dəyişdirməlidir");
    } catch (e: unknown) {
      const msg = (e as { message?: string })?.message || "Şifrə sıfırlanmadı";
      flash(setToast, msg, "error");
    }
  };

  const saveAppUser = async () => {
    const usernameErr = validateUsername(appUserDraft.username);
    if (usernameErr) {
      flash(setToast, usernameErr, "error");
      return;
    }
    const name = appUserDraft.name.trim();
    if (!name) {
      flash(setToast, "Ad, soyad daxil edin.", "error");
      return;
    }
    const username = appUserDraft.username.trim().toLowerCase();
    const role = appUserDraft.role;
    const now = Date.now();

    if (firebaseEnabled) {
      if (!appUserEditId && appUserDraft.password.length < 6) {
        flash(setToast, "Müvəqqəti şifrə ən azı 6 simvol olmalıdır.", "error");
        return;
      }
      const authEmailForCreate = usernameToAuthEmail(username, firebaseProjectId);
      const duplicate = activeUsers.some(
        (u) => u.username.toLowerCase() === username && u.id !== appUserEditId,
      );
      if (duplicate) {
        flash(setToast, "Bu istifadəçi adı artıq mövcuddur.", "error");
        return;
      }
      if (await isUsernameTaken(username, appUserEditId ?? undefined)) {
        flash(setToast, "Bu istifadəçi adı artıq mövcuddur.", "error");
        return;
      }
      try {
        if (appUserEditId) {
          const existing = activeUsers.find((u) => u.id === appUserEditId);
          if (!existing) return;
          const authEmail = existing.authEmail ?? usernameToAuthEmail(existing.username, firebaseProjectId);
          let mustChangePassword = existing.mustChangePassword;
          if (appUserDraft.password.length >= 6) {
            if (!appUserDraft.currentPassword.trim()) {
              flash(setToast, "Yeni şifrə üçün cari şifrə daxil edin.", "error");
              return;
            }
            await resetAppUserPassword(authEmail, appUserDraft.password, appUserDraft.currentPassword);
            mustChangePassword = true;
          }
          if (username !== existing.username.toLowerCase()) {
            await syncUsernameIndex(existing.username, username, existing.id, authEmail);
          }
          const rec: SystemUserRecord = {
            ...existing,
            username,
            name,
            role,
            modules: defaultModulesForRole(role),
            mustChangePassword,
            authEmail,
            updatedAt: now,
          };
          await writeOrgMember(rec);
          flash(setToast, appUserDraft.password.length >= 6 ? "İstifadəçi və şifrə yeniləndi" : "İstifadəçi yeniləndi");
        } else {
          const { uid } = await createAppUserAuthAccount(authEmailForCreate, appUserDraft.password);
          const rec: SystemUserRecord = {
            id: uid,
            username,
            name,
            role,
            modules: defaultModulesForRole(role),
            mustChangePassword: true,
            authEmail: authEmailForCreate,
            createdAt: now,
            updatedAt: now,
          };
          await syncUsernameIndex(undefined, username, uid, authEmailForCreate);
          await writeOrgMember(rec);
          flash(setToast, "İstifadəçi yaradıldı");
        }
        cancelAppUserForm();
      } catch (e: unknown) {
        flash(setToast, mapAuthError(e), "error");
      }
      return;
    }

    if (appUserEditId) {
      setWorkspace((w) => ({
        ...w,
        systemUsers: (w.systemUsers ?? []).map((u) =>
          u.id === appUserEditId ? { ...u, username, name, role, modules: defaultModulesForRole(role), updatedAt: now } : u,
        ),
      }));
    } else {
      const rec: SystemUserRecord = {
        id: crypto.randomUUID(),
        username,
        name,
        role,
        modules: defaultModulesForRole(role),
        createdAt: now,
        updatedAt: now,
      };
      setWorkspace((w) => ({ ...w, systemUsers: [...(w.systemUsers ?? []), rec] }));
    }
    flash(setToast, appUserEditId ? "İstifadəçi yeniləndi" : "İstifadəçi əlavə olundu");
    cancelAppUserForm();
  };

  const deleteAppUser = async (id: string) => {
    const ok = await askConfirm({
      title: "Silmə təsdiqi",
      message: "Bu istifadəçi silinsin?",
      confirmLabel: "Sil",
      cancelLabel: "Ləğv et",
      danger: true,
    });
    if (!ok) return;
    const target = activeUsers.find((u) => u.id === id);
    if (firebaseEnabled) {
      if (target) await deleteUsernameIndex(target.username);
      await deleteOrgMember(id);
    } else {
      setWorkspace((w) => ({
        ...w,
        systemUsers: (w.systemUsers ?? []).filter((u) => u.id !== id),
        leaveRequests: (w.leaveRequests ?? []).filter((r) => r.employeeId !== id),
      }));
    }
    if (appUserEditId === id) resetAppUserDraft();
    flash(setToast, "İstifadəçi silindi");
  };

  const cancelPermissionForm = () => {
    setPermissionDraft({ memberId: "", modules: [] });
    setPermissionMode("list");
  };

  const startEditPermissions = (u: SystemUserRecord) => {
    if (u.role === "admin" || u.role === "director") {
      flash(setToast, "Direktor və admin bütün modullara giriş edir.", "error");
      return;
    }
    setPermissionDraft({ memberId: u.id, modules: [...u.modules] });
    setPermissionMode("form");
  };

  const togglePermissionModule = (mod: PermissionModuleId) => {
    setPermissionDraft((d) => {
      const has = d.modules.includes(mod);
      const modules = has ? d.modules.filter((m) => m !== mod) : [...d.modules, mod];
      return { ...d, modules };
    });
  };

  const savePermissions = async () => {
    if (!permissionDraft.memberId) return;
    const user = activeUsers.find((u) => u.id === permissionDraft.memberId);
    if (!user) return;
    if (permissionDraft.modules.length === 0) {
      flash(setToast, "Ən azı bir modul seçin.", "error");
      return;
    }
    const rec: SystemUserRecord = { ...user, modules: permissionDraft.modules, updatedAt: Date.now() };
    if (firebaseEnabled) {
      await writeOrgMember(rec);
    } else {
      setWorkspace((w) => ({
        ...w,
        systemUsers: (w.systemUsers ?? []).map((u) => (u.id === rec.id ? rec : u)),
      }));
    }
    flash(setToast, "İcazələr yeniləndi");
    cancelPermissionForm();
  };

  const renderAppUsersModule = () => {
    if (!canManageUsers) {
      return (
        <div className="dg-form-page pg-panel" aria-label="İstifadəçilər">
          <div className="dg-form-page-body">
            <div className="dg-empty-state-card" role="status">
              <div className="dg-empty-state-title">Giriş icazəsi yoxdur</div>
              <div className="dg-empty-state-desc">Bu bölmə yalnız developer, direktor və ya admin üçün əlçatandır.</div>
            </div>
          </div>
        </div>
      );
    }

    const users = [...activeUsers].sort((a, b) => a.name.localeCompare(b.name, "az", { sensitivity: "base" }));

    if (appUserMode === "form") {
      return (
        <div className="dg-form-page pg-panel" aria-label={appUserEditId ? "İstifadəçi redaktəsi" : "Yeni istifadəçi"}>
          <header className="dg-form-page-head">
            <div>
              <h1 className="dg-form-page-title">İstifadəçilər</h1>
            </div>
            <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelAppUserForm}>
              Siyahı
            </button>
          </header>
          <div className="dg-form-page-body">
            <div className="dg-form-meta-grid">
              <label className="dg-field">
                <span className="dg-label">İstifadəçi adı</span>
                <input
                  className="dg-input"
                  value={appUserDraft.username}
                  onChange={(e) => setAppUserDraft((d) => ({ ...d, username: e.target.value }))}
                  placeholder="məs: ali.mammadov"
                />
                {appUserEditId ? (
                  <span className="dg-muted" style={{ fontSize: "0.8rem" }}>
                    Dəyişəndə işçi yeni ad ilə daxil olacaq
                  </span>
                ) : null}
              </label>
              <label className="dg-field">
                <span className="dg-label">Ad, soyad</span>
                <input
                  className="dg-input"
                  value={appUserDraft.name}
                  onChange={(e) => setAppUserDraft((d) => ({ ...d, name: e.target.value }))}
                />
              </label>
              <label className="dg-field">
                <span className="dg-label">Rol</span>
                <select
                  className="dg-input"
                  value={appUserDraft.role}
                  onChange={(e) => setAppUserDraft((d) => ({ ...d, role: e.target.value as AppUserRole }))}
                >
                  {APP_USER_ROLE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dg-field">
                <span className="dg-label">{appUserEditId ? "Yeni müvəqqəti şifrə (istəyə görə)" : "Müvəqqəti şifrə"}</span>
                <input
                  className="dg-input"
                  type="password"
                  value={appUserDraft.password}
                  onChange={(e) => setAppUserDraft((d) => ({ ...d, password: e.target.value }))}
                  placeholder={appUserEditId ? "Boş buraxsanız, şifrə dəyişməz" : "İlk girişdə dəyişdiriləcək"}
                />
              </label>
              {appUserEditId ? (
                <label className="dg-field">
                  <span className="dg-label">Cari şifrə (yeni şifrə üçün)</span>
                  <input
                    className="dg-input"
                    type="password"
                    value={appUserDraft.currentPassword}
                    onChange={(e) => setAppUserDraft((d) => ({ ...d, currentPassword: e.target.value }))}
                    placeholder="İstifadəçinin hazırkı şifrəsi"
                  />
                </label>
              ) : null}
            </div>
            <footer className="dg-form-footer-actions">
              <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelAppUserForm}>
                Ləğv et
              </button>
              <button type="button" className="dg-btn dg-btn-primary" onClick={() => void saveAppUser()}>
                Yadda saxla
              </button>
            </footer>
          </div>
        </div>
      );
    }

    return (
      <div className="dg-form-page pg-panel" aria-label="İstifadəçilər siyahısı">
        <div className="dg-form-page-body">
          {users.length === 0 ? (
            <div className="dg-empty-state-card" role="status">
              <div className="dg-empty-state-title">Hələ istifadəçi yoxdur</div>
              <div className="dg-empty-state-desc">«Yeni istifadəçi» ilə giriş hesabı yaradın. İcazələri «Sistem icazələri» bölməsində verin.</div>
            </div>
          ) : (
            <div className="dg-table-wrap pg-grid-host">
              <table className="dg-table">
                <thead>
                  <tr>
                    <th className="dg-th-num">№</th>
                    <th>İstifadəçi adı</th>
                    <th>Ad</th>
                    <th>Rol</th>
                    <th>İlk giriş</th>
                    <th className="dg-th-actions">Əməliyyatlar</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id}>
                      <td className="dg-td-num">{i + 1}</td>
                      <td>{u.username}</td>
                      <td>{u.name}</td>
                      <td>{appUserRoleLabel(u.role)}</td>
                      <td>{u.mustChangePassword ? "Şifrə dəyişməli" : "—"}</td>
                      <td className="dg-td-actions">
                        <div className="dg-icon-row">
                          <button
                            type="button"
                            className="dg-icon-btn"
                            title="Şifrəni sıfırla"
                            aria-label="Şifrəni sıfırla"
                            onClick={() => void resetAppUserPasswordAction(u)}
                          >
                            <IconKey />
                          </button>
                          <button type="button" className="dg-icon-btn" title="Redaktə" aria-label="Redaktə" onClick={() => startEditAppUser(u)}>
                            <IconEdit />
                          </button>
                          <button type="button" className="dg-icon-btn dg-icon-btn-danger" title="Sil" aria-label="Sil" onClick={() => void deleteAppUser(u.id)}>
                            <IconTrash />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const renderSystemPermissionsModule = () => {
    if (!canManageSystemUsers) {
      return (
        <div className="dg-form-page pg-panel" aria-label="Sistem icazələri">
          <div className="dg-form-page-body">
            <div className="dg-empty-state-card" role="status">
              <div className="dg-empty-state-title">Giriş icazəsi yoxdur</div>
              <div className="dg-empty-state-desc">Bu bölmə yalnız developer, direktor və ya admin üçün əlçatandır.</div>
            </div>
          </div>
        </div>
      );
    }

    const users = [...activeUsers].filter((u) => u.role === "employee");

    if (permissionMode === "form") {
      const target = activeUsers.find((u) => u.id === permissionDraft.memberId);
      return (
        <div className="dg-form-page pg-panel" aria-label="Modul icazələri">
          <header className="dg-form-page-head">
            <div>
              <h1 className="dg-form-page-title">Sistem icazələri</h1>
              <p className="dg-muted">{target ? `${target.name} (@${target.username})` : ""}</p>
            </div>
            <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelPermissionForm}>
              Siyahı
            </button>
          </header>
          <div className="dg-form-page-body">
            <div className="dg-permission-grid">
              {PERMISSION_MODULE_OPTIONS.map((m) => (
                <label key={m.id} className="dg-permission-check">
                  <input
                    type="checkbox"
                    checked={permissionDraft.modules.includes(m.id)}
                    onChange={() => togglePermissionModule(m.id)}
                  />
                  <span>{m.label}</span>
                </label>
              ))}
            </div>
            <footer className="dg-form-footer-actions">
              <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelPermissionForm}>
                Ləğv et
              </button>
              <button type="button" className="dg-btn dg-btn-primary" onClick={() => void savePermissions()}>
                Yadda saxla
              </button>
            </footer>
          </div>
        </div>
      );
    }

    return (
      <div className="dg-form-page pg-panel" aria-label="Sistem icazələri siyahısı">
        <div className="dg-form-page-body">
          {users.length === 0 ? (
            <div className="dg-empty-state-card" role="status">
              <div className="dg-empty-state-title">İşçi yoxdur</div>
              <div className="dg-empty-state-desc">Əvvəlcə «İstifadəçilər» bölməsində işçi hesabı yaradın.</div>
            </div>
          ) : (
            <div className="dg-table-wrap pg-grid-host">
              <table className="dg-table">
                <thead>
                  <tr>
                    <th className="dg-th-num">№</th>
                    <th>İstifadəçi</th>
                    <th>Modullar</th>
                    <th className="dg-th-actions">Əməliyyatlar</th>
                  </tr>
                </thead>
                <tbody>
                  {users.map((u, i) => (
                    <tr key={u.id}>
                      <td className="dg-td-num">{i + 1}</td>
                      <td>
                        {u.name} <span className="dg-muted">(@{u.username})</span>
                      </td>
                      <td>
                        {u.modules.map((id) => PERMISSION_MODULE_OPTIONS.find((m) => m.id === id)?.label ?? id).join(", ")}
                      </td>
                      <td className="dg-td-actions">
                        <button type="button" className="dg-btn dg-btn-secondary dg-btn--compact" onClick={() => startEditPermissions(u)}>
                          İcazələr
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const resetLeaveDraft = () => {
    setLeaveEditId(null);
    const defaultEmployeeId = currentMember?.role === "employee" ? currentMember.id : "";
    setLeaveDraft(emptyLeaveRequestDraft(defaultEmployeeId));
  };

  const openNewLeaveForm = () => {
    resetLeaveDraft();
    if (currentMember?.role === "employee") {
      setLeaveDraft((d) => ({ ...d, employeeId: currentMember.id }));
    }
    setLeaveMode("form");
  };

  const cancelLeaveForm = () => {
    resetLeaveDraft();
    setLeaveMode("list");
  };

  const startEditLeaveRequest = (r: LeaveRequestRecord) => {
    if (r.status !== "pending") {
      flash(setToast, "Yalnız gözləyən sorğular redaktə oluna bilər.", "error");
      return;
    }
    setLeaveEditId(r.id);
    setLeaveDraft({
      employeeId: r.employeeId,
      leaveType: r.leaveType,
      startDate: r.startDate,
      endDate: r.endDate,
      reason: r.reason,
    });
    setLeaveMode("form");
  };

  const saveLeaveRequest = () => {
    const employeeId =
      currentMember?.role === "employee" && !leaveEditId
        ? currentMember.id
        : leaveDraft.employeeId.trim();
    const employee =
      systemUsersById.get(employeeId) ??
      (currentMember?.id === employeeId ? currentMember : undefined);
    const employeeName = employee?.name.trim() || "";
    const reason = leaveDraft.reason.trim();
    if (!employeeId || !employeeName) {
      flash(setToast, "İşçi seçin.", "error");
      return;
    }
    if (!reason) {
      flash(setToast, "Sorğu mətnini daxil edin.", "error");
      return;
    }
    const startDate = leaveDraft.startDate.trim() || new Date().toISOString().slice(0, 10);
    const endDate = leaveDraft.endDate.trim() || startDate;
    const leaveType = leaveDraft.leaveType.trim() || "other";
    const now = Date.now();

    if (leaveEditId) {
      setWorkspace((w) => ({
        ...w,
        leaveRequests: (w.leaveRequests ?? []).map((r) => {
          if (r.id !== leaveEditId) return r;
          return {
            ...r,
            employeeId,
            employeeName,
            leaveType,
            startDate,
            endDate,
            reason,
            updatedAt: now,
          };
        }),
      }));
      flash(setToast, "Sorğu yeniləndi");
    } else {
      const rec: LeaveRequestRecord = {
        id: crypto.randomUUID(),
        employeeId,
        employeeName,
        leaveType,
        startDate,
        endDate,
        reason,
        status: "pending",
        createdAt: now,
        updatedAt: now,
      };
      setWorkspace((w) => ({ ...w, leaveRequests: [...(w.leaveRequests ?? []), rec] }));
      flash(setToast, "Sorğu göndərildi");
    }
    cancelLeaveForm();
  };

  const deleteLeaveRequest = async (id: string) => {
    const ok = await askConfirm({
      title: "Silmə təsdiqi",
      message: "Bu sorğu silinsin?",
      confirmLabel: "Sil",
      cancelLabel: "Ləğv et",
      danger: true,
    });
    if (!ok) return;
    setWorkspace((w) => ({ ...w, leaveRequests: (w.leaveRequests ?? []).filter((r) => r.id !== id) }));
    if (leaveEditId === id) resetLeaveDraft();
    flash(setToast, "Sorğu silindi");
  };

  const approveLeaveRequest = async (id: string) => {
    const ok = await askConfirm({
      title: "Təsdiq",
      message: "Bu iş icazəsi sorğusu təsdiq olunsun?",
      confirmLabel: "Təsdiq et",
      cancelLabel: "Ləğv et",
    });
    if (!ok) return;
    const now = Date.now();
    const by = reviewerDisplayName();
    setWorkspace((w) => ({
      ...w,
      leaveRequests: (w.leaveRequests ?? []).map((r) => {
          if (r.id !== id) return r;
          const { rejectReason: _omit, ...rest } = r;
          return { ...rest, status: "approved" as const, reviewedAt: now, reviewedByName: by, updatedAt: now };
        }),
    }));
    flash(setToast, "Sorğu təsdiq olundu");
  };

  const rejectLeaveRequest = async (id: string) => {
    const reason = await askPrompt({
      title: "İmtina səbəbi",
      label: "İmtina səbəbini yazın (işçi görəcək)",
      confirmLabel: "İmtina et",
      cancelLabel: "Bağla",
      multiline: true,
    });
    if (reason == null) return;
    const rejectReason = reason.trim();
    if (!rejectReason) {
      flash(setToast, "İmtina səbəbi mütləqdir.", "error");
      return;
    }
    const now = Date.now();
    const by = reviewerDisplayName();
    setWorkspace((w) => ({
      ...w,
      leaveRequests: (w.leaveRequests ?? []).map((r) =>
        r.id === id
          ? { ...r, status: "rejected" as const, rejectReason, reviewedAt: now, reviewedByName: by, updatedAt: now }
          : r,
      ),
    }));
    flash(setToast, "Sorğu imtina edildi");
  };

  const renderWorkLeaveModule = () => {
    const employees = [...activeUsers].filter((u) => u.role === "employee" || u.role === "director");
    const requests = [...(workspace.leaveRequests ?? [])].sort((a, b) => b.createdAt - a.createdAt);

    if (leaveMode === "form") {
      const employeeOptions = employees.length > 0 ? employees : activeUsers;
      const isEmployeeSelf = currentMember?.role === "employee";
      const leaveEmployeeName = isEmployeeSelf
        ? currentMember.name
        : systemUsersById.get(leaveDraft.employeeId)?.name ??
          (leaveEditId
            ? (workspace.leaveRequests ?? []).find((r) => r.id === leaveEditId)?.employeeName
            : undefined) ??
          "";
      return (
        <div className="dg-form-page pg-panel" aria-label={leaveEditId ? "Sorğu redaktəsi" : "Yeni sorğu"}>
          <header className="dg-form-page-head">
            <div>
              <h1 className="dg-form-page-title">İş icazəsi sorğusu</h1>
            </div>
            <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelLeaveForm}>
              Siyahı
            </button>
          </header>
          <div className="dg-form-page-body">
            <div className="dg-form-meta-grid">
              <label className="dg-field">
                <span className="dg-label">İşçi</span>
                {isEmployeeSelf ? (
                  <input className="dg-input" value={leaveEmployeeName} readOnly disabled />
                ) : (
                  <select
                    className="dg-input"
                    value={leaveDraft.employeeId}
                    onChange={(e) => setLeaveDraft((d) => ({ ...d, employeeId: e.target.value }))}
                    disabled={Boolean(leaveEditId)}
                  >
                    <option value="">— seçin —</option>
                    {employeeOptions.map((u) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                )}
              </label>
              <label className="dg-field">
                <span className="dg-label">İcazə növü</span>
                <select
                  className="dg-input"
                  value={leaveDraft.leaveType}
                  onChange={(e) => setLeaveDraft((d) => ({ ...d, leaveType: e.target.value }))}
                >
                  {LEAVE_TYPE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dg-field">
                <span className="dg-label">Başlama tarixi</span>
                <input className="dg-input" type="date" value={leaveDraft.startDate} onChange={(e) => setLeaveDraft((d) => ({ ...d, startDate: e.target.value }))} />
              </label>
              <label className="dg-field">
                <span className="dg-label">Bitmə tarixi</span>
                <input className="dg-input" type="date" value={leaveDraft.endDate} onChange={(e) => setLeaveDraft((d) => ({ ...d, endDate: e.target.value }))} />
              </label>
              <label className="dg-field dg-field-span-full">
                <span className="dg-label">Sorğu mətni</span>
                <textarea className="dg-input" rows={3} value={leaveDraft.reason} onChange={(e) => setLeaveDraft((d) => ({ ...d, reason: e.target.value }))} />
              </label>
            </div>
            <footer className="dg-form-footer-actions">
              <button type="button" className="dg-btn dg-btn-secondary" onClick={cancelLeaveForm}>
                Ləğv et
              </button>
              <button type="button" className="dg-btn dg-btn-primary" onClick={saveLeaveRequest}>
                {leaveEditId ? "Yenilə" : "Sorğu göndər"}
              </button>
            </footer>
          </div>
        </div>
      );
    }

    return (
      <div className="dg-form-page pg-panel" aria-label="İş icazələri siyahısı">
        <div className="dg-form-page-body">
          {requests.length === 0 ? (
            <div className="dg-empty-state-card" role="status">
              <div className="dg-empty-state-title">Hələ sorğu yoxdur</div>
              <div className="dg-empty-state-desc">«Yeni sorğu» ilə iş icazəsi müraciəti göndərin.</div>
            </div>
          ) : (
            <div className="dg-table-wrap pg-grid-host">
              <table className="dg-table">
                <thead>
                  <tr>
                    <th className="dg-th-num">№</th>
                    <th>İşçi</th>
                    <th>Növ</th>
                    <th>Tarix</th>
                    <th>Status</th>
                    <th>İmtina səbəbi</th>
                    <th className="dg-th-actions">Əməliyyatlar</th>
                  </tr>
                </thead>
                <tbody>
                  {requests.map((r, i) => (
                    <tr key={r.id}>
                      <td className="dg-td-num">{i + 1}</td>
                      <td>{r.employeeName}</td>
                      <td>{leaveTypeLabel(r.leaveType)}</td>
                      <td>
                        {formatDateAzLong(r.startDate)}
                        {r.endDate !== r.startDate ? ` – ${formatDateAzLong(r.endDate)}` : ""}
                      </td>
                      <td>
                        <LeaveStatusBadge status={r.status} />
                      </td>
                      <td className={r.status === "rejected" ? "dg-leave-reject-reason" : ""}>
                        {r.status === "rejected" ? r.rejectReason || "—" : "—"}
                      </td>
                      <td className="dg-td-actions">
                        <div className="dg-icon-row dg-icon-row--wrap">
                          <button type="button" className="dg-icon-btn" title="Məlumat" aria-label="Məlumat" onClick={() => setLeaveInfoId(r.id)}>
                            <IconInfo />
                          </button>
                          {r.status === "pending" && (
                            <button type="button" className="dg-icon-btn" title="Redaktə" aria-label="Redaktə" onClick={() => startEditLeaveRequest(r)}>
                              <IconEdit />
                            </button>
                          )}
                          {canReviewLeave && r.status === "pending" ? (
                            <>
                              <button type="button" className="dg-btn dg-btn-secondary dg-btn--compact" onClick={() => approveLeaveRequest(r.id)}>
                                Təsdiq
                              </button>
                              <button type="button" className="dg-btn dg-btn-danger dg-btn--compact" onClick={() => rejectLeaveRequest(r.id)}>
                                İmtina
                              </button>
                            </>
                          ) : null}
                          {(r.status === "pending" || canReviewLeave) && (
                            <button type="button" className="dg-icon-btn dg-icon-btn-danger" title="Sil" aria-label="Sil" onClick={() => deleteLeaveRequest(r.id)}>
                              <IconTrash />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    );
  };

  const switchSidebarModule = (next: SidebarModule) => {
    if (module === "companies") cancelCompanyForm();
    else if (module === "projects") cancelProjectForm();
    else if (module === "suppliers") cancelOfferForm();
    else if (module === "storeOrders") cancelStoreOrderForm();
    else if (module === "customerOrders") cancelCustomerOrderForm();
    else if (module === "systemPermissions") cancelPermissionForm();
    else if (module === "appUsers") cancelAppUserForm();
    else if (module === "workLeave") cancelLeaveForm();
    setModule(next);
    setSidebarOpen(false);
  };

  // ----- Auth handlers -----
  const mapAuthError = (e: unknown): string => {
    const code = (e as { code?: string })?.code || "";
    switch (code) {
      case "auth/invalid-email":
        return "Email səhvdir.";
      case "auth/missing-password":
      case "auth/weak-password":
        return "Şifrə ən azı 6 simvol olmalıdır.";
      case "auth/email-already-in-use":
        return "Bu email artıq qeydiyyatdadır.";
      case "auth/invalid-credential":
      case "auth/wrong-password":
      case "auth/user-not-found":
        return "İstifadəçi adı/email və ya şifrə səhvdir.";
      case "auth/network-request-failed":
        return "Şəbəkə xətası. Yenidən cəhd edin.";
      default:
        return "Daxil olmaq alınmadı.";
    }
  };

  const handleSignIn = useCallback(async () => {
    if (!auth) return;
    const identifier = loginIdentifier.trim();
    if (!identifier || !loginPassword) {
      setAuthError("İstifadəçi adı (və ya email) və şifrə daxil edin.");
      return;
    }
    const email = await resolveLoginEmail(identifier, firebaseProjectId);
    if (!email) {
      setAuthError("İstifadəçi adı və ya email düzgün deyil.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      await signInWithEmailAndPassword(auth, email, loginPassword);
      setLoginPassword("");
    } catch (e: unknown) {
      setAuthError(mapAuthError(e));
    } finally {
      setAuthBusy(false);
    }
  }, [loginIdentifier, loginPassword]);

  const handlePasswordReset = useCallback(async () => {
    if (!auth) return;
    const identifier = loginIdentifier.trim();
    if (!identifier.includes("@")) {
      setAuthError("Şifrə yeniləmə yalnız developer email hesabları üçündür.");
      return;
    }
    const email = await resolveLoginEmail(identifier, firebaseProjectId);
    if (!email) {
      setAuthError("Email daxil edin.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      await sendPasswordResetEmail(auth, email);
      flash(setToast, "Şifrə yeniləmə linki email-ə göndərildi");
    } catch (e: unknown) {
      setAuthError(mapAuthError(e));
    } finally {
      setAuthBusy(false);
    }
  }, [loginIdentifier]);

  const handleForcePasswordSubmit = useCallback(async () => {
    if (!auth || authState.status !== "signedIn" || !currentMember) return;
    if (newPasswordDraft.length < 6) {
      flash(setToast, "Şifrə ən azı 6 simvol olmalıdır.", "error");
      return;
    }
    if (newPasswordDraft !== newPasswordConfirm) {
      flash(setToast, "Şifrələr uyğun gəlmir.", "error");
      return;
    }
    try {
      await updatePassword(authState.user, newPasswordDraft);
      await setMemberMustChangePassword(currentMember.id, false);
      const rec: SystemUserRecord = { ...currentMember, mustChangePassword: false, updatedAt: Date.now() };
      setCurrentMember(rec);
      setForcePasswordChange(false);
      setNewPasswordDraft("");
      setNewPasswordConfirm("");
      flash(setToast, "Şifrə yeniləndi");
    } catch (e: unknown) {
      const code = (e as { code?: string })?.code ?? "";
      if (code === "permission-denied") {
        flash(setToast, "Şifrə dəyişildi, amma profil yenilənmədi — administratorla əlaqə saxlayın.", "error");
        return;
      }
      flash(setToast, mapAuthError(e), "error");
    }
  }, [authState, currentMember, newPasswordDraft, newPasswordConfirm]);

  const handleSignOut = useCallback(async () => {
    if (!auth) return;
    const ok = await askConfirm({
      title: "Çıxış",
      message: "Sistemdən çıxış etmək istədiyinizdən əminsiniz?",
      confirmLabel: "Çıxış",
      cancelLabel: "Ləğv et",
    });
    if (!ok) return;
    try {
      await signOut(auth);
      // Lokal nüsxə qarışmasın deyə təmizləyirik (remote artıq əsas mənbədi)
      clearLocalWorkspace();
      clearWorkspaceLiveCache();
      // Ekrana boş workspace göstər
      setWorkspace(
        normalizeWorkspace({
          version: 3,
          settings: { seller: emptyCompany() },
          companies: [],
          projects: [],
        }),
      );
    } catch {
      flash(setToast, "Çıxış alınmadı", "error");
    }
  }, [askConfirm]);

  const headerPrimaryAction =
    module === "companies" && companyMode === "list"
      ? { label: "Yeni şirkət", onClick: startNewCompany }
      : module === "projects" && projectMode === "list"
        ? { label: "Yeni təklif", onClick: startNewProject }
        : module === "folders" && folderView === "grid"
          ? { label: "Yeni qovluq", onClick: () => createCustomFolder() }
          : module === "notes"
            ? { label: "Yeni qeyd", onClick: openNewNoteDialog }
            : module === "suppliers" && offerMode === "list"
              ? { label: "Yeni təklif", onClick: openNewOfferForm }
              : module === "storeOrders" && storeOrderMode === "list"
                ? { label: "Yeni sifariş", onClick: openNewStoreOrderForm }
                : module === "customerOrders" && customerOrderMode === "list"
                  ? { label: "Yeni sifariş", onClick: openNewCustomerOrderForm }
                    : module === "appUsers" && appUserMode === "list" && canManageUsers
                    ? { label: "Yeni istifadəçi", onClick: openNewAppUserForm }
                    : module === "workLeave" && leaveMode === "list"
                      ? { label: "Yeni sorğu", onClick: openNewLeaveForm }
        : null;

  const modalLayer = (
    <>
      {printProjectId ? (
        <dialog ref={printDialogRef} className="dg-modal dg-modal--wide" onClose={() => setPrintProjectId(null)}>
          <div className="dg-modal-body">
            <h2 className="dg-modal-title">Çap — sənəd seçin</h2>
            <p className="dg-modal-hint">Satıcı Ayarlardan, alıcı təklifdə seçilmiş şirkətdən götürülür.</p>
            <div className="dg-print-picker" role="group" aria-label="Sənəd seçimləri">
              <div className="dg-print-picker-head">
                <div>Sənəd</div>
                <div>Çap</div>
                <div>PDF</div>
              </div>
              <div className="dg-print-picker-row">
                <div className="dg-print-picker-name">Hesab-faktura</div>
                <button
                  type="button"
                  className="dg-btn dg-btn-primary"
                  onClick={() => printProjectId && runExport(printProjectId, "invoice", "print")}
                >
                  Çap et
                </button>
                <button
                  type="button"
                  className="dg-btn dg-btn-secondary"
                  onClick={() => printProjectId && runExport(printProjectId, "invoice", "pdf")}
                >
                  Endir
                </button>
              </div>
              <div className="dg-print-picker-row">
                <div className="dg-print-picker-name">Təhvil aktı</div>
                <button
                  type="button"
                  className="dg-btn dg-btn-primary"
                  onClick={() => printProjectId && runExport(printProjectId, "delivery", "print")}
                >
                  Çap et
                </button>
                <button
                  type="button"
                  className="dg-btn dg-btn-secondary"
                  onClick={() => printProjectId && runExport(printProjectId, "delivery", "pdf")}
                >
                  Endir
                </button>
              </div>
              <div className="dg-print-picker-row">
                <div className="dg-print-picker-name">Qiymətsiz təhvil aktı</div>
                <button
                  type="button"
                  className="dg-btn dg-btn-primary"
                  onClick={() => printProjectId && runExport(printProjectId, "deliveryNoPrice", "print")}
                >
                  Çap et
                </button>
                <button
                  type="button"
                  className="dg-btn dg-btn-secondary"
                  onClick={() => printProjectId && runExport(printProjectId, "deliveryNoPrice", "pdf")}
                >
                  Endir
                </button>
              </div>
              <div className="dg-print-picker-row">
                <div className="dg-print-picker-name">Qiymət təklifi</div>
                <button
                  type="button"
                  className="dg-btn dg-btn-primary"
                  onClick={() => printProjectId && runExport(printProjectId, "priceQuote", "print")}
                >
                  Çap et
                </button>
                <button
                  type="button"
                  className="dg-btn dg-btn-secondary"
                  onClick={() => printProjectId && runExport(printProjectId, "priceQuote", "pdf")}
                >
                  Endir
                </button>
              </div>
              <div className="dg-print-picker-row">
                <div className="dg-print-picker-name">Protokol</div>
                <button
                  type="button"
                  className="dg-btn dg-btn-primary"
                  onClick={() => printProjectId && runExport(printProjectId, "protocol", "print")}
                >
                  Çap et
                </button>
                <button
                  type="button"
                  className="dg-btn dg-btn-secondary"
                  onClick={() => printProjectId && runExport(printProjectId, "protocol", "pdf")}
                >
                  Endir
                </button>
              </div>
            </div>

            <div className="dg-modal-actions">
              <button type="button" className="dg-btn dg-btn-secondary" onClick={() => closePrintDialog()}>
                Bağla
              </button>
            </div>
          </div>
        </dialog>
      ) : null}

      {orderSupplierPdfTarget && pdfOrder ? (
        <dialog
          ref={orderSupplierPdfDialogRef}
          className="dg-modal dg-modal--alert"
          onClose={() => closeOrderSupplierPdfDialog()}
        >
          <div className="dg-modal-body">
            <h2 className="dg-modal-title">Çap et — təchizatçı seçin</h2>
            <p className="dg-modal-hint">
              Yalnız seçilən təchizatçıya aid məhsullarla sənəd birbaşa çap açılacaq.
            </p>
            <label className="dg-field">
              <span className="dg-label">Təchizatçı</span>
              <select
                className="dg-input"
                value={orderSupplierPdfSupplier}
                onChange={(e) => setOrderSupplierPdfSupplier(e.target.value)}
              >
                {pdfSuppliers.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </label>
            <div className="dg-modal-actions">
              <button type="button" className="dg-btn dg-btn-secondary" onClick={closeOrderSupplierPdfDialog}>
                Ləğv et
              </button>
              <button
                type="button"
                className="dg-btn dg-btn-primary"
                disabled={pdfSuppliers.length === 0}
                onClick={async () => {
                  const ok = await printOrderSupplierDoc();
                  if (ok) closeOrderSupplierPdfDialog();
                }}
              >
                Çap et
              </button>
            </div>
          </div>
        </dialog>
      ) : null}

      <dialog ref={infoDialogRef} className="dg-modal dg-modal-info" onClose={() => setInfoDialog(null)}>
        <div className="dg-modal-body">
          {infoDialog?.kind === "company" && infoCompany ? (
            <>
              <h2 className="dg-modal-title">Şirkət məlumatı</h2>
              <dl className="dg-info-dl">
                {companyInfoLines(infoCompany.profile).map((line) => (
                  <div key={line.label} className="dg-info-row">
                    <dt>{line.label}</dt>
                    <dd>{line.value}</dd>
                  </div>
                ))}
              </dl>
            </>
          ) : null}
          {infoDialog?.kind === "project" && infoProject ? (
            <>
              <h2 className="dg-modal-title">Təklif məlumatı</h2>
              <dl className="dg-info-dl">
                <div className="dg-info-row">
                  <dt>Təklif</dt>
                  <dd>{infoProject.title}</dd>
                </div>
                <div className="dg-info-row">
                  <dt>Tarix</dt>
                  <dd>{formatDateAzLong(infoProject.meta.invoiceDate)}</dd>
                </div>
                <div className="dg-info-row">
                  <dt>Şirkət</dt>
                  <dd>{infoProjectBuyer?.name ?? "—"}</dd>
                </div>
                <div className="dg-info-row">
                  <dt>Sətir sayı</dt>
                  <dd>{infoProject.rows.length}</dd>
                </div>
                <div className="dg-info-row">
                  <dt>Növ</dt>
                  <dd>
                    {infoProject.billingMode === "cash"
                      ? "Nağd (qeyri-rəsmi)"
                      : infoProject.billingMode === "official"
                        ? "Rəsmi köçürmə"
                        : infoProject.vatPercent > 0
                          ? `ƏDV ${infoProject.vatPercent}%`
                          : "—"}
                  </dd>
                </div>
                <div className="dg-info-row">
                  <dt>H/F №</dt>
                  <dd>{infoProject.meta.invoiceNumber || "—"}</dd>
                </div>
              </dl>
              <div className="dg-info-section-title">Məhsullar</div>
              <div className="dg-info-table-wrap">
                <table className="dg-info-table">
                  <thead>
                    <tr>
                      <th style={{ width: 54 }} className="dg-num">
                        №
                      </th>
                      <th>Məhsul</th>
                      <th style={{ width: 90 }}>Vahid</th>
                      <th style={{ width: 90 }} className="dg-num">
                        Miqdar
                      </th>
                      <th style={{ width: 140 }} className="dg-num">
                        Qiymət
                      </th>
                      <th style={{ width: 160 }} className="dg-num">
                        Məbləğ
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {infoProject.rows.map((r, idx) => (
                      <tr key={r.id}>
                        <td className="dg-num">{idx + 1}</td>
                        <td>{r.name || "—"}</td>
                        <td>{r.unit || "—"}</td>
                        <td className="dg-num">{r.qty}</td>
                        <td className="dg-num">{formatMoney(r.unitPrice)}</td>
                        <td className="dg-num">{formatMoney(r.qty * r.unitPrice)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {(() => {
                const pack = workspaceToGeneratorState(workspace, { ...infoProject, companyId: infoProject.companyId });
                const t = computeTotals(pack);
                return (
                  <div className="dg-info-totals" aria-label="Yekunlar">
                    <div className="k">Ara cəm</div>
                    <div className="v">{formatMoney(t.subtotal)}</div>
                    {t.vatRate > 0 ? (
                      <>
                        <div className="k">ƏDV ({t.vatRate.toLocaleString("az-AZ", { maximumFractionDigits: 2 })}%)</div>
                        <div className="v">{formatMoney(t.vatAmount)}</div>
                      </>
                    ) : null}
                    <div className="k">Yekun</div>
                    <div className="v">{formatMoney(t.vatRate > 0 ? t.grandTotal : t.subtotal)}</div>
                  </div>
                );
              })()}
            </>
          ) : null}
          {infoDialog?.kind === "offer" && infoOffer && infoOfferTotals ? (
            <>
              <h2 className="dg-modal-title">Təchizatçı təklifi</h2>
              <dl className="dg-info-dl">
                <div className="dg-info-row">
                  <dt>Tarix</dt>
                  <dd>{formatDateAzLong(infoOffer.offerDate)}</dd>
                </div>
                <div className="dg-info-row">
                  <dt>Şirkət</dt>
                  <dd>{companyLabel(infoOffer.companyId)}</dd>
                </div>
                <div className="dg-info-row">
                  <dt>Təchizatçılar</dt>
                  <dd>{offerSuppliersLabel(infoOffer.rows)}</dd>
                </div>
                {infoOffer.note?.trim() ? (
                  <div className="dg-info-row">
                    <dt>Qeyd</dt>
                    <dd>{infoOffer.note.trim()}</dd>
                  </div>
                ) : null}
              </dl>
              <div className="dg-info-section-title">Məhsullar</div>
              <div className="dg-info-table-wrap">
                <table className="dg-info-table">
                  <thead>
                    <tr>
                      <th style={{ width: 54 }} className="dg-num">
                        №
                      </th>
                      <th style={{ width: 140 }}>Təchizatçı</th>
                      <th>Məhsul</th>
                      <th>Əvəz məhsul</th>
                      <th style={{ width: 100 }} className="dg-num">
                        Alış (ƏDV-siz)
                      </th>
                      <th style={{ width: 100 }} className="dg-num">
                        Alış (ƏDV daxil)
                      </th>
                      <th style={{ width: 80 }} className="dg-num">
                        Miqdar
                      </th>
                      <th style={{ width: 80 }} className="dg-num">
                        Faiz %
                      </th>
                      <th style={{ width: 96 }} className="dg-num">
                        Sat. rəsmi
                      </th>
                      <th style={{ width: 96 }} className="dg-num">
                        Sat. nağd
                      </th>
                      <th style={{ width: 100 }} className="dg-num">
                        Alış c.
                      </th>
                      <th style={{ width: 100 }} className="dg-num">
                        Rəsmi c.
                      </th>
                      <th style={{ width: 100 }} className="dg-num">
                        Nağd c.
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {infoOffer.rows.map((r, idx) => (
                      <tr key={r.id}>
                        <td className="dg-num">{idx + 1}</td>
                        <td>{r.supplierName || "—"}</td>
                        <td>{r.name || "—"}</td>
                        <td>{r.replacementName?.trim() || "—"}</td>
                        <td className="dg-num">{r.purchasePrice > 0 ? formatMoney(r.purchasePrice) : "—"}</td>
                        <td className="dg-num">
                          {(r.purchasePriceWithVat ?? 0) > 0 ? formatMoney(r.purchasePriceWithVat!) : "—"}
                        </td>
                        <td className="dg-num">{r.qty}</td>
                        <td className="dg-num">
                          {typeof r.marginPercent === "number" ? r.marginPercent.toLocaleString("az-AZ") : "—"}
                        </td>
                        <td className="dg-num">{formatMoney(resolveOfferSaleUnitPrice(r, "official"))}</td>
                        <td className="dg-num">{formatMoney(resolveOfferSaleUnitPrice(r, "cash"))}</td>
                        <td className="dg-num">{formatMoney(resolvePurchaseExVat(r) * r.qty)}</td>
                        <td className="dg-num">{formatMoney(resolveOfferSaleUnitPrice(r, "official") * r.qty)}</td>
                        <td className="dg-num">{formatMoney(resolveOfferSaleUnitPrice(r, "cash") * r.qty)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <div className="dg-info-totals" aria-label="Yekunlar">
                <div className="k">Alış (ƏDV-siz)</div>
                <div className="v">{formatMoney(infoOfferTotals.purchaseEx)}</div>
                <div className="k">Alış (ƏDV daxil)</div>
                <div className="v">{formatMoney(infoOfferTotals.purchaseInc)}</div>
                <div className="k">Satış (rəsmi, ƏDV-siz)</div>
                <div className="v">{formatMoney(infoOfferTotals.saleOfficial)}</div>
                <div className="k">ƏDV ({OFFICIAL_VAT_PERCENT}%)</div>
                <div className="v">{formatMoney(infoOfferTotals.saleOfficialVat)}</div>
                <div className="k">Yekun (rəsmi)</div>
                <div className="v">{formatMoney(infoOfferTotals.saleOfficialGrand)}</div>
                <div className="k">Satış (nağd)</div>
                <div className="v">{formatMoney(infoOfferTotals.saleCash)}</div>
              </div>
            </>
          ) : null}
          {infoDialog?.kind === "storeOrder" && infoStoreOrder ? (
            <>
              <h2 className="dg-modal-title">Mağaza sifarişi</h2>
              <dl className="dg-info-dl">
                <div className="dg-info-row">
                  <dt>Tarix</dt>
                  <dd>{formatDateAzLong(infoStoreOrder.orderDate)}</dd>
                </div>
                <div className="dg-info-row">
                  <dt>Status</dt>
                  <dd>
                    <OrderStatusBadge status={infoStoreOrder.status} />
                  </dd>
                </div>
                {infoStoreOrder.note?.trim() ? (
                  <div className="dg-info-row">
                    <dt>Qeyd</dt>
                    <dd>{infoStoreOrder.note.trim()}</dd>
                  </div>
                ) : null}
              </dl>
              {renderOrderInfoLinesTable(infoStoreOrder.rows)}
            </>
          ) : null}
          {infoDialog?.kind === "customerOrder" && infoCustomerOrder ? (
            <>
              <h2 className="dg-modal-title">Müştəri sifarişi</h2>
              <dl className="dg-info-dl">
                <div className="dg-info-row">
                  <dt>Müştəri</dt>
                  <dd>{infoCustomerOrder.customerName}</dd>
                </div>
                {infoCustomerOrder.customerPhone?.trim() ? (
                  <div className="dg-info-row">
                    <dt>Telefon</dt>
                    <dd>{infoCustomerOrder.customerPhone.trim()}</dd>
                  </div>
                ) : null}
                <div className="dg-info-row">
                  <dt>Tarix</dt>
                  <dd>{formatDateAzLong(infoCustomerOrder.orderDate)}</dd>
                </div>
                <div className="dg-info-row">
                  <dt>Status</dt>
                  <dd>
                    <OrderStatusBadge status={infoCustomerOrder.status} />
                  </dd>
                </div>
                {infoCustomerOrder.note?.trim() ? (
                  <div className="dg-info-row">
                    <dt>Qeyd</dt>
                    <dd>{infoCustomerOrder.note.trim()}</dd>
                  </div>
                ) : null}
              </dl>
              {renderOrderInfoLinesTable(infoCustomerOrder.rows)}
            </>
          ) : null}
          <button type="button" className="dg-btn dg-btn-primary dg-btn-block dg-modal-close" onClick={() => infoDialogRef.current?.close()}>
            Bağla
          </button>
        </div>
      </dialog>

      {confirmDialog ? (
        <dialog ref={confirmDialogRef} className="dg-modal dg-modal--alert" onClose={() => resolveConfirm(false)}>
          <div className="dg-modal-body">
            <h2 className="dg-modal-title">{confirmDialog.title}</h2>
            <p className="dg-modal-hint">{confirmDialog.message}</p>
            <div className="dg-modal-actions">
              <button type="button" className="dg-btn dg-btn-secondary" onClick={() => resolveConfirm(false)}>
                {confirmDialog.cancelLabel ?? "Ləğv et"}
              </button>
              <button
                type="button"
                className={`dg-btn ${confirmDialog.danger ? "dg-btn-danger" : "dg-btn-primary"}`}
                onClick={() => resolveConfirm(true)}
              >
                {confirmDialog.confirmLabel ?? "Təsdiqlə"}
              </button>
            </div>
          </div>
        </dialog>
      ) : null}

      {promptDialog ? (
        <dialog ref={promptDialogRef} className="dg-modal dg-modal--alert" onClose={() => resolvePrompt(null)}>
          <form
            className="dg-modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              const value = promptDialog.multiline
                ? promptTextareaRef.current?.value ?? ""
                : promptInputRef.current?.value ?? "";
              resolvePrompt(value);
            }}
          >
            <h2 className="dg-modal-title">{promptDialog.title}</h2>
            <label className="dg-field">
              <span className="dg-label">{promptDialog.label}</span>
              {promptDialog.multiline ? (
                <textarea
                  ref={promptTextareaRef}
                  className="dg-input"
                  rows={4}
                  defaultValue={promptDialog.defaultValue ?? ""}
                />
              ) : (
                <input ref={promptInputRef} className="dg-input" defaultValue={promptDialog.defaultValue ?? ""} />
              )}
            </label>
            <div className="dg-modal-actions">
              <button type="button" className="dg-btn dg-btn-secondary" onClick={() => resolvePrompt(null)}>
                {promptDialog.cancelLabel ?? "Ləğv et"}
              </button>
              <button type="submit" className="dg-btn dg-btn-primary">
                {promptDialog.confirmLabel ?? "OK"}
              </button>
            </div>
          </form>
        </dialog>
      ) : null}

      {cashHistoryOpen ? (
        <dialog
          open
          className="dg-modal dg-modal--wide"
          onClose={() => setCashHistoryOpen(false)}
          onClick={(e) => {
            if (e.target === e.currentTarget) setCashHistoryOpen(false);
          }}
        >
          <div className="dg-modal-body">
            <h2 className="dg-modal-title">Kassa tarixçəsi</h2>
            <p className="dg-modal-hint">Hər dəyişiklik avtomatik qeyd olunur.</p>
            {cashReportHistory.length === 0 ? (
              <p className="dg-muted">Hələ dəyişiklik qeydi yoxdur.</p>
            ) : (
              <ul className="dg-cash-changelog">
                {cashReportHistory.map((entry) => (
                  <li key={entry.id} className="dg-cash-changelog-item">
                    <div className="dg-cash-changelog-meta">
                      <span className="dg-cash-changelog-time">
                        {new Date(entry.savedAt).toLocaleString("az-AZ")}
                      </span>
                      {entry.authorName ? (
                        <span className="dg-cash-changelog-author">{entry.authorName}</span>
                      ) : null}
                    </div>
                    <div className="dg-cash-changelog-text">{entry.label}</div>
                    <div className={`dg-cash-changelog-balance ${cashAmountClass(entry.balance)}`}>
                      {entry.balance === 0 ? "—" : `Balans: ${formatCashAmount(entry.balance)}`}
                    </div>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              className="dg-btn dg-btn-primary dg-btn-block dg-modal-close"
              onClick={() => setCashHistoryOpen(false)}
            >
              Bağla
            </button>
          </div>
        </dialog>
      ) : null}

      {noteDialogOpen ? (
        <dialog ref={noteDialogRef} className="dg-modal dg-modal--wide" onClose={() => setNoteDialogOpen(false)}>
          <form
            className="dg-modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              saveNote();
            }}
          >
            <h2 className="dg-modal-title">{noteEditId ? "Qeydi yenilə" : "Yeni qeyd"}</h2>
            <p className="dg-modal-hint">Tarix: {new Date(noteDraftStartedAt).toLocaleString("az-AZ")}</p>
            <div className="dg-grid dg-grid-2">
              <label className="dg-field">
                <span className="dg-label">Başlıq</span>
                <input className="dg-input" value={noteDraft.title} onChange={(e) => setNoteDraft((d) => ({ ...d, title: e.target.value }))} />
              </label>
              <label className="dg-field">
                <span className="dg-label">Reminder vaxtı</span>
                <input
                  className="dg-input"
                  type="datetime-local"
                  value={noteDraft.remindAt || ""}
                  onChange={(e) => setNoteDraft((d) => ({ ...d, remindAt: e.target.value }))}
                />
              </label>
              <label className="dg-field" style={{ gridColumn: "1 / -1" }}>
                <span className="dg-label">Mətn</span>
                <textarea className="dg-input" rows={5} value={noteDraft.body} onChange={(e) => setNoteDraft((d) => ({ ...d, body: e.target.value }))} />
              </label>
            </div>
            <div className="dg-modal-actions">
              <button type="button" className="dg-btn dg-btn-secondary" onClick={() => setNoteDialogOpen(false)}>
                Ləğv et
              </button>
              <button type="submit" className="dg-btn dg-btn-primary">
                Yadda saxla
              </button>
            </div>
          </form>
        </dialog>
      ) : null}

      {reminderNote ? (
        <dialog ref={reminderDialogRef} className="dg-modal dg-modal--alert" onClose={() => setReminderNote(null)}>
          <div className="dg-modal-body">
            <h2 className="dg-modal-title">Reminder</h2>
            <p className="dg-modal-hint">{reminderNote.title || "Qeyd"}</p>
            {reminderNote.body ? <p className="dg-modal-hint">{reminderNote.body}</p> : null}
            <div className="dg-modal-actions">
              <button type="button" className="dg-btn dg-btn-primary" onClick={() => setReminderNote(null)}>
                Bağla
              </button>
            </div>
          </div>
        </dialog>
      ) : null}

      {noteInfoId ? (
        <dialog ref={noteInfoDialogRef} className="dg-modal dg-modal--wide" onClose={() => setNoteInfoId(null)}>
          <div className="dg-modal-body">
            {(() => {
              const n = (workspace.notes ?? []).find((x) => x.id === noteInfoId);
              if (!n) return null;
              return (
                <>
                  <h2 className="dg-modal-title">{n.title || "Qeyd"}</h2>
                  <p className="dg-modal-hint">
                    Tarix: {new Date(n.createdAt).toLocaleString("az-AZ")} · Yenilənib: {new Date(n.updatedAt).toLocaleString("az-AZ")}
                  </p>
                  {n.remindAt ? <p className="dg-modal-hint">Reminder: {n.remindAt.replace("T", " ")}</p> : null}
                  {n.body ? <p className="dg-modal-hint">{n.body}</p> : <p className="dg-modal-hint">—</p>}
                  <div className="dg-modal-actions">
                    <button type="button" className="dg-btn dg-btn-secondary" onClick={() => setNoteInfoId(null)}>
                      Bağla
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </dialog>
      ) : null}

      {leaveInfoId ? (
        <dialog ref={leaveInfoDialogRef} className="dg-modal dg-modal--wide" onClose={() => setLeaveInfoId(null)}>
          <div className="dg-modal-body">
            {(() => {
              const r = (workspace.leaveRequests ?? []).find((x) => x.id === leaveInfoId);
              if (!r) return null;
              return (
                <>
                  <h2 className="dg-modal-title">İş icazəsi sorğusu</h2>
                  <dl className="dg-info-dl">
                    <div className="dg-info-row">
                      <dt>İşçi</dt>
                      <dd>{r.employeeName}</dd>
                    </div>
                    <div className="dg-info-row">
                      <dt>Növ</dt>
                      <dd>{leaveTypeLabel(r.leaveType)}</dd>
                    </div>
                    <div className="dg-info-row">
                      <dt>Tarix</dt>
                      <dd>
                        {formatDateAzLong(r.startDate)}
                        {r.endDate !== r.startDate ? ` – ${formatDateAzLong(r.endDate)}` : ""}
                      </dd>
                    </div>
                    <div className="dg-info-row">
                      <dt>Status</dt>
                      <dd>
                        <LeaveStatusBadge status={r.status} />
                      </dd>
                    </div>
                    <div className="dg-info-row">
                      <dt>Sorğu</dt>
                      <dd>{r.reason}</dd>
                    </div>
                    {r.status === "rejected" && r.rejectReason ? (
                      <div className="dg-info-row dg-leave-reject-info">
                        <dt>İmtina səbəbi</dt>
                        <dd>{r.rejectReason}</dd>
                      </div>
                    ) : null}
                    {r.reviewedByName ? (
                      <div className="dg-info-row">
                        <dt>Baxıldı</dt>
                        <dd>
                          {r.reviewedByName}
                          {r.reviewedAt ? ` · ${new Date(r.reviewedAt).toLocaleString("az-AZ")}` : ""}
                        </dd>
                      </div>
                    ) : null}
                  </dl>
                  <div className="dg-modal-actions">
                    <button type="button" className="dg-btn dg-btn-secondary" onClick={() => setLeaveInfoId(null)}>
                      Bağla
                    </button>
                  </div>
                </>
              );
            })()}
          </div>
        </dialog>
      ) : null}

      {forcePasswordChange ? (
        <dialog ref={forcePasswordDialogRef} className="dg-modal" onCancel={(e) => e.preventDefault()}>
          <div className="dg-modal-body">
            <h2 className="dg-modal-title">Şifrəni dəyişin</h2>
            <p className="dg-modal-hint">İlk girişdə öz şifrənizi təyin etməlisiniz.</p>
            <label className="dg-field">
              <span className="dg-label">Yeni şifrə</span>
              <input
                className="dg-input"
                type="password"
                autoComplete="new-password"
                value={newPasswordDraft}
                onChange={(e) => setNewPasswordDraft(e.target.value)}
                placeholder="Ən azı 6 simvol"
              />
            </label>
            <label className="dg-field">
              <span className="dg-label">Yeni şifrə (təkrar)</span>
              <input
                className="dg-input"
                type="password"
                autoComplete="new-password"
                value={newPasswordConfirm}
                onChange={(e) => setNewPasswordConfirm(e.target.value)}
                placeholder="Şifrəni təkrarlayın"
              />
            </label>
            <div className="dg-modal-actions">
              <button type="button" className="dg-btn dg-btn-primary" onClick={() => void handleForcePasswordSubmit()}>
                Yadda saxla
              </button>
            </div>
          </div>
        </dialog>
      ) : null}
    </>
  );

  if (authState.status === "loading") {
    return (
      <>
        <div className="pg-root biz-ui rb-desktop rb-auth-screen">
          <div className="rb-auth-card" role="status" aria-live="polite">
            <div className="rb-auth-brand">
              <div className="rb-auth-logo" aria-hidden>
                <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" focusable="false">
                  <circle cx="20" cy="20" r="20" fill="rgba(15,23,42,0.06)" />
                  <path d="M11 14h12M11 20h12M11 26h8" stroke="rgba(15,23,42,0.7)" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="rb-auth-title">GenDoc</div>
            </div>
            <p className="rb-auth-sub">Yüklənir…</p>
          </div>
        </div>
        {createPortal(<div className="biz-ui biz-portal-modals">{modalLayer}</div>, document.body)}
      </>
    );
  }

  if (authState.status === "signedOut") {
    return (
      <>
        <div className="pg-root biz-ui rb-desktop rb-auth-screen">
          <form
            className="rb-auth-card"
            onSubmit={(e) => {
              e.preventDefault();
              handleSignIn();
            }}
          >
            <div className="rb-auth-brand">
              <div className="rb-auth-logo" aria-hidden>
                <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" focusable="false">
                  <circle cx="20" cy="20" r="20" fill="rgba(15,23,42,0.06)" />
                  <path d="M11 14h12M11 20h12M11 26h8" stroke="rgba(15,23,42,0.7)" strokeWidth="2" strokeLinecap="round" />
                </svg>
              </div>
              <div className="rb-auth-title">GenDoc</div>
            </div>
            <p className="rb-auth-sub">Daxil olun</p>

            <label className="dg-field">
              <span className="dg-label">İstifadəçi adı və ya email</span>
              <input
                className="dg-input"
                type="text"
                autoComplete="username"
                value={loginIdentifier}
                onChange={(e) => setLoginIdentifier(e.target.value)}
                placeholder="istifadəçi adı və ya developer@email.com"
                disabled={authBusy}
                required
              />
            </label>
            <label className="dg-field">
              <span className="dg-label">Şifrə</span>
              <input
                className="dg-input"
                type="password"
                autoComplete="current-password"
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Şifrə"
                disabled={authBusy}
                required
              />
            </label>

            {authError ? (
              <div className="rb-auth-error" role="alert">
                {authError}
              </div>
            ) : null}

            <div className="rb-auth-actions">
              <button type="submit" className="dg-btn dg-btn-primary" disabled={authBusy}>
                {authBusy ? "Gözləyin…" : "Daxil ol"}
              </button>
              <button type="button" className="dg-btn dg-btn-secondary" onClick={handlePasswordReset} disabled={authBusy}>
                Şifrəni unutmusan?
              </button>
            </div>

            <p className="rb-auth-hint dg-muted" style={{ marginTop: "0.75rem", fontSize: "0.85rem" }}>
              Yeni hesab yalnız admin tərəfindən yaradılır.
            </p>
          </form>
        </div>
        {toast ? (
          <div className={`dg-toast ${toast.kind === "error" ? "dg-toast--error" : "dg-toast--success"}`} role="status">
            {toast.msg}
          </div>
        ) : null}
        {createPortal(<div className="biz-ui biz-portal-modals">{modalLayer}</div>, document.body)}
      </>
    );
  }

  return (
    <>
      <div className="pg-root biz-ui rb-desktop">
        {!firebaseEnabled ? (
          <div
            style={{
              position: "fixed",
              left: 12,
              bottom: 12,
              zIndex: 200,
              padding: "10px 12px",
              borderRadius: 12,
              border: "1px solid rgba(239, 68, 68, 0.35)",
              background: "rgba(239, 68, 68, 0.10)",
              color: "rgba(153, 27, 27, 0.95)",
              fontSize: 12,
              fontWeight: 700,
              maxWidth: 520,
            }}
            role="status"
          >
            Sync OFF — Firebase qoşulmayıb. {firebaseConfigError || ""}
          </div>
        ) : null}
        <button
          type="button"
          className={`rb-sidebar-backdrop ${sidebarOpen ? "is-visible" : ""}`}
          aria-label="Menyunu bağla"
          tabIndex={sidebarOpen ? 0 : -1}
          onClick={() => setSidebarOpen(false)}
        />

        <div className="rb-shell">
          <aside className={`rb-sidebar ${sidebarOpen ? "is-open" : ""}`} aria-label="Modullar">
            <div className="rb-profile-card">
              <div className="rb-profile-avatar" aria-hidden>
                <svg viewBox="0 0 40 40" xmlns="http://www.w3.org/2000/svg" focusable="false">
                  <circle cx="20" cy="20" r="20" fill="rgba(255,255,255,0.12)" />
                  <circle cx="20" cy="16" r="7" fill="rgba(255,255,255,0.9)" />
                  <path d="M7.5 36.5c2.7-6.7 8.2-10 12.5-10s9.8 3.3 12.5 10" fill="rgba(255,255,255,0.9)" />
                </svg>
              </div>
              <div className="rb-profile-meta">
                <div className="rb-profile-name">GenDoc</div>
                <div className="rb-profile-sub">Sənəd generatoru</div>
              </div>
            </div>

            <p className="rb-menu-section">Modullar</p>
            <nav className="rb-menu" aria-label="Əsas modullar">
              {filteredMainNavIds.map((id) => {
                const m = SIDEBAR_MODULES.find((x) => x.id === id)!;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`rb-menu-item ${module === m.id ? "is-active" : ""}`}
                    onClick={() => switchSidebarModule(m.id)}
                  >
                    <span className="rb-menu-icon">
                      <SidebarNavIcon mod={m.id} />
                    </span>
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </nav>

            <p className="rb-menu-section">Sistem</p>
            <nav className="rb-menu" aria-label="Sistem modulları">
              {filteredSystemNavIds.map((id) => {
                const m = SIDEBAR_MODULES.find((x) => x.id === id)!;
                return (
                  <button
                    key={m.id}
                    type="button"
                    className={`rb-menu-item ${module === m.id ? "is-active" : ""}`}
                    onClick={() => switchSidebarModule(m.id)}
                  >
                    <span className="rb-menu-icon">
                      <SidebarNavIcon mod={m.id} />
                    </span>
                    <span>{m.label}</span>
                  </button>
                );
              })}
            </nav>

            <div className="rb-sidebar-spacer" aria-hidden />
            {authState.status === "signedIn" ? (
              <div className="rb-auth-bar">
                <div className="rb-auth-email" title={authState.user.email || ""}>
                  {authState.user.email || "İstifadəçi"}
                </div>
              </div>
            ) : null}
            <button
              type="button"
              className="rb-menu-item rb-menu-item-logout"
              onClick={() => {
                if (authState.status === "signedIn") {
                  handleSignOut();
                } else {
                  setSidebarOpen(false);
                }
              }}
            >
              <span className="rb-menu-icon">
                <IconLogout />
              </span>
              <span>{authState.status === "signedIn" ? "Çıxış" : "Logout"}</span>
            </button>
          </aside>

          <section className="rb-workspace">
            <header className="rb-topbar">
              <div className="rb-topbar-leading">
                <button
                  type="button"
                  className="rb-sidebar-toggle"
                  aria-label="Menyunu aç"
                  onClick={() => setSidebarOpen(true)}
                >
                  <IconMenuBars />
                </button>
                <div className="rb-page-title">
                  <h1>{workspaceHeader.title}</h1>
                  {workspaceHeader.sub ? <p>{workspaceHeader.sub}</p> : null}
                </div>
              </div>
              <div className="rb-topbar-tools">
                {canReviewLeave ? (
                  <div className="rb-notifications" ref={notificationsRef}>
                    <button
                      type="button"
                      className={`rb-notifications-btn ${unviewedLeaveCount > 0 ? "has-unread" : ""}`}
                      aria-label={
                        unviewedLeaveCount > 0
                          ? `${unviewedLeaveCount} yeni iş icazəsi sorğusu`
                          : "Bildirişlər"
                      }
                      aria-expanded={notificationsOpen}
                      onClick={() => setNotificationsOpen((open) => !open)}
                    >
                      <IconBell />
                      {unviewedLeaveCount > 0 ? (
                        <span className="rb-notifications-badge" aria-hidden>
                          {unviewedLeaveCount > 9 ? "9+" : unviewedLeaveCount}
                        </span>
                      ) : null}
                    </button>
                    {notificationsOpen ? (
                      <div className="rb-notifications-panel" role="dialog" aria-label="Bildirişlər">
                        <div className="rb-notifications-head">Bildirişlər</div>
                        {unviewedLeaveCount === 0 ? (
                          <p className="rb-notifications-empty">Yeni iş icazəsi sorğusu yoxdur</p>
                        ) : (
                          <ul className="rb-notifications-list">
                            {unviewedLeaveRequests.map((r) => (
                              <li key={r.id}>
                                <button
                                  type="button"
                                  className="rb-notifications-item"
                                  onClick={() => {
                                    markLeaveNotificationsSeen();
                                    switchSidebarModule("workLeave");
                                    setLeaveInfoId(r.id);
                                    setNotificationsOpen(false);
                                  }}
                                >
                                  <span className="rb-notifications-item-title">{r.employeeName}</span>
                                  <span className="rb-notifications-item-sub">
                                    {leaveTypeLabel(r.leaveType)} · {formatDateAzLong(r.startDate)}
                                  </span>
                                </button>
                              </li>
                            ))}
                          </ul>
                        )}
                        <button
                          type="button"
                          className="rb-notifications-foot"
                          onClick={() => {
                            markLeaveNotificationsSeen();
                            switchSidebarModule("workLeave");
                            setNotificationsOpen(false);
                          }}
                        >
                          İş icazələrinə keç
                        </button>
                      </div>
                    ) : null}
                  </div>
                ) : null}
                <div className="rb-search-with-action">
                  <div className="rb-search-box" role="search">
                    <IconSearchSidebar />
                    <input
                      ref={navSearchRef}
                      type="search"
                      placeholder="Modullarda süzgəc..."
                      value={navSearch}
                      onChange={(e) => setNavSearch(e.target.value)}
                      aria-label="Modullarda süzgəc"
                    />
                  </div>
                  {module === "cashReport" ? (
                    <>
                      <button type="button" className="dg-btn dg-btn-secondary" onClick={() => setCashHistoryOpen(true)}>
                        Tarixçə
                        {cashReportHistory.length > 0 ? (
                          <span className="dg-cash-history-badge">{cashReportHistory.length}</span>
                        ) : null}
                      </button>
                      <button type="button" className="dg-btn dg-btn-primary" onClick={addCashReportRow}>
                        Sətir əlavə et
                      </button>
                    </>
                  ) : headerPrimaryAction ? (
                    <button type="button" className="dg-btn dg-btn-primary" onClick={headerPrimaryAction.onClick}>
                      {headerPrimaryAction.label}
                    </button>
                  ) : null}
                </div>
              </div>
            </header>

            <main className={`rb-content${module === "cashReport" ? " rb-content--cash-report" : ""}`}>
              {toast ? (
                <div className={`dg-toast ${toast.kind === "error" ? "dg-toast--error" : "dg-toast--success"}`} role="status">
                  {toast.msg}
                </div>
              ) : null}

              {module === "companies" ? renderCompaniesModule() : null}
              {module === "projects" ? renderProjectsModule() : null}
              {module === "folders" ? renderFoldersModule() : null}
              {module === "notes" ? renderNotesModule() : null}
              {module === "suppliers" ? renderSuppliersModule() : null}
              {module === "storeOrders" ? renderStoreOrdersModule() : null}
              {module === "customerOrders" ? renderCustomerOrdersModule() : null}
              {module === "priceCalculations" ? renderPriceCalculationsModule() : null}
              {module === "instructions" ? (
                <InstructionsModule
                  state={workspace.instructions!}
                  onChange={(instructions) => setWorkspace((w) => ({ ...w, instructions }))}
                />
              ) : null}
              {module === "cashReport" ? renderCashReportModule() : null}
              {module === "appUsers" ? renderAppUsersModule() : null}
              {module === "systemPermissions" ? renderSystemPermissionsModule() : null}
              {module === "workLeave" ? renderWorkLeaveModule() : null}
              {module === "settings" ? renderSettingsModule() : null}
            </main>
          </section>
        </div>
      </div>
      {createPortal(<div className="biz-ui biz-portal-modals">{modalLayer}</div>, document.body)}
    </>
  );
}

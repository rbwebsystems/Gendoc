import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { createPortal } from "react-dom";
import "./App.css";
import "./rbsoft-theme.css";
import {
  buildDeliveryActHtml,
  buildDeliveryActNoPriceHtml,
  buildInvoiceHtml,
  buildProtocolHtml,
  openPrintableDocument,
  computeTotals,
} from "./documents/generateDocuments";
import {
  backupLocalWorkspace,
  clearLocalWorkspace,
  hasLocalWorkspace,
  hasLocalWorkspaceBackup,
  loadLocalWorkspaceBackup,
  loadWorkspaceLocal,
  normalizeCompany,
  normalizeProductRows,
  normalizeWorkspace,
  pickPreferredWorkspace,
  projectsUsingCompany,
  saveWorkspaceLocal,
  sortProjectsByDate,
  workspaceHasUserData,
  workspaceToGeneratorState,
} from "./lib/docStorage";
import { emptyCompany, emptyMeta, newProductRow } from "./lib/defaults";
import { formatDateAzLong, formatMoney } from "./lib/text";
import type {
  CompanyProfile,
  DocWorkspace,
  DocumentMeta,
  FolderFileRecord,
  NoteRecord,
  ProductRow,
  ProjectRecord,
  SavedCompanyRecord,
  SupplierQuoteRecord,
  SupplierRecord,
  WorkspaceFolderRecord,
} from "./types";
import html2pdf from "html2pdf.js";
import { auth, firebaseConfigError, firebaseEnabled } from "./lib/firebase";
import {
  createUserWithEmailAndPassword,
  onAuthStateChanged,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signOut,
  type User,
} from "firebase/auth";
import {
  deleteStorageFile,
  fetchWorkspaceOnce,
  subscribeWorkspace,
  uploadFolderFile,
  writeWorkspace,
} from "./lib/workspaceSync";

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

type SidebarModule = "companies" | "projects" | "folders" | "notes" | "suppliers" | "settings";

type CompanyFormMode = "list" | "form";
type ProjectFormMode = "list" | "form";

type ProjectDraft = {
  title: string;
  companyId: string;
  rows: ProductRow[];
  meta: DocumentMeta;
  vatPercent: number;
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
  { id: "companies", label: "Şirkətlər" },
  { id: "projects", label: "Təkliflər" },
  { id: "folders", label: "Qovluqlar" },
  { id: "notes", label: "Qeydlər" },
  { id: "suppliers", label: "Təchizatçılar" },
  { id: "settings", label: "Ayarlar" },
];

const SIDEBAR_MAIN_IDS: SidebarModule[] = ["companies", "projects", "folders", "notes", "suppliers"];

const MODULE_TAGLINE: Record<SidebarModule, string> = {
  companies: "",
  projects: "",
  folders: "",
  notes: "",
  suppliers: "",
  settings: "",
};

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

type LoginFormMode = "signin" | "signup";

export default function App() {
  // Firebase yoxdursa lokal localStorage rejimində qalırıq.
  const initialAuth: AuthState = firebaseEnabled ? { status: "loading" } : { status: "disabled" };
  const [authState, setAuthState] = useState<AuthState>(initialAuth);
  const [authError, setAuthError] = useState<string>("");
  const [authBusy, setAuthBusy] = useState<boolean>(false);
  const [loginMode, setLoginMode] = useState<LoginFormMode>("signin");
  const [loginEmail, setLoginEmail] = useState<string>("");
  const [loginPassword, setLoginPassword] = useState<string>("");

  const [workspace, setWorkspace] = useState<DocWorkspace>(() => normalizeWorkspace(loadWorkspaceLocal()));
  // Remote ilə yerli arasında "echo" yazıların qarşısını almaq üçün son sinxronlaşmış JSON
  const lastSyncedJsonRef = useRef<string>("");
  // İlk snapshot gəlmədən yazmaq olmaz (yoxsa migration ilə yaza bilərik)
  const remoteReadyRef = useRef<boolean>(false);
  const [module, setModule] = useState<SidebarModule>("companies");
  const [toast, setToast] = useState<{ kind: ToastKind; msg: string } | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [navSearch, setNavSearch] = useState("");
  const navSearchRef = useRef<HTMLInputElement>(null);
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

  type SupplierPanel = "quotes" | "directory";
  const [supplierPanel, setSupplierPanel] = useState<SupplierPanel>("quotes");
  const [quoteEditId, setQuoteEditId] = useState<string | null>(null);
  const [quoteDraft, setQuoteDraft] = useState<{
    supplierId: string;
    projectId: string;
    quoteDate: string;
    amount: string;
    description: string;
    note: string;
  }>(() => ({
    supplierId: "",
    projectId: "",
    quoteDate: new Date().toISOString().slice(0, 10),
    amount: "",
    description: "",
    note: "",
  }));
  const quoteDialogRef = useRef<HTMLDialogElement>(null);
  const [quoteDialogOpen, setQuoteDialogOpen] = useState(false);
  const [supplierEditId, setSupplierEditId] = useState<string | null>(null);
  const [supplierDraft, setSupplierDraft] = useState<{ name: string; phone: string; note: string }>(() => ({
    name: "",
    phone: "",
    note: "",
  }));
  const supplierDialogRef = useRef<HTMLDialogElement>(null);
  const [supplierDialogOpen, setSupplierDialogOpen] = useState(false);

  const [companyMode, setCompanyMode] = useState<CompanyFormMode>("list");
  const [companyEditId, setCompanyEditId] = useState<string | null>(null);
  const [companyDraft, setCompanyDraft] = useState<CompanyProfile>(() => emptyCompany());

  const [projectMode, setProjectMode] = useState<ProjectFormMode>("list");
  const [projectEditId, setProjectEditId] = useState<string | null>(null);
  const [projectDraft, setProjectDraft] = useState<ProjectDraft>(() => emptyProjectDraft());

  const [infoDialog, setInfoDialog] = useState<{ kind: "company" | "project"; id: string } | null>(null);
  const printDialogRef = useRef<HTMLDialogElement>(null);
  const [printProjectId, setPrintProjectId] = useState<string | null>(null);
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
  } | null>(null);
  const promptResolverRef = useRef<((v: string | null) => void) | null>(null);
  const promptInputRef = useRef<HTMLInputElement>(null);
  const reminderDialogRef = useRef<HTMLDialogElement>(null);
  const [reminderNote, setReminderNote] = useState<NoteRecord | null>(null);
  const noteInfoDialogRef = useRef<HTMLDialogElement>(null);
  const [noteInfoId, setNoteInfoId] = useState<string | null>(null);

  // 1) Firebase Auth dövriyyəsi
  useEffect(() => {
    if (!firebaseEnabled || !auth) {
      setAuthState({ status: "disabled" });
      return;
    }
    const unsub = onAuthStateChanged(auth, (user) => {
      if (user) {
        setAuthState({ status: "signedIn", user });
      } else {
        setAuthState({ status: "signedOut" });
        // İstifadəçi çıxış edibsə remote sinxron izlərini sıfırla
        remoteReadyRef.current = false;
        lastSyncedJsonRef.current = "";
      }
    });
    return () => unsub();
  }, []);

  // 2) Workspace abunəliyi (yalnız autentifikasiyadan sonra)
  useEffect(() => {
    if (authState.status !== "signedIn") return;
    const uid = authState.user.uid;
    let cancelled = false;

    // İlk dəfə: lokal + remote-u müqayisə et, daha dolu olanı saxla
    (async () => {
      try {
        const remote = await fetchWorkspaceOnce(uid);
        if (cancelled) return;

        const localMain = hasLocalWorkspace() ? loadWorkspaceLocal() : null;
        const localBackup = loadLocalWorkspaceBackup();
        const local = pickPreferredWorkspace(localMain, localBackup);
        const merged = pickPreferredWorkspace(local, remote);

        const remoteNorm = remote ? normalizeWorkspace(remote) : null;
        const needsUpload =
          !remoteNorm ||
          !workspaceHasUserData(remoteNorm) ||
          JSON.stringify(merged) !== JSON.stringify(remoteNorm);

        if (needsUpload) {
          await writeWorkspace(uid, merged);
        }

        backupLocalWorkspace();
        clearLocalWorkspace();

        if (!cancelled) {
          lastSyncedJsonRef.current = JSON.stringify(merged);
          setWorkspace(merged);
          remoteReadyRef.current = true;
        }
      } catch {
        /* ignore — onSnapshot da işə düşəcək */
      }
    })();

    const unsub = subscribeWorkspace(uid, ({ exists, workspace: remoteWs }) => {
      if (!exists || !remoteWs) {
        // Hələ doc yaranmayıb — fetchWorkspaceOnce yuxarıda işini görür
        return;
      }
      const normalized = normalizeWorkspace(remoteWs);
      const json = JSON.stringify(normalized);
      // Echo qoruması: snapshot bizim öz yazımızdırsa, state-ə dəymə
      if (json === lastSyncedJsonRef.current) {
        remoteReadyRef.current = true;
        return;
      }
      lastSyncedJsonRef.current = json;
      remoteReadyRef.current = true;
      setWorkspace(normalized);
    });

    return () => {
      cancelled = true;
      unsub();
    };
  }, [authState]);

  // 3) Workspace dəyişəndə debounced yazı (remote və ya lokal)
  useEffect(() => {
    const json = JSON.stringify(workspace);

    // Remote rejim
    if (firebaseEnabled && authState.status === "signedIn") {
      if (!remoteReadyRef.current) return; // hələ ilk snapshot gəlməyib
      if (json === lastSyncedJsonRef.current) return; // remote ilə eyni
      const uid = authState.user.uid;
      const id = window.setTimeout(() => {
        writeWorkspace(uid, workspace)
          .then(() => {
            lastSyncedJsonRef.current = json;
          })
          .catch(() => {
            flash(setToast, "Sinxronlaşma alınmadı", "error");
          });
      }, 600);
      return () => window.clearTimeout(id);
    }

    // Lokal rejim — yalnız Firebase ümumiyyətlə deaktivdirsə
    if (!firebaseEnabled || authState.status === "disabled") {
      const id = window.setTimeout(() => saveWorkspaceLocal(workspace), 420);
      return () => window.clearTimeout(id);
    }
    // signedOut / loading vəziyyətində yazma — istifadəçilər arası məlumat sızmasın
    return;
  }, [workspace, authState]);

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
    const el = quoteDialogRef.current;
    if (!el) return;
    if (quoteDialogOpen) {
      softBeep();
      el.showModal();
    } else el.close();
  }, [quoteDialogOpen]);

  useEffect(() => {
    const el = supplierDialogRef.current;
    if (!el) return;
    if (supplierDialogOpen) {
      softBeep();
      el.showModal();
    } else el.close();
  }, [supplierDialogOpen]);

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

  const projectLabel = useCallback(
    (projectId?: string) => {
      if (!projectId) return "—";
      const p = workspace.projects.find((x) => x.id === projectId);
      if (!p) return "—";
      const company = workspace.companies.find((c) => c.id === p.companyId);
      const companyName = company?.profile.name?.trim();
      return companyName ? `${p.title} (${companyName})` : p.title;
    },
    [workspace.projects, workspace.companies],
  );

  const sortedSupplierQuotes = useMemo(() => {
    return [...(workspace.supplierQuotes ?? [])].sort((a, b) => {
      const da = a.quoteDate || "";
      const db = b.quoteDate || "";
      if (da !== db) return db.localeCompare(da);
      return b.updatedAt - a.updatedAt;
    });
  }, [workspace.supplierQuotes]);

  const filteredMainNavIds = useMemo(() => {
    const q = navSearch.trim().toLowerCase();
    return SIDEBAR_MAIN_IDS.filter((id) => {
      const label = SIDEBAR_MODULES.find((m) => m.id === id)?.label ?? "";
      return !q || label.toLowerCase().includes(q);
    });
  }, [navSearch]);

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
      return { title: "Təchizatçılar", sub: MODULE_TAGLINE.suppliers };
    }
    return { title: "", sub: "" };
  }, [module, companyMode, projectMode, companyEditId, projectEditId]);

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
    (opts: { title: string; label: string; defaultValue?: string; confirmLabel?: string; cancelLabel?: string }) => {
      return new Promise<string | null>((resolve) => {
        promptResolverRef.current = resolve;
        setPromptDialog(opts);
      });
    },
    [],
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
        await writeWorkspace(authState.user.uid, merged);
        lastSyncedJsonRef.current = JSON.stringify(merged);
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
      const seq = workspace.settings.docSeq ?? { invoice: 1, delivery: 1, protocol: 1 };
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
    kind: "invoice" | "delivery" | "deliveryNoPrice" | "protocol",
    mode: "print" | "pdf",
  ) => {
    const proj = workspace.projects.find((p) => p.id === projectId);
    if (!proj) {
      closePrintDialog();
      return;
    }

    // Çap zamanı nömrə dərhal HTML-də görünsün deyə burada sinxron hesablayırıq
    // və həm workspace-ə, həm də print paketin meta-sına tətbiq edirik.
    const seq = workspace.settings.docSeq ?? { invoice: 1, delivery: 1, protocol: 1 };
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
          : buildProtocolHtml(pack);
    if (mode === "pdf") {
      const buyerName = workspace.companies.find((c) => c.id === proj.companyId)?.profile?.name?.trim();
      const base = kind === "invoice" ? "hesab-faktura" : kind === "protocol" ? "protokol" : "tehvil-akti";
      const no =
        kind === "invoice"
          ? meta.invoiceNumber
          : kind === "protocol"
            ? meta.protocolNumber
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
        vatPercent: projectDraft.vatPercent,
      }),
    [projectDraft.rows, projectDraft.meta, projectDraft.vatPercent],
  );

  const infoCompany = infoDialog?.kind === "company" ? workspace.companies.find((c) => c.id === infoDialog.id) : undefined;
  const infoProject = infoDialog?.kind === "project" ? workspace.projects.find((p) => p.id === infoDialog.id) : undefined;
  const infoProjectBuyer =
    infoProject && workspace.companies.find((c) => c.id === infoProject.companyId)?.profile;

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
  }>(() => ({
    open: false,
    x: 0,
    y: 0,
    kind: "folder",
    folderId: undefined,
    companyId: undefined,
  }));

  const foldersByCompany = useMemo(() => {
    const m = new Map<string, WorkspaceFolderRecord>();
    for (const f of (workspace.folders ?? []).filter((x) => x.kind === "company" && x.companyId)) {
      m.set(f.companyId!, f as WorkspaceFolderRecord);
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

  const readFileAsDataUrlRecord = (f: File): Promise<FolderFileRecord> => {
    return new Promise<FolderFileRecord>((resolve, reject) => {
      const r = new FileReader();
      r.onerror = () => reject(new Error("read"));
      r.onload = () =>
        resolve({
          id: crypto.randomUUID(),
          name: f.name,
          mime: f.type || "application/octet-stream",
          size: f.size,
          createdAt: Date.now(),
          dataUrl: String(r.result || ""),
        });
      r.readAsDataURL(f);
    });
  };

  const onUploadToFolder = async (folderId: string, filesList: FileList | null) => {
    if (!folderId || !filesList || filesList.length === 0) return;
    const files = Array.from(filesList);
    const useRemote = firebaseEnabled && authState.status === "signedIn";
    try {
      let added: FolderFileRecord[] = [];
      if (useRemote && authState.status === "signedIn") {
        const uid = authState.user.uid;
        // Storage ola bilməz (billing tələb edə bilər). Bu halda dataUrl fallback edirik.
        const results = await Promise.all(
          files.map(async (f) => {
            try {
              return await uploadFolderFile(uid, folderId, f);
            } catch {
              return await readFileAsDataUrlRecord(f);
            }
          }),
        );
        added = results;
        if (results.some((x) => Boolean(x.dataUrl) && !x.url)) {
          flash(setToast, "Storage yoxdur — fayllar dataUrl kimi saxlanıldı", "error");
        }
      } else {
        // Lokal rejim — eski dataUrl formatı
        added = await Promise.all(files.map(readFileAsDataUrlRecord));
      }
      setWorkspace((w) => ({
        ...w,
        folders: (w.folders ?? []).map((fold) => {
          if (fold.id !== folderId) return fold;
          const now = Date.now();
          return {
            ...fold,
            updatedAt: now,
            files: [...(fold.files ?? []), ...added],
          };
        }),
      }));
      flash(setToast, "Fayllar əlavə olundu");
    } catch {
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
    // Əvvəlcə Storage-dən sil (varsa)
    const folder = (workspace.folders ?? []).find((x) => x.id === folderId);
    const file = folder?.files?.find((x) => x.id === fileId);
    if (file?.storagePath && firebaseEnabled && authState.status === "signedIn") {
      try {
        await deleteStorageFile(file.storagePath);
      } catch {
        /* metadatanı yenə də siləcəyik */
      }
    }
    setWorkspace((w) => ({
      ...w,
      folders: (w.folders ?? []).map((fold) =>
        fold.id !== folderId ? fold : { ...fold, updatedAt: Date.now(), files: (fold.files ?? []).filter((x) => x.id !== fileId) },
      ),
    }));
    flash(setToast, "Fayl silindi");
  };

  // Qovluq silərkən bütün remote faylları da Storage-dən təmizləyir
  const purgeFoldersStorage = async (folders: WorkspaceFolderRecord[]) => {
    if (!(firebaseEnabled && authState.status === "signedIn")) return;
    for (const fold of folders) {
      for (const f of fold.files ?? []) {
        if (f.storagePath) {
          try {
            await deleteStorageFile(f.storagePath);
          } catch {
            /* davam et */
          }
        }
      }
    }
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
    setFolderMenu({ open: false, x: 0, y: 0, kind: "folder", folderId: undefined, companyId: undefined });
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
    setFolderMenu({ open: false, x: 0, y: 0, kind: "folder", folderId: undefined, companyId: undefined });
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
    const folder = activeFolderId ? folderById.get(activeFolderId) : undefined;
    const anyFoldersExist = (workspace.folders ?? []).length > 0;
    return (
      <div className="dg-form-page pg-panel" aria-label="Qovluqlar">
        <header className="dg-form-page-head">
          <div>
            <h1 className="dg-form-page-title">Qovluqlar</h1>
          </div>
        </header>
        <div className="dg-form-page-body">
          {companies.length === 0 ? (
            <div className="dg-empty-state-card" role="status" aria-label="Boş vəziyyət">
              <div className="dg-empty-state-title">Əvvəl şirkət əlavə edin</div>
              <div className="dg-empty-state-desc">
                Qovluqlar bölməsindən istifadə etmək üçün əvvəlcə Şirkətlər bölməsində şirkət yaradılmalıdır.
              </div>
              <div className="dg-empty-state-actions">
                <button
                  type="button"
                  className="dg-btn dg-btn-primary"
                  onClick={() => {
                    setModule("companies");
                    setFolderView("grid");
                  }}
                >
                  Şirkətlərə keç
                </button>
              </div>
            </div>
          ) : folderView === "grid" ? (
            <>
              <div className="dg-folders-toolbar" aria-label="Qovluqlar alət paneli">
                <div className="dg-folders-toolbar-left">
                  <input className="dg-input dg-folders-search" type="search" placeholder="Qovluqlarda axtar..." aria-label="Qovluqlarda axtar" />
                </div>
                <div className="dg-folders-toolbar-right" />
              </div>

              {!anyFoldersExist ? (
                <div className="dg-empty-state-card" role="status">
                  <div className="dg-empty-state-title">Hələ qovluq yoxdur</div>
                  <div className="dg-empty-state-desc">Yeni qovluq yaradaraq sənədləri qruplaşdırın.</div>
                </div>
              ) : null}
              <div
                className="dg-folder-grid"
                role="list"
                aria-label="Qovluqlar"
                onContextMenu={(e) => {
                  if (e.target !== e.currentTarget) return;
                  e.preventDefault();
                  setFolderMenu({ open: true, x: e.clientX, y: e.clientY, kind: "root" });
                }}
              >
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
                {companies.map((c) => {
                  const f = foldersByCompany.get(c.id);
                  const thumbs = (f?.files ?? [])
                    .slice()
                    .sort((a, b) => b.createdAt - a.createdAt)
                    .slice(0, 4);
                  return (
                    <button
                      key={c.id}
                      type="button"
                      className="dg-folder-tile"
                      role="listitem"
                      onDoubleClick={() => {
                        if (f?.id) setActiveFolderId(f.id);
                        setFolderView("folder");
                      }}
                      onClick={() => f?.id && setActiveFolderId(f.id)}
                      onContextMenu={(e) => {
                        e.preventDefault();
                        if (f?.id) setActiveFolderId(f.id);
                        setFolderMenu({ open: true, x: e.clientX, y: e.clientY, kind: "folder", folderId: f?.id, companyId: c.id });
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
                                  <div className="dg-folder-thumbbadge">{t.mime === "application/pdf" ? "PDF" : "FILE"}</div>
                                )}
                              </div>
                            ))}
                          </div>
                        ) : null}
                      </div>
                      <div className="dg-folder-name">{c.profile.name || c.profile.voen || "Şirkət"}</div>
                    </button>
                  );
                })}
              </div>

              {folderMenu.open ? (
                <div
                  className="dg-context-menu-backdrop"
                  onMouseDown={() => setFolderMenu({ open: false, x: 0, y: 0, kind: "folder", folderId: undefined, companyId: undefined })}
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
                          setFolderMenu({ open: false, x: 0, y: 0, kind: "folder", folderId: undefined, companyId: undefined });
                          createCustomFolder();
                          return;
                        }
                        if (folderMenu.folderId) setActiveFolderId(folderMenu.folderId);
                        setFolderView("folder");
                        setFolderMenu({ open: false, x: 0, y: 0, kind: "folder", folderId: undefined, companyId: undefined });
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
                      const isPdf = f.mime === "application/pdf";
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

  const resetQuoteDraft = () => {
    setQuoteEditId(null);
    setQuoteDraft({
      supplierId: "",
      projectId: "",
      quoteDate: new Date().toISOString().slice(0, 10),
      amount: "",
      description: "",
      note: "",
    });
  };

  const openNewQuoteDialog = () => {
    resetQuoteDraft();
    setQuoteDialogOpen(true);
  };

  const startEditQuote = (q: SupplierQuoteRecord) => {
    setQuoteEditId(q.id);
    setQuoteDraft({
      supplierId: q.supplierId,
      projectId: q.projectId || "",
      quoteDate: q.quoteDate || new Date().toISOString().slice(0, 10),
      amount: q.amount > 0 ? String(q.amount) : "",
      description: q.description || "",
      note: q.note || "",
    });
    setQuoteDialogOpen(true);
  };

  const saveQuote = () => {
    const supplierId = quoteDraft.supplierId.trim();
    if (!supplierId) {
      flash(setToast, "Təchizatçı seçin.", "error");
      return;
    }
    const amount = Number(String(quoteDraft.amount).replace(",", "."));
    if (!Number.isFinite(amount) || amount <= 0) {
      flash(setToast, "Qiymət düzgün daxil edin.", "error");
      return;
    }
    const quoteDate = (quoteDraft.quoteDate || "").trim() || new Date().toISOString().slice(0, 10);
    const projectId = quoteDraft.projectId.trim() || undefined;
    const description = quoteDraft.description.trim() || undefined;
    const note = quoteDraft.note.trim() || undefined;
    const now = Date.now();

    if (quoteEditId) {
      setWorkspace((w) => ({
        ...w,
        supplierQuotes: (w.supplierQuotes ?? []).map((q) =>
          q.id === quoteEditId
            ? { ...q, supplierId, projectId, quoteDate, amount, description, note, updatedAt: now }
            : q,
        ),
      }));
      flash(setToast, "Qiymət qeydi yeniləndi");
    } else {
      const rec: SupplierQuoteRecord = {
        id: crypto.randomUUID(),
        supplierId,
        projectId,
        quoteDate,
        amount,
        description,
        note,
        createdAt: now,
        updatedAt: now,
      };
      setWorkspace((w) => ({ ...w, supplierQuotes: [...(w.supplierQuotes ?? []), rec] }));
      flash(setToast, "Qiymət qeydi əlavə olundu");
    }
    resetQuoteDraft();
    setQuoteDialogOpen(false);
  };

  const deleteQuote = async (id: string) => {
    const ok = await askConfirm({
      title: "Silmə təsdiqi",
      message: "Bu qiymət qeydi silinsin?",
      confirmLabel: "Sil",
      cancelLabel: "Ləğv et",
      danger: true,
    });
    if (!ok) return;
    setWorkspace((w) => ({ ...w, supplierQuotes: (w.supplierQuotes ?? []).filter((q) => q.id !== id) }));
    if (quoteEditId === id) resetQuoteDraft();
    flash(setToast, "Qiymət qeydi silindi");
  };

  const resetSupplierDraft = () => {
    setSupplierEditId(null);
    setSupplierDraft({ name: "", phone: "", note: "" });
  };

  const openNewSupplierDialog = () => {
    resetSupplierDraft();
    setSupplierDialogOpen(true);
  };

  const startEditSupplier = (s: SupplierRecord) => {
    setSupplierEditId(s.id);
    setSupplierDraft({ name: s.name, phone: s.phone || "", note: s.note || "" });
    setSupplierDialogOpen(true);
  };

  const saveSupplier = () => {
    const name = supplierDraft.name.trim();
    if (!name) {
      flash(setToast, "Təchizatçı adı daxil edin.", "error");
      return;
    }
    const phone = supplierDraft.phone.trim() || undefined;
    const note = supplierDraft.note.trim() || undefined;
    const now = Date.now();

    if (supplierEditId) {
      setWorkspace((w) => ({
        ...w,
        suppliers: (w.suppliers ?? []).map((s) =>
          s.id === supplierEditId ? { ...s, name, phone, note, updatedAt: now } : s,
        ),
      }));
      flash(setToast, "Təchizatçı yeniləndi");
    } else {
      const rec: SupplierRecord = {
        id: crypto.randomUUID(),
        name,
        phone,
        note,
        createdAt: now,
        updatedAt: now,
      };
      setWorkspace((w) => ({ ...w, suppliers: [...(w.suppliers ?? []), rec] }));
      flash(setToast, "Təchizatçı əlavə olundu");
    }
    resetSupplierDraft();
    setSupplierDialogOpen(false);
  };

  const deleteSupplier = async (id: string) => {
    const quoteCount = (workspace.supplierQuotes ?? []).filter((q) => q.supplierId === id).length;
    const ok = await askConfirm({
      title: "Təchizatçı silinsin?",
      message:
        quoteCount > 0
          ? `Bu təchizatçı və ona bağlı ${quoteCount} qiymət qeydi silinsin?`
          : "Bu təchizatçı silinsin?",
      confirmLabel: "Sil",
      cancelLabel: "Ləğv et",
      danger: true,
    });
    if (!ok) return;
    setWorkspace((w) => ({
      ...w,
      suppliers: (w.suppliers ?? []).filter((s) => s.id !== id),
      supplierQuotes: (w.supplierQuotes ?? []).filter((q) => q.supplierId !== id),
    }));
    if (supplierEditId === id) resetSupplierDraft();
    flash(setToast, "Təchizatçı silindi");
  };

  const renderSuppliersModule = () => {
    const quotes = sortedSupplierQuotes;
    const suppliers = sortedSuppliers;

    return (
      <div className="dg-form-page pg-panel" aria-label="Təchizatçılar">
        <header className="dg-form-page-head">
          <div>
            <h1 className="dg-form-page-title">Təchizatçılar</h1>
          </div>
        </header>
        <div className="dg-form-page-body">
          <div className="dg-suppliers-tabs" role="tablist" aria-label="Təchizatçılar bölmələri">
            <button
              type="button"
              role="tab"
              aria-selected={supplierPanel === "quotes"}
              className={`dg-suppliers-tab ${supplierPanel === "quotes" ? "is-active" : ""}`}
              onClick={() => setSupplierPanel("quotes")}
            >
              Qiymət qeydləri
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={supplierPanel === "directory"}
              className={`dg-suppliers-tab ${supplierPanel === "directory" ? "is-active" : ""}`}
              onClick={() => setSupplierPanel("directory")}
            >
              Təchizatçı siyahısı
            </button>
          </div>

          {supplierPanel === "quotes" ? (
            quotes.length === 0 ? (
              <div className="dg-empty-state-card" role="status">
                <div className="dg-empty-state-title">Hələ qiymət qeydi yoxdur</div>
              </div>
            ) : (
              <div className="dg-table-wrap pg-grid-host">
                <table className="dg-table dg-table--sales">
                  <thead>
                    <tr>
                      <th className="dg-th-num">№</th>
                      <th>Tarix</th>
                      <th>Təchizatçı</th>
                      <th>Sifariş / təklif</th>
                      <th>Təsvir</th>
                      <th className="dg-th-num">Qiymət</th>
                      <th className="dg-th-actions">Əməliyyatlar</th>
                    </tr>
                  </thead>
                  <tbody>
                    {quotes.map((q, i) => (
                      <tr key={q.id}>
                        <td className="dg-td-num">{i + 1}</td>
                        <td>{formatDateAzLong(q.quoteDate)}</td>
                        <td>{supplierById.get(q.supplierId)?.name || "—"}</td>
                        <td>{projectLabel(q.projectId)}</td>
                        <td>{q.description?.trim() || "—"}</td>
                        <td className="dg-td-num">{formatMoney(q.amount)}</td>
                        <td className="dg-td-actions">
                          <div className="dg-icon-row">
                            <button
                              type="button"
                              className="dg-icon-btn"
                              title="Redaktə"
                              aria-label="Redaktə"
                              onClick={() => startEditQuote(q)}
                            >
                              <IconEdit />
                            </button>
                            <button
                              type="button"
                              className="dg-icon-btn dg-icon-btn-danger"
                              title="Sil"
                              aria-label="Sil"
                              onClick={() => deleteQuote(q.id)}
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
            )
          ) : suppliers.length === 0 ? (
            <div className="dg-empty-state-card" role="status">
              <div className="dg-empty-state-title">Hələ təchizatçı yoxdur</div>
            </div>
          ) : (
            <div className="dg-table-wrap pg-grid-host">
              <table className="dg-table dg-table--sales">
                <thead>
                  <tr>
                    <th className="dg-th-num">№</th>
                    <th>Ad</th>
                    <th>Telefon</th>
                    <th>Qeyd</th>
                    <th className="dg-th-actions">Əməliyyatlar</th>
                  </tr>
                </thead>
                <tbody>
                  {suppliers.map((s, i) => (
                    <tr key={s.id}>
                      <td className="dg-td-num">{i + 1}</td>
                      <td>{s.name}</td>
                      <td>{s.phone?.trim() || "—"}</td>
                      <td>{s.note?.trim() || "—"}</td>
                      <td className="dg-td-actions">
                        <div className="dg-icon-row">
                          <button
                            type="button"
                            className="dg-icon-btn"
                            title="Redaktə"
                            aria-label="Redaktə"
                            onClick={() => startEditSupplier(s)}
                          >
                            <IconEdit />
                          </button>
                          <button
                            type="button"
                            className="dg-icon-btn dg-icon-btn-danger"
                            title="Sil"
                            aria-label="Sil"
                            onClick={() => deleteSupplier(s.id)}
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
        return "Email və ya şifrə səhvdir.";
      case "auth/network-request-failed":
        return "Şəbəkə xətası. Yenidən cəhd edin.";
      default:
        return "Daxil olmaq alınmadı.";
    }
  };

  const handleSignIn = useCallback(async () => {
    if (!auth) return;
    if (!loginEmail.trim() || !loginPassword) {
      setAuthError("Email və şifrə daxil edin.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      await signInWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      setLoginPassword("");
    } catch (e: unknown) {
      setAuthError(mapAuthError(e));
    } finally {
      setAuthBusy(false);
    }
  }, [loginEmail, loginPassword]);

  const handleSignUp = useCallback(async () => {
    if (!auth) return;
    if (!loginEmail.trim() || !loginPassword) {
      setAuthError("Email və şifrə daxil edin.");
      return;
    }
    if (loginPassword.length < 6) {
      setAuthError("Şifrə ən azı 6 simvol olmalıdır.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      await createUserWithEmailAndPassword(auth, loginEmail.trim(), loginPassword);
      setLoginPassword("");
    } catch (e: unknown) {
      setAuthError(mapAuthError(e));
    } finally {
      setAuthBusy(false);
    }
  }, [loginEmail, loginPassword]);

  const handlePasswordReset = useCallback(async () => {
    if (!auth) return;
    if (!loginEmail.trim()) {
      setAuthError("Şifrə yeniləmək üçün email daxil edin.");
      return;
    }
    setAuthBusy(true);
    setAuthError("");
    try {
      await sendPasswordResetEmail(auth, loginEmail.trim());
      flash(setToast, "Şifrə yeniləmə linki email-ə göndərildi");
    } catch (e: unknown) {
      setAuthError(mapAuthError(e));
    } finally {
      setAuthBusy(false);
    }
  }, [loginEmail]);

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
        : module === "folders" && folderView === "grid" && workspace.companies.length > 0
          ? { label: "Yeni qovluq", onClick: () => createCustomFolder() }
          : module === "notes"
            ? { label: "Yeni qeyd", onClick: openNewNoteDialog }
            : module === "suppliers" && supplierPanel === "quotes"
              ? { label: "Yeni qiymət", onClick: openNewQuoteDialog }
              : module === "suppliers" && supplierPanel === "directory"
                ? { label: "Yeni təchizatçı", onClick: openNewSupplierDialog }
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
              resolvePrompt(promptInputRef.current?.value ?? "");
            }}
          >
            <h2 className="dg-modal-title">{promptDialog.title}</h2>
            <label className="dg-field">
              <span className="dg-label">{promptDialog.label}</span>
              <input ref={promptInputRef} className="dg-input" defaultValue={promptDialog.defaultValue ?? ""} />
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

      {quoteDialogOpen ? (
        <dialog ref={quoteDialogRef} className="dg-modal dg-modal--wide" onClose={() => setQuoteDialogOpen(false)}>
          <form
            className="dg-modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              saveQuote();
            }}
          >
            <h2 className="dg-modal-title">{quoteEditId ? "Qiymət qeydini yenilə" : "Yeni qiymət qeydi"}</h2>
            <div className="dg-grid dg-grid-2">
              <label className="dg-field">
                <span className="dg-label">Təchizatçı</span>
                <select
                  className="dg-input"
                  value={quoteDraft.supplierId}
                  onChange={(e) => setQuoteDraft((d) => ({ ...d, supplierId: e.target.value }))}
                  required
                >
                  <option value="">Seçin…</option>
                  {sortedSuppliers.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dg-field">
                <span className="dg-label">Qiymət alınma tarixi</span>
                <input
                  className="dg-input"
                  type="date"
                  value={quoteDraft.quoteDate}
                  onChange={(e) => setQuoteDraft((d) => ({ ...d, quoteDate: e.target.value }))}
                  required
                />
              </label>
              <label className="dg-field" style={{ gridColumn: "1 / -1" }}>
                <span className="dg-label">Sifariş / təklif</span>
                <select
                  className="dg-input"
                  value={quoteDraft.projectId}
                  onChange={(e) => setQuoteDraft((d) => ({ ...d, projectId: e.target.value }))}
                >
                  <option value="">Seçilməyib</option>
                  {sortedProjects.map((p) => (
                    <option key={p.id} value={p.id}>
                      {projectLabel(p.id)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="dg-field">
                <span className="dg-label">Qiymət (AZN)</span>
                <input
                  className="dg-input"
                  type="number"
                  min="0"
                  step="0.01"
                  value={quoteDraft.amount}
                  onChange={(e) => setQuoteDraft((d) => ({ ...d, amount: e.target.value }))}
                  required
                />
              </label>
              <label className="dg-field">
                <span className="dg-label">Məhsul / təsvir</span>
                <input
                  className="dg-input"
                  value={quoteDraft.description}
                  onChange={(e) => setQuoteDraft((d) => ({ ...d, description: e.target.value }))}
                  placeholder="Məs: Kabel, avadanlıq…"
                />
              </label>
              <label className="dg-field" style={{ gridColumn: "1 / -1" }}>
                <span className="dg-label">Qeyd</span>
                <textarea
                  className="dg-input"
                  rows={3}
                  value={quoteDraft.note}
                  onChange={(e) => setQuoteDraft((d) => ({ ...d, note: e.target.value }))}
                />
              </label>
            </div>
            {sortedSuppliers.length === 0 ? (
              <p className="dg-modal-hint">
                Əvvəlcə «Təchizatçı siyahısı» tabında təchizatçı əlavə edin və ya topbar-dan «Yeni təchizatçı».
              </p>
            ) : null}
            <div className="dg-modal-actions">
              <button type="button" className="dg-btn dg-btn-secondary" onClick={() => setQuoteDialogOpen(false)}>
                Ləğv et
              </button>
              <button type="submit" className="dg-btn dg-btn-primary" disabled={sortedSuppliers.length === 0}>
                Yadda saxla
              </button>
            </div>
          </form>
        </dialog>
      ) : null}

      {supplierDialogOpen ? (
        <dialog ref={supplierDialogRef} className="dg-modal dg-modal--wide" onClose={() => setSupplierDialogOpen(false)}>
          <form
            className="dg-modal-body"
            onSubmit={(e) => {
              e.preventDefault();
              saveSupplier();
            }}
          >
            <h2 className="dg-modal-title">{supplierEditId ? "Təchizatçını yenilə" : "Yeni təchizatçı"}</h2>
            <div className="dg-grid dg-grid-2">
              <label className="dg-field" style={{ gridColumn: "1 / -1" }}>
                <span className="dg-label">Ad</span>
                <input
                  className="dg-input"
                  value={supplierDraft.name}
                  onChange={(e) => setSupplierDraft((d) => ({ ...d, name: e.target.value }))}
                  required
                />
              </label>
              <label className="dg-field">
                <span className="dg-label">Telefon</span>
                <input
                  className="dg-input"
                  value={supplierDraft.phone}
                  onChange={(e) => setSupplierDraft((d) => ({ ...d, phone: e.target.value }))}
                />
              </label>
              <label className="dg-field">
                <span className="dg-label">Qeyd</span>
                <input
                  className="dg-input"
                  value={supplierDraft.note}
                  onChange={(e) => setSupplierDraft((d) => ({ ...d, note: e.target.value }))}
                />
              </label>
            </div>
            <div className="dg-modal-actions">
              <button type="button" className="dg-btn dg-btn-secondary" onClick={() => setSupplierDialogOpen(false)}>
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
              if (loginMode === "signin") handleSignIn();
              else handleSignUp();
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
            <p className="rb-auth-sub">{loginMode === "signin" ? "Daxil olun" : "Yeni hesab yaradın"}</p>

            <label className="dg-field">
              <span className="dg-label">Email</span>
              <input
                className="dg-input"
                type="email"
                autoComplete="email"
                value={loginEmail}
                onChange={(e) => setLoginEmail(e.target.value)}
                placeholder="email@example.com"
                disabled={authBusy}
                required
              />
            </label>
            <label className="dg-field">
              <span className="dg-label">Şifrə</span>
              <input
                className="dg-input"
                type="password"
                autoComplete={loginMode === "signin" ? "current-password" : "new-password"}
                value={loginPassword}
                onChange={(e) => setLoginPassword(e.target.value)}
                placeholder="Ən azı 6 simvol"
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
                {authBusy ? "Gözləyin…" : loginMode === "signin" ? "Daxil ol" : "Qeydiyyat"}
              </button>
              {loginMode === "signin" ? (
                <button type="button" className="dg-btn dg-btn-secondary" onClick={handlePasswordReset} disabled={authBusy}>
                  Şifrəni unutmusan?
                </button>
              ) : null}
            </div>

            <div className="rb-auth-switch">
              {loginMode === "signin" ? (
                <button
                  type="button"
                  className="rb-auth-link"
                  onClick={() => {
                    setLoginMode("signup");
                    setAuthError("");
                  }}
                  disabled={authBusy}
                >
                  Hesabın yoxdur? Qeydiyyatdan keç
                </button>
              ) : (
                <button
                  type="button"
                  className="rb-auth-link"
                  onClick={() => {
                    setLoginMode("signin");
                    setAuthError("");
                  }}
                  disabled={authBusy}
                >
                  Artıq hesabın var? Daxil ol
                </button>
              )}
            </div>
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
                    onClick={() => {
                      cancelCompanyForm();
                      cancelProjectForm();
                      setModule(m.id);
                      setSidebarOpen(false);
                    }}
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
            <nav className="rb-menu" aria-label="Sistem ayarları">
              <button
                type="button"
                className={`rb-menu-item ${module === "settings" ? "is-active" : ""}`}
                onClick={() => {
                  cancelCompanyForm();
                  cancelProjectForm();
                  setModule("settings");
                  setSidebarOpen(false);
                }}
              >
                <span className="rb-menu-icon">
                  <SidebarNavIcon mod="settings" />
                </span>
                <span>Ayarlar</span>
              </button>
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
                </div>
              </div>
              <div className="rb-topbar-tools">
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
                  {headerPrimaryAction ? (
                    <button type="button" className="dg-btn dg-btn-primary" onClick={headerPrimaryAction.onClick}>
                      {headerPrimaryAction.label}
                    </button>
                  ) : null}
                </div>
              </div>
            </header>

            <main className="rb-content">
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
              {module === "settings" ? renderSettingsModule() : null}
            </main>
          </section>
        </div>
      </div>
      {createPortal(<div className="biz-ui biz-portal-modals">{modalLayer}</div>, document.body)}
    </>
  );
}

import type {
  CompanyProfile,
  WorkspaceFolderRecord,
  NoteRecord,
  SupplierRecord,
  SupplierQuoteRecord,
  DocWorkspace,
  DocWorkspaceV2,
  GeneratorState,
  ProductRow,
  ProjectRecord,
  SavedCompanyRecord,
  SavedProjectV2,
} from "../types";
import { emptyCompany, emptyMeta } from "./defaults";

const WS_KEY_V3 = "docgen_workspace_v3";
const WS_KEY_V3_BACKUP = "docgen_workspace_v3_backup";
const WS_KEY_V2 = "docgen_workspace_v2";
const LEGACY_KEY = "docgen_state_v1";

export function normalizeCompany(c: CompanyProfile): CompanyProfile {
  return { ...emptyCompany(), ...c };
}

export function normalizeGeneratorState(p: GeneratorState): GeneratorState {
  return {
    seller: normalizeCompany(p.seller),
    buyer: normalizeCompany(p.buyer),
    meta: { ...emptyMeta(), ...p.meta },
    rows: (p.rows ?? []).map((r) => ({
      id: r.id || crypto.randomUUID(),
      name: r.name ?? "",
      unit: r.unit ?? "ədəd",
      qty: Number(r.qty) || 0,
      unitPrice: Number(r.unitPrice) || 0,
    })),
    vatPercent: Number(p.vatPercent) || 0,
  };
}

export function normalizeProductRows(rows: ProductRow[]): ProductRow[] {
  return (rows ?? []).map((r) => ({
    id: r.id || crypto.randomUUID(),
    name: r.name ?? "",
    unit: r.unit ?? "ədəd",
    qty: Number(r.qty) || 0,
    unitPrice: Number(r.unitPrice) || 0,
  }));
}

export function normalizeWorkspace(w: DocWorkspace): DocWorkspace {
  const companies = (w.companies ?? [])
    .filter((c) => c && typeof c.id === "string")
    .map((c) => ({
      id: c.id,
      profile: normalizeCompany(c.profile ?? emptyCompany()),
      createdAt: typeof c.createdAt === "number" ? c.createdAt : Date.now(),
      updatedAt: typeof c.updatedAt === "number" ? c.updatedAt : Date.now(),
    }));

  const companyIds = new Set(companies.map((c) => c.id));

  let projects = (w.projects ?? [])
    .filter((p) => p && typeof p.id === "string")
    .map((p) => ({
      id: p.id,
      title: typeof p.title === "string" && p.title.trim() ? p.title.trim() : "Adsız təklif",
      companyId: typeof p.companyId === "string" && companyIds.has(p.companyId) ? p.companyId : "",
      rows: normalizeProductRows(p.rows ?? []),
      meta: { ...emptyMeta(), ...p.meta },
      vatPercent: Number(p.vatPercent) || 0,
      createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
      updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
    }));

  projects = projects.filter((p) => p.companyId);

  const suppliersRaw = Array.isArray(w.suppliers) ? w.suppliers : [];
  const suppliers: SupplierRecord[] = suppliersRaw
    .filter((s) => s && typeof (s as { id?: unknown }).id === "string")
    .map((s) => ({
      id: String((s as { id: string }).id),
      name: typeof (s as { name?: unknown }).name === "string" ? String((s as { name: string }).name).trim() : "",
      phone: typeof (s as { phone?: unknown }).phone === "string" ? String((s as { phone: string }).phone) : undefined,
      note: typeof (s as { note?: unknown }).note === "string" ? String((s as { note: string }).note) : undefined,
      createdAt: typeof (s as { createdAt?: unknown }).createdAt === "number" ? Number((s as { createdAt: number }).createdAt) : Date.now(),
      updatedAt: typeof (s as { updatedAt?: unknown }).updatedAt === "number" ? Number((s as { updatedAt: number }).updatedAt) : Date.now(),
    }))
    .filter((s) => s.name.length > 0);

  const supplierIds = new Set(suppliers.map((s) => s.id));

  const foldersRaw = Array.isArray(w.folders) ? w.folders : [];
  const folders: WorkspaceFolderRecord[] = foldersRaw
    .filter((f) => f && typeof f.id === "string")
    .map((f) => {
      // legacy (companyId məcburi idi) -> company folder
      const legacyCompanyId = typeof (f as { companyId?: unknown }).companyId === "string" ? String((f as { companyId: string }).companyId) : "";
      const kindRaw = typeof (f as { kind?: unknown }).kind === "string" ? String((f as { kind: string }).kind) : "";
      const kind: WorkspaceFolderRecord["kind"] =
        kindRaw === "custom" ? "custom" : kindRaw === "supplier" ? "supplier" : "company";

      const companyId =
        kind === "company"
          ? (typeof (f as { companyId?: unknown }).companyId === "string" ? String((f as { companyId: string }).companyId) : legacyCompanyId)
          : undefined;

      const supplierId =
        kind === "supplier" && typeof (f as { supplierId?: unknown }).supplierId === "string"
          ? String((f as { supplierId: string }).supplierId)
          : undefined;

      let safeKind: WorkspaceFolderRecord["kind"] = "custom";
      if (kind === "company" && companyId && companyIds.has(companyId)) safeKind = "company";
      else if (kind === "supplier" && supplierId && supplierIds.has(supplierId)) safeKind = "supplier";
      else if (kind === "custom") safeKind = "custom";

      const safeCompanyId = safeKind === "company" ? companyId : undefined;
      const safeSupplierId = safeKind === "supplier" ? supplierId : undefined;

      return {
        id: String((f as { id: string }).id),
        kind: safeKind,
        companyId: safeCompanyId,
        supplierId: safeSupplierId,
        name: typeof (f as { name?: unknown }).name === "string" ? String((f as { name: string }).name) : "",
        createdAt: typeof (f as { createdAt?: unknown }).createdAt === "number" ? Number((f as { createdAt: number }).createdAt) : Date.now(),
        updatedAt: typeof (f as { updatedAt?: unknown }).updatedAt === "number" ? Number((f as { updatedAt: number }).updatedAt) : Date.now(),
        files: Array.isArray((f as { files?: unknown }).files)
          ? (f as { files: unknown[] }).files
              .filter((x) => {
                if (!x || typeof (x as { id?: unknown }).id !== "string") return false;
                const hasDataUrl = typeof (x as { dataUrl?: unknown }).dataUrl === "string";
                const hasUrl = typeof (x as { url?: unknown }).url === "string";
                const hasPath = typeof (x as { storagePath?: unknown }).storagePath === "string";
                return hasDataUrl || hasUrl || hasPath;
              })
              .map((x) => {
                const dataUrl = typeof (x as { dataUrl?: unknown }).dataUrl === "string" ? String((x as { dataUrl: string }).dataUrl) : undefined;
                const url = typeof (x as { url?: unknown }).url === "string" ? String((x as { url: string }).url) : undefined;
                const storagePath = typeof (x as { storagePath?: unknown }).storagePath === "string" ? String((x as { storagePath: string }).storagePath) : undefined;
                return {
                  id: String((x as { id: string }).id),
                  name: typeof (x as { name?: unknown }).name === "string" ? String((x as { name: string }).name) : "fayl",
                  mime: typeof (x as { mime?: unknown }).mime === "string" ? String((x as { mime: string }).mime) : "application/octet-stream",
                  size: typeof (x as { size?: unknown }).size === "number" ? Number((x as { size: number }).size) : 0,
                  createdAt: typeof (x as { createdAt?: unknown }).createdAt === "number" ? Number((x as { createdAt: number }).createdAt) : Date.now(),
                  ...(dataUrl ? { dataUrl } : {}),
                  ...(url ? { url } : {}),
                  ...(storagePath ? { storagePath } : {}),
                };
              })
          : [],
      };
    })
    .filter((f) => {
      if (f.kind === "company") return Boolean(f.companyId && companyIds.has(f.companyId));
      if (f.kind === "supplier") return Boolean(f.supplierId && supplierIds.has(f.supplierId));
      return true;
    });

  const notesRaw = Array.isArray(w.notes) ? w.notes : [];
  const notes: NoteRecord[] = notesRaw
    .filter((n) => n && typeof n.id === "string")
    .map((n) => ({
      id: String((n as { id: string }).id),
      title: typeof (n as { title?: unknown }).title === "string" ? String((n as { title: string }).title) : "",
      body: typeof (n as { body?: unknown }).body === "string" ? String((n as { body: string }).body) : "",
      createdAt: typeof (n as { createdAt?: unknown }).createdAt === "number" ? Number((n as { createdAt: number }).createdAt) : Date.now(),
      updatedAt: typeof (n as { updatedAt?: unknown }).updatedAt === "number" ? Number((n as { updatedAt: number }).updatedAt) : Date.now(),
      remindAt: typeof (n as { remindAt?: unknown }).remindAt === "string" ? String((n as { remindAt: string }).remindAt) : undefined,
      remindedAt: typeof (n as { remindedAt?: unknown }).remindedAt === "number" ? Number((n as { remindedAt: number }).remindedAt) : undefined,
      done: Boolean((n as { done?: unknown }).done),
    }));

  const projectIds = new Set(projects.map((p) => p.id));

  const quotesRaw = Array.isArray(w.supplierQuotes) ? w.supplierQuotes : [];
  const supplierQuotes: SupplierQuoteRecord[] = quotesRaw
    .filter((q) => q && typeof (q as { id?: unknown }).id === "string")
    .map((q) => {
      const supplierId = typeof (q as { supplierId?: unknown }).supplierId === "string" ? String((q as { supplierId: string }).supplierId) : "";
      const projectIdRaw = typeof (q as { projectId?: unknown }).projectId === "string" ? String((q as { projectId: string }).projectId) : "";
      const projectId = projectIdRaw && projectIds.has(projectIdRaw) ? projectIdRaw : undefined;
      const quoteDateRaw = typeof (q as { quoteDate?: unknown }).quoteDate === "string" ? String((q as { quoteDate: string }).quoteDate) : "";
      const quoteDate = /^\d{4}-\d{2}-\d{2}$/.test(quoteDateRaw) ? quoteDateRaw : new Date().toISOString().slice(0, 10);
      return {
        id: String((q as { id: string }).id),
        supplierId: supplierIds.has(supplierId) ? supplierId : "",
        projectId,
        quoteDate,
        amount: Number((q as { amount?: unknown }).amount) || 0,
        description: typeof (q as { description?: unknown }).description === "string" ? String((q as { description: string }).description) : undefined,
        note: typeof (q as { note?: unknown }).note === "string" ? String((q as { note: string }).note) : undefined,
        createdAt: typeof (q as { createdAt?: unknown }).createdAt === "number" ? Number((q as { createdAt: number }).createdAt) : Date.now(),
        updatedAt: typeof (q as { updatedAt?: unknown }).updatedAt === "number" ? Number((q as { updatedAt: number }).updatedAt) : Date.now(),
      };
    })
    .filter((q) => q.supplierId);

  return {
    version: 3,
    settings: {
      seller: normalizeCompany(w.settings?.seller ?? emptyCompany()),
      docSeq: {
        invoice: Number(w.settings?.docSeq?.invoice) > 0 ? Number(w.settings?.docSeq?.invoice) : 1,
        delivery: Number(w.settings?.docSeq?.delivery) > 0 ? Number(w.settings?.docSeq?.delivery) : 1,
        protocol: Number(w.settings?.docSeq?.protocol) > 0 ? Number(w.settings?.docSeq?.protocol) : 1,
      },
    },
    companies,
    projects,
    folders,
    notes,
    suppliers,
    supplierQuotes,
  };
}

function companyDedupeKey(profile: CompanyProfile): string {
  const n = profile.name.trim().toLowerCase();
  const v = profile.voen.trim();
  return `${v}|${n}`;
}

function migrateV2ToV3(v2: DocWorkspaceV2): DocWorkspace {
  const projectsRaw = Array.isArray(v2.projects) ? v2.projects : [];
  const normalizedProjects: SavedProjectV2[] = projectsRaw
    .filter((p) => p && typeof p.id === "string")
    .map((p) => ({
      ...p,
      name: typeof p.name === "string" && p.name.trim() ? p.name.trim() : "Təklif",
      createdAt: typeof p.createdAt === "number" ? p.createdAt : Date.now(),
      updatedAt: typeof p.updatedAt === "number" ? p.updatedAt : Date.now(),
      state: normalizeGeneratorState(p.state as GeneratorState),
    }));

  if (normalizedProjects.length === 0) {
    return normalizeWorkspace({
      version: 3,
      settings: { seller: emptyCompany() },
      companies: [],
      projects: [],
    });
  }

  const active = normalizedProjects.find((p) => p.id === v2.activeProjectId) ?? normalizedProjects[0];
  const seller = normalizeCompany(active?.state.seller ?? emptyCompany());

  const keyToCompanyId = new Map<string, string>();
  const companies: SavedCompanyRecord[] = [];

  for (const sp of normalizedProjects) {
    const buyer = normalizeCompany(sp.state.buyer);
    const key = companyDedupeKey(buyer);
    if (!keyToCompanyId.has(key)) {
      const id = crypto.randomUUID();
      keyToCompanyId.set(key, id);
      companies.push({
        id,
        profile: buyer,
        createdAt: sp.createdAt,
        updatedAt: sp.updatedAt,
      });
    }
  }

  const projects: ProjectRecord[] = normalizedProjects.map((sp) => {
    const buyer = normalizeCompany(sp.state.buyer);
    const cid = keyToCompanyId.get(companyDedupeKey(buyer))!;
    return {
      id: sp.id,
      title: sp.name,
      companyId: cid,
      rows: normalizeProductRows(sp.state.rows),
      meta: { ...emptyMeta(), ...sp.state.meta },
      vatPercent: Number(sp.state.vatPercent) || 0,
      createdAt: sp.createdAt,
      updatedAt: sp.updatedAt,
    };
  });

  const ws: DocWorkspace = {
    version: 3,
    settings: { seller },
    companies,
    projects,
  };
  return normalizeWorkspace(ws);
}

export function loadWorkspaceLocal(): DocWorkspace {
  try {
    const rawV3 = localStorage.getItem(WS_KEY_V3);
    if (rawV3) {
      const w = JSON.parse(rawV3) as Partial<DocWorkspace>;
      if (w?.version === 3) {
        return normalizeWorkspace(w as DocWorkspace);
      }
    }

    const rawV2 = localStorage.getItem(WS_KEY_V2);
    if (rawV2) {
      const v2 = JSON.parse(rawV2) as DocWorkspaceV2;
      if (v2?.version === 2 && Array.isArray(v2.projects)) {
        const migrated = migrateV2ToV3(v2);
        saveWorkspace(migrated);
        localStorage.removeItem(WS_KEY_V2);
        return migrated;
      }
    }

    const legacy = localStorage.getItem(LEGACY_KEY);
    if (legacy) {
      const parsed = JSON.parse(legacy) as GeneratorState;
      const state =
        parsed?.seller && parsed?.buyer && Array.isArray(parsed.rows)
          ? normalizeGeneratorState(parsed)
          : normalizeGeneratorState({
              seller: emptyCompany(),
              buyer: emptyCompany(),
              rows: [],
              meta: emptyMeta(),
              vatPercent: 0,
            });

      const companyId = crypto.randomUUID();
      const companies: SavedCompanyRecord[] =
        state.buyer.name.trim() || state.buyer.voen.trim()
          ? [
              {
                id: companyId,
                profile: normalizeCompany(state.buyer),
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            ]
          : [];

      const projects: ProjectRecord[] =
        companies.length > 0
          ? [
              {
                id: crypto.randomUUID(),
                title: "Təklif 1",
                companyId,
                rows: normalizeProductRows(state.rows),
                meta: { ...emptyMeta(), ...state.meta },
                vatPercent: state.vatPercent,
                createdAt: Date.now(),
                updatedAt: Date.now(),
              },
            ]
          : [];

      const ws = normalizeWorkspace({
        version: 3,
        settings: { seller: normalizeCompany(state.seller) },
        companies,
        projects,
      });
      saveWorkspace(ws);
      localStorage.removeItem(LEGACY_KEY);
      return ws;
    }
  } catch {
    /* ignore */
  }

  const fresh = normalizeWorkspace({
    version: 3,
    settings: { seller: emptyCompany() },
    companies: [],
    projects: [],
  });
  saveWorkspace(fresh);
  return fresh;
}

export function saveWorkspaceLocal(w: DocWorkspace): void {
  localStorage.setItem(WS_KEY_V3, JSON.stringify(w));
}

function readRawLocal(key: string): DocWorkspace | null {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const w = JSON.parse(raw) as Partial<DocWorkspace>;
    if (w?.version === 3) return normalizeWorkspace(w as DocWorkspace);
  } catch {
    /* ignore */
  }
  return null;
}

/** Lokal məlumat varmı (şirkət, təklif, qeyd və s.) */
export function workspaceHasUserData(w: DocWorkspace): boolean {
  const ws = normalizeWorkspace(w);
  const hasSeller =
    Boolean(ws.settings.seller.name?.trim()) ||
    Boolean(ws.settings.seller.voen?.trim()) ||
    Boolean(ws.settings.seller.accountManat?.trim());
  const hasFolders = (ws.folders ?? []).some((f) => (f.files?.length ?? 0) > 0);
  return (
    ws.companies.length > 0 ||
    ws.projects.length > 0 ||
    (ws.notes?.length ?? 0) > 0 ||
    (ws.suppliers?.length ?? 0) > 0 ||
    (ws.supplierQuotes?.length ?? 0) > 0 ||
    hasFolders ||
    hasSeller
  );
}

function workspaceLatestTouch(w: DocWorkspace): number {
  const ws = normalizeWorkspace(w);
  let t = 0;
  const bump = (n: unknown) => {
    if (typeof n === "number" && Number.isFinite(n)) t = Math.max(t, n);
  };
  for (const c of ws.companies) bump(c.updatedAt);
  for (const p of ws.projects) bump(p.updatedAt);
  for (const n of ws.notes ?? []) bump(n.updatedAt);
  for (const s of ws.suppliers ?? []) bump(s.updatedAt);
  for (const q of ws.supplierQuotes ?? []) bump(q.updatedAt);
  for (const f of ws.folders ?? []) bump(f.updatedAt);
  return t;
}

/** Lokal və remote arasında daha dolu / daha yeni olanı seç */
export function pickPreferredWorkspace(
  local: DocWorkspace | null,
  remote: DocWorkspace | null,
): DocWorkspace {
  const l = local ? normalizeWorkspace(local) : null;
  const r = remote ? normalizeWorkspace(remote) : null;
  const lHas = l ? workspaceHasUserData(l) : false;
  const rHas = r ? workspaceHasUserData(r) : false;
  if (lHas && !rHas) return l!;
  if (rHas && !lHas) return r!;
  if (lHas && rHas) return workspaceLatestTouch(l!) >= workspaceLatestTouch(r!) ? l! : r!;
  if (l) return l;
  if (r) return r;
  return normalizeWorkspace({
    version: 3,
    settings: { seller: emptyCompany() },
    companies: [],
    projects: [],
  });
}

export function loadLocalWorkspaceBackup(): DocWorkspace | null {
  return readRawLocal(WS_KEY_V3_BACKUP);
}

export function hasLocalWorkspaceBackup(): boolean {
  try {
    return Boolean(localStorage.getItem(WS_KEY_V3_BACKUP));
  } catch {
    return false;
  }
}

export function backupLocalWorkspace(): void {
  try {
    const raw = localStorage.getItem(WS_KEY_V3);
    if (raw) localStorage.setItem(WS_KEY_V3_BACKUP, raw);
  } catch {
    /* ignore */
  }
}

/** Köhnə adlar — geriyə uyğunluq üçün ekvivalent funksiyalar */
export const loadWorkspace = loadWorkspaceLocal;
export const saveWorkspace = saveWorkspaceLocal;

/** Lokal nüsxəni silməzdən əvvəl backup saxla */
export function clearLocalWorkspace(): void {
  try {
    backupLocalWorkspace();
    localStorage.removeItem(WS_KEY_V3);
  } catch {
    /* ignore */
  }
}

export function hasLocalWorkspace(): boolean {
  try {
    return Boolean(localStorage.getItem(WS_KEY_V3));
  } catch {
    return false;
  }
}

export function workspaceToGeneratorState(ws: DocWorkspace, proj: ProjectRecord): GeneratorState {
  const buyer =
    ws.companies.find((c) => c.id === proj.companyId)?.profile ?? emptyCompany();
  return normalizeGeneratorState({
    seller: ws.settings.seller,
    buyer,
    rows: proj.rows,
    meta: proj.meta,
    vatPercent: proj.vatPercent,
  });
}

export function sortProjectsByDate(projects: ProjectRecord[]): ProjectRecord[] {
  return [...projects].sort((a, b) => {
    const da = a.meta.invoiceDate || "";
    const db = b.meta.invoiceDate || "";
    if (da !== db) return db.localeCompare(da);
    return b.updatedAt - a.updatedAt;
  });
}

export function projectsUsingCompany(ws: DocWorkspace, companyId: string): number {
  return ws.projects.filter((p) => p.companyId === companyId).length;
}

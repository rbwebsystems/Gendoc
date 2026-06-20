/** Şirkət / bank rekvizitləri (alıcı və satıcı üçün eyni struktur) */
export interface CompanyProfile {
  /** Valyuta, məs: AZN */
  currency: string;
  /** Benefisiarın bankı */
  bankName: string;
  /** Filialın kodu */
  branchCode: string;
  /** Bankın VÖEN-i (şablonda ümumi «VÖEN» sətri) */
  bankVoen: string;
  bankSwift: string;
  /** Müxbir hesab */
  correspondentAccount: string;
  /** Benefisiarın adı */
  name: string;
  /** Benefisiarın hesabı */
  accountManat: string;
  /** Benefisiarın VÖEN-i */
  voen: string;
  address: string;
  phone: string;
  fax: string;
  email: string;
  director: string;
}

/** Mal / iş sətiri */
export interface ProductRow {
  id: string;
  name: string;
  unit: string;
  qty: number;
  unitPrice: number;
}

/** Sənəd üzrə ümumi parametrlər */
export interface DocumentMeta {
  invoiceNumber: string;
  invoiceDate: string;
  deliveryActNumber: string;
  protocolNumber: string;
  contractNumber: string;
  contractDate: string;
  deliveryPlace: string;
  deliveryBasis: string;
}

/** Sənəd paketi (satıcı + alıcı + sətirlər) — çap funksiyalarına ötürülür */
export interface GeneratorState {
  seller: CompanyProfile;
  buyer: CompanyProfile;
  rows: ProductRow[];
  meta: DocumentMeta;
  vatPercent: number;
}

/** Şirkətlər bölməsində saxlanılan alıcı / tərəf kartı */
export interface SavedCompanyRecord {
  id: string;
  profile: CompanyProfile;
  createdAt: number;
  updatedAt: number;
}

/** Təkliflər bölməsində saxlanılan sənəd dəsti */
export interface ProjectRecord {
  id: string;
  /** Təklifin qısa adı */
  title: string;
  /** Şirkətlər siyahısından FK */
  companyId: string;
  rows: ProductRow[];
  meta: DocumentMeta;
  vatPercent: number;
  createdAt: number;
  updatedAt: number;
}

export interface FolderFileRecord {
  id: string;
  name: string;
  mime: string;
  size: number;
  createdAt: number;
  /** Legacy: base64 data URL (PDF/JPG/PNG) — saxlanılır geriyə uyğunluq üçün */
  dataUrl?: string;
  /** Firebase Storage path (məs: users/{uid}/folders/{folderId}/{fileId}-{name}) */
  storagePath?: string;
  /** Public download URL (Firebase Storage) */
  url?: string;
}

export type WorkspaceFolderKind = "company" | "supplier" | "custom";

/** Qovluq (şirkət, təchizatçı və ya manual qovluq) */
export interface WorkspaceFolderRecord {
  id: string;
  kind: WorkspaceFolderKind;
  /** kind==="company" üçün */
  companyId?: string;
  /** kind==="supplier" üçün */
  supplierId?: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  files: FolderFileRecord[];
}

export interface NoteRecord {
  id: string;
  title: string;
  body: string;
  createdAt: number;
  updatedAt: number;
  /** ISO datetime-local string (e.g. "2026-05-08T12:30") */
  remindAt?: string;
  /** one-shot reminder marker */
  remindedAt?: number;
  done?: boolean;
}

/** Təchizatçı kartı */
export interface SupplierRecord {
  id: string;
  name: string;
  phone?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

/** Təchizatçı təklifində məhsul sətri */
export interface SupplierOfferRow {
  id: string;
  /** Təchizatçı adı (hər sətir üçün ayrıca) */
  supplierName: string;
  name: string;
  /** Alış qiyməti (ƏDV-siz) */
  purchasePrice: number;
  qty: number;
  /** Satış faizi — alışa əlavə */
  marginPercent?: number;
  /** Satış qiyməti (ƏDV-siz) */
  salePrice: number;
}

/** Təchizatçı təklifi */
export interface SupplierOfferRecord {
  id: string;
  /** Təklif olunan şirkət */
  companyId: string;
  /** Təklif tarixi (YYYY-MM-DD) */
  offerDate: string;
  rows: SupplierOfferRow[];
  note?: string;
  createdAt: number;
  updatedAt: number;
}

/** @deprecated köhnə format — migrate olunur */
export interface SupplierQuoteRecord {
  id: string;
  supplierId: string;
  projectId?: string;
  quoteDate: string;
  amount: number;
  description?: string;
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export interface DocWorkspace {
  version: 3;
  /** Ayarlarda: daimi satıcı */
  settings: {
    seller: CompanyProfile;
    docSeq?: {
      invoice: number;
      delivery: number;
      protocol: number;
    };
  };
  companies: SavedCompanyRecord[];
  projects: ProjectRecord[];
  folders?: WorkspaceFolderRecord[];
  notes?: NoteRecord[];
  suppliers?: SupplierRecord[];
  supplierOffers?: SupplierOfferRecord[];
  /** @deprecated migrate → supplierOffers */
  supplierQuotes?: SupplierQuoteRecord[];
}

/** Köçürmə üçün köhnə format */
export interface DocWorkspaceV2 {
  version: 2;
  activeProjectId: string;
  projects: SavedProjectV2[];
}

export interface SavedProjectV2 {
  id: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  state: GeneratorState;
}

export type DocKind = "invoice" | "delivery" | "deliveryNoPrice" | "protocol";

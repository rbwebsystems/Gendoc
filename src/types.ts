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
  /** Qiymət təklifi sənədi nömrəsi */
  quoteNumber?: string;
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
  /** Rəsmi köçürmə və ya nağd qeyri-rəsmi */
  billingMode?: "official" | "cash";
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
  /** Əsas məhsul yoxdursa əvəz verilən məhsul */
  replacementName?: string;
  /** Alış qiyməti (ƏDV-siz) */
  purchasePrice: number;
  /** Alış qiyməti (ƏDV daxil) — doldurulubsa nağd təklifdə birbaşa istifadə olunur */
  purchasePriceWithVat?: number;
  /** Hansı alış sahəsi əsas götürülüb (satış daxil etmə üçün) */
  purchasePriceSource?: "ex" | "inc";
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

export type OrderStatus = "draft" | "pending" | "done" | "cancelled";

/** Mağaza və müştəri sifarişlərində məhsul sətri — digər modullarla əlaqəsiz */
export interface OrderLineRow {
  id: string;
  name: string;
  qty: number;
  purchasePrice: number;
  supplierName: string;
}

/** Mağaza daxili sifariş — şirkət/təklif/təchizatçı modulları ilə əlaqəli deyil */
export interface StoreOrderRecord {
  id: string;
  orderDate: string;
  status: OrderStatus;
  rows: OrderLineRow[];
  note?: string;
  createdAt: number;
  updatedAt: number;
}

/** Müştəri sifarişi — şirkətlər siyahısından asılı deyil */
export interface CustomerOrderRecord {
  id: string;
  customerName: string;
  customerPhone?: string;
  orderDate: string;
  status: OrderStatus;
  rows: OrderLineRow[];
  note?: string;
  createdAt: number;
  updatedAt: number;
}

export type LeaveRequestStatus = "pending" | "approved" | "rejected";

export type AppUserRole = "employee" | "director" | "admin";

/** Sistem icazələri modulunda təyin olunan modul girişləri */
export type PermissionModuleId =
  | "companies"
  | "projects"
  | "folders"
  | "notes"
  | "suppliers"
  | "storeOrders"
  | "customerOrders"
  | "priceCalculations"
  | "cashReport"
  | "workLeave";

/** Kassa hesabatı — hesab sətri */
export interface CashReportRow {
  id: string;
  name: string;
  /** 5 sütun: [0] cəmlənmiş balans, [1–4] gözləyən daxiletmələr */
  slots: [number, number, number, number, number];
  createdAt: number;
  updatedAt: number;
}

/** Kassa hesabatı tarixçə anlık görüntüsü */
export interface CashReportSnapshot {
  id: string;
  label: string;
  savedAt: number;
  balance: number;
  rows: CashReportRow[];
}

export interface CashReportState {
  rows: CashReportRow[];
  history: CashReportSnapshot[];
}

/** Sistem istifadəçisi və modul icazələri */
export type SessionKind = "developer" | "member" | "local";

export interface SystemUserRecord {
  id: string;
  /** Giriş istifadəçi adı */
  username: string;
  name: string;
  /** @deprecated köhnə — app user üçün authEmail istifadə olunur */
  email?: string;
  /** Firebase Auth email (saxta domen) */
  authEmail?: string;
  role: AppUserRole;
  modules: PermissionModuleId[];
  mustChangePassword?: boolean;
  disabled?: boolean;
  createdAt: number;
  updatedAt: number;
}

/** İşçinin iş icazəsi sorğusu */
export interface LeaveRequestRecord {
  id: string;
  employeeId: string;
  employeeName: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  reason: string;
  status: LeaveRequestStatus;
  /** İmtina səbəbi — işçi görür */
  rejectReason?: string;
  reviewedAt?: number;
  reviewedByName?: string;
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
      quote?: number;
    };
    /** Direktor/admin: son baxılan iş icazəsi bildirişi vaxtı (uid → timestamp) */
    leaveReviewSeenAt?: Record<string, number>;
  };
  companies: SavedCompanyRecord[];
  projects: ProjectRecord[];
  folders?: WorkspaceFolderRecord[];
  notes?: NoteRecord[];
  suppliers?: SupplierRecord[];
  supplierOffers?: SupplierOfferRecord[];
  /** @deprecated migrate → supplierOffers */
  supplierQuotes?: SupplierQuoteRecord[];
  storeOrders?: StoreOrderRecord[];
  customerOrders?: CustomerOrderRecord[];
  cashReport?: CashReportState;
  systemUsers?: SystemUserRecord[];
  leaveRequests?: LeaveRequestRecord[];
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

export type DocKind = "invoice" | "delivery" | "deliveryNoPrice" | "protocol" | "priceQuote";

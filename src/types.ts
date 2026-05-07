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
  /** Base64 data URL (PDF/JPG/PNG) */
  dataUrl: string;
}

export type WorkspaceFolderKind = "company" | "custom";

/** Qovluq (şirkət qovluğu və ya manual qovluq) */
export interface WorkspaceFolderRecord {
  id: string;
  kind: WorkspaceFolderKind;
  /** kind==="company" üçün */
  companyId?: string;
  name: string;
  createdAt: number;
  updatedAt: number;
  files: FolderFileRecord[];
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

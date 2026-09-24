import type {
  CompanyProfile,
  DocWorkspace,
  SavedCompanyRecord,
  SupplierOfferRecord,
  SupplierOfferRow,
  SupplierRecord,
  WorkspaceFolderRecord,
} from "../types";
import { BAKFON_EQUIPMENT } from "./bakfonEquipment";

export const TELCON_BAKFON_IMPORT_KEY = "telcon-tlc-2209-26-equipment-v2";
export const TELCON_BAKFON_OFFER_ID = "offer-telcon-tlc-2209-26";

const SUPPLIER_ID = "supplier-telcon-mmc";
const SUPPLIER_FOLDER_ID = "folder-supplier-telcon-mmc";
const BAKFON_COMPANY_ID = "company-bakfon-telcon-import";
const IMPORTED_AT = Date.parse("2026-09-24T09:53:42+04:00");

type TelconPrice = { price: number; offeredProduct: string };

const TELCON_PRICES = new Map<string, TelconPrice>([
  ["Access card", { price: 0.58, offeredProduct: "Hikvision M1 Cards / DS-K7M101-M1" }],
  ["Access Reader (card/PIN)", { price: 58.41, offeredProduct: "Hikvision Value Card Terminal / DS-K1T809MX" }],
  ["Face Recognition Access Control Terminal", { price: 181.96, offeredProduct: "Hikvision DS-K1A340X" }],
  ["Face Recognition Access Controller Bracket (for Turniket)", { price: 69.31, offeredProduct: "Hikvision DS-KAB6-ZU1" }],
  ["AGM Battery 12V 7AH", { price: 25.11, offeredProduct: "SAIL SOLAR ENERGY" }],
  ["Door Closer", { price: 46.72, offeredProduct: "Hikvision Automatic Door Closer / DS-K4DC105" }],
  ["Door Contact", { price: 4.77, offeredProduct: "Hikvision Wired Magnetic Contact / DS-PD1-MC-WS" }],
  ["Mexaniki çıxış düyməsi Exit & Emergency Buton", { price: 11.81, offeredProduct: "Hikvision Exit & Emergency Button / DS-K7P02" }],
  ["Pro Series Access Controller", { price: 245.76, offeredProduct: "Hikvision Pro Series Access Contoller / DS-K2624X(P)" }],
  ["Single Door Magnetic Lock > 280KG", { price: 32.56, offeredProduct: "Hikvision Value Magnetic Locks / DS-K4H255S" }],
  ["Single Door Magnetic Lock Bracket", { price: 16.28, offeredProduct: "Hikvision Bracket for DS-K4H255S / DS-K4H255-LZ" }],
  ["Turniket Midlle Flap Barrier", { price: 1940, offeredProduct: "Hikvision DS-K3B211LX-M/Pg" }],
  ["4 MP Motorized Varifocal 2.8 ~ 12 mm Bullet Network Camera for Perimeter Protection", { price: 332.87, offeredProduct: "DS-2CD2643G2-IZS(2.8-12mm)" }],
  ["Junction box for Bullet Camera", { price: 1.6, offeredProduct: "Kamera montaj qutusu böyük" }],
  ["Monitor 27”", { price: 209.69, offeredProduct: "Hikvision 27 inch FHD 100Hz IPS Monitor / DS-D5027F3-2P2" }],
  ["UPS 10KV OnLine; Rack Mount", { price: 1740, offeredProduct: "Shturmann WINNER PRO+RACK 10KR ONLINE UPS 10KVA 9000W" }],
  ["UPS 2KV OnLine; Rack Mount", { price: 625, offeredProduct: "Pulsar PSOR-2000-04-09-02" }],
  ["UPS 3KV OnLine; Rack Mount", { price: 750, offeredProduct: "Pulsar PSOR-3000-06-07-02" }],
  ["Access Control-Chanel-License", { price: 60, offeredProduct: "Hikvision HikCentral-P-ACS-1Door" }],
  ["Video-Chanel-License", { price: 60, offeredProduct: "Hikvision HikCentral-P-VSS-1Ch" }],
  // 12 qutu × 100 ədəd = 1200 ədəd; qiymət əsas siyahının vahidinə çevrilib.
  ["RJ45 + Rezin CAT6", { price: 0.178, offeredProduct: "Hikvision PFM976-631 (100 pcs)" }],
  ["RJ45 Patch Cord 1 metrik", { price: 2.54, offeredProduct: "Hikvision DS-1NP6UEC0 grey 1m" }],
  ["RJ45 Patch panel 24 portlu", { price: 23.05, offeredProduct: "Pulsar PPP24-1UC6AU" }],
  ["Smart PoE+ Manage Switch 24-Port", { price: 279.05, offeredProduct: "Hikvision DS-3E1326P-EI (B)(370 W)" }],
  ["RJ45 Patch Cord 3 metrik", { price: 6.89, offeredProduct: "Hikvision DS-1NP6UEC0 grey 5m" }],
  // 2 cüt = 4 ədəd; 64,42 / 2 = 32,21 AZN/ədəd.
  ["SFP Single Mode 1KM (A+B)", { price: 32.21, offeredProduct: "Benchu GSFP-1.25G-1310-3KM-LC / GSFP-1.25G-1550-3KM-LC" }],
  ["Smart PoE+ Manage Switch 16-Port (16 Port Ethernet; 2 Ports SFP)", { price: 224.89, offeredProduct: "Hikvision DS-3E1318P-EI/M(130 W)" }],
  ["Smart PoE+ Manage Switch 16-Port (16 Port Ethernet; 4 Ports SFP)", { price: 575.85, offeredProduct: "Hikvision DS-3E1528P-SI-24P4F" }],
  ["Cable management 1U", { price: 8.79, offeredProduct: "Pulsar PCO-1MH12-HB" }],
  ["Decoder,4 Channel Ultra HD Network Video Decoder", { price: 1677.02, offeredProduct: "Hikvision DS-6904UDI(C)" }],
  ["Decoder,9 Channel Ultra HD Network Video Decoder", { price: 3390.12, offeredProduct: "Hikvision DS-6910UDI(C)" }],
]);

function importedOfferRows(): SupplierOfferRow[] {
  return BAKFON_EQUIPMENT.map((item) => {
    const quoted = TELCON_PRICES.get(item.name);
    return {
      id: `${TELCON_BAKFON_IMPORT_KEY}-row-${item.sequence}`,
      supplierName: "TELCON MMC",
      name: item.name,
      ...(quoted ? { replacementName: quoted.offeredProduct } : {}),
      purchasePrice: quoted?.price ?? 0,
      purchasePriceSource: "ex",
      qty: item.qty,
      unit: item.unit,
      salePrice: 0,
    };
  });
}

function importedBakfonCompanyProfile(): CompanyProfile {
  return {
    currency: "AZN", bankName: "", branchCode: "", bankVoen: "", bankSwift: "",
    correspondentAccount: "", name: "Bakfon", accountManat: "", voen: "", address: "",
    phone: "", fax: "", email: "", director: "",
  };
}

function importedOffer(companyId: string, existing?: SupplierOfferRecord): SupplierOfferRecord {
  return {
    id: TELCON_BAKFON_OFFER_ID,
    companyId,
    offerDate: "2026-09-24",
    rows: importedOfferRows(),
    note: "Avadanliq_siyahisi_novlere_gore.xlsx faylının «Siyahı» sheet-indəki 110 sətir daxil edilib. TELCON TLC-2209/26 təklifində dəqiq uyğun gələn 31 sətirə qiymət və təklif olunan model əlavə olunub. Turniket Left/Right Flap Barrier və Turniket üçün şüşə qapı avtomatik uyğunlaşdırılmayıb. Çatdırılma: 45-65 iş günü, DDP Bakı. Ödəniş: 100% əvvəlcədən. Zəmanət: 1 il. Təklif 10 gün qüvvədədir.",
    createdAt: existing?.createdAt ?? IMPORTED_AT,
    updatedAt: IMPORTED_AT,
  };
}

/** Imports the complete equipment list and upgrades the earlier 33-row offer once. */
export function applyBundledSupplierOfferImports(workspace: DocWorkspace): DocWorkspace {
  if (workspace.settings.dataImports?.[TELCON_BAKFON_IMPORT_KEY]) return workspace;

  const existingOffer = (workspace.supplierOffers ?? []).find(
    (offer) => offer.id === TELCON_BAKFON_OFFER_ID || offer.note?.includes("TLC-2209/26"),
  );
  const existingCompany =
    (existingOffer ? workspace.companies.find((item) => item.id === existingOffer.companyId) : undefined) ??
    workspace.companies.find((item) => item.profile.name.trim().toLocaleLowerCase("az-AZ").includes("bakfon"));
  const company: SavedCompanyRecord = existingCompany ?? {
    id: BAKFON_COMPANY_ID,
    profile: importedBakfonCompanyProfile(),
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
  };
  const companies = existingCompany ? workspace.companies : [...workspace.companies, company];

  const existingSupplier = (workspace.suppliers ?? []).find(
    (supplier) => supplier.name.trim().toLocaleLowerCase("az-AZ") === "telcon mmc",
  );
  const supplier: SupplierRecord = existingSupplier ?? {
    id: SUPPLIER_ID,
    name: "TELCON MMC",
    phone: "+99455 559 59 30",
    note: "H. Əliyev pr. 106B; mubariz@telcon.az; www.telcon.az",
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
  };
  const suppliers = existingSupplier ? workspace.suppliers ?? [] : [...(workspace.suppliers ?? []), supplier];

  const hasSupplierFolder = (workspace.folders ?? []).some(
    (folder) => folder.kind === "supplier" && folder.supplierId === supplier.id,
  );
  const supplierFolder: WorkspaceFolderRecord = {
    id: SUPPLIER_FOLDER_ID,
    kind: "supplier",
    supplierId: supplier.id,
    name: "TELCON MMC",
    createdAt: IMPORTED_AT,
    updatedAt: IMPORTED_AT,
    files: [],
  };
  const nextOffer = importedOffer(company.id, existingOffer);
  const supplierOffers = existingOffer
    ? (workspace.supplierOffers ?? []).map((offer) => offer.id === existingOffer.id ? nextOffer : offer)
    : [...(workspace.supplierOffers ?? []), nextOffer];

  return {
    ...workspace,
    settings: {
      ...workspace.settings,
      dataImports: { ...(workspace.settings.dataImports ?? {}), [TELCON_BAKFON_IMPORT_KEY]: true },
    },
    companies,
    suppliers,
    folders: hasSupplierFolder ? workspace.folders ?? [] : [...(workspace.folders ?? []), supplierFolder],
    supplierOffers,
  };
}

export function telconBakfonImportedPurchaseTotal(): number {
  return importedOfferRows().reduce((sum, row) => sum + row.purchasePrice * row.qty, 0);
}

export function telconBakfonPricedRowCount(): number {
  return importedOfferRows().filter((row) => row.purchasePrice > 0).length;
}

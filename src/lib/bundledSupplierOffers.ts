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

export const TELCON_BAKFON_IMPORT_KEY = "telcon-tlc-2209-26-equipment-v5-abv";
export const TELCON_BAKFON_OFFER_ID = "offer-telcon-tlc-2209-26";

const SUPPLIER_ID = "supplier-telcon-mmc";
const SUPPLIER_FOLDER_ID = "folder-supplier-telcon-mmc";
const ABV_SUPPLIER_ID = "supplier-abv";
const ABV_SUPPLIER_FOLDER_ID = "folder-supplier-abv";
const BAKFON_COMPANY_ID = "company-bakfon-telcon-import";
const IMPORTED_AT = Date.parse("2026-09-24T09:53:42+04:00");
const ABV_IMPORTED_AT = Date.parse("2026-10-02T15:26:00+04:00");
const USD_TO_AZN = 1.7;
const VAT_FACTOR = 1.18;

type TelconPrice = { price: number; offeredProduct: string };
type AbvPrice = { usdWithVat: number; offeredProduct: string };

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

// ABV.xlsx: qiymətlər ABŞ dolları ilə və ƏDV daxil təqdim olunub.
// Eyni adlı təkrarlanan məhsulları düzgün saxlamaq üçün uyğunluq sıra nömrəsi ilə qurulub.
const ABV_PRICES = new Map<number, AbvPrice>([
  [1, { usdWithVat: 1.26, offeredProduct: "IC S50" }],
  [2, { usdWithVat: 34.94, offeredProduct: "DS-K1108AM" }],
  [3, { usdWithVat: 1019.93, offeredProduct: "DS-K1T673TDWX-PROE1" }],
  [16, { usdWithVat: 889.32, offeredProduct: "DS-2DF6A425IWG1-EL" }],
  [17, { usdWithVat: 286.83, offeredProduct: "DS-2CD3643G2-LIZSU" }],
  [18, { usdWithVat: 155.31, offeredProduct: "DS-2CD3147G3E-LIUF" }],
  [19, { usdWithVat: 695.76, offeredProduct: "iDS-2CD7546G2-XZHS" }],
  [24, { usdWithVat: 133.25, offeredProduct: "POE,LAS60-57CN-RJ45,60W" }],
  [29, { usdWithVat: 66.93, offeredProduct: "DS-1660ZJ" }],
  [30, { usdWithVat: 82.8, offeredProduct: "DS-1660ZJ-P" }],
  [31, { usdWithVat: 205.94, offeredProduct: "DS-PRB2221" }],
  [33, { usdWithVat: 22.5, offeredProduct: "DS-1276ZJ" }],
  [34, { usdWithVat: 1221.36, offeredProduct: "DS-1600KI" }],
  [35, { usdWithVat: 2064.83, offeredProduct: "DS-UPSB09240A-R/TJ" }],
  [36, { usdWithVat: 589.95, offeredProduct: "DS-UPSB0948B-R/TJC" }],
  [37, { usdWithVat: 765.9, offeredProduct: "DS-UPSB0972B-R/TJC" }],
  [38, { usdWithVat: 29.01, offeredProduct: "DS-1275ZJ-S-SUS" }],
  [39, { usdWithVat: 96.11, offeredProduct: "DS-1604ZJ-BOX-POLE" }],
  [40, { usdWithVat: 3400.11, offeredProduct: "DS-TDSB0G-FK/120m" }],
  [41, { usdWithVat: 9976.28, offeredProduct: "DS-TDSB0G-FK/500m" }],
  [45, { usdWithVat: 5181.98, offeredProduct: "DS-2TD4137-25/WY" }],
  [46, { usdWithVat: 133.25, offeredProduct: "POE,LAS60-57CN-RJ45,60W" }],
  [91, { usdWithVat: 3703.44, offeredProduct: "DS-D2055HR-G" }],
  [92, { usdWithVat: 234.03, offeredProduct: "DP-D2X55XXX-1X1-Q1-SW-Q0.8-TY" }],
  [99, { usdWithVat: 2611.5, offeredProduct: "DS-6916UDI" }],
  [100, { usdWithVat: 234.03, offeredProduct: "DP-D2X55XXX-1X1-Q1-SW-Q0.8-TY" }],
  [104, { usdWithVat: 2611.5, offeredProduct: "DS-6916UDI" }],
]);

function abvExVatPrice(usdWithVat: number): number {
  return Math.round((usdWithVat * USD_TO_AZN / VAT_FACTOR) * 100) / 100;
}

function importedOfferRows(): SupplierOfferRow[] {
  const equipmentRows: SupplierOfferRow[] = BAKFON_EQUIPMENT.map((item) => {
    const telcon = TELCON_PRICES.get(item.name);
    const abv = ABV_PRICES.get(item.sequence);
    const abvPrice = abv ? abvExVatPrice(abv.usdWithVat) : 0;
    const useAbv = Boolean(abv && abvPrice > 0 && (!telcon || abvPrice < telcon.price));
    const quoted = useAbv ? abv : telcon;
    return {
      id: `${TELCON_BAKFON_IMPORT_KEY}-row-${item.sequence}`,
      supplierName: useAbv ? "ABV" : "TELCON MMC",
      name: item.name,
      ...(quoted ? { replacementName: quoted.offeredProduct } : {}),
      purchasePrice: useAbv ? abvPrice : telcon?.price ?? 0,
      purchasePriceSource: "ex",
      qty: item.qty,
      unit: item.unit,
      salePrice: 0,
    };
  });

  const turnstileLeftRightRow: SupplierOfferRow = {
    id: `${TELCON_BAKFON_IMPORT_KEY}-extra-turniket-left-right`,
    supplierName: "TELCON MMC",
    name: "Turniket Left/Right Flap Barrier",
    replacementName: "Hikvision DS-K3B211LX-LR/Pg",
    purchasePrice: 2600,
    purchasePriceSource: "ex",
    qty: 2,
    unit: "ədəd",
    salePrice: 0,
  };
  const turnstileGlassRow: SupplierOfferRow = {
    id: `${TELCON_BAKFON_IMPORT_KEY}-extra-turniket-glass`,
    supplierName: "TELCON MMC",
    name: "Turniket üçün şüşə qapı",
    replacementName: "Hikvision Acrylic door wings for swing barrier / DS-KSD24-P650-2pcs",
    purchasePrice: 98.08,
    purchasePriceSource: "ex",
    qty: 4,
    unit: "ədəd",
    salePrice: 0,
  };

  return [...equipmentRows, turnstileLeftRightRow, turnstileGlassRow];
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
    note: "Avadanliq_siyahisi_novlere_gore.xlsx faylının «Siyahı» sheet-indəki 110 sətir daxil edilib. TELCON TLC-2209/26 qiymətləri ABV.xlsx ilə müqayisə olunub: eyni məhsulda aşağı və ya bərabər TELCON qiyməti saxlanılıb, ABV daha ucuz olduqda və ya TELCON qiyməti olmadıqda ABV seçilib. ABV qiymətləri 1 USD = 1,7000 AZN məzənnəsi ilə manata çevrilib və ƏDV daxil məbləğ 1,18-ə bölünərək ƏDV-siz vahid qiymət yazılıb. ABV-dən 19 sətir seçilib: 1-i daha ucuz qiymət, 18-i TELCON-da qiymətsiz mövqedir. Turniket Left/Right, Middle və şüşə qapı TELCON təklifindəki ayrıca sətirlər kimi saxlanılıb. TELCON şərtləri: çatdırılma 45-65 iş günü, DDP Bakı; ödəniş 100% əvvəlcədən; zəmanət 1 il; təklif 10 gün qüvvədədir.",
    createdAt: existing?.createdAt ?? IMPORTED_AT,
    updatedAt: ABV_IMPORTED_AT,
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

  const existingAbvSupplier = suppliers.find(
    (item) => item.name.trim().toLocaleLowerCase("az-AZ") === "abv",
  );
  const abvSupplier: SupplierRecord = existingAbvSupplier ?? {
    id: ABV_SUPPLIER_ID,
    name: "ABV",
    note: "ABV.xlsx qiymət təklifi; USD, ƏDV daxil. GenDoc-da AZN, ƏDV-siz qiymətə çevrilib.",
    createdAt: ABV_IMPORTED_AT,
    updatedAt: ABV_IMPORTED_AT,
  };
  const suppliersWithAbv = existingAbvSupplier ? suppliers : [...suppliers, abvSupplier];

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
  const hasAbvSupplierFolder = (workspace.folders ?? []).some(
    (folder) => folder.kind === "supplier" && folder.supplierId === abvSupplier.id,
  );
  const abvSupplierFolder: WorkspaceFolderRecord = {
    id: ABV_SUPPLIER_FOLDER_ID,
    kind: "supplier",
    supplierId: abvSupplier.id,
    name: "ABV",
    createdAt: ABV_IMPORTED_AT,
    updatedAt: ABV_IMPORTED_AT,
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
    suppliers: suppliersWithAbv,
    folders: [
      ...(workspace.folders ?? []),
      ...(hasSupplierFolder ? [] : [supplierFolder]),
      ...(hasAbvSupplierFolder ? [] : [abvSupplierFolder]),
    ],
    supplierOffers,
  };
}

export function telconBakfonImportedPurchaseTotal(): number {
  return importedOfferRows().reduce((sum, row) => sum + row.purchasePrice * row.qty, 0);
}

export function telconBakfonPricedRowCount(): number {
  return importedOfferRows().filter((row) => row.purchasePrice > 0).length;
}

export function abvBakfonSelectedRowCount(): number {
  return importedOfferRows().filter((row) => row.supplierName === "ABV").length;
}

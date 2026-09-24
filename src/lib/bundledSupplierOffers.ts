import type {
  CompanyProfile,
  DocWorkspace,
  SavedCompanyRecord,
  SupplierOfferRow,
  SupplierRecord,
  WorkspaceFolderRecord,
} from "../types";

export const TELCON_BAKFON_IMPORT_KEY = "telcon-tlc-2209-26";
export const TELCON_BAKFON_OFFER_ID = "offer-telcon-tlc-2209-26";

const SUPPLIER_ID = "supplier-telcon-mmc";
const SUPPLIER_FOLDER_ID = "folder-supplier-telcon-mmc";
const BAKFON_COMPANY_ID = "company-bakfon-telcon-import";
const IMPORTED_AT = Date.parse("2026-09-24T09:53:42+04:00");

type ImportedRow = {
  description: string;
  brand?: string;
  model?: string;
  unit?: "qutu" | "cüt";
  qty: number;
  price: number;
};

const IMPORTED_ROWS: ImportedRow[] = [
  { description: "Access card", brand: "Hikvision", model: "M1 Cards / DS-K7M101-M1", qty: 2900, price: 0.58 },
  { description: "Access Reader (card/PIN)", brand: "Hikvision", model: "Value Card Terminal / DS-K1T809MX", qty: 361, price: 58.41 },
  { description: "Face Recognition Access Control Terminal", brand: "Hikvision", model: "DS-K1A340X", qty: 12, price: 181.96 },
  { description: "Face Recognition Access Controller Bracket (for Turniket)", brand: "Hikvision", model: "DS-KAB6-ZU1", qty: 8, price: 69.31 },
  { description: "AGM Battery 12V 7AH", brand: "SAIL SOLAR ENERGY", qty: 111, price: 25.11 },
  { description: "Door Closer", brand: "Hikvision", model: "Automatic Door Closer / DS-K4DC105", qty: 355, price: 46.72 },
  { description: "Door Contact", brand: "Hikvision", model: "Wired Magnetic Contact / DS-PD1-MC-WS", qty: 355, price: 4.77 },
  { description: "Mexaniki çıxış düyməsi Exit & Emergency Buton", brand: "Hikvision", model: "Exit & Emergency Button / DS-K7P02", qty: 373, price: 11.81 },
  { description: "Pro Series Access Controller", brand: "Hikvision", model: "Pro Series Access Contoller / DS-K2624X(P)", qty: 111, price: 245.76 },
  { description: "Single Door Magnetic Lock > 280KG", brand: "Hikvision", model: "Value Magnetic Locks / DS-K4H255S", qty: 355, price: 32.56 },
  { description: "Single Door Magnetic Lock Bracket", brand: "Hikvision", model: "Bracket for DS-K4H255S / DS-K4H255-LZ", qty: 57, price: 16.28 },
  { description: "Turniket Left/Right Flap Barrier", brand: "Hikvision", model: "DS-K3B211LX-LR/Pg", qty: 2, price: 2600 },
  { description: "Turniket Midlle Flap Barrier", brand: "Hikvision", model: "DS-K3B211LX-M/Pg", qty: 2, price: 1940 },
  { description: "Turniket üçün şüşə qapı", brand: "Hikvision", model: "Acrylic door wings for swing barrier / DS-KSD24-P650-2pcs", qty: 4, price: 98.08 },
  { description: "4 MP Motorized Varifocal 2.8 ~ 12 mm Bullet Network Camera for Perimeter Protection", model: "DS-2CD2643G2-IZS(2.8-12mm)", qty: 465, price: 332.87 },
  { description: "Junction box for Bullet Camera", brand: "N/A", model: "Kamera montaj qutusu böyük", qty: 465, price: 1.6 },
  { description: "Monitor 27”", brand: "Hikvision", model: "27 inch FHD 100Hz IPS Monitor / DS-D5027F3-2P2", qty: 42, price: 209.69 },
  { description: "UPS 10KV OnLine; Rack Mount", brand: "Shturmann", model: "SHTURMANN WINNER PRO+RACK 10KR ONLINE UPS 10KVA 9000W 3U + 3U BATTERY PACK WITHOUT 12V7AH 16PCS BATTERY, USB PORT, LCD", qty: 4, price: 1740 },
  { description: "UPS 2KV OnLine; Rack Mount", brand: "Pulsar", model: "Pulsar Server Online UPS Rack 2000VA model: PSOR-2000-04-09-02", qty: 21, price: 625 },
  { description: "UPS 3KV OnLine; Rack Mount", brand: "Pulsar", model: "Pulsar Server Online UPS Rack 3000VA model: PSOR-3000-06-07-02", qty: 55, price: 750 },
  { description: "Access Control-Chanel-License", brand: "Hikvision", model: "HikCentral-P-ACS-1Door", qty: 419, price: 60 },
  { description: "Video-Chanel-License", brand: "Hikvision", model: "HikCentral-P-VSS-1Ch", qty: 967, price: 60 },
  { description: "RJ45 + Rezin CAT6", brand: "Hikvision", model: "PFM976-631 (100 pcs)", unit: "qutu", qty: 12, price: 17.8 },
  { description: "RJ45 Patch Cord 1 metrik", brand: "Hikvision", model: "Patch cord CAT6, U/UTP, 24AWG, CU / DS-1NP6UEC0 grey 1m", qty: 1007, price: 2.54 },
  { description: "RJ45 Patch panel 24 portlu", brand: "Pulsar", model: "Pulsar Cat6 Patch Panel model: PPP24-1UC6AU", qty: 77, price: 23.05 },
  { description: "Smart PoE+ Manage Switch 24-Port", brand: "Hikvision", model: "24 Port Fast Ethernet Smart POE Switch / DS-3E1326P-EI (B)(370 W)", qty: 22, price: 279.05 },
  { description: "RJ45 Patch Cord 3 metrik", brand: "Hikvision", model: "U/UTP Cat6 PVC 24AWG Patch cord / DS-1NP6UEC0 grey 5m", qty: 50, price: 6.89 },
  { description: "SFP Single Mode 1KM (A+B)", brand: "Benchu", model: "GSFP-1.25G-1310-3KM-LC / GSFP-1.25G-1550-3KM-LC", unit: "cüt", qty: 2, price: 64.42 },
  { description: "Smart PoE+ Manage Switch 16-Port (16 Port Ethernet; 2 Ports SFP)", brand: "Hikvision", model: "16 Port Fast Ethernet Smart POE Switch / DS-3E1318P-EI/M(130 W)", qty: 38, price: 224.89 },
  { description: "Smart PoE+ Manage Switch 16-Port (16 Port Ethernet; 4 Ports SFP)", brand: "Hikvision", model: "DS-3E1528P-SI-24P4F", qty: 1, price: 575.85 },
  { description: "Cable management 1U", brand: "Pulsar", model: "Pulsar Cable Organizer 12 hole metal model: PCO-1MH12-HB", qty: 170, price: 8.79 },
  { description: "Decoder,4 Channel Ultra HD Network Video Decoder", brand: "Hikvision", model: "DS-6904UDI(C)", qty: 1, price: 1677.02 },
  { description: "Decoder,9 Channel Ultra HD Network Video Decoder", brand: "Hikvision", model: "DS-6910UDI(C)", qty: 1, price: 3390.12 },
];

function importedProductName(row: ImportedRow): string {
  return [row.description, row.brand, row.model, row.unit ? `ölçü vahidi: ${row.unit}` : ""]
    .filter(Boolean)
    .join(" - ");
}

function importedOfferRows(): SupplierOfferRow[] {
  return IMPORTED_ROWS.map((row, index) => ({
    id: `${TELCON_BAKFON_IMPORT_KEY}-row-${index + 1}`,
    supplierName: "TELCON MMC",
    name: importedProductName(row),
    purchasePrice: row.price,
    purchasePriceSource: "ex",
    qty: row.qty,
    salePrice: 0,
  }));
}

function importedBakfonCompanyProfile(): CompanyProfile {
  return {
    currency: "AZN",
    bankName: "",
    branchCode: "",
    bankVoen: "",
    bankSwift: "",
    correspondentAccount: "",
    name: "Bakfon",
    accountManat: "",
    voen: "",
    address: "",
    phone: "",
    fax: "",
    email: "",
    director: "",
  };
}

/** Adds the bundled PDF offer once and creates its Bakfon company card if needed. */
export function applyBundledSupplierOfferImports(workspace: DocWorkspace): DocWorkspace {
  if (workspace.settings.dataImports?.[TELCON_BAKFON_IMPORT_KEY]) return workspace;

  const existingOffer = (workspace.supplierOffers ?? []).some(
    (offer) => offer.id === TELCON_BAKFON_OFFER_ID || offer.note?.includes("TLC-2209/26"),
  );
  if (existingOffer) {
    return {
      ...workspace,
      settings: {
        ...workspace.settings,
        dataImports: { ...(workspace.settings.dataImports ?? {}), [TELCON_BAKFON_IMPORT_KEY]: true },
      },
    };
  }

  const existingCompany = workspace.companies.find((item) =>
    item.profile.name.trim().toLocaleLowerCase("az-AZ").includes("bakfon"),
  );
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

  return {
    ...workspace,
    settings: {
      ...workspace.settings,
      dataImports: { ...(workspace.settings.dataImports ?? {}), [TELCON_BAKFON_IMPORT_KEY]: true },
    },
    companies,
    suppliers,
    folders: hasSupplierFolder ? workspace.folders ?? [] : [...(workspace.folders ?? []), supplierFolder],
    supplierOffers: [
      ...(workspace.supplierOffers ?? []),
      {
        id: TELCON_BAKFON_OFFER_ID,
        companyId: company.id,
        offerDate: "2026-09-24",
        rows: importedOfferRows(),
        note: "Kommersiya təklifi № TLC-2209/26. Çatdırılma: 45-65 iş günü, DDP Bakı. Ödəniş: 100% əvvəlcədən. Zəmanət: 1 il. Təklif 10 gün qüvvədədir. Mənbə: ST_Bakfon_24.09.26_V1_43.pdf.",
        createdAt: IMPORTED_AT,
        updatedAt: IMPORTED_AT,
      },
    ],
  };
}

export function telconBakfonImportedPurchaseTotal(): number {
  return importedOfferRows().reduce((sum, row) => sum + row.purchasePrice * row.qty, 0);
}

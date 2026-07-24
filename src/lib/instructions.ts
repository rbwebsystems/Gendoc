import type {
  InstructionCashSaleRow,
  InstructionCorporateSaleRow,
  InstructionCreditSaleRow,
  InstructionPosFeeRow,
  InstructionRowStatus,
  InstructionsState,
} from "../types";

function nowRow() {
  return Date.now();
}

function normalizeStatus(raw: unknown): InstructionRowStatus {
  return raw === "inactive" ? "inactive" : "active";
}

function baseRow<T extends { id: string; createdAt: number; updatedAt: number; status: InstructionRowStatus }>(
  raw: unknown,
  fields: Omit<T, "id" | "createdAt" | "updatedAt" | "status">,
): T | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const id = typeof r.id === "string" ? r.id : "";
  if (!id) return null;
  const createdAt = typeof r.createdAt === "number" ? r.createdAt : nowRow();
  const updatedAt = typeof r.updatedAt === "number" ? r.updatedAt : createdAt;
  return {
    id,
    ...fields,
    status: normalizeStatus(r.status),
    createdAt,
    updatedAt,
  } as T;
}

function str(raw: unknown, fallback = ""): string {
  return typeof raw === "string" ? raw : fallback;
}

export const POS_TERMINAL_ORDER = ["ABB Terminal", "Kapital Terminal"] as const;

export type PosTerminalName = (typeof POS_TERMINAL_ORDER)[number];

export function normalizePosTerminal(terminal: string): string {
  const value = terminal.trim().toLowerCase();
  if (value === "abb" || value === "abb terminal") return "ABB Terminal";
  if (value === "kapital" || value === "kapİtal" || value === "kapital terminal") return "Kapital Terminal";
  return terminal.trim() || "ABB Terminal";
}

function migratePosPaymentType(terminal: string, operationType: string): string {
  const op = operationType.trim();
  if (!op) return op;
  const isAbb = normalizePosTerminal(terminal) === "ABB Terminal";
  const mapAbb: Record<string, string> = {
    ABB: "ABB kartı ilə ödəniş",
    "D.b.k": "Digər yerli bank kartı ilə ödəniş",
    "X.b.k": "Xarici ölkə kartı ilə ödəniş",
  };
  const mapKapital: Record<string, string> = {
    Kapital: "Kapital kartı ilə ödəniş",
    "D.b.k": "Digər yerli bank kartı ilə ödəniş",
    "X.b.k": "Xarici ölkə kartı ilə ödəniş",
  };
  if (isAbb && mapAbb[op]) return mapAbb[op];
  if (!isAbb && mapKapital[op]) return mapKapital[op];
  return op;
}

export function newInstructionCashSaleRow(partial?: Partial<InstructionCashSaleRow>): InstructionCashSaleRow {
  const now = nowRow();
  return {
    id: crypto.randomUUID(),
    category: "",
    condition: "",
    priceRule: "",
    rate: "",
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function newInstructionCreditSaleRow(partial?: Partial<InstructionCreditSaleRow>): InstructionCreditSaleRow {
  const now = nowRow();
  return {
    id: crypto.randomUUID(),
    productGroup: "",
    term: "",
    creditRate: "",
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function newInstructionCorporateSaleRow(
  partial?: Partial<InstructionCorporateSaleRow>,
): InstructionCorporateSaleRow {
  const now = nowRow();
  return {
    id: crypto.randomUUID(),
    customerType: "",
    priceRule: "",
    rate: "",
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function newInstructionPosFeeRow(partial?: Partial<InstructionPosFeeRow>): InstructionPosFeeRow {
  const now = nowRow();
  return {
    id: crypto.randomUUID(),
    terminal: "",
    operationType: "",
    commissionRate: "",
    note: "",
    status: "active",
    createdAt: now,
    updatedAt: now,
    ...partial,
  };
}

export function defaultInstructionsState(): InstructionsState {
  return {
    cashSales: [
      newInstructionCashSaleRow({
        category: "Mobil telefonlar",
        condition: "Nağd və taksit",
        priceRule: "Bazar alış qiyməti + 17%",
        rate: "17%",
      }),
      newInstructionCashSaleRow({
        category: "Mobil telefonlar",
        condition: "İkinci əl Telefonlar",
        priceRule: "Bazar alış + 20%",
        rate: "20%",
      }),
      newInstructionCashSaleRow({
        category: "Məişət texnikası, Aksessuar, Ofis avadanlığı",
        condition: "15 AZN-ə qədər",
        priceRule: "Maya+150%",
        rate: "150%",
      }),
      newInstructionCashSaleRow({
        category: "Məişət texnikası, Aksessuar, Ofis avadanlığı",
        condition: "60 Azn-ə qədər",
        priceRule: "Maya+70%",
        rate: "70%",
      }),
      newInstructionCashSaleRow({
        category: "Məişət texnikası, Aksessuar, Ofis avadanlığı",
        condition: "60-90 Azn arası",
        priceRule: "Maya +50%",
        rate: "50%",
      }),
      newInstructionCashSaleRow({
        category: "Məişət texnikası, Aksessuar, Ofis avadanlığı",
        condition: "90 azn üzəri",
        priceRule: "Maya +30%",
        rate: "30%",
      }),
    ],
    creditSales: [
      newInstructionCreditSaleRow({
        productGroup: "Mobil telefonlar 12 aya qədər",
        term: "1-6 ay",
        creditRate: "0%",
      }),
      newInstructionCreditSaleRow({
        productGroup: "Məişət texnikası, Aksessuar, Ofis avadanlığı 18 aya qədər",
        term: "6-12 ay",
        creditRate: "10%",
      }),
      newInstructionCreditSaleRow({
        productGroup: "Korporativ Satışlar",
        term: "12-18 ay",
        creditRate: "15%",
      }),
    ],
    corporateSales: [
      newInstructionCorporateSaleRow({
        customerType: "Korporativ",
        priceRule: "Maya+10%",
        rate: "10%",
      }),
      newInstructionCorporateSaleRow({
        customerType: "XKİ",
        priceRule: "Maya",
        rate: "35%",
      }),
      newInstructionCorporateSaleRow({
        customerType: "ATİAHİRK",
        priceRule: "Maya",
        rate: "30%",
      }),
    ],
    posFees: [
      newInstructionPosFeeRow({
        terminal: "ABB Terminal",
        operationType: "ABB kartı ilə ödəniş",
        commissionRate: "1%",
      }),
      newInstructionPosFeeRow({
        terminal: "ABB Terminal",
        operationType: "Digər yerli bank kartı ilə ödəniş",
        commissionRate: "1.5%",
      }),
      newInstructionPosFeeRow({
        terminal: "ABB Terminal",
        operationType: "Xarici ölkə kartı ilə ödəniş",
        commissionRate: "2.5%",
      }),
      newInstructionPosFeeRow({
        terminal: "ABB Terminal",
        operationType: "ABB kart + Keşbek istifadə olunarsa",
        commissionRate: "5%",
      }),
      newInstructionPosFeeRow({
        terminal: "Kapital Terminal",
        operationType: "Kapital kartı ilə ödəniş",
        commissionRate: "1.5%",
      }),
      newInstructionPosFeeRow({
        terminal: "Kapital Terminal",
        operationType: "Digər yerli bank kartı ilə ödəniş",
        commissionRate: "2%",
      }),
      newInstructionPosFeeRow({
        terminal: "Kapital Terminal",
        operationType: "Xarici ölkə kartı ilə ödəniş",
        commissionRate: "3%",
      }),
      newInstructionPosFeeRow({
        terminal: "Kapital Terminal",
        operationType: "Kapital kart + Keşbek istifadə olunarsa",
        commissionRate: "5%",
      }),
      newInstructionPosFeeRow({
        terminal: "Kapital Terminal",
        operationType: "Umico istifadə olunarsa",
        commissionRate: "əlavə 2%",
      }),
    ],
  };
}

export function normalizeInstructionsState(raw: unknown | undefined): InstructionsState {
  if (raw === undefined) return defaultInstructionsState();
  if (!raw || typeof raw !== "object") {
    return { cashSales: [], creditSales: [], corporateSales: [], posFees: [] };
  }

  const w = raw as Record<string, unknown>;
  const cashSales = (Array.isArray(w.cashSales) ? w.cashSales : [])
    .map((row) =>
      baseRow<InstructionCashSaleRow>(row, {
        category: str((row as { category?: unknown }).category),
        condition: str((row as { condition?: unknown }).condition),
        priceRule: str((row as { priceRule?: unknown }).priceRule),
        rate: str((row as { rate?: unknown }).rate),
      }),
    )
    .filter((row): row is InstructionCashSaleRow => row != null);

  const creditSales = (Array.isArray(w.creditSales) ? w.creditSales : [])
    .map((row) =>
      baseRow<InstructionCreditSaleRow>(row, {
        productGroup: str((row as { productGroup?: unknown }).productGroup),
        term: str((row as { term?: unknown }).term),
        creditRate: str((row as { creditRate?: unknown }).creditRate),
      }),
    )
    .filter((row): row is InstructionCreditSaleRow => row != null);

  const corporateSales = (Array.isArray(w.corporateSales) ? w.corporateSales : [])
    .map((row) =>
      baseRow<InstructionCorporateSaleRow>(row, {
        customerType: str((row as { customerType?: unknown }).customerType),
        priceRule: str((row as { priceRule?: unknown }).priceRule),
        rate: str((row as { rate?: unknown }).rate),
      }),
    )
    .filter((row): row is InstructionCorporateSaleRow => row != null);

  const posFees = (Array.isArray(w.posFees) ? w.posFees : [])
    .map((row) => {
      const terminalRaw = str((row as { terminal?: unknown }).terminal);
      const operationRaw = str((row as { operationType?: unknown }).operationType);
      const terminal = normalizePosTerminal(terminalRaw);
      const operationType = migratePosPaymentType(terminal, operationRaw);
      return baseRow<InstructionPosFeeRow>(row, {
        terminal,
        operationType,
        commissionRate: str((row as { commissionRate?: unknown }).commissionRate),
        note: str((row as { note?: unknown }).note),
      });
    })
    .filter((row): row is InstructionPosFeeRow => row != null);

  return { cashSales, creditSales, corporateSales, posFees };
}

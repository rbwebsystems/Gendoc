import type { InstructionCreditRateRow } from "../types";

export type PriceCalcProductType = "mobileNew" | "mobileUsed" | "homeOffice";

export const PRICE_CALC_PRODUCT_OPTIONS: { value: PriceCalcProductType; label: string }[] = [
  { value: "mobileNew", label: "Mobil telefon — yeni" },
  { value: "mobileUsed", label: "Mobil telefon — 2-ci əl" },
  { value: "homeOffice", label: "Məişət və ofis avadanlığı" },
];

/** Defolt kredit müddətləri / faizləri (Təlimat → Kredit faizləri ilə eyni) */
export const DEFAULT_PRICE_CALC_CREDIT_RATES: Omit<
  InstructionCreditRateRow,
  "id" | "createdAt" | "updatedAt" | "status"
>[] = [
  { label: "0–6 ay", months: 6, percent: 0 },
  { label: "9 ay", months: 9, percent: 5 },
  { label: "12 ay", months: 12, percent: 10 },
  { label: "15 ay", months: 15, percent: 12.5 },
  { label: "18 ay", months: 18, percent: 15 },
  { label: "24 ay", months: 24, percent: 20 },
];

export type PriceCalcCreditPeriod = {
  id: string;
  label: string;
  months: number;
  percent: number;
};

export type PriceCalcCreditLine = PriceCalcCreditPeriod & {
  total: number;
  monthly: number;
};

export type PriceCalculationResult = {
  cashPrice: number;
  creditLines: PriceCalcCreditLine[];
};

function toCents(amountAzn: number): number {
  return Math.round(amountAzn * 100);
}

function fromCents(cents: number): number {
  return cents / 100;
}

function applyPercent(cents: number, percent: number): number {
  return Math.round(cents * (1 + percent / 100));
}

/** Qiyməti həmişə yuxarıya, 9 ilə bitən ən yaxın məbləğə yuvarlaqlaşdırır (məs. 101 → 109). */
export function roundPriceToNineEnding(amountAzn: number): number {
  if (!Number.isFinite(amountAzn) || amountAzn <= 0) return 0;
  const n = Math.ceil(amountAzn - 1e-9);
  const rem = n % 10;
  if (rem === 9) return n;
  return rem === 0 ? n + 9 : n + (9 - rem);
}

export function monthlyCreditPayment(totalPrice: number, months: number): number {
  if (!Number.isFinite(totalPrice) || totalPrice <= 0 || !Number.isFinite(months) || months <= 0) return 0;
  return fromCents(Math.round(toCents(totalPrice) / months));
}

/** Aktiv kredit faizlərini qiymət hesablaması üçün hazırlayır; boşdursa defolt. */
export function resolvePriceCalcCreditPeriods(
  rates: InstructionCreditRateRow[] | undefined,
): PriceCalcCreditPeriod[] {
  const active = (rates ?? [])
    .filter((row) => row.status !== "inactive" && Number.isFinite(row.months) && row.months > 0)
    .map((row) => ({
      id: row.id,
      label: row.label.trim() || `${row.months} ay`,
      months: Math.round(row.months),
      percent: Number.isFinite(row.percent) ? row.percent : 0,
    }))
    .sort((a, b) => a.months - b.months || a.label.localeCompare(b.label, "az"));

  if (active.length > 0) return active;

  return DEFAULT_PRICE_CALC_CREDIT_RATES.map((row, index) => ({
    id: `default-${row.months}-${index}`,
    label: row.label,
    months: row.months,
    percent: row.percent,
  }));
}

/** 9 ay və yuxarı kredit qiymətləri yuvarlaqlaşmır; ondan aşağı (məs. 0–6) yuvarlaqlaşır. */
function creditLinesFromCash(cashPrice: number, periods: PriceCalcCreditPeriod[]): PriceCalcCreditLine[] {
  return periods.map((period) => {
    const priceBaseCents = applyPercent(toCents(cashPrice), period.percent);
    const raw = fromCents(priceBaseCents);
    const total = period.months < 9 ? roundPriceToNineEnding(raw) : raw;
    return {
      ...period,
      total,
      monthly: monthlyCreditPayment(total, period.months),
    };
  });
}

function resolveCashPercent(productType: PriceCalcProductType, costAzn: number): number {
  if (productType === "mobileNew") return 17;
  if (productType === "mobileUsed") return 20;
  if (costAzn <= 15) return 150;
  if (costAzn <= 60) return 70;
  if (costAzn <= 90) return 50;
  return 30;
}

export function calculatePricePlan(
  productType: PriceCalcProductType,
  costAznRaw: number,
  rates?: InstructionCreditRateRow[],
): PriceCalculationResult {
  const periods = resolvePriceCalcCreditPeriods(rates);
  if (!Number.isFinite(costAznRaw) || costAznRaw <= 0) {
    return { cashPrice: 0, creditLines: periods.map((p) => ({ ...p, total: 0, monthly: 0 })) };
  }

  const costCents = toCents(costAznRaw);
  const costAzn = fromCents(costCents);
  const cashPercent = resolveCashPercent(productType, costAzn);
  const cashBaseCents = applyPercent(costCents, cashPercent);
  const cashPrice = roundPriceToNineEnding(fromCents(cashBaseCents));

  return { cashPrice, creditLines: creditLinesFromCash(cashPrice, periods) };
}

/**
 * Bilinən nağd satış qiymətindən kredit qiymətlərini hesablayır.
 * Nağd qiymət olduğu kimi qalır; faizlər Təlimat → Kredit faizlərindən götürülür.
 */
export function calculatePricePlanFromSalePrice(
  salePriceRaw: number,
  rates?: InstructionCreditRateRow[],
): PriceCalculationResult {
  const periods = resolvePriceCalcCreditPeriods(rates);
  if (!Number.isFinite(salePriceRaw) || salePriceRaw <= 0) {
    return { cashPrice: 0, creditLines: periods.map((p) => ({ ...p, total: 0, monthly: 0 })) };
  }

  const cashPrice = fromCents(toCents(salePriceRaw));
  return { cashPrice, creditLines: creditLinesFromCash(cashPrice, periods) };
}

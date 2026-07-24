export type PriceCalcProductType = "mobileNew" | "mobileUsed" | "homeOffice";

export const PRICE_CALC_PRODUCT_OPTIONS: { value: PriceCalcProductType; label: string }[] = [
  { value: "mobileNew", label: "Mobil telefon — yeni" },
  { value: "mobileUsed", label: "Mobil telefon — 2-ci əl" },
  { value: "homeOffice", label: "Məişət və ofis avadanlığı" },
];

export const PRICE_CALC_CREDIT_PERIODS = [
  { key: "m0to6", label: "0–6 ay", percent: 0, months: 6 },
  { key: "m9", label: "9 ay", percent: 5, months: 9 },
  { key: "m12", label: "12 ay", percent: 10, months: 12 },
  { key: "m15", label: "15 ay", percent: 12.5, months: 15 },
  { key: "m18", label: "18 ay", percent: 15, months: 18 },
  { key: "m24", label: "24 ay", percent: 20, months: 24 },
] as const;

export type PriceCalcCreditKey = (typeof PRICE_CALC_CREDIT_PERIODS)[number]["key"];

export type PriceCalcCreditLine = {
  key: PriceCalcCreditKey;
  label: string;
  months: number;
  percent: number;
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

/** 9 ay və yuxarı kredit qiymətləri yuvarlaqlaşmır; ondan aşağı (məs. 0–6) yuvarlaqlaşır. */
function creditLinesFromCash(cashPrice: number): PriceCalcCreditLine[] {
  return PRICE_CALC_CREDIT_PERIODS.map((period) => {
    const priceBaseCents = applyPercent(toCents(cashPrice), period.percent);
    const raw = fromCents(priceBaseCents);
    const total = period.months < 9 ? roundPriceToNineEnding(raw) : raw;
    return {
      key: period.key,
      label: period.label,
      months: period.months,
      percent: period.percent,
      total,
      monthly: monthlyCreditPayment(total, period.months),
    };
  });
}

function emptyCreditLines(): PriceCalcCreditLine[] {
  return PRICE_CALC_CREDIT_PERIODS.map((period) => ({
    key: period.key,
    label: period.label,
    months: period.months,
    percent: period.percent,
    total: 0,
    monthly: 0,
  }));
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
): PriceCalculationResult {
  if (!Number.isFinite(costAznRaw) || costAznRaw <= 0) {
    return { cashPrice: 0, creditLines: emptyCreditLines() };
  }

  const costCents = toCents(costAznRaw);
  const costAzn = fromCents(costCents);
  const cashPercent = resolveCashPercent(productType, costAzn);
  const cashBaseCents = applyPercent(costCents, cashPercent);
  const cashPrice = roundPriceToNineEnding(fromCents(cashBaseCents));

  return { cashPrice, creditLines: creditLinesFromCash(cashPrice) };
}

/**
 * Bilinən nağd satış qiymətindən kredit qiymətlərini hesablayır.
 * Nağd qiymət olduğu kimi qalır; faizlər sabit kredit cədvəlindən götürülür.
 */
export function calculatePricePlanFromSalePrice(salePriceRaw: number): PriceCalculationResult {
  if (!Number.isFinite(salePriceRaw) || salePriceRaw <= 0) {
    return { cashPrice: 0, creditLines: emptyCreditLines() };
  }

  const cashPrice = fromCents(toCents(salePriceRaw));
  return { cashPrice, creditLines: creditLinesFromCash(cashPrice) };
}

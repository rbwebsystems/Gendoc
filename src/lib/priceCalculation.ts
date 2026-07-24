export type PriceCalcProductType = "mobileNew" | "mobileUsed" | "homeOffice";

export const PRICE_CALC_PRODUCT_OPTIONS: { value: PriceCalcProductType; label: string }[] = [
  { value: "mobileNew", label: "Mobil telefon — yeni" },
  { value: "mobileUsed", label: "Mobil telefon — 2-ci əl" },
  { value: "homeOffice", label: "Məişət və ofis avadanlığı" },
];

export const PRICE_CALC_CREDIT_PERIODS = [
  { key: "m0to6", label: "0–6 ay", percent: 0 },
  { key: "m9", label: "9 ay", percent: 5 },
  { key: "m12", label: "12 ay", percent: 10 },
  { key: "m15", label: "15 ay", percent: 12.5 },
  { key: "m18", label: "18 ay", percent: 15 },
  { key: "m24", label: "24 ay", percent: 20 },
] as const;

export type PriceCalcCreditKey = (typeof PRICE_CALC_CREDIT_PERIODS)[number]["key"];

export type PriceCalculationResult = {
  cashPrice: number;
  creditPrices: Record<PriceCalcCreditKey, number>;
};

const ZERO_CREDITS: Record<PriceCalcCreditKey, number> = {
  m0to6: 0,
  m9: 0,
  m12: 0,
  m15: 0,
  m18: 0,
  m24: 0,
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

function creditPricesFromCash(cashPrice: number): Record<PriceCalcCreditKey, number> {
  return PRICE_CALC_CREDIT_PERIODS.reduce(
    (acc, period) => {
      const priceBaseCents = applyPercent(toCents(cashPrice), period.percent);
      acc[period.key] = roundPriceToNineEnding(fromCents(priceBaseCents));
      return acc;
    },
    { ...ZERO_CREDITS },
  );
}

function resolveCashPercent(productType: PriceCalcProductType, costAzn: number): number {
  if (productType === "mobileNew") return 17;
  if (productType === "mobileUsed") return 20;
  if (costAzn <= 15) return 150;
  if (costAzn <= 60) return 70;
  if (costAzn <= 90) return 50;
  return 30;
}

export function calculatePricePlan(productType: PriceCalcProductType, costAznRaw: number): PriceCalculationResult {
  if (!Number.isFinite(costAznRaw) || costAznRaw <= 0) {
    return { cashPrice: 0, creditPrices: { ...ZERO_CREDITS } };
  }

  const costCents = toCents(costAznRaw);
  const costAzn = fromCents(costCents);
  const cashPercent = resolveCashPercent(productType, costAzn);
  const cashBaseCents = applyPercent(costCents, cashPercent);
  const cashPrice = roundPriceToNineEnding(fromCents(cashBaseCents));

  return { cashPrice, creditPrices: creditPricesFromCash(cashPrice) };
}

/**
 * Bilinən nağd satış qiymətindən kredit qiymətlərini hesablayır.
 * Nağd qiymət olduğu kimi qalır; 0–6 ay faizsiz; digər aylar mövcud faizlə + yuxarı yuvarlaq.
 */
export function calculatePricePlanFromSalePrice(salePriceRaw: number): PriceCalculationResult {
  if (!Number.isFinite(salePriceRaw) || salePriceRaw <= 0) {
    return { cashPrice: 0, creditPrices: { ...ZERO_CREDITS } };
  }

  const cashPrice = fromCents(toCents(salePriceRaw));
  return { cashPrice, creditPrices: creditPricesFromCash(cashPrice) };
}

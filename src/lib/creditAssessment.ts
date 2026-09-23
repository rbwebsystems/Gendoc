export type CreditRisk = "low" | "med" | "high";

export type CreditAssessmentInput = {
  price: number;
  months: number;
  risk: CreditRisk;
  salary: number;
  obligations: number;
  extraIncome?: number;
  manualDownPayment?: number | null;
};

export type CreditAssessmentResult = {
  totalIncome: number;
  netIncome: number;
  incomeRatio: number;
  downPayment: number;
  downPaymentPercent: number;
  principal: number;
  monthlyPayment: number;
  maxMonthlyPayment: number;
  obligationRatio: number;
  obligationWarning: boolean;
  autoAdjusted: boolean;
  schedule: Array<{ paymentNo: number; payment: number; remaining: number }>;
};

const BASE_DOWN_PAYMENT: Record<CreditRisk, number> = { low: 0.2, med: 0.3, high: 0.5 };
const MIN_DOWN_PAYMENT = 50;
const MAX_DSR = 0.4;
const MAX_OBLIGATION_SHARE = 0.5;

function ratioModifier(ratio: number): number {
  if (ratio >= 0.7) return -0.1;
  if (ratio >= 0.5) return -0.05;
  if (ratio >= 0.35) return 0;
  if (ratio >= 0.2) return 0.1;
  return 0.2;
}

export function calculateCreditAssessment(input: CreditAssessmentInput): CreditAssessmentResult {
  const price = Math.max(0, Number(input.price) || 0);
  const months = Math.max(1, Math.trunc(Number(input.months) || 0));
  const totalIncome = Math.max(0, (Number(input.salary) || 0) + (Number(input.extraIncome) || 0));
  const obligations = Math.max(0, Number(input.obligations) || 0);
  const netIncome = Math.max(0, totalIncome - obligations);
  const incomeRatio = totalIncome > 0 ? netIncome / totalIncome : 0;

  let modifier = ratioModifier(incomeRatio);
  if (input.risk === "high") modifier *= 0.7;
  let downPaymentPercent = Math.min(0.85, Math.max(0.1, BASE_DOWN_PAYMENT[input.risk] + modifier));
  let downPayment = Math.min(price, Math.max(MIN_DOWN_PAYMENT, price * downPaymentPercent));

  const manual = input.manualDownPayment;
  const manualUsed = manual != null && Number.isFinite(Number(manual));
  if (manualUsed) {
    downPayment = Math.max(0, Math.min(price, Number(manual)));
    downPaymentPercent = price > 0 ? downPayment / price : 0;
  }

  let principal = Math.max(0, price - downPayment);
  let monthlyPayment = principal / months;
  const maxMonthlyPayment = netIncome * MAX_DSR;
  let autoAdjusted = false;

  if (monthlyPayment > maxMonthlyPayment + 1e-9) {
    const allowedPrincipal = Math.max(0, maxMonthlyPayment * months);
    const requiredDownPayment = price - allowedPrincipal;
    downPayment = Math.min(
      price,
      Math.max(manualUsed ? downPayment : MIN_DOWN_PAYMENT, downPayment, requiredDownPayment),
    );
    downPaymentPercent = price > 0 ? downPayment / price : 0;
    principal = Math.max(0, price - downPayment);
    monthlyPayment = principal / months;
    autoAdjusted = true;
  }

  const schedule = Array.from({ length: months }, (_, index) => ({
    paymentNo: index + 1,
    payment: monthlyPayment,
    remaining: Math.max(0, principal - monthlyPayment * (index + 1)),
  }));
  const obligationRatio = totalIncome > 0 ? obligations / totalIncome : obligations > 0 ? Infinity : 0;

  return {
    totalIncome,
    netIncome,
    incomeRatio,
    downPayment,
    downPaymentPercent,
    principal,
    monthlyPayment,
    maxMonthlyPayment,
    obligationRatio,
    obligationWarning: obligationRatio > MAX_OBLIGATION_SHARE,
    autoAdjusted,
    schedule,
  };
}

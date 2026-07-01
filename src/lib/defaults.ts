import type { CompanyProfile, DocumentMeta, OrderLineRow, OrderStatus, ProductRow } from "../types";

/** Rəsmi sənədlər və təchizatçı təkliflərində standart ƏDV */
export const OFFICIAL_VAT_PERCENT = 18;

export function emptyCompany(): CompanyProfile {
  return {
    currency: "AZN",
    bankName: "",
    branchCode: "",
    bankVoen: "",
    bankSwift: "",
    correspondentAccount: "",
    name: "",
    accountManat: "",
    voen: "",
    address: "",
    phone: "",
    fax: "",
    email: "",
    director: "",
  };
}

export function emptyMeta(): DocumentMeta {
  return {
    invoiceNumber: "",
    invoiceDate: new Date().toISOString().slice(0, 10),
    deliveryActNumber: "",
    protocolNumber: "",
    contractNumber: "",
    contractDate: "",
    deliveryPlace: "",
    deliveryBasis: "",
    quoteNumber: "",
  };
}

export function newProductRow(): ProductRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    unit: "ədəd",
    qty: 1,
    unitPrice: 0,
  };
}

export const ORDER_STATUS_OPTIONS: { value: OrderStatus; label: string }[] = [
  { value: "draft", label: "Qaralama" },
  { value: "pending", label: "Gözləyir" },
  { value: "done", label: "Tamamlanıb" },
  { value: "cancelled", label: "Ləğv edilib" },
];

export function orderStatusLabel(status: OrderStatus): string {
  return ORDER_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function orderStatusModifier(status: OrderStatus): string {
  return `dg-order-status--${status}`;
}

export function newOrderLineRow(): OrderLineRow {
  return {
    id: crypto.randomUUID(),
    name: "",
    qty: 1,
    purchasePrice: 0,
    supplierName: "",
  };
}

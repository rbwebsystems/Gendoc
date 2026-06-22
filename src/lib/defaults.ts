import type { CompanyProfile, DocumentMeta, ProductRow } from "../types";

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

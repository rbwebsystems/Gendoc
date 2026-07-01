import type {
  CompanyProfile,
  DocumentMeta,
  OrderLineRow,
  OrderStatus,
  ProductRow,
  PermissionModuleId,
  AppUserRole,
  LeaveRequestStatus,
} from "../types";

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

export const PERMISSION_MODULE_OPTIONS: { id: PermissionModuleId; label: string }[] = [
  { id: "companies", label: "Şirkətlər" },
  { id: "projects", label: "Təkliflər" },
  { id: "folders", label: "Qovluqlar" },
  { id: "notes", label: "Qeydlər" },
  { id: "suppliers", label: "Təchizatçı təklifləri" },
  { id: "storeOrders", label: "Mağaza sifarişi" },
  { id: "customerOrders", label: "Müştəri sifarişi" },
  { id: "workLeave", label: "İş icazələri" },
];

export const APP_USER_ROLE_OPTIONS: { value: AppUserRole; label: string }[] = [
  { value: "employee", label: "İşçi" },
  { value: "director", label: "Direktor" },
  { value: "admin", label: "Admin" },
];

export function appUserRoleLabel(role: AppUserRole): string {
  return APP_USER_ROLE_OPTIONS.find((o) => o.value === role)?.label ?? role;
}

export const LEAVE_TYPE_OPTIONS = [
  { value: "annual", label: "Məzuniyyət" },
  { value: "sick", label: "Xəstəlik" },
  { value: "unpaid", label: "Ödənişsiz" },
  { value: "other", label: "Digər" },
] as const;

export function leaveTypeLabel(value: string): string {
  return LEAVE_TYPE_OPTIONS.find((o) => o.value === value)?.label ?? value;
}

export const LEAVE_STATUS_OPTIONS: { value: LeaveRequestStatus; label: string }[] = [
  { value: "pending", label: "Gözləyir" },
  { value: "approved", label: "Təsdiq olundu" },
  { value: "rejected", label: "İmtina edildi" },
];

export function leaveStatusLabel(status: LeaveRequestStatus): string {
  return LEAVE_STATUS_OPTIONS.find((o) => o.value === status)?.label ?? status;
}

export function leaveStatusModifier(status: LeaveRequestStatus): string {
  return `dg-leave-status--${status}`;
}

export function defaultModulesForRole(role: AppUserRole): PermissionModuleId[] {
  if (role === "admin") return PERMISSION_MODULE_OPTIONS.map((m) => m.id);
  if (role === "director") return PERMISSION_MODULE_OPTIONS.map((m) => m.id);
  return ["workLeave"];
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

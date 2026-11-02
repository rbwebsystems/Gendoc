import { readSheet } from "read-excel-file/browser";
import { auth } from "./firebase";
import type { CorporateOrderItem, CorporateQuoteMatchType } from "../types";
import { parseOrderMatrix, parseQuoteMatrix, type Matrix } from "./corporateLocalParse";

/**
 * Korporativ sifariş faylının oxunması.
 * AI servisi qoşulubsa: şəkil və PDF olduğu kimi, Excel / Word / CSV isə mətnə çevrilib
 * GenDoc fayl servisinə (Cloudflare Worker → Claude) göndərilir.
 * Qoşulmayıbsa: Excel / Word / CSV cədvəlləri brauzerdə qaydalarla oxunur.
 */

const EXTRACT_URL = (import.meta.env.VITE_EXTRACT_URL as string | undefined)?.replace(/\/+$/, "") ?? "";

export const extractConfigured = EXTRACT_URL.length > 0;

export const ACCEPTED_ORDER_FILES = extractConfigured
  ? ".jpg,.jpeg,.png,.webp,.gif,.heic,.pdf,.xlsx,.csv,.txt,.docx"
  : ".xlsx,.csv,.docx";

export const ACCEPTED_FILES_LABEL = extractConfigured ? "şəkil, PDF, Excel, Word" : "Excel (.xlsx), Word (.docx), CSV";

type FilePayload =
  | { kind: "image"; name: string; mediaType: "image/jpeg" | "image/png" | "image/gif" | "image/webp"; data: string }
  | { kind: "pdf"; name: string; data: string }
  | { kind: "text"; name: string; text: string };

export type ExtractedOrder = { items: Array<{ name: string; qty: number | null; unit: string; note: string }> };

export type ExtractedQuote = {
  supplierName: string;
  currency: string;
  lines: Array<{
    orderItemId: string | null;
    matchType: CorporateQuoteMatchType;
    offeredName: string;
    qty: number | null;
    unitPrice: number | null;
    totalPrice: number | null;
    note: string;
  }>;
};

const MAX_PDF_BYTES = 20 * 1024 * 1024;
const MAX_IMAGE_SIDE = 2400;

function extension(name: string): string {
  const i = name.lastIndexOf(".");
  return i >= 0 ? name.slice(i + 1).toLowerCase() : "";
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

/** Böyük şəkilləri JPEG kimi kiçildir (Claude-un 5 MB şəkil limiti üçün). */
async function imageToBase64Jpeg(file: File): Promise<string> {
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("Şəkil açılmadı. JPG və ya PNG formatında yenidən yoxlayın.");
  });
  const scale = Math.min(1, MAX_IMAGE_SIDE / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Şəkil emal edilmədi.");
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  const dataUrl = canvas.toDataURL("image/jpeg", 0.88);
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

function rowsToText(rows: unknown[][]): string {
  return rows
    .map((row) => row.map((cell) => (cell == null ? "" : String(cell).replace(/[\t\r\n]+/g, " ").trim())).join("\t"))
    .filter((line) => line.replace(/\t/g, "").trim().length > 0)
    .join("\n");
}

async function fileToPayload(file: File): Promise<FilePayload> {
  const ext = extension(file.name);
  if (["jpg", "jpeg", "png", "webp", "gif", "heic", "heif"].includes(ext) || file.type.startsWith("image/")) {
    return { kind: "image", name: file.name, mediaType: "image/jpeg", data: await imageToBase64Jpeg(file) };
  }
  if (ext === "pdf" || file.type === "application/pdf") {
    if (file.size > MAX_PDF_BYTES) throw new Error("PDF 20 MB-dan böyükdür.");
    return { kind: "pdf", name: file.name, data: bytesToBase64(new Uint8Array(await file.arrayBuffer())) };
  }
  if (ext === "xlsx") {
    return { kind: "text", name: file.name, text: rowsToText(await readSheet(file)) };
  }
  if (ext === "csv" || ext === "txt") {
    return { kind: "text", name: file.name, text: await file.text() };
  }
  if (ext === "docx") {
    const mammoth = await import("mammoth");
    const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
    return { kind: "text", name: file.name, text: value };
  }
  if (ext === "xls" || ext === "doc") {
    throw new Error(`.${ext} köhnə formatdır. Faylı .${ext}x kimi yadda saxlayıb yenidən əlavə edin.`);
  }
  throw new Error("Bu fayl tipi dəstəklənmir. Şəkil, PDF, Excel (.xlsx), Word (.docx) və ya CSV seçin.");
}

/** CSV mətnini sətir/sütun cədvəlinə çevirir (vergül və ya nöqtəli vergül). */
function parseCsv(source: string): Matrix {
  const firstLine = source.split(/\r?\n/, 1)[0] ?? "";
  const delimiter = (firstLine.match(/;/g)?.length ?? 0) > (firstLine.match(/,/g)?.length ?? 0) ? ";" : ",";
  const rows: string[][] = [];
  let row: string[] = [];
  let field = "";
  let quoted = false;
  for (let i = 0; i < source.length; i++) {
    const ch = source[i];
    if (quoted) {
      if (ch === '"' && source[i + 1] === '"') {
        field += '"';
        i++;
      } else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delimiter) {
      row.push(field);
      field = "";
    } else if (ch === "\n" || ch === "\r") {
      if (ch === "\r" && source[i + 1] === "\n") i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = "";
    } else field += ch;
  }
  row.push(field);
  rows.push(row);
  return rows;
}

/** Word sənədindəki cədvəllər (bir neçə cədvəl varsa ardıcıl birləşdirilir). */
async function docxToMatrix(file: File): Promise<Matrix> {
  const mammoth = await import("mammoth");
  const { value } = await mammoth.convertToHtml({ arrayBuffer: await file.arrayBuffer() });
  const doc = new DOMParser().parseFromString(value, "text/html");
  const rows: Matrix = [];
  for (const tr of Array.from(doc.querySelectorAll("table tr"))) {
    rows.push(Array.from(tr.querySelectorAll("th,td")).map((c) => c.textContent?.trim() ?? ""));
  }
  if (rows.length === 0) {
    throw new Error("Word faylında cədvəl tapılmadı. Məhsulları cədvəl şəklində göndərin və ya əllə daxil edin.");
  }
  return rows;
}

async function fileToMatrix(file: File): Promise<Matrix> {
  const ext = extension(file.name);
  if (ext === "xlsx") return (await readSheet(file)) as Matrix;
  if (ext === "csv" || ext === "txt") return parseCsv(await file.text());
  if (ext === "docx") return docxToMatrix(file);
  if (ext === "xls" || ext === "doc") {
    throw new Error(`.${ext} köhnə formatdır. Faylı .${ext}x kimi yadda saxlayıb yenidən əlavə edin.`);
  }
  throw new Error("Şəkil və PDF hələ avtomatik oxunmur. Excel (.xlsx), Word (.docx) və ya CSV seçin, ya da məhsulları əllə daxil edin.");
}

async function callExtract<T>(body: object): Promise<T> {
  const user = auth?.currentUser;
  if (!user) throw new Error("Fayl oxumaq üçün daxil olun.");
  const token = await user.getIdToken();
  let res: Response;
  try {
    res = await fetch(`${EXTRACT_URL}/extract`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    throw new Error("Fayl servisinə qoşulmaq alınmadı. İnterneti yoxlayın.");
  }
  const data = (await res.json().catch(() => null)) as (T & { error?: string }) | null;
  if (!res.ok || !data) throw new Error(data?.error || `Fayl oxunmadı (${res.status}).`);
  return data;
}

export async function extractOrderFromFile(file: File): Promise<ExtractedOrder> {
  if (!extractConfigured) return { items: parseOrderMatrix(await fileToMatrix(file)) };
  const payload = await fileToPayload(file);
  const data = await callExtract<ExtractedOrder>({ mode: "order", file: payload });
  return { items: Array.isArray(data.items) ? data.items : [] };
}

export async function extractQuoteFromFile(file: File, orderItems: CorporateOrderItem[]): Promise<ExtractedQuote> {
  if (!extractConfigured) {
    const lines = parseQuoteMatrix(await fileToMatrix(file), orderItems);
    return { supplierName: "", currency: "AZN", lines };
  }
  const payload = await fileToPayload(file);
  const data = await callExtract<ExtractedQuote>({
    mode: "quote",
    file: payload,
    orderItems: orderItems.map((it) => ({ id: it.id, name: it.name, qty: it.qty, unit: it.unit })),
  });
  return {
    supplierName: data.supplierName ?? "",
    currency: data.currency || "AZN",
    lines: Array.isArray(data.lines) ? data.lines : [],
  };
}

import type { GeneratorState } from "../types";
import { escapeHtml, formatDateAzLong, moneyToWordsAz } from "../lib/text";

/** Firma blankı — #ff000d vurğu, qalan mətn qara */
const DOC_THEME = {
  brand: "#ff000d",
  text: "#111827",
  textMuted: "#374151",
  white: "#ffffff",
  border: "#374151",
  borderLight: "#d1d5db",
  rowMuted: "#f9fafb",
  rowTotal: "#f3f4f6",
  screenBg: "#f3f4f6",
} as const;

type PrintCssOptions = {
  thFontSize?: string;
  tdFontSize?: string;
  thPadding?: string;
  compact?: boolean;
};

function printCssDocument(opts: PrintCssOptions = {}): string {
  const thFontSize = opts.thFontSize ?? "8.5px";
  const tdFontSize = opts.tdFontSize ?? "9.5px";
  const thPadding = opts.thPadding ?? "4px 8px";
  const compactBlock = opts.compact
    ? `
        .mb-10 { margin-bottom: 1.75rem !important; }
        .mb-6 { margin-bottom: 1.25rem !important; }
        .mt-12 { margin-top: 2rem !important; }
        .pb-4 { padding-bottom: 0.85rem !important; }
        .gap-20 { gap: 3.5rem !important; }
        .gap-10 { gap: 2rem !important; }
        .space-y-3 > :not([hidden]) ~ :not([hidden]) { margin-top: 0.45rem !important; }
        .mb-16 { margin-bottom: 2.5rem !important; }
    `
    : "";

  return `
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Merriweather:wght@700&display=swap');

        body {
            font-family: 'Inter', sans-serif;
            background-color: ${DOC_THEME.screenBg};
            color: ${DOC_THEME.text};
            padding: 40px 20px;
        }

        .no-print button {
            background-color: ${DOC_THEME.brand} !important;
            color: ${DOC_THEME.white} !important;
        }
        .no-print button:hover {
            background-color: #cc000b !important;
        }

        .page-container {
            max-width: 210mm;
            min-height: 297mm;
            margin: 0 auto;
            background: ${DOC_THEME.white};
            padding: 18mm 18mm 16mm 22mm;
            box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.08);
            border-radius: 4px;
            position: relative;
            color: ${DOC_THEME.text};
            display: flex;
            flex-direction: column;
        }

        .page-container::before {
            content: "";
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: ${DOC_THEME.brand};
            border-radius: 4px 4px 0 0;
        }

        .page-container::after {
            content: "";
            position: absolute;
            top: 12mm;
            bottom: 12mm;
            left: 10mm;
            width: 3px;
            background: linear-gradient(180deg, ${DOC_THEME.brand} 0%, ${DOC_THEME.brand} 72%, transparent 100%);
            border-radius: 2px;
        }

        .doc-body {
            flex: 1 1 auto;
        }

        /* Korporativ letterhead */
        .doc-letterhead {
            margin-bottom: 1.35rem;
        }

        .doc-letterhead-main {
            display: flex;
            justify-content: space-between;
            align-items: flex-start;
            gap: 20px;
            background: linear-gradient(135deg, #fafafa 0%, ${DOC_THEME.white} 100%);
            border: 1px solid ${DOC_THEME.borderLight};
            border-left: 4px solid ${DOC_THEME.brand};
            padding: 14px 18px;
            border-radius: 0 6px 6px 0;
        }

        .doc-letterhead-brand {
            display: flex;
            align-items: center;
            gap: 12px;
            min-width: 0;
        }

        .doc-letterhead-mark {
            width: 6px;
            height: 44px;
            background: ${DOC_THEME.brand};
            border-radius: 2px;
            flex-shrink: 0;
        }

        .doc-letterhead-brand .doc-brand {
            font-family: 'Merriweather', serif;
            font-size: 22px;
            font-weight: 700;
            margin: 0;
            line-height: 1.15;
            letter-spacing: -0.02em;
        }

        .doc-letterhead-meta {
            margin: 5px 0 0;
            font-size: 8.5px;
            color: ${DOC_THEME.textMuted};
            letter-spacing: 0.06em;
            text-transform: uppercase;
            font-weight: 600;
        }

        .doc-letterhead-contact {
            text-align: right;
            font-size: 9px;
            line-height: 1.55;
            max-width: 46%;
        }

        .doc-letterhead-contact .doc-label {
            color: ${DOC_THEME.brand};
            font-weight: 600;
        }

        .doc-letterhead-rule {
            height: 2px;
            margin-top: 10px;
            background: linear-gradient(90deg, ${DOC_THEME.brand} 0%, ${DOC_THEME.brand} 100px, ${DOC_THEME.borderLight} 100px);
        }

        .doc-doc-title {
            text-align: center;
            margin-bottom: 1.5rem;
            padding-bottom: 0.65rem;
            border-bottom: 1px solid ${DOC_THEME.borderLight};
        }

        .doc-doc-title h2 {
            font-family: 'Merriweather', serif;
            font-size: 1.125rem;
            font-weight: 700;
            color: ${DOC_THEME.text};
            margin: 0;
            letter-spacing: 0.08em;
            text-transform: uppercase;
        }

        .doc-doc-title-sub {
            margin: 8px 0 0;
            font-size: 10px;
            color: ${DOC_THEME.textMuted};
            font-weight: 500;
        }

        .doc-doc-title::after {
            content: "";
            display: block;
            width: 64px;
            height: 3px;
            background: ${DOC_THEME.brand};
            margin: 10px auto 0;
            border-radius: 1px;
        }

        .doc-requisites {
            border-left: 4px solid ${DOC_THEME.brand} !important;
            border-radius: 0 8px 8px 0 !important;
            background: linear-gradient(135deg, ${DOC_THEME.rowMuted} 0%, ${DOC_THEME.white} 100%) !important;
        }

        .doc-letterfoot {
            margin-top: auto;
            padding-top: 12px;
            border-top: 1px solid ${DOC_THEME.borderLight};
            position: relative;
        }

        .doc-letterfoot::before {
            content: "";
            position: absolute;
            top: -1px;
            left: 50%;
            transform: translateX(-50%);
            width: 120px;
            height: 2px;
            background: ${DOC_THEME.brand};
        }

        .doc-letterfoot-inner {
            font-size: 7.5px;
            color: ${DOC_THEME.textMuted};
            text-align: center;
            letter-spacing: 0.04em;
            line-height: 1.5;
        }

        .doc-letterfoot-name {
            font-weight: 700;
            color: ${DOC_THEME.brand};
        }

        .doc-letterfoot-sep {
            margin: 0 7px;
            opacity: 0.45;
        }

        /* Yalnız firma adı qırmızı */
        .page-container .doc-brand {
            color: ${DOC_THEME.brand} !important;
        }

        /* Şirkət məlumatları: etiketlər qırmızı, dəyərlər qara */
        .page-container .doc-company-panel {
            color: ${DOC_THEME.text};
        }
        .page-container .doc-company-panel h3,
        .page-container .doc-company-panel h3.text-gray-900,
        .page-container .doc-company-panel .font-semibold,
        .page-container .doc-company-panel .font-medium {
            color: ${DOC_THEME.brand} !important;
        }
        .page-container .doc-company-panel .text-gray-900,
        .page-container .doc-company-panel p,
        .page-container .doc-company-panel div.text-gray-900 {
            color: ${DOC_THEME.text} !important;
        }
        .page-container .doc-company-panel h3 {
            border-color: ${DOC_THEME.borderLight} !important;
        }

        /* Ümumi mətn qara */
        .page-container .text-gray-900,
        .page-container .text-gray-800,
        .page-container .text-gray-700,
        .page-container .text-gray-600,
        .page-container .text-gray-500 {
            color: ${DOC_THEME.text} !important;
        }
        .page-container .text-gray-400 {
            color: ${DOC_THEME.textMuted} !important;
        }
        .page-container .border-gray-900,
        .page-container .border-b.border-gray-900,
        .page-container .border-gray-400,
        .page-container .border-gray-300 {
            border-color: ${DOC_THEME.border} !important;
        }
        .page-container .border-gray-200 {
            border-color: ${DOC_THEME.borderLight} !important;
        }
        .page-container .bg-gray-50,
        .page-container .bg-gray-50\\/60 {
            background-color: ${DOC_THEME.rowMuted} !important;
            color: ${DOC_THEME.text} !important;
        }
        .page-container .bg-gray-200 {
            background-color: ${DOC_THEME.rowTotal} !important;
            color: ${DOC_THEME.text} !important;
        }

        @media print {
            body { background: white; padding: 0; color: ${DOC_THEME.text}; }
            .no-print { display: none !important; }
            .page-container {
                box-shadow: none;
                margin: 0;
                padding: 15mm;
                width: 100%;
                border-radius: 0;
            }
            .page-container::before { border-radius: 0; }
            .page-container::after { top: 10mm; bottom: 10mm; left: 8mm; }
            .print-exact {
                -webkit-print-color-adjust: exact;
                print-color-adjust: exact;
            }
            .grid.grid-cols-2.gap-20.text-\\[12px\\].mt-12,
            .grid.grid-cols-2.gap-16.text-\\[12px\\].mt-12,
            .mt-12.text-\\[12px\\].w-1\\/2 {
                break-inside: avoid;
                page-break-inside: avoid;
            }
            .grid.grid-cols-2.gap-20.text-\\[12px\\].mt-12 > div,
            .grid.grid-cols-2.gap-16.text-\\[12px\\].mt-12 > div,
            .mt-12.text-\\[12px\\].w-1\\/2 {
                break-inside: avoid;
                page-break-inside: avoid;
            }
        }

        table {
            width: 100%;
            border-collapse: collapse;
        }

        /* Çoxsəhifəli çapda cəmi/ƏDV/yekun yalnız son səhifədə (tfoot təkrarlanmasın) */
        tfoot {
            display: table-row-group;
        }

        tfoot tr {
            break-inside: avoid;
            page-break-inside: avoid;
        }

        th, td {
            border: 1px solid ${DOC_THEME.border};
            padding: ${thPadding};
        }

        th {
            background-color: ${DOC_THEME.brand};
            color: ${DOC_THEME.white};
            font-weight: 600;
            font-size: ${thFontSize};
            text-transform: uppercase;
            letter-spacing: 0.02em;
        }

        td {
            font-size: ${tdFontSize};
            color: ${DOC_THEME.text};
        }

        .border-none-left {
            border-left: none !important;
            border-top: none !important;
            border-bottom: none !important;
        }
        ${compactBlock}
    `;
}

function printButton(label: string): string {
  return `
    <div class="no-print flex justify-center mb-8">
        <button onclick="window.print()" class="font-medium py-2.5 px-6 rounded-lg transition duration-200 shadow-md flex items-center gap-2">
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 6 2 18 2 18 9"></polyline><path d="M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2"></path><rect x="6" y="14" width="12" height="8"></rect></svg>
            ${escapeHtml(label)}
        </button>
    </div>`;
}

function renderLetterhead(state: GeneratorState): string {
  const seller = state.seller;
  const sellerName = seller.name?.trim() || "—";
  const sellerAddr = seller.address?.trim() || "";
  const sellerPhone = seller.phone?.trim() || "";
  const sellerEmail = seller.email?.trim() || "";
  const sellerVoen = seller.voen?.trim() || "";

  const contact: string[] = [];
  if (sellerAddr) contact.push(`<p><span class="doc-label">Ünvan:</span> ${escapeHtml(sellerAddr)}</p>`);
  if (sellerPhone) contact.push(`<p><span class="doc-label">Tel:</span> ${escapeHtml(sellerPhone)}</p>`);
  if (sellerEmail) contact.push(`<p><span class="doc-label">E-poçt:</span> ${escapeHtml(sellerEmail)}</p>`);

  return `
    <header class="doc-letterhead">
      <div class="doc-letterhead-main">
        <div class="doc-letterhead-brand">
          <div class="doc-letterhead-mark" aria-hidden="true"></div>
          <div>
            <h1 class="doc-brand">${escapeHtml(sellerName)}</h1>
            ${sellerVoen ? `<p class="doc-letterhead-meta">VÖEN ${escapeHtml(sellerVoen)}</p>` : ""}
          </div>
        </div>
        ${contact.length ? `<div class="doc-company-panel doc-letterhead-contact">${contact.join("")}</div>` : ""}
      </div>
      <div class="doc-letterhead-rule" aria-hidden="true"></div>
    </header>`;
}

function renderDocTitle(title: string, subtitle?: string): string {
  return `
    <div class="doc-doc-title">
      <h2>${escapeHtml(title)}</h2>
      ${subtitle ? `<p class="doc-doc-title-sub">${escapeHtml(subtitle)}</p>` : ""}
    </div>`;
}

function renderLetterfoot(state: GeneratorState): string {
  const sellerName = state.seller.name?.trim() || "";
  if (!sellerName) return "";
  const sellerVoen = state.seller.voen?.trim() || "";
  const sellerPhone = state.seller.phone?.trim() || "";
  const parts = [`<span class="doc-letterfoot-name">${escapeHtml(sellerName)}</span>`];
  if (sellerVoen) parts.push(`<span>VÖEN ${escapeHtml(sellerVoen)}</span>`);
  if (sellerPhone) parts.push(`<span>${escapeHtml(sellerPhone)}</span>`);
  return `
    <footer class="doc-letterfoot">
      <div class="doc-letterfoot-inner">${parts.join('<span class="doc-letterfoot-sep">·</span>')}</div>
    </footer>`;
}

export function computeTotals(state: GeneratorState) {
  const subtotal = state.rows.reduce((sum, r) => sum + r.qty * r.unitPrice, 0);
  const vatRate = Math.max(0, state.vatPercent || 0);
  const vatAmount = subtotal * (vatRate / 100);
  const grandTotal = subtotal + vatAmount;
  return { subtotal, vatRate, vatAmount, grandTotal };
}

// formatMoneyPlain artıq istifadə olunmur (şablonlarda lokal formatter var).
// rowsTableProtocol artıq istifadə olunmur (protokol/faktura/akt HTML-i birbaşa şablonla yığılır).
export function buildInvoiceHtml(state: GeneratorState): string {
  const m = state.meta;
  const sellerName = state.seller.name?.trim() || "—";
  const sellerVoen = state.seller.voen?.trim() || "";
  const sellerBank = state.seller.bankName?.trim() || "";
  const sellerAccount = state.seller.accountManat?.trim() || "";
  const sellerCode = state.seller.branchCode?.trim() || "";
  const sellerBankVoen = state.seller.bankVoen?.trim() || "";
  const sellerSwift = state.seller.bankSwift?.trim() || "";
  const sellerCorr = state.seller.correspondentAccount?.trim() || "";
  const sellerCurrency = state.seller.currency?.trim() || "";

  // alıcı rekvizitləri fakturada göstərilmir

  const director = state.seller.director?.trim() || "";

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      Number.isFinite(n) ? n : 0,
    );
  const { subtotal, vatRate, vatAmount, grandTotal } = computeTotals(state);
  const finalTotal = vatRate > 0 ? grandTotal : subtotal;

  const bodyRows =
    state.rows.length === 0
      ? ""
      : state.rows
          .map((r, i) => {
            const qty = Number(r.qty) || 0;
            const unitPrice = Number(r.unitPrice) || 0;
            const lineTotal = qty * unitPrice;
            const unit = (r.unit || "").trim() || "—";
            return `
                    <tr>
                        <td class="text-center">${i + 1}</td>
                        <td>${escapeHtml(r.name)}</td>
                        <td class="text-center text-gray-500">${escapeHtml(unit)}</td>
                        <td class="text-center">${qty}</td>
                        <td class="text-right font-medium">${fmt(unitPrice)}</td>
                        <td class="text-right font-medium">${fmt(lineTotal)}</td>
                    </tr>`;
          })
          .join("");

  return `<!DOCTYPE html>
<html lang="az">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Hesab-Faktura</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
${printCssDocument()}
    </style>
</head>
<body>

    ${printButton("Fakturanı Çap Et")}

    <!-- Sənəd Konteyneri -->
    <div class="page-container">

        ${renderLetterhead(state)}

        <div class="doc-body">

        ${renderDocTitle(`Hesab-Faktura № ${m.invoiceNumber || "—"}`, `Tarix: ${formatDateAzLong(m.invoiceDate)}`)}

        <!-- Rekvizitlər (yalnız Satıcı) -->
        <div class="mb-8 border border-gray-200 rounded-xl bg-gray-50/60 px-5 py-4 doc-company-panel doc-requisites">
          <div class="min-w-0 text-[10.5px]">
                <h3 class="font-bold text-gray-900 text-[12px] uppercase mb-2 border-b border-gray-200 pb-1">Satıcı rekvizitləri</h3>
                <div class="grid grid-cols-[110px_minmax(0,1fr)] gap-y-1 gap-x-3">
                    <div class="font-semibold text-gray-700">Müəssisə</div>
                    <div class="text-gray-900 break-words">${escapeHtml(sellerName)}</div>
                    ${sellerVoen ? `<div class="font-semibold text-gray-700">VÖEN</div><div class="text-gray-900 break-words">${escapeHtml(sellerVoen)}</div>` : ""}
                    ${sellerCurrency ? `<div class="font-semibold text-gray-700">Valyuta</div><div class="text-gray-900 break-words">${escapeHtml(sellerCurrency)}</div>` : ""}
                    ${sellerBank ? `<div class="font-semibold text-gray-700">Bank</div><div class="text-gray-900 break-words">${escapeHtml(sellerBank)}</div>` : ""}
                    ${sellerCode ? `<div class="font-semibold text-gray-700">KOD</div><div class="text-gray-900 break-words">${escapeHtml(sellerCode)}</div>` : ""}
                    ${sellerSwift ? `<div class="font-semibold text-gray-700">SWIFT</div><div class="text-gray-900 break-words">${escapeHtml(sellerSwift)}</div>` : ""}
                    ${sellerBankVoen ? `<div class="font-semibold text-gray-700">Bank VÖEN</div><div class="text-gray-900 break-words">${escapeHtml(sellerBankVoen)}</div>` : ""}
                    ${sellerAccount ? `<div class="font-semibold text-gray-700">Hesab</div><div class="text-gray-900 break-words">${escapeHtml(sellerAccount)}</div>` : ""}
                    ${sellerCorr ? `<div class="font-semibold text-gray-700">Müxbir</div><div class="text-gray-900 break-words">${escapeHtml(sellerCorr)}</div>` : ""}
                </div>
          </div>
        </div>

        <!-- Cədvəl -->
        <div class="mb-6">
            <table>
                <thead class="print-exact">
                    <tr>
                        <th class="text-center w-12">Sıra</th>
                        <th class="text-left">Məhsul / Xidmətin adı</th>
                        <th class="text-center w-16">Ölçü</th>
                        <th class="text-center w-16">Miqdar</th>
                        <th class="text-right w-28">Qiymət (AZN)</th>
                        <th class="text-right w-36">Cəmi (Ədv-siz)</th>
                    </tr>
                </thead>
                <tbody class="text-gray-800">${bodyRows}
                </tbody>
                <!-- Yekun Hissə -->
                <tfoot class="print-exact text-gray-900">
                    <tr>
                        <td colspan="4" class="border-none-left"></td>
                        <td class="font-bold bg-gray-50 text-[11px] uppercase tracking-wider">Cəmi</td>
                        <td class="text-right font-bold bg-gray-50 text-[11px]">${fmt(subtotal)}</td>
                    </tr>
                    ${vatRate > 0 ? `
                    <tr>
                        <td colspan="4" class="border-none-left"></td>
                        <td class="font-bold bg-gray-50 text-[11px] uppercase tracking-wider">ƏDV ${vatRate.toLocaleString("az-AZ", { maximumFractionDigits: 2 })}%</td>
                        <td class="text-right font-bold bg-gray-50 text-[11px]">${fmt(vatAmount)}</td>
                    </tr>` : ""}
                    <tr>
                        <td colspan="4" class="border-none-left"></td>
                        <td class="font-bold bg-gray-200 text-[12px] uppercase tracking-wider">Yekun</td>
                        <td class="text-right font-bold bg-gray-200 text-[12px]">${fmt(finalTotal)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <!-- Məbləğ Sözlə -->
        <div class="mb-12">
            <p class="text-[12px] text-gray-800">
                <span class="font-bold text-gray-900">Məbləğ sözlə:</span> ${escapeHtml(moneyToWordsAz(finalTotal))}.
            </p>
        </div>

        <!-- İmzalar -->
        <div class="mt-12 text-[12px] w-1/2">
            <div class="space-y-3 mb-8">
                <p><span class="font-bold text-gray-900">Satıcı:</span> ${escapeHtml(sellerName)}</p>
                ${director ? `<p><span class="font-bold text-gray-900">Rəhbər:</span> ${escapeHtml(director)}</p>` : ""}
            </div>
            <div class="flex items-end gap-6">
                <div class="flex-1">
                    <p class="font-bold text-gray-900 mb-1">İmza</p>
                    <div class="border-b border-gray-900 w-full"></div>
                </div>
                <div class="w-20 h-20 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center text-gray-400 text-[10px] font-bold shrink-0">
                    M.Y.
                </div>
            </div>
        </div>

        </div>

        ${renderLetterfoot(state)}

    </div>

</body>
</html>`;
}

export function buildDeliveryActHtml(state: GeneratorState): string {
  const m = state.meta;
  const sellerName = state.seller.name?.trim() || "";
  const sellerVoen = state.seller.voen?.trim() || "";
  const sellerDirector = state.seller.director?.trim() || "";

  const buyerName = state.buyer.name?.trim() || "";
  const buyerVoen = state.buyer.voen?.trim() || "";
  const buyerDirector = state.buyer.director?.trim() || "";

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      Number.isFinite(n) ? n : 0,
    );
  const { subtotal, vatRate, vatAmount, grandTotal } = computeTotals(state);
  const finalTotal = vatRate > 0 ? grandTotal : subtotal;

  const bodyRows =
    state.rows.length === 0
      ? ""
      : state.rows
          .map((r, i) => {
            const qty = Number(r.qty) || 0;
            const unitPrice = Number(r.unitPrice) || 0;
            const lineTotal = qty * unitPrice;
            const unit = (r.unit || "").trim();
            return `
                    <tr>
                        <td class="text-center">${i + 1}</td>
                        <td>${escapeHtml(r.name)}</td>
                        <td class="text-center text-gray-500">${escapeHtml(unit)}</td>
                        <td class="text-center">${qty}</td>
                        <td class="text-right font-medium">${fmt(unitPrice)}</td>
                        <td class="text-right font-medium">${fmt(lineTotal)}</td>
                    </tr>`;
          })
          .join("");

  const buyerAuthorized = buyerDirector || "___________________";

  return `<!DOCTYPE html>
<html lang="az">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Təhvil-Təslim Aktı</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
${printCssDocument({ thFontSize: "10px", tdFontSize: "11px", thPadding: "6px 10px" })}
    </style>
</head>
<body>

    ${printButton("Aktı Çap Et")}

    <!-- Sənəd Konteyneri -->
    <div class="page-container">

        ${renderLetterhead(state)}

        <div class="doc-body">

        <!-- Məlumat Hissəsi -->
        <div class="mb-10 text-[12px]">
            <div class="mb-5 flex justify-between">
                <p><span class="font-bold text-gray-900 w-16 inline-block">Tarix:</span> ${escapeHtml(formatDateAzLong(m.invoiceDate))}</p>
                <p><span class="font-bold text-gray-900 mr-2">Akt №:</span> ${escapeHtml(m.deliveryActNumber || "")}</p>
            </div>
            <div class="grid grid-cols-2 gap-10">
                <div class="space-y-3">
                    <p><span class="font-bold text-gray-900 w-[90px] inline-block">Təhvil verən:</span> ${escapeHtml(sellerName)}</p>
                    <p><span class="font-bold text-gray-900 w-[90px] inline-block">VÖEN:</span> ${escapeHtml(sellerVoen)}</p>
                </div>
                <div class="space-y-3">
                    <p><span class="font-bold text-gray-900 w-[90px] inline-block">Təhvil alan:</span> ${escapeHtml(buyerName)}</p>
                    <p><span class="font-bold text-gray-900 w-[90px] inline-block">VÖEN:</span> ${escapeHtml(buyerVoen)}</p>
                </div>
            </div>
        </div>

        ${renderDocTitle("Təhvil-Təslim Aktı")}

        <!-- Giriş Mətni -->
        <p class="text-[12px] text-gray-800 leading-relaxed mb-6 text-justify">
            Biz, aşağıda imza edən tərəflər, bu aktı ona görə tərtib etdik ki, "Təhvil verən" aşağıda göstərilən məhsulları (işləri, xidmətləri) tam olaraq təhvil vermiş, "Təhvil alan" isə onları qəbul etmişdir:
        </p>

        <!-- Cədvəl -->
        <div class="mb-6">
            <table>
                <thead class="print-exact">
                    <tr>
                        <th class="text-center w-12">Sıra</th>
                        <th class="text-left">Məhsulun adı</th>
                        <th class="text-center w-16">Ölçü</th>
                        <th class="text-center w-16">Miqdar</th>
                        <th class="text-right w-28">Qiymət (AZN)</th>
                        <th class="text-right w-36">Cəmi (Ədv-siz)</th>
                    </tr>
                </thead>
                <tbody class="text-gray-800">${bodyRows}
                </tbody>
                <!-- Yekun Hissə -->
                <tfoot class="print-exact text-gray-900">
                    <tr>
                        <td colspan="4" class="border-none-left"></td>
                        <td class="font-bold bg-gray-50 text-[11px] uppercase tracking-wider">Cəmi</td>
                        <td class="text-right font-bold bg-gray-50 text-[11px]">${fmt(subtotal)}</td>
                    </tr>
                    ${vatRate > 0 ? `
                    <tr>
                        <td colspan="4" class="border-none-left"></td>
                        <td class="font-bold bg-gray-50 text-[11px] uppercase tracking-wider">ƏDV ${vatRate.toLocaleString("az-AZ", { maximumFractionDigits: 2 })}%</td>
                        <td class="text-right font-bold bg-gray-50 text-[11px]">${fmt(vatAmount)}</td>
                    </tr>` : ""}
                    <tr>
                        <td colspan="4" class="border-none-left"></td>
                        <td class="font-bold bg-gray-200 text-[12px] uppercase tracking-wider">Yekun</td>
                        <td class="text-right font-bold bg-gray-200 text-[12px]">${fmt(finalTotal)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <!-- Təsdiq Mətni -->
        <p class="text-[12px] text-gray-800 leading-relaxed mb-12 text-justify">
            Yuxarıda qeyd olunan məhsullar (işlər, xidmətlər) tam, işlək vəziyyətdə və qüsursuz olaraq təhvil verilmişdir. Təhvil alanın məhsulların kəmiyyəti, keyfiyyəti və komplektasiyası barədə heç bir iddiası yoxdur. Bu akt 2 (iki) nüsxədə tərtib edilmişdir və hər iki tərəf üçün bərabər hüquqi qüvvəyə malikdir.
        </p>

        <!-- İmzalar -->
        <div class="grid grid-cols-2 gap-16 text-[12px] mt-12">
            <!-- Təhvil Verən Blok -->
            <div class="flex flex-col h-full">
                <div class="space-y-3 mb-10">
                    <p><span class="font-bold text-gray-900 w-[90px] inline-block">Təhvil verdi:</span> ${escapeHtml(sellerName)}</p>
                    <p><span class="font-bold text-gray-900 w-[90px] inline-block">Rəhbər:</span> ${escapeHtml(sellerDirector)}</p>
                </div>
                <div class="flex items-end gap-4 mt-auto">
                    <div class="flex-1">
                        <p class="font-bold text-gray-900 mb-1 text-[10px] uppercase tracking-wider">İmza</p>
                        <div class="border-b border-gray-900 w-full"></div>
                    </div>
                    <div class="w-16 h-16 border-2 border-dashed border-gray-400 rounded-full flex items-center justify-center text-gray-400 text-[8px] font-bold shrink-0">
                        M.Y.
                    </div>
                </div>
            </div>
            
            <!-- Təhvil Alan Blok -->
            <div class="flex flex-col h-full">
                <div class="space-y-3 mb-10">
                    <p><span class="font-bold text-gray-900 w-[90px] inline-block">Təhvil aldı:</span> ${escapeHtml(buyerName)}</p>
                    <p><span class="font-bold text-gray-900 w-[90px] inline-block">Səlahiyyətli:</span> ${escapeHtml(buyerAuthorized)}</p>
                </div>
                <div class="flex items-end gap-4 mt-auto">
                    <div class="flex-1">
                        <p class="font-bold text-gray-900 mb-1 text-[10px] uppercase tracking-wider">İmza</p>
                        <div class="border-b border-gray-900 w-full"></div>
                    </div>
                    <div class="w-16 h-16 border-2 border-dashed border-gray-400 rounded-full flex items-center justify-center text-gray-400 text-[8px] font-bold shrink-0">
                        M.Y.
                    </div>
                </div>
            </div>
        </div>

        </div>

        ${renderLetterfoot(state)}

    </div>

</body>
</html>`;
}

export function buildDeliveryActNoPriceHtml(state: GeneratorState): string {
  const m = state.meta;
  const sellerName = state.seller.name?.trim() || "";
  const sellerVoen = state.seller.voen?.trim() || "";
  const sellerDirector = state.seller.director?.trim() || "";

  const buyerName = state.buyer.name?.trim() || "";
  const buyerVoen = state.buyer.voen?.trim() || "";
  const buyerDirector = state.buyer.director?.trim() || "";

  const bodyRows =
    state.rows.length === 0
      ? ""
      : state.rows
          .map((r, i) => {
            const qty = Number(r.qty) || 0;
            const unit = (r.unit || "").trim();
            return `
                    <tr>
                        <td class="text-center font-medium">${i + 1}</td>
                        <td>${escapeHtml(r.name)}</td>
                        <td class="text-center text-gray-500">${escapeHtml(unit)}</td>
                        <td class="text-center font-bold">${qty}</td>
                    </tr>`;
          })
          .join("");

  const buyerAuthorized = buyerDirector || "___________________";

  return `<!DOCTYPE html>
<html lang="az">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Qiymətsiz Təhvil-Təslim Aktı</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
${printCssDocument({ thFontSize: "11px", tdFontSize: "12px", thPadding: "8px 12px" })}
    </style>
</head>
<body>

    ${printButton("Aktı Çap Et")}

    <!-- Sənəd Konteyneri -->
    <div class="page-container">

        ${renderLetterhead(state)}

        <div class="doc-body">

        <!-- Məlumat Hissəsi -->
        <div class="mb-10 text-[12px]">
            <div class="mb-5 flex justify-between">
                <p><span class="font-bold text-gray-900 w-16 inline-block">Tarix:</span> ${escapeHtml(formatDateAzLong(m.invoiceDate))}</p>
                <p><span class="font-bold text-gray-900 mr-2">Akt №:</span> ${escapeHtml(m.deliveryActNumber || "")}</p>
            </div>
            <div class="grid grid-cols-2 gap-10">
                <div class="space-y-3">
                    <p><span class="font-bold text-gray-900 w-[90px] inline-block">Təhvil verən:</span> ${escapeHtml(sellerName)}</p>
                    <p><span class="font-bold text-gray-900 w-[90px] inline-block">VÖEN:</span> ${escapeHtml(sellerVoen)}</p>
                </div>
                <div class="space-y-3">
                    <p><span class="font-bold text-gray-900 w-[90px] inline-block">Təhvil alan:</span> ${escapeHtml(buyerName)}</p>
                    <p><span class="font-bold text-gray-900 w-[90px] inline-block">VÖEN:</span> ${escapeHtml(buyerVoen)}</p>
                </div>
            </div>
        </div>

        ${renderDocTitle("Təhvil-Təslim Aktı")}

        <!-- Giriş Mətni -->
        <p class="text-[12px] text-gray-800 leading-relaxed mb-6 text-justify">
            Biz, aşağıda imza edən tərəflər, bu aktı ona görə tərtib etdik ki, "Təhvil verən" tərəfindən aşağıda adları və miqdarı göstərilən məhsullar (işlər, xidmətlər) "Təhvil alan"a təhvil verilmişdir:
        </p>

        <!-- Cədvəl -->
        <div class="mb-6">
            <table>
                <thead class="print-exact">
                    <tr>
                        <th class="text-center w-16">Sıra</th>
                        <th class="text-left">Məhsulun adı və təsviri</th>
                        <th class="text-center w-24">Ölçü vahidi</th>
                        <th class="text-center w-24">Miqdar</th>
                    </tr>
                </thead>
                <tbody class="text-gray-800">${bodyRows}
                </tbody>
            </table>
        </div>

        <!-- Təsdiq Mətni -->
        <p class="text-[12px] text-gray-800 leading-relaxed mb-16 text-justify mt-8">
            Yuxarıda qeyd olunan məhsullar tam, işlək vəziyyətdə, siyahıya və sayına uyğun olaraq qüsursuz təhvil verilmişdir. Təhvil alanın məhsulların kəmiyyəti, keyfiyyəti və komplektasiyası barədə heç bir iddiası yoxdur. Bu akt 2 (iki) nüsxədə tərtib edilmişdir və hər iki tərəf üçün bərabər hüquqi qüvvəyə malikdir.
        </p>

        <!-- İmzalar -->
        <div class="grid grid-cols-2 gap-16 text-[12px] mt-12">
            <!-- Təhvil Verən Blok -->
            <div class="flex flex-col h-full">
                <div class="space-y-3 mb-10">
                    <p><span class="font-bold text-gray-900 w-[90px] inline-block">Təhvil verdi:</span> ${escapeHtml(sellerName)}</p>
                    <p><span class="font-bold text-gray-900 w-[90px] inline-block">Rəhbər:</span> ${escapeHtml(sellerDirector)}</p>
                </div>
                <div class="flex items-end gap-4 mt-auto">
                    <div class="flex-1">
                        <p class="font-bold text-gray-900 mb-1 text-[10px] uppercase tracking-wider">İmza</p>
                        <div class="border-b border-gray-900 w-full"></div>
                    </div>
                    <div class="w-16 h-16 border-2 border-dashed border-gray-400 rounded-full flex items-center justify-center text-gray-400 text-[8px] font-bold shrink-0">
                        M.Y.
                    </div>
                </div>
            </div>
            
            <!-- Təhvil Alan Blok -->
            <div class="flex flex-col h-full">
                <div class="space-y-3 mb-10">
                    <p><span class="font-bold text-gray-900 w-[90px] inline-block">Təhvil aldı:</span> ${escapeHtml(buyerName)}</p>
                    <p><span class="font-bold text-gray-900 w-[90px] inline-block">Səlahiyyətli:</span> ${escapeHtml(buyerAuthorized)}</p>
                </div>
                <div class="flex items-end gap-4 mt-auto">
                    <div class="flex-1">
                        <p class="font-bold text-gray-900 mb-1 text-[10px] uppercase tracking-wider">İmza</p>
                        <div class="border-b border-gray-900 w-full"></div>
                    </div>
                    <div class="w-16 h-16 border-2 border-dashed border-gray-400 rounded-full flex items-center justify-center text-gray-400 text-[8px] font-bold shrink-0">
                        M.Y.
                    </div>
                </div>
            </div>
        </div>

        </div>

        ${renderLetterfoot(state)}

    </div>

</body>
</html>`;
}

export function buildProtocolHtml(state: GeneratorState): string {
  const m = state.meta;
  const buyerName = state.buyer.name?.trim() || "—";
  const sellerName = state.seller.name?.trim() || "—";
  const sellerVoen = state.seller.voen?.trim() || "";
  const buyerVoen = state.buyer.voen?.trim() || "";
  const director = state.seller.director?.trim() || "";

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      Number.isFinite(n) ? n : 0,
    );
  const { subtotal, vatRate, vatAmount, grandTotal } = computeTotals(state);

  const bodyRows =
    state.rows.length === 0
      ? ""
      : state.rows
          .map((r, i) => {
            const lineTotal = (Number(r.qty) || 0) * (Number(r.unitPrice) || 0);
            return `
                    <tr>
                        <td class="text-center">${i + 1}</td>
                        <td>${escapeHtml(r.name)}</td>
                        <td class="text-right font-medium">${fmt(Number(r.unitPrice) || 0)}</td>
                        <td class="text-center">${Number(r.qty) || 0}</td>
                        <td class="text-right font-medium">${fmt(lineTotal)}</td>
                    </tr>`;
          })
          .join("");

  return `<!DOCTYPE html>
<html lang="az">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Qiymət Razılaşdırma Protokolu</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
${printCssDocument({ compact: true })}
    </style>
</head>
<body>

    ${printButton("Sənədi Çap Et")}

    <!-- Sənəd Konteyneri -->
    <div class="page-container">

        ${renderLetterhead(state)}

        <div class="doc-body">

        <!-- Məlumat Hissəsi -->
        <div class="mb-10 text-[12px]">
            <div class="mb-5">
                <p><span class="font-bold text-gray-900 w-16 inline-block">Tarix:</span> ${escapeHtml(formatDateAzLong(m.invoiceDate))}</p>
            </div>
            <div class="grid grid-cols-2 gap-10">
                <div class="space-y-3">
                    <p><span class="font-bold text-gray-900 w-16 inline-block">Satıcı:</span> ${escapeHtml(sellerName)}</p>
                    <p><span class="font-bold text-gray-900 w-16 inline-block">VÖEN:</span> ${escapeHtml(sellerVoen)}</p>
                </div>
                <div class="space-y-3">
                    <p><span class="font-bold text-gray-900 w-16 inline-block">Alıcı:</span> ${escapeHtml(buyerName)}</p>
                    <p><span class="font-bold text-gray-900 w-16 inline-block">VÖEN:</span> ${escapeHtml(buyerVoen)}</p>
                </div>
            </div>
        </div>

        ${renderDocTitle("Qiymət razılaşdırma protokolu")}

        <!-- Giriş Mətni -->
        <p class="text-[12px] text-gray-800 leading-relaxed mb-6 text-justify">
            Bu protokol üzrə tərəflər aşağıda göstərilən məhsulların miqdarı və vahid qiyməti ilə razılaşır. Razılaşdırılmış yekun məbləğ ödəniş və təhvil-təslim üçün əsas hesab olunur.
        </p>

        <!-- Cədvəl -->
        <div class="mb-10">
            <table>
                <thead class="print-exact">
                    <tr>
                        <th class="text-center w-12">Sıra</th>
                        <th class="text-left">Məhsul</th>
                        <th class="text-right w-32">Vahidin qiyməti</th>
                        <th class="text-center w-20">Miqdar</th>
                        <th class="text-right w-36">Cəmi (Ədv-siz)</th>
                    </tr>
                </thead>
                <tbody class="text-gray-800">${bodyRows}
                </tbody>
                <!-- Yekun Hissə -->
                <tfoot class="print-exact text-gray-900">
                    <tr>
                        <td colspan="3" class="border-none-left"></td>
                        <td class="font-bold bg-gray-50 text-[11px] uppercase tracking-wider">Cəmi</td>
                        <td class="text-right font-bold bg-gray-50 text-[11px]">${fmt(subtotal)}</td>
                    </tr>
                    ${vatRate > 0 ? `
                    <tr>
                        <td colspan="3" class="border-none-left"></td>
                        <td class="font-bold bg-gray-50 text-[11px] uppercase tracking-wider">ƏDV ${vatRate.toLocaleString("az-AZ", { maximumFractionDigits: 2 })}%</td>
                        <td class="text-right font-bold bg-gray-50 text-[11px]">${fmt(vatAmount)}</td>
                    </tr>` : ""}
                    <tr>
                        <td colspan="3" class="border-none-left"></td>
                        <td class="font-bold bg-gray-200 text-[12px] uppercase tracking-wider">Yekun</td>
                        <td class="text-right font-bold bg-gray-200 text-[12px]">${fmt(vatRate > 0 ? grandTotal : subtotal)}</td>
                    </tr>
                </tfoot>
            </table>
        </div>

        <!-- İmzalar -->
        <div class="grid grid-cols-2 gap-20 text-[12px] mt-12">
            <!-- Satıcı Blok -->
            <div class="flex flex-col h-full">
                <div class="space-y-3 mb-16">
                    <p><span class="font-bold text-gray-900">Satıcı:</span> ${escapeHtml(sellerName)}</p>
                    ${director ? `<p><span class="font-bold text-gray-900">Direktor:</span> ${escapeHtml(director)}</p>` : ""}
                </div>
                <div class="mt-auto">
                    <p class="font-bold text-gray-900 mb-1">İmza</p>
                    <div class="border-b border-gray-900 w-full"></div>
                </div>
            </div>
            
            <!-- Alıcı Blok -->
            <div class="flex flex-col h-full">
                <div class="space-y-3 mb-16">
                    <p><span class="font-bold text-gray-900">Alıcı:</span> ${escapeHtml(buyerName)}</p>
                </div>
                <div class="mt-auto">
                    <p class="font-bold text-gray-900 mb-1">İmza</p>
                    <div class="border-b border-gray-900 w-full"></div>
                </div>
            </div>
        </div>

        </div>

        ${renderLetterfoot(state)}

    </div>

</body>
</html>`;
}

export function buildPriceQuoteHtml(state: GeneratorState): string {
  const m = state.meta;
  const sellerName = state.seller.name?.trim() || "—";
  const sellerVoen = state.seller.voen?.trim() || "";
  const sellerDirector = state.seller.director?.trim() || "";

  const buyerName = state.buyer.name?.trim() || "—";
  const buyerVoen = state.buyer.voen?.trim() || "";

  const fmt = (n: number) =>
    new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }).format(
      Number.isFinite(n) ? n : 0,
    );
  const { subtotal, vatRate, vatAmount, grandTotal } = computeTotals(state);
  const isCash = vatRate <= 0;
  const finalTotal = isCash ? subtotal : grandTotal;
  const quoteNo = m.quoteNumber?.trim() || "—";
  const subtitle = isCash ? "Nağd hesablaşma" : "Rəsmi təklif — ƏDV ayrıca göstərilir";

  const bodyRows =
    state.rows.length === 0
      ? ""
      : state.rows
          .map((r, i) => {
            const qty = Number(r.qty) || 0;
            const unitPrice = Number(r.unitPrice) || 0;
            const lineTotal = qty * unitPrice;
            const unit = (r.unit || "").trim() || "—";
            return `
                    <tr>
                        <td class="text-center">${i + 1}</td>
                        <td>${escapeHtml(r.name)}</td>
                        <td class="text-center text-gray-500">${escapeHtml(unit)}</td>
                        <td class="text-center">${qty}</td>
                        <td class="text-right font-medium">${fmt(unitPrice)}</td>
                        <td class="text-right font-medium">${fmt(lineTotal)}</td>
                    </tr>`;
          })
          .join("");

  const lineTotalHeader = isCash ? "Cəmi" : "Cəmi (ƏDV-siz)";
  const footRows = isCash
    ? `
                    <tr>
                        <td colspan="4" class="border-none-left"></td>
                        <td class="font-bold bg-gray-200 text-[12px] uppercase tracking-wider">Yekun</td>
                        <td class="text-right font-bold bg-gray-200 text-[12px]">${fmt(finalTotal)}</td>
                    </tr>`
    : `
                    <tr>
                        <td colspan="4" class="border-none-left"></td>
                        <td class="font-bold bg-gray-50 text-[11px] uppercase tracking-wider">Cəmi</td>
                        <td class="text-right font-bold bg-gray-50 text-[11px]">${fmt(subtotal)}</td>
                    </tr>
                    <tr>
                        <td colspan="4" class="border-none-left"></td>
                        <td class="font-bold bg-gray-50 text-[11px] uppercase tracking-wider">ƏDV ${vatRate.toLocaleString("az-AZ", { maximumFractionDigits: 2 })}%</td>
                        <td class="text-right font-bold bg-gray-50 text-[11px]">${fmt(vatAmount)}</td>
                    </tr>
                    <tr>
                        <td colspan="4" class="border-none-left"></td>
                        <td class="font-bold bg-gray-200 text-[12px] uppercase tracking-wider">Yekun</td>
                        <td class="text-right font-bold bg-gray-200 text-[12px]">${fmt(finalTotal)}</td>
                    </tr>`;

  return `<!DOCTYPE html>
<html lang="az">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Qiymət Təklifi</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <style>
${printCssDocument()}
    </style>
</head>
<body>

    ${printButton("Təklifi Çap Et")}

    <div class="page-container">

        ${renderLetterhead(state)}

        <div class="doc-body">

        ${renderDocTitle(`Qiymət Təklifi № ${quoteNo}`, `Tarix: ${formatDateAzLong(m.invoiceDate)} — ${subtitle}`)}

        <div class="mb-8 border border-gray-200 rounded-xl bg-gray-50/60 px-5 py-4 doc-company-panel">
          <div class="grid grid-cols-2 gap-8 text-[10.5px]">
            <div class="min-w-0">
                <h3 class="font-bold text-gray-900 text-[12px] uppercase mb-2 border-b border-gray-200 pb-1">Satıcı</h3>
                <div class="grid grid-cols-[90px_minmax(0,1fr)] gap-y-1 gap-x-3">
                    <div class="font-semibold text-gray-700">Müəssisə</div>
                    <div class="text-gray-900 break-words">${escapeHtml(sellerName)}</div>
                    ${sellerVoen ? `<div class="font-semibold text-gray-700">VÖEN</div><div class="text-gray-900 break-words">${escapeHtml(sellerVoen)}</div>` : ""}
                </div>
            </div>
            <div class="min-w-0">
                <h3 class="font-bold text-gray-900 text-[12px] uppercase mb-2 border-b border-gray-200 pb-1">Alıcı</h3>
                <div class="grid grid-cols-[90px_minmax(0,1fr)] gap-y-1 gap-x-3">
                    <div class="font-semibold text-gray-700">Müəssisə</div>
                    <div class="text-gray-900 break-words">${escapeHtml(buyerName)}</div>
                    ${buyerVoen ? `<div class="font-semibold text-gray-700">VÖEN</div><div class="text-gray-900 break-words">${escapeHtml(buyerVoen)}</div>` : ""}
                </div>
            </div>
          </div>
        </div>

        <div class="mb-6">
            <table>
                <thead class="print-exact">
                    <tr>
                        <th class="text-center w-12">Sıra</th>
                        <th class="text-left">Məhsul / Xidmətin adı</th>
                        <th class="text-center w-16">Ölçü</th>
                        <th class="text-center w-16">Miqdar</th>
                        <th class="text-right w-28">Qiymət (AZN)</th>
                        <th class="text-right w-36">${lineTotalHeader}</th>
                    </tr>
                </thead>
                <tbody class="text-gray-800">${bodyRows}
                </tbody>
                <tfoot class="print-exact text-gray-900">${footRows}
                </tfoot>
            </table>
        </div>

        <div class="mb-12">
            <p class="text-[12px] text-gray-800">
                <span class="font-bold text-gray-900">Məbləğ sözlə:</span> ${escapeHtml(moneyToWordsAz(finalTotal))}.
            </p>
        </div>

        <div class="mt-12 text-[12px] w-1/2">
            <div class="space-y-3 mb-8">
                <p><span class="font-bold text-gray-900">Satıcı:</span> ${escapeHtml(sellerName)}</p>
                ${sellerDirector ? `<p><span class="font-bold text-gray-900">Rəhbər:</span> ${escapeHtml(sellerDirector)}</p>` : ""}
            </div>
            <div class="flex items-end gap-6">
                <div class="flex-1">
                    <p class="font-bold text-gray-900 mb-1">İmza</p>
                    <div class="border-b border-gray-900 w-full"></div>
                </div>
                <div class="w-20 h-20 border-2 border-dashed border-gray-300 rounded-full flex items-center justify-center text-gray-400 text-[10px] font-bold shrink-0">
                    M.Y.
                </div>
            </div>
        </div>

        </div>

        ${renderLetterfoot(state)}

    </div>

</body>
</html>`;
}

export function openPrintableDocument(html: string): boolean {
  const w = window.open("", "_blank");
  if (!w) {
    return false;
  }
  w.document.open();
  w.document.write(html);
  w.document.close();
  const trigger = () => {
    w.focus();
    w.print();
  };
  if (w.document.readyState === "complete") trigger();
  else w.onload = trigger;
  return true;
}

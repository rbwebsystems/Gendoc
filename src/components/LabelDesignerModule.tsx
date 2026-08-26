import { useMemo, useRef, useState } from "react";
import html2pdf from "html2pdf.js";

const LABEL_WIDTH_MM = 100.35;
const LABEL_HEIGHT_MM = 145.35;

type SpecificationRow = {
  id: string;
  value: string;
};

function createSpecification(value = ""): SpecificationRow {
  return { id: crypto.randomUUID(), value };
}

function safeFilename(value: string): string {
  const normalized = value
    .trim()
    .replace(/[^a-zA-Z0-9ƏəÖöÜüĞğŞşÇçİı_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return normalized || "etiket";
}

function displayPrice(value: string): string {
  const normalized = value.trim().replace(/\s/g, "").replace(",", ".");
  const numberValue = Number(normalized);
  if (!normalized || !Number.isFinite(numberValue)) return value.trim() || "0";
  return new Intl.NumberFormat("az-AZ", {
    minimumFractionDigits: Number.isInteger(numberValue) ? 0 : 2,
    maximumFractionDigits: 2,
  }).format(numberValue);
}

export function LabelDesignerModule() {
  const labelRef = useRef<HTMLDivElement>(null);
  const [leftLogo, setLeftLogo] = useState("bakfon");
  const [brand, setBrand] = useState("PHILIPS");
  const [productName, setProductName] = useState("FC-6718/01");
  const [price, setPrice] = useState("399");
  const [currency, setCurrency] = useState("AZN");
  const [specifications, setSpecifications] = useState<SpecificationRow[]>([
    createSpecification("Güc: 18W"),
    createSpecification("Təmizləmə: quru və nəm"),
    createSpecification("Sürət rejim: 2"),
    createSpecification("Başlıq: 3 müxtəlif formalı"),
    createSpecification("Toz qabının həcmi: 0.4lt"),
  ]);
  const [exporting, setExporting] = useState(false);

  const visibleSpecifications = useMemo(
    () => specifications.map((row) => row.value.trim()).filter(Boolean),
    [specifications],
  );

  const patchSpecification = (id: string, value: string) => {
    setSpecifications((rows) => rows.map((row) => (row.id === id ? { ...row, value } : row)));
  };

  const downloadPdf = async () => {
    if (!labelRef.current || exporting) return;
    setExporting(true);
    try {
      await (html2pdf as any)()
        .set({
          margin: 0,
          filename: `${safeFilename(productName)}-etiket.pdf`,
          image: { type: "jpeg", quality: 1 },
          html2canvas: {
            scale: 4,
            useCORS: true,
            letterRendering: true,
            backgroundColor: "#ed1c24",
          },
          jsPDF: {
            unit: "mm",
            format: [LABEL_WIDTH_MM, LABEL_HEIGHT_MM],
            orientation: "portrait",
          },
          pagebreak: { mode: ["avoid-all"] },
        })
        .from(labelRef.current)
        .save();
    } finally {
      setExporting(false);
    }
  };

  const printLabel = () => {
    if (!labelRef.current) return;
    const popup = window.open("", "_blank");
    if (!popup) return;
    popup.document.open();
    popup.document.write(`<!doctype html>
      <html lang="az"><head><meta charset="utf-8"><title>${productName || "Etiket"}</title>
      <style>
        @page { size: ${LABEL_WIDTH_MM}mm ${LABEL_HEIGHT_MM}mm; margin: 0; }
        * { box-sizing: border-box; }
        html, body { margin: 0; width: ${LABEL_WIDTH_MM}mm; height: ${LABEL_HEIGHT_MM}mm; overflow: hidden; }
        ${Array.from(document.styleSheets)
          .map((sheet) => {
            try { return Array.from(sheet.cssRules).map((rule) => rule.cssText).join("\n"); }
            catch { return ""; }
          })
          .join("\n")}
      </style></head><body>${labelRef.current.outerHTML}
      <script>window.addEventListener('load',()=>{window.print();window.close();});<\/script></body></html>`);
    popup.document.close();
  };

  return (
    <div className="dg-label-designer" aria-label="Etiket hazırlama">
      <section className="dg-form-page pg-panel dg-label-designer-form" aria-label="Etiket məlumatları">
        <div className="dg-form-page-body">
          <h2 className="dg-panel-section-title">Etiket məlumatları</h2>
          <div className="dg-label-designer-fields">
            <label className="dg-field">
              <span className="dg-label">Sol loqo mətni</span>
              <input className="dg-input" value={leftLogo} onChange={(event) => setLeftLogo(event.target.value)} />
            </label>
            <label className="dg-field">
              <span className="dg-label">Brend</span>
              <input className="dg-input" value={brand} onChange={(event) => setBrand(event.target.value)} />
            </label>
            <label className="dg-field dg-field-span-full">
              <span className="dg-label">Məhsul adı / model</span>
              <input
                className="dg-input"
                value={productName}
                onChange={(event) => setProductName(event.target.value)}
                placeholder="Məsələn: FC-6718/01"
              />
            </label>
            <label className="dg-field">
              <span className="dg-label">Qiymət</span>
              <input
                className="dg-input"
                inputMode="decimal"
                value={price}
                onChange={(event) => setPrice(event.target.value)}
                placeholder="399"
              />
            </label>
            <label className="dg-field">
              <span className="dg-label">Valyuta</span>
              <input className="dg-input" value={currency} onChange={(event) => setCurrency(event.target.value)} />
            </label>
          </div>

          <div className="dg-label-spec-head">
            <h3 className="dg-panel-section-title dg-panel-section-title--sub">Məhsul göstəriciləri</h3>
            <button
              type="button"
              className="dg-btn dg-btn-secondary dg-btn--compact"
              onClick={() => setSpecifications((rows) => [...rows, createSpecification()])}
              disabled={specifications.length >= 9}
            >
              Sətir əlavə et
            </button>
          </div>
          <div className="dg-label-spec-list">
            {specifications.map((row, index) => (
              <div className="dg-label-spec-row" key={row.id}>
                <span className="dg-label-spec-number">{index + 1}</span>
                <input
                  className="dg-input"
                  value={row.value}
                  onChange={(event) => patchSpecification(row.id, event.target.value)}
                  placeholder="Məsələn: Güc: 18W"
                />
                <button
                  type="button"
                  className="dg-icon-btn dg-icon-btn-danger"
                  aria-label={`${index + 1}-ci göstəricini sil`}
                  onClick={() => setSpecifications((rows) => rows.filter((item) => item.id !== row.id))}
                >
                  ×
                </button>
              </div>
            ))}
          </div>

          <div className="dg-form-footer-actions dg-label-designer-actions">
            <button type="button" className="dg-btn dg-btn-secondary" onClick={printLabel}>
              Çap et
            </button>
            <button type="button" className="dg-btn dg-btn-primary" onClick={() => void downloadPdf()} disabled={exporting}>
              {exporting ? "PDF hazırlanır…" : "PDF hazırla"}
            </button>
          </div>
        </div>
      </section>

      <section className="dg-label-preview-panel" aria-label="Etiket önizləməsi">
        <div className="dg-label-preview-meta">
          <div>
            <h2 className="dg-panel-section-title">Canlı önizləmə</h2>
            <p className="dg-muted">Çıxış ölçüsü: 100.35 × 145.35 mm</p>
          </div>
        </div>
        <div className="dg-label-preview-scroll">
          <div ref={labelRef} className="dg-product-label">
            <div className="dg-product-label-top">
              <div className="dg-product-label-logo">{leftLogo || "Logo"}</div>
              <div className="dg-product-label-brand">{brand || "BREND"}</div>
            </div>
            <div className="dg-product-label-model">{productName || "MƏHSUL ADI"}</div>
            <div
              className={`dg-product-label-specs${visibleSpecifications.length > 5 ? " is-compact" : ""}${visibleSpecifications.length > 7 ? " is-dense" : ""}`}
            >
              {(visibleSpecifications.length > 0 ? visibleSpecifications : ["Məhsul göstəricisi"]).map((value, index) => (
                <div key={`${index}-${value}`} className="dg-product-label-spec">
                  {value}
                </div>
              ))}
            </div>
            <div className="dg-product-label-price-shape" aria-hidden />
            <div className="dg-product-label-price">
              <span>{displayPrice(price)}</span>
              <span className="dg-product-label-currency">{currency || "AZN"}</span>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

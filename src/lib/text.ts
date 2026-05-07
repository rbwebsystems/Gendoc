/** İstifadəçi mətnlərində HTML təhlükəsizliyi */
export function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

export function formatMoney(n: number): string {
  const v = Number.isFinite(n) ? n : 0;
  return (
    new Intl.NumberFormat("az-AZ", {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    }).format(v) + " ₼"
  );
}

export function formatDateAz(iso: string): string {
  if (!iso?.trim()) return "________";
  const d = new Date(iso + "T12:00:00");
  if (Number.isNaN(d.getTime())) return iso;
  const base = d.toLocaleDateString("az-AZ", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
  return `${base}-il`;
}

export function formatDateAzLong(iso: string): string {
  if (!iso?.trim()) return "________";
  // Sabit format: "07 May 2026-cı il"
  // Bəzi brauzerlərdə locale ay adı gözlənilmədən fərqli çıxa bildiyi üçün (məs. "M05"),
  // ay adını ISO-dan əl ilə xəritələyirik.
  const m = iso.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return iso;
  const [, yyyy, mm, dd] = m;
  const monthNames: Record<string, string> = {
    "01": "Yanvar",
    "02": "Fevral",
    "03": "Mart",
    "04": "Aprel",
    "05": "May",
    "06": "İyun",
    "07": "İyul",
    "08": "Avqust",
    "09": "Sentyabr",
    "10": "Oktyabr",
    "11": "Noyabr",
    "12": "Dekabr",
  };
  const mon = monthNames[mm] ?? mm;
  return `${dd} ${mon} ${yyyy}-cı il`;
}

function azOnes(n: number): string {
  const ones = [
    "sıfır",
    "bir",
    "iki",
    "üç",
    "dörd",
    "beş",
    "altı",
    "yeddi",
    "səkkiz",
    "doqquz",
  ];
  return ones[n] ?? "";
}

function azTens(n: number): string {
  const tens = [
    "",
    "on",
    "iyirmi",
    "otuz",
    "qırx",
    "əlli",
    "altmış",
    "yetmiş",
    "səksən",
    "doxsan",
  ];
  return tens[n] ?? "";
}

function numberToWordsAzInt(n: number): string {
  const v = Math.trunc(Math.abs(n));
  if (v === 0) return "sıfır";

  const chunkToWords = (x: number): string => {
    const parts: string[] = [];
    const h = Math.floor(x / 100);
    const t = Math.floor((x % 100) / 10);
    const o = x % 10;
    if (h > 0) {
      if (h === 1) parts.push("yüz");
      else parts.push(`${azOnes(h)} yüz`);
    }
    if (t > 0) parts.push(azTens(t));
    if (o > 0) parts.push(azOnes(o));
    return parts.join(" ").trim();
  };

  const scales: { value: number; label: string }[] = [
    { value: 1_000_000_000, label: "milyard" },
    { value: 1_000_000, label: "milyon" },
    { value: 1_000, label: "min" },
  ];

  let rest = v;
  const out: string[] = [];
  for (const s of scales) {
    if (rest >= s.value) {
      const q = Math.floor(rest / s.value);
      rest = rest % s.value;
      if (s.label === "min" && q === 1) out.push("min");
      else out.push(`${chunkToWords(q)} ${s.label}`.trim());
    }
  }
  if (rest > 0) out.push(chunkToWords(rest));
  return out.join(" ").replace(/\s+/g, " ").trim();
}

export function moneyToWordsAz(amount: number): string {
  const v = Number.isFinite(amount) ? amount : 0;
  const sign = v < 0 ? "mənfi " : "";
  const abs = Math.abs(v);
  const manat = Math.floor(abs + 1e-9);
  const qepik = Math.round((abs - manat) * 100 + 1e-9);
  const manatWords = numberToWordsAzInt(manat);
  const qepikWords = numberToWordsAzInt(qepik);
  return `${sign}${manatWords} manat ${qepikWords} qəpik`;
}

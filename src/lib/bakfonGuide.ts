export type BakfonGuideCashback = {
  label: string;
  value: string;
};

export type BakfonGuideSection = {
  retailTitle: string;
  retailItems: string[];
  creditTerm: string;
  creditRate: string;
  postBank?: string;
  postRates?: string[];
  postCashbacks?: BakfonGuideCashback[];
  postNote?: string;
};

export const BAKFON_GUIDE_SECTIONS: BakfonGuideSection[] = [
  {
    retailTitle: "1 Mobil telefonlar 12 aya qədər",
    retailItems: [
      "1.1 Nağd və taksit Bazar alış qiyməti + 17%",
      "1.2 İkinci əl Telefonlar Bazar alış + 20%",
    ],
    creditTerm: "1-6 ay",
    creditRate: "0%",
    postBank: "ABB",
    postRates: ["1.1. ABB-1%", "1.2. D.b.k- 1.5%", "1.3. X.b.k-2.5%"],
    postCashbacks: [{ label: "KEŞBEK", value: "5%" }],
    postNote: "ABB Kartı ilə ABB terminalında",
  },
  {
    retailTitle: "2 Məişət texnikası, Aksessuar, Ofis avadanlığı 18 aya qədər",
    retailItems: [
      "2.1. 15 AZN-ə qədər Maya+150%",
      "2.2 60 Azn-ə qədər Maya+70%",
      "2.3 60-90 Azn arası-Maya +50%",
      "2.4 90 azn üzəri- Maya +30%",
    ],
    creditTerm: "6-12 ay",
    creditRate: "10%",
    postBank: "KAPİTAL",
    postRates: ["2.1. Kapital- 1,5%", "2.2. D.b.k- 2%", "2.3. X.b.k - 3%"],
    postCashbacks: [
      { label: "KEŞBEK", value: "5%" },
      { label: "UMİCO", value: "2%" },
    ],
    postNote: "Kapital kartı və M10 birmarket varsa keçərlidir",
  },
  {
    retailTitle: "3 Korporativ Satışlar",
    retailItems: ["3.1 Maya+10%", "3.2 XKİ-35%", "3.3 ATİAHİRK- 30%"],
    creditTerm: "12-18 ay",
    creditRate: "15%",
  },
];

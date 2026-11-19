// Zakat arithmetic, kept free of any page code so tests/giving.test.mjs can check it directly.
// Where the schools differ, the caller passes the user's choice (see RULES for the sources shown in the app).

export const GRAMS_PER_TROY_OUNCE = 31.1034768;
export const NISAB_GRAMS = { gold: 85, silver: 595 };
export const RATE = { lunar: 0.025, solar: 0.02577 };

// The sources shown beside each choice in the app.
export const RULES = {
  nisab: {
    title: "Nisab: silver or gold",
    text: "Zakat is due on wealth that has stayed at or above the nisab for a lunar year. The nisab is 595 g of silver or 85 g of gold. The Hanafi school uses silver; the other schools use gold. Silver gives a lower threshold, so more people pay and more reaches the poor. Some scholars prefer gold in wealthier countries.",
    sources: [["Islamic Relief: Nisab", "https://islamicrelief.org.au/our-work/islamic-giving/nisab/"], ["SeekersGuidance: gold or silver standard?", "https://seekersguidance.org/uncategorized/should-the-minimum-zakatable-amount-be-measured-by-the-gold-or-silver-standards"]]
  },
  jewellery: {
    title: "Jewellery you wear",
    text: "In the Hanafi school, gold and silver jewellery is zakatable even if worn. The Maliki, Shafi'i and Hanbali schools exempt permissible jewellery kept for wearing (excessive amounts can still be zakatable).",
    sources: [["Rulings about zakat in the four madhhabs", "https://myreligionislam.com/detail.asp?Aid=6422"], ["AskImam: zakat on worn gold jewellery", "https://islamqa.org/hanafi/askimam/985/i-heard-that-only-hanafi-fiqh-zakath-on-gold-jewellery-for-the-purpose-of-wearing-of-women-is-to-be-given-and-the-other-three-fiqh-no-need-for-zakath-on-gold-jewellery/"]]
  },
  debts: {
    title: "Debts",
    text: "In the Hanafi school, debts are deducted before zakat is worked out. In the Shafi'i school, they are not.",
    sources: [["Rulings about zakat in the four madhhabs", "https://myreligionislam.com/detail.asp?Aid=6422"]]
  },
  shares: {
    title: "Shares and funds",
    text: "Shares held to sell (trading) are zakatable at their full market value. For long-term holdings, the Fiqh Council of North America's method is 2.5% of your share of the companies' zakatable assets; if you can't find that, many scholars accept the full market value as a precaution.",
    sources: [["AMJA: zakat on stocks", "https://www.amjaonline.org/fatwa/en/3625/how-to-pay-zakat-al-mal-on-stocks"], ["Human Appeal USA: what the scholars say", "https://humanappealusa.org/news/2026/7/zakat-on-stocks-and-investments-what-the-scholars-say"]]
  },
  retirement: {
    title: "401(k), IRA and pensions",
    text: "AMJA and the Fiqh Council of North America: pay each year on the amount you could withdraw, after the early-withdrawal penalty and tax. Other scholars hold that zakat is due only once the money is withdrawn.",
    sources: [["AMJA: zakat on a 401(k)", "https://www.amjaonline.org/fatwa/en/21964/zakat-on-401k-or-retirement-plan"], ["AMJA: zakat on 401(k) shares", "https://www.amjaonline.org/fatwa/en/3625/how-to-pay-zakat-al-mal-on-stocks"]]
  },
  year: {
    title: "Lunar or solar year",
    text: "Zakat is due once a lunar (Hijri) year has passed. Under the AAOIFI standards a solar year may be used instead, at 2.577% to make up for its extra 11 days. NZF advises the lunar year.",
    sources: [["NZF: can a solar year be used?", "https://nzf.org.uk/knowledge/can-a-solar-year-be-used-for-zakat-calculation/"]]
  },
  fitr: {
    title: "Zakat al-fitr and fidyah",
    text: "Zakat al-fitr is due for every member of the household and is given before the Eid prayer. Fidyah is paid for each day of Ramadan a person can't fast and won't be able to make up. The Fiqh Council of North America's amounts for 2026 are $10 per person for zakat al-fitr and $15 per day for fidyah. Elsewhere, ask your local masjid.",
    sources: [["Fiqh Council of North America: fidyah and zakat al-fitr", "https://fiqhcouncil.org/fidyah-and-zakat-al-fitr/"]]
  }
};
export const FITR_DEFAULTS = { usd: { fitr: 10, fidyah: 15, year: 2026, by: "Fiqh Council of North America" } };

const num = v => { const n = typeof v === "number" ? v : parseFloat(String(v ?? "").replace(/,/g, "")); return Number.isFinite(n) && n > 0 ? n : 0; };

// prices: { goldGram, silverGram } in the user's currency.
// v: the amounts the user entered (see FIELDS in giving.js). opts: the user's choices.
// Returns every line of the working, the nisab, and the zakat due.
export function computeZakat(v, prices, opts) {
  const o = { nisab: "silver", jewellery: "exclude", debts: "deduct", longTerm: "full", retirement: "accessible", year: "lunar", ...opts };
  const gp = num(prices && prices.goldGram), sp = num(prices && prices.silverGram);
  const pureGold = g => num(g.grams) * Math.min(24, num(g.karat) || 24) / 24;
  const lines = [];
  const add = (key, label, amount, note) => { if (amount > 0) lines.push({ key, label, amount, note }); };

  add("cash", "Cash and bank accounts", num(v.cash));
  add("owed", "Money owed to you", num(v.owed));
  const goldG = pureGold({ grams: v.goldGrams, karat: v.goldKarat });
  const goldJewelG = o.jewellery === "include" ? pureGold({ grams: v.goldJewelGrams, karat: v.goldJewelKarat }) : 0;
  add("gold", "Gold", (goldG + goldJewelG) * gp, `${round2(goldG + goldJewelG)} g of pure gold`);
  const silverG = num(v.silverGrams) + (o.jewellery === "include" ? num(v.silverJewelGrams) : 0);
  add("silver", "Silver", silverG * sp, `${round2(silverG)} g`);
  add("trading", "Shares held to sell", num(v.trading));
  add("longTerm", "Long-term shares and funds", o.longTerm === "full" ? num(v.longTerm) : num(v.longTermZakatable),
    o.longTerm === "full" ? "full market value" : "your share of the companies' zakatable assets");
  if (o.retirement === "accessible") {
    const cut = Math.min(100, num(v.retirementCut)) / 100;
    add("retirement", "Retirement accounts", num(v.retirement) * (1 - cut), cut ? `after ${round2(cut * 100)}% penalty and tax` : "");
  }
  add("crypto", "Crypto", num(v.crypto));
  add("business", "Business stock and cash", num(v.business));
  add("other", "Other zakatable wealth", num(v.other));

  const gross = sum(lines.map(l => l.amount));
  const debts = o.debts === "deduct" ? Math.min(gross, num(v.debts)) : 0;
  const net = Math.max(0, gross - debts);
  const nisabPrice = o.nisab === "gold" ? gp : sp;
  const nisab = nisabPrice ? NISAB_GRAMS[o.nisab] * nisabPrice : null;
  const due = nisab != null && net >= nisab && net > 0;
  const rate = RATE[o.year] || RATE.lunar;
  return { lines, gross, debts, net, nisab, nisabGrams: NISAB_GRAMS[o.nisab], metal: o.nisab, due, rate, zakat: due ? net * rate : 0, missingPrice: nisab == null };
}

// From the feed: 1 troy ounce of gold in each currency, and how many ounces of silver buy one of gold.
export function pricesFromFeed(xau, currency) {
  const oz = xau && Number(xau[currency]), ratio = xau && Number(xau.xag);
  if (!(oz > 0) || !(ratio > 0)) return null;
  return { goldGram: oz / GRAMS_PER_TROY_OUNCE, silverGram: oz / ratio / GRAMS_PER_TROY_OUNCE };
}

export const sum = a => a.reduce((s, x) => s + x, 0);
const round2 = x => Math.round(x * 100) / 100;

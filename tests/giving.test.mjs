// Checks the zakat arithmetic in giving-calc.js with hand-worked cases.
import { computeZakat, pricesFromFeed, NISAB_GRAMS, GRAMS_PER_TROY_OUNCE } from "../giving-calc.js";

let checks = 0, failures = 0;
const near = (a, b, what, eps = 0.005) => { checks++; if (Math.abs(a - b) > eps) { failures++; console.error(`FAIL - ${what}: expected ${b}, got ${a}`); } };
const is = (a, b, what) => { checks++; if (a !== b) { failures++; console.error(`FAIL - ${what}: expected ${JSON.stringify(b)}, got ${JSON.stringify(a)}`); } };

// Round prices make the working easy to follow: gold $100/g, silver $1.50/g.
const P = { goldGram: 100, silverGram: 1.5 };
is(NISAB_GRAMS.gold, 85, "gold nisab 85 g"); is(NISAB_GRAMS.silver, 595, "silver nisab 595 g");

// 1. Savings only, silver nisab: 595 × 1.50 = 892.50
let r = computeZakat({ cash: 10000 }, P, {});
near(r.nisab, 892.5, "silver nisab value"); is(r.due, true, "above nisab"); near(r.zakat, 250, "2.5% of 10,000");
// 2. Same savings, gold nisab: 85 × 100 = 8,500, still above
r = computeZakat({ cash: 10000 }, P, { nisab: "gold" });
near(r.nisab, 8500, "gold nisab value"); near(r.zakat, 250, "still 250");
// 3. 5,000 is above the silver nisab but below the gold one
is(computeZakat({ cash: 5000 }, P, { nisab: "silver" }).due, true, "5,000 owes zakat by silver");
is(computeZakat({ cash: 5000 }, P, { nisab: "gold" }).due, false, "5,000 owes nothing by gold");
is(computeZakat({ cash: 5000 }, P, { nisab: "gold" }).zakat, 0, "no zakat below nisab");
// 4. Exactly at nisab is due
is(computeZakat({ cash: 892.5 }, P, {}).due, true, "at nisab counts");
// 5. Gold by karat: 30 g of 18k = 22.5 g pure = 2,250
r = computeZakat({ goldGrams: 30, goldKarat: 18 }, P, {});
near(r.lines.find(l => l.key === "gold").amount, 2250, "18k gold valued by its pure gold");
// 6. Worn jewellery: counted only with the Hanafi choice
const jewel = { cash: 1000, goldJewelGrams: 20, goldJewelKarat: 22, silverJewelGrams: 100 };
near(computeZakat(jewel, P, { jewellery: "exclude" }).gross, 1000, "jewellery left out");
near(computeZakat(jewel, P, { jewellery: "include" }).gross, 1000 + 20 * 22 / 24 * 100 + 150, "jewellery included (20 g 22k + 100 g silver)");
// 7. Debts: deducted only with the Hanafi choice, never below zero
near(computeZakat({ cash: 10000, debts: 4000 }, P, { debts: "deduct" }).zakat, 150, "6,000 after debts");
near(computeZakat({ cash: 10000, debts: 4000 }, P, { debts: "keep" }).zakat, 250, "debts not deducted");
near(computeZakat({ cash: 1000, debts: 4000 }, P, { debts: "deduct" }).net, 0, "debts can't make wealth negative");
// 8. Retirement: accessible after 30% penalty and tax, or not counted
near(computeZakat({ retirement: 100000, retirementCut: 30 }, P, { retirement: "accessible" }).zakat, 1750, "70,000 accessible");
near(computeZakat({ cash: 2000, retirement: 100000, retirementCut: 30 }, P, { retirement: "withdrawn" }).zakat, 50, "retirement left until withdrawn");
// 9. Long-term shares: full value, or the zakatable part the user found
near(computeZakat({ longTerm: 40000, longTermZakatable: 12000 }, P, { longTerm: "full" }).zakat, 1000, "full market value");
near(computeZakat({ longTerm: 40000, longTermZakatable: 12000 }, P, { longTerm: "portion" }).zakat, 300, "zakatable portion");
// 10. Solar year rate
near(computeZakat({ cash: 10000 }, P, { year: "solar" }).zakat, 257.7, "2.577% for a solar year");
// 11. Everything together
r = computeZakat({ cash: "1,200", owed: 300, silverGrams: 200, trading: 500, crypto: 250, business: 750, other: 0 }, P, {});
near(r.gross, 1200 + 300 + 300 + 500 + 250 + 750, "sum of every line, with a comma in the input");
near(r.zakat, 3300 * 0.025, "zakat on the total");
// 12. Nonsense input is ignored
near(computeZakat({ cash: -500, owed: "abc" }, P, {}).gross, 0, "negative and non-numbers count as zero");
// 13. No price yet: no nisab, nothing due
r = computeZakat({ cash: 10000 }, {}, {});
is(r.missingPrice, true, "reports the missing price"); is(r.due, false, "can't decide without a price");

// Feed conversion: 1 oz gold = 3,110.35 (so 100/g) and 1 oz gold = 80 oz silver (1.25/g)
const p = pricesFromFeed({ usd: 100 * GRAMS_PER_TROY_OUNCE, xag: 80 }, "usd");
near(p.goldGram, 100, "gold per gram from ounces"); near(p.silverGram, 1.25, "silver per gram from the gold/silver ratio");
is(pricesFromFeed({ usd: 3000 }, "usd"), null, "no silver ratio: no prices");
is(pricesFromFeed({ xag: 80 }, "cad"), null, "currency missing: no prices");

if (failures) { console.error(`FAIL: ${failures} of ${checks} zakat checks`); process.exit(1); }
console.log(`ok - ${checks} zakat checks pass`);

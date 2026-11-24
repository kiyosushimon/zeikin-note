/* 賞与の手取り計算エンジン
 * 仕様: ~/workspace/notes/tax-tools-spec-04-bonus.md
 * データ: data/kenpo/rates-2026.json（協会けんぽ料率・等級表）
 *         data/bonus/bonus-rate-table-2026.json（算出率の表・令和8年分）
 *         data/bonus/monthly-table-2026.json（月額表・令和8年分、国税庁Excelから変換）
 * 金額の端数処理は浮動小数点誤差を避けるため整数演算（率を10万分率の整数化）で行う。
 */
(function (global) {
'use strict';

var HEALTH_CAP = 5730000;   // 健康保険の標準賞与額の年度累計上限（§1.4）
var PENSION_CAP = 1500000;  // 厚生年金の標準賞与額の上限（1か月あたり。§1.4）
var PENSION_RATE_PCT = 18.3; // 厚生年金保険料率（§1.6）
// 雇用保険の労働者負担率（令和8年度。§1.7）: 率（%）
var EMPLOYMENT_RATES = { general: 0.5, nourin: 0.6, kensetsu: 0.6 };

function floor1000(n) { return Math.floor(n / 1000) * 1000; }

/* 率（%）→ 10万分率の整数（例: 8.168% → 8168） */
function per100k(ratePct) { return Math.round(ratePct * 1000); }

/* 保険料の本人負担分の端数処理（§1.8）:
 * 「標準賞与額 × 料率」の折半額について、端数が50銭以下の場合は切り捨て、
 * 50銭を超える場合は切り上げる。雇用保険（折半なし）も同じ規則
 * （50銭以下切り捨て・50銭1厘以上切り上げ）。
 * num/den の有理数として正確に判定する。 */
function roundPremium(num, den) {
  var q = Math.floor(num / den);
  var r = num - q * den;
  return (2 * r > den) ? q + 1 : q;
}
/* 折半あり: 本人負担 = round(金額 × 料率 / 2) */
function premiumHalf(amount, ratePct) {
  return roundPremium(amount * per100k(ratePct), 200000);
}
/* 折半なし（雇用保険）: 本人負担 = round(金額 × 料率) */
function premiumFull(amount, ratePct) {
  return roundPremium(amount * per100k(ratePct), 100000);
}

/* ---------- 月額表（§1.3） ---------- */
/* column: 'kou' | 'otsu', dependents: 扶養親族等の数（甲欄のみ使用） */
function monthlyTax(table, amount, column, dependents) {
  amount = Math.floor(+amount || 0);
  if (amount < 0) amount = 0;
  var dep = Math.min(Math.max(dependents | 0, 0), 7);
  var tax;
  if (amount < table.under_min.limit) {
    tax = column === 'kou' ? table.under_min.kou_tax : Math.floor(amount * table.under_min.otsu_rate);
  } else if (amount < 740000) {
    var row = null;
    for (var i = 0; i < table.rows.length; i++) {
      if (amount >= table.rows[i].min && amount < table.rows[i].max) { row = table.rows[i]; break; }
    }
    tax = column === 'kou' ? row.kou[dep] : row.otsu;
  } else {
    var segs = column === 'kou' ? table.over.kou_segments : table.over.otsu_segments;
    var seg = segs[0];
    for (var j = 0; j < segs.length; j++) { if (segs[j].from <= amount) seg = segs[j]; }
    var base = column === 'kou' ? seg.base_tax[dep] : seg.base_tax;
    tax = base + Math.floor((amount - seg.from) * seg.rate);
  }
  if (column === 'kou' && dependents > 7) {
    tax = Math.max(0, tax - table.per_dependent_over7 * (dependents - 7));
  }
  return tax;
}

/* ---------- 算出率の表（§1.2） ---------- */
/* 戻り値: { ratePct, lowerYen, upperYen|null } */
function bonusRate(rateTable, column, dependents, prevAfterYen) {
  var amountThousand = Math.floor(prevAfterYen / 1000);
  var i, bounds, ratePct;
  if (column === 'otsu') {
    var bands = rateTable.otsu_bands;
    var band = bands[0];
    for (i = 0; i < bands.length; i++) { if (bands[i].lower_thousand <= amountThousand) band = bands[i]; }
    var idx = bands.indexOf(band);
    return {
      ratePct: band.rate_percent,
      lowerYen: band.lower_thousand * 1000,
      upperYen: idx + 1 < bands.length ? bands[idx + 1].lower_thousand * 1000 : null
    };
  }
  var depKey = String(Math.min(Math.max(dependents | 0, 0), 7));
  bounds = rateTable.kou_lower_thousand[depKey];
  var bi = 0;
  for (i = 0; i < bounds.length; i++) { if (bounds[i] <= amountThousand) bi = i; }
  ratePct = rateTable.rates_percent[bi];
  return {
    ratePct: ratePct,
    lowerYen: bounds[bi] * 1000,
    upperYen: bi + 1 < bounds.length ? bounds[bi + 1] * 1000 : null
  };
}

/* ---------- 所得税（§1.2・§1.3） ---------- */
/* input: { bonusAfter, prevAfter (null=前月給与なし), column, dependents, divisor (6|12) }
 * 戻り値: { tax, method: 'rate'|'monthly-none'|'monthly-over10', rateInfo, monthly: {...} } */
function incomeTax(data, input) {
  var bonusAfter = Math.max(0, Math.floor(input.bonusAfter));
  var column = input.column, dependents = input.dependents | 0;
  var d = input.divisor === 12 ? 12 : 6;
  var prev = (input.prevAfter === null || input.prevAfter === undefined) ? null : Math.floor(input.prevAfter);

  if (prev === null || prev <= 0) {
    var divided1 = Math.floor(bonusAfter / d);
    var t1 = monthlyTax(data.monthlyTable, divided1, column, dependents);
    return {
      tax: t1 * d, method: 'monthly-none', divisor: d,
      monthly: { divided: divided1, dividedTax: t1 }
    };
  }
  if (bonusAfter > prev * 10) {
    var divided2 = Math.floor(bonusAfter / d);
    var combined = divided2 + prev;
    var tComb = monthlyTax(data.monthlyTable, combined, column, dependents);
    var tPrev = monthlyTax(data.monthlyTable, prev, column, dependents);
    return {
      tax: (tComb - tPrev) * d, method: 'monthly-over10', divisor: d,
      monthly: { divided: divided2, combined: combined, combinedTax: tComb, prevTax: tPrev }
    };
  }
  var ri = bonusRate(data.rateTable, column, dependents, prev);
  var tax = Math.floor(bonusAfter * per100k(ri.ratePct) / 100000);
  return { tax: tax, method: 'rate', rateInfo: ri };
}

/* ---------- 方式(c): 前月の社会保険料等を等級表から計算（§2.1(c)） ---------- */
function prevMonthInsurance(kenpo, prefName, ageBand, industry, employmentInsured, prevGross) {
  var pref = kenpo.prefectures[prefName];
  var grade = null;
  for (var i = 0; i < kenpo.grade_table.length; i++) {
    var g = kenpo.grade_table[i];
    if (prevGross >= g.range_min && (g.range_max === null || prevGross < g.range_max)) { grade = g; break; }
  }
  if (!grade) grade = kenpo.grade_table[kenpo.grade_table.length - 1];
  var std = grade.standard;
  var withCare = ageBand === '40to64';
  var health = premiumHalf(std, pref.health_rate * 100);
  var child = premiumHalf(std, pref.child_rate * 100);
  var care = withCare ? premiumHalf(std, pref.care_rate * 100) : 0;
  var pension = premiumHalf(std, PENSION_RATE_PCT);
  var employment = employmentInsured ? premiumFull(prevGross, EMPLOYMENT_RATES[industry]) : 0;
  return {
    standard: std, grade: grade.grade,
    health: health, child: child, care: care, pension: pension, employment: employment,
    total: health + child + care + pension + employment
  };
}

/* ---------- 全体計算（§3） ---------- */
/* input: {
 *   gross, prefecture, ageBand ('under40'|'40to64'|'65over'),
 *   industry ('general'|'nourin'|'kensetsu'), employmentInsured (bool),
 *   column ('kou'|'otsu'), dependents,
 *   prevMode ('after'|'grossAndInsurance'|'grossOnly'|'none'),
 *   prevAfter, prevGross, prevInsurance,
 *   periodOver6 (bool), cumulativeBonus (B9)
 * } */
function compute(data, input) {
  var gross = Math.max(0, Math.floor(+input.gross || 0));
  var pref = data.kenpo.prefectures[input.prefecture];
  var withCare = input.ageBand === '40to64';
  var cumulative = Math.max(0, Math.floor(+input.cumulativeBonus || 0));

  var stdGross = floor1000(gross);
  var stdHealth = Math.max(0, Math.min(stdGross, HEALTH_CAP - cumulative));
  var stdPension = Math.min(stdGross, PENSION_CAP);

  var health = premiumHalf(stdHealth, pref.health_rate * 100);
  var care = withCare ? premiumHalf(stdHealth, pref.care_rate * 100) : 0;
  var child = premiumHalf(stdHealth, pref.child_rate * 100);
  var pension = premiumHalf(stdPension, PENSION_RATE_PCT);
  var employment = input.employmentInsured ? premiumFull(gross, EMPLOYMENT_RATES[input.industry]) : 0;
  var socialTotal = health + care + child + pension + employment;

  var bonusAfter = gross - socialTotal;

  // 前月控除後給与の決定（§2.1）
  var prevAfter = null, prevComputed = null;
  if (input.prevMode === 'after') {
    prevAfter = Math.floor(+input.prevAfter || 0);
  } else if (input.prevMode === 'grossAndInsurance') {
    prevAfter = Math.floor(+input.prevGross || 0) - Math.floor(+input.prevInsurance || 0);
  } else if (input.prevMode === 'grossOnly') {
    prevComputed = prevMonthInsurance(data.kenpo, input.prefecture, input.ageBand, input.industry, input.employmentInsured, Math.floor(+input.prevGross || 0));
    prevAfter = Math.floor(+input.prevGross || 0) - prevComputed.total;
  }

  var tax = incomeTax(data, {
    bonusAfter: bonusAfter,
    prevAfter: input.prevMode === 'none' ? null : prevAfter,
    column: input.column, dependents: input.dependents,
    divisor: input.periodOver6 ? 12 : 6
  });

  return {
    gross: gross,
    standardHealth: stdHealth, standardPension: stdPension,
    healthCapped: stdGross > stdHealth, pensionCapped: stdGross > stdPension,
    health: health, care: care, child: child, pension: pension, employment: employment,
    socialTotal: socialTotal,
    bonusAfter: bonusAfter,
    prevAfter: input.prevMode === 'none' ? null : prevAfter,
    prevComputed: prevComputed,
    taxMethod: tax.method, rateInfo: tax.rateInfo || null, monthly: tax.monthly || null,
    divisor: tax.divisor || (input.periodOver6 ? 12 : 6),
    incomeTax: tax.tax,
    net: gross - socialTotal - tax.tax
  };
}

var api = {
  compute: compute, incomeTax: incomeTax, monthlyTax: monthlyTax, bonusRate: bonusRate,
  prevMonthInsurance: prevMonthInsurance, premiumHalf: premiumHalf, premiumFull: premiumFull,
  EMPLOYMENT_RATES: EMPLOYMENT_RATES, HEALTH_CAP: HEALTH_CAP, PENSION_CAP: PENSION_CAP
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.BonusEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* 社会保険料計算エンジン
 * 仕様: ~/workspace/notes/tax-tools-spec-06-shaho.md
 * データ: data/kenpo/rates-2026.json（協会けんぽ料率・健康保険の等級表）
 *         data/shaho/params-2026.json（厚生年金等級表・雇用保険労使料率・標準賞与額の上限）
 * 金額の端数処理は浮動小数点誤差を避けるため整数演算（率を10万分率の整数化）で行う。
 */
(function (global) {
'use strict';

/* 率（小数。例: 0.0985）→ 10万分率の整数（例: 9850） */
function per100k(rateDecimal) { return Math.round(rateDecimal * 100000); }

function floor1000(n) { return Math.floor(n / 1000) * 1000; }

/* 保険料の本人負担分の端数処理（§1.7）:
 * 折半額について、端数が50銭以下の場合は切り捨て、50銭を超える場合は切り上げる。
 * 雇用保険（折半なし）も同じ規則（50銭以下切り捨て・50銭1厘以上切り上げ）。
 * num/den の有理数として正確に判定する。 */
function roundPremium(num, den) {
  var q = Math.floor(num / den);
  var r = num - q * den;
  return (2 * r > den) ? q + 1 : q;
}
/* 折半あり: 本人負担 = round(金額 × 料率 / 2) */
function premiumHalf(amount, rateDecimal) {
  return roundPremium(amount * per100k(rateDecimal), 200000);
}
/* 折半なし（雇用保険の本人負担）: 本人負担 = round(金額 × 料率) */
function premiumFull(amount, rateDecimal) {
  return roundPremium(amount * per100k(rateDecimal), 100000);
}

/* 折半項目の内訳（§1.7）:
 * 総額は「基礎額 × 料率」の1円未満を切り捨てた額とし、会社負担 ＝ 総額 − 本人負担。
 * これにより本人負担＋会社負担＝総額が常に一致する。 */
function splitPremium(base, rateDecimal) {
  var k = per100k(rateDecimal);
  var total = Math.floor(base * k / 100000);
  var insured = roundPremium(base * k, 200000);
  return { total: total, insured: insured, employer: total - insured };
}
function zeroSplit() { return { total: 0, insured: 0, employer: 0 }; }

/* 報酬月額 → 等級の当てはめ（kenpo-engine.js の gradeFromSalary と同じロジック。§1.10） */
function gradeFromSalary(table, monthlySalary) {
  for (var i = 0; i < table.length; i++) {
    var g = table[i];
    if (monthlySalary >= g.range_min && (g.range_max === null || monthlySalary < g.range_max)) return g;
  }
  return table[table.length - 1];
}
/* 標準報酬月額の額そのものから等級を引く（直接入力方式の表示用） */
function gradeFromStandard(table, standard) {
  for (var i = 0; i < table.length; i++) {
    if (table[i].standard === standard) return table[i];
  }
  return null;
}

/* ---------- 月給分の項目別計算（基礎額が決まれば月給・賞与で共通。§3 手順3〜6） ---------- */
function insuredItems(pref, params, stdHealth, stdPension, withCare) {
  return {
    health: splitPremium(stdHealth, pref.health_rate),
    care: withCare ? splitPremium(stdHealth, pref.care_rate) : zeroSplit(),
    child: splitPremium(stdHealth, pref.child_rate),
    pension: splitPremium(stdPension, params.pension_rate)
  };
}
/* 雇用保険（§1.6・§1.7）: 本人は控除時の端数規則、会社は1円未満切り捨て */
function employmentItem(params, industry, insured, wageTotal) {
  if (!insured) return { insured: 0, employer: 0 };
  var r = params.employment_rates[industry];
  return {
    insured: premiumFull(wageTotal, r.worker_rate),
    employer: Math.floor(wageTotal * per100k(r.employer_rate) / 100000)
  };
}
function addEmployment(items, emp) {
  items.employment = { total: emp.insured + emp.employer, insured: emp.insured, employer: emp.employer };
  return items;
}
function totals(items) {
  var keys = ['health', 'care', 'child', 'pension', 'employment'];
  var t = { total: 0, insured: 0, employer: 0 };
  keys.forEach(function (k) {
    t.total += items[k].total; t.insured += items[k].insured; t.employer += items[k].employer;
  });
  return t;
}

/* ---------- 全体計算（§3） ---------- */
/* input: {
 *   prefecture, ageBand ('under40'|'40to64'|'65to69'),
 *   salaryMode ('gross'|'direct'), gross (月給の総支給額), directStandard (方式(b)の標準報酬月額),
 *   bonusGross (賞与の総支給額・1回あたり), bonusCount (0〜3),
 *   industry ('general'|'nourin'|'kensetsu'), employmentInsured (bool),
 *   cumulativeBonus (S7: 今年度すでに支払われた賞与の標準賞与額の累計)
 * } */
function compute(data, input) {
  var pref = data.kenpo.prefectures[input.prefecture];
  var params = data.params;
  var withCare = input.ageBand === '40to64';
  var gross = Math.max(0, Math.floor(+input.gross || 0));
  var bonusGross = Math.max(0, Math.floor(+input.bonusGross || 0));
  var bonusCount = Math.min(Math.max(input.bonusCount | 0, 0), 3);
  var cumulative = Math.max(0, Math.floor(+input.cumulativeBonus || 0));

  /* 月給分（§3 手順1〜7） */
  var stdHealth, healthGrade, stdPension, pensionGrade, pensionClamped = null;
  if (input.salaryMode === 'direct') {
    stdHealth = Math.max(0, Math.floor(+input.directStandard || 0));
    var hg = gradeFromStandard(data.kenpo.grade_table, stdHealth);
    healthGrade = hg ? hg.grade : null;
    var clamped = Math.min(Math.max(stdHealth, params.pension_grade_table[0].standard),
                           params.pension_grade_table[params.pension_grade_table.length - 1].standard);
    if (clamped !== stdHealth) pensionClamped = clamped;
    var pg = gradeFromSalary(params.pension_grade_table, clamped);
    stdPension = pg.standard;
    pensionGrade = pg.grade;
  } else {
    var hg2 = gradeFromSalary(data.kenpo.grade_table, gross);
    stdHealth = hg2.standard; healthGrade = hg2.grade;
    var pg2 = gradeFromSalary(params.pension_grade_table, gross);
    stdPension = pg2.standard; pensionGrade = pg2.grade;
  }
  var monthlyItems = insuredItems(pref, params, stdHealth, stdPension, withCare);
  addEmployment(monthlyItems, employmentItem(params, input.industry, input.employmentInsured, gross));
  var monthly = {
    standardHealth: stdHealth, healthGrade: healthGrade,
    standardPension: stdPension, pensionGrade: pensionGrade,
    pensionClamped: pensionClamped,
    items: monthlyItems, totals: totals(monthlyItems)
  };

  /* 賞与分（§3 手順8〜11） */
  var stdBonusGross = floor1000(bonusGross);
  var stdBonusHealth = Math.max(0, Math.min(stdBonusGross, params.bonus_caps.health_annual - cumulative));
  var stdBonusPension = Math.min(stdBonusGross, params.bonus_caps.pension_per_month);
  var bonusItems = insuredItems(pref, params, stdBonusHealth, stdBonusPension, withCare);
  addEmployment(bonusItems, employmentItem(params, input.industry, input.employmentInsured, bonusGross));
  var bonus = {
    standardHealth: stdBonusHealth, standardPension: stdBonusPension,
    healthCapped: stdBonusGross > stdBonusHealth, pensionCapped: stdBonusGross > stdBonusPension,
    items: bonusItems, totals: totals(bonusItems)
  };

  /* 年額（§3 手順12・§1.9） */
  var keys = ['health', 'care', 'child', 'pension', 'employment'];
  var annualItems = {}, annualTotals = { total: 0, insured: 0, employer: 0 };
  keys.forEach(function (k) {
    var a = {
      total: monthlyItems[k].total * 12 + bonusItems[k].total * bonusCount,
      insured: monthlyItems[k].insured * 12 + bonusItems[k].insured * bonusCount,
      employer: monthlyItems[k].employer * 12 + bonusItems[k].employer * bonusCount
    };
    annualItems[k] = a;
    annualTotals.total += a.total; annualTotals.insured += a.insured; annualTotals.employer += a.employer;
  });

  return {
    monthly: monthly, bonus: bonus,
    annual: { items: annualItems, totals: annualTotals },
    bonusCount: bonusCount
  };
}

var api = {
  compute: compute, gradeFromSalary: gradeFromSalary, gradeFromStandard: gradeFromStandard,
  splitPremium: splitPremium, premiumHalf: premiumHalf, premiumFull: premiumFull
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.ShahoEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

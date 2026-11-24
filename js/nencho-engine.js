/* 年末調整・還付シミュレーション エンジン
 * 仕様: ~/workspace/notes/tax-tools-spec-05-nencho.md
 * データ: data/nencho/tables-2026.json（令和8年分の表データ）
 * 対象は令和8年分（2026年分）の年末調整。手順は源泉徴収簿の計算の流れ（仕様§3）。
 * 金額の端数処理は浮動小数点誤差を避けるため、可能な限り整数演算で行う。
 */
(function (global) {
'use strict';

function yen0(n) { return Math.max(0, Math.floor(+n || 0)); }
function count0(n) { return Math.max(0, Math.floor(+n || 0)); }
/* 切り上げ割り算（a, d は非負整数） */
function ceilDiv(a, d) { return a <= 0 ? 0 : Math.floor((a + d - 1) / d); }

/* ---------- 給与所得控除後の給与等の金額（所得税法別表第五の再現規則。§1.2） ---------- */
function salaryAfterDeduction(t, income) {
  income = yen0(income);
  var s = t.salary;
  if (income < s.zero_under) return 0;
  if (income < s.flat_minus.max) return income - s.flat_minus.amount;
  var i, fv;
  for (i = 0; i < s.flat_values.length; i++) {
    fv = s.flat_values[i];
    if (income >= fv.min && income < fv.max) return fv.value;
  }
  if (income < s.band4000.max) {
    var A = Math.floor(income / s.band4000.step) * s.band4000.step;
    var segs = s.band4000.deduction_segments;
    var seg = segs[segs.length - 1];
    for (i = 0; i < segs.length; i++) { if (A <= segs[i].max) { seg = segs[i]; break; } }
    var ded = Math.floor(A * seg.rate_percent / 100) + seg.plus;
    return A - ded;
  }
  if (income <= s.over6600k.max) {
    return Math.floor(income * s.over6600k.rate_percent / 100) - s.over6600k.minus;
  }
  return income - s.over8500k.minus;
}

/* ---------- 所得金額調整控除（子ども・特別障害者等。§1.3） ---------- */
/* 控除額 =（給与収入金額 − 850万円）× 10%（1円未満切り上げ、上限15万円） */
function adjustmentDeduction(t, income, eligible) {
  income = yen0(income);
  if (!eligible || income <= t.adjustment.threshold) return 0;
  return Math.min(ceilDiv(income - t.adjustment.threshold, 10), t.adjustment.cap);
}

/* ---------- 保険料控除の計算式（区分バンド。§1.6・§1.7） ---------- */
/* bands: [{max, type:'all'} | {max, div, plus} | {max:null, cap}]
 * 1円未満の端数は切り上げ（§7.1 の設計判断）。 */
function bandDeduction(bands, amount) {
  amount = yen0(amount);
  for (var i = 0; i < bands.length; i++) {
    var b = bands[i];
    if (b.max === null || amount <= b.max) {
      if (b.type === 'all') return amount;
      if (b.cap !== undefined) return b.cap;
      return ceilDiv(amount, b.div) + b.plus;
    }
  }
  return 0;
}

/* 生命保険料控除の1区分（一般・個人年金）: 新旧併用の有利判定（§1.6(c)） */
function lifeCategory(t, newAmount, oldAmount, special) {
  var newOnly = bandDeduction(special ? t.life.new_special_bands : t.life.new_bands, newAmount);
  var oldOnly = bandDeduction(t.life.old_bands, oldAmount);
  var combined = Math.min(newOnly + oldOnly, special ? t.life.combined_cap_special : t.life.combined_cap);
  return {
    amount: Math.max(newOnly, oldOnly, combined),
    newOnly: newOnly, oldOnly: oldOnly, combined: combined
  };
}

/* 生命保険料控除（§1.6）: life = {newGeneral, oldGeneral, care, newPension, oldPension}
 * special = 年齢23歳未満の扶養親族がいる場合の特例（一般の新契約のみ） */
function lifeDeduction(t, life, special) {
  life = life || {};
  var general = lifeCategory(t, life.newGeneral, life.oldGeneral, !!special);
  var care = bandDeduction(t.life.new_bands, life.care);
  var pension = lifeCategory(t, life.newPension, life.oldPension, false);
  var total = Math.min(general.amount + care + pension.amount, t.life.total_cap);
  return { general: general, care: care, pension: pension, total: total };
}

/* 地震保険料控除（§1.7） */
function earthquakeDeduction(t, quake, oldLong) {
  var q = Math.min(yen0(quake), t.earthquake.quake_cap);
  var o = bandDeduction(t.earthquake.old_long_bands, oldLong);
  return Math.min(q + o, t.earthquake.total_cap);
}

/* ---------- 配偶者控除・配偶者特別控除（§1.8） ---------- */
/* ownTotal: 本人の合計所得金額、spouseIncome: 配偶者の合計所得金額
 * 戻り値: { amount, kind: '配偶者控除'|'配偶者特別控除'|null, tier: 0|1|2|null } */
function spouseDeduction(t, ownTotal, hasSpouse, spouseIncome, elderly) {
  if (!hasSpouse) return { amount: 0, kind: null, tier: null };
  var sp = t.spouse;
  if (ownTotal > sp.own_limit) return { amount: 0, kind: null, tier: null, reason: 'own-over' };
  var tier = 2;
  for (var i = 0; i < sp.own_tiers.length; i++) { if (ownTotal <= sp.own_tiers[i]) { tier = i; break; } }
  spouseIncome = yen0(spouseIncome);
  if (spouseIncome <= sp.deduction_limit) {
    var amounts = elderly ? sp.elderly_amounts : sp.general_amounts;
    return { amount: amounts[tier], kind: '配偶者控除', tier: tier };
  }
  if (spouseIncome <= sp.special_limit) {
    for (var j = 0; j < sp.special_rows.length; j++) {
      if (spouseIncome <= sp.special_rows[j].max) {
        return { amount: sp.special_rows[j].amounts[tier], kind: '配偶者特別控除', tier: tier };
      }
    }
  }
  return { amount: 0, kind: null, tier: tier };
}

/* ---------- 特定親族特別控除（§1.9）: 1人分 ---------- */
function specificRelativeOne(t, income) {
  income = yen0(income);
  var sr = t.specific_relative;
  if (income <= sr.lower_exclusive) return 0;
  for (var i = 0; i < sr.rows.length; i++) { if (income <= sr.rows[i].max) return sr.rows[i].amount; }
  return 0;
}

/* ---------- 扶養控除・障害者控除・寡婦・ひとり親・勤労学生（§1.10） ---------- */
/* d: { general, specific, elderlyCohab, elderlyOther,
 *      disabledGeneral, disabledSpecial, disabledCohabSpecial,
 *      selfStatus: 'none'|'widow'|'singleParent'|'workingStudent' } */
/* 本人区分（寡婦・ひとり親・勤労学生）の所得要件（合計所得金額）:
 * 寡婦・ひとり親は500万円以下（国税庁タックスアンサー No.1170・No.1171、仕様§1.10）。
 * 勤労学生は令和8年分から89万円以下（国税庁タックスアンサー No.1175:
 * 令和8年12月1日施行・令和8年分から適用。改正前の令和7年分は85万円以下）。
 * 勤労学生の「勤労に基づく所得以外の所得が10万円以下」などの細目は、
 * 本ツールでは判定せず注記に倒す（アプリ側の注記・コピー文で明示）。 */
var SELF_STATUS_RULES = {
  widow: { amountKey: 'widow', limit: 5000000 },
  singleParent: { amountKey: 'single_parent', limit: 5000000 },
  workingStudent: { amountKey: 'working_student', limit: 890000 }
};
function selfStatusDeduction(t, d, totalIncome) {
  var status = (d && d.selfStatus) || 'none';
  var rule = SELF_STATUS_RULES[status];
  if (!rule) return { status: status, applied: false, amount: 0, limit: null, reason: null };
  /* totalIncome を渡さない呼び出し（部品単体利用）は従来どおり適用する */
  if (totalIncome == null || totalIncome <= rule.limit) {
    return { status: status, applied: true, amount: t.dependent_amounts[rule.amountKey], limit: rule.limit, reason: null };
  }
  return { status: status, applied: false, amount: 0, limit: rule.limit, reason: 'over-limit' };
}
function dependentEtc(t, d, totalIncome) {
  d = d || {};
  var a = t.dependent_amounts;
  var total = count0(d.general) * a.general
    + count0(d.specific) * a.specific
    + count0(d.elderlyCohab) * a.elderly_cohab
    + count0(d.elderlyOther) * a.elderly_other
    + count0(d.disabledGeneral) * a.disabled_general
    + count0(d.disabledSpecial) * a.disabled_special
    + count0(d.disabledCohabSpecial) * a.disabled_cohab_special;
  total += selfStatusDeduction(t, d, totalIncome).amount;
  return total;
}

/* ---------- 基礎控除（§1.11） ---------- */
function basicDeduction(t, totalIncome) {
  var rows = t.basic_deduction.rows;
  for (var i = 0; i < rows.length; i++) {
    if (rows[i].max === null || totalIncome <= rows[i].max) return rows[i].amount;
  }
  return 0;
}

/* ---------- 算出所得税額（速算表。§1.12） ---------- */
function taxFromTable(t, taxable) {
  var rows = t.tax_table.rows;
  for (var i = 0; i < rows.length; i++) {
    if (taxable <= rows[i].max) return Math.floor(taxable * rows[i].rate_percent / 100) - rows[i].minus;
  }
  return 0; /* 課税給与所得金額が1,805万円を超える場合は年末調整の対象外 */
}

/* ---------- 全体計算（§3） ---------- */
/* input: {
 *   income (N1), socialInsurance (N2), smallBusiness (N3), withheld (N4),
 *   life: { newGeneral, oldGeneral, care, newPension, oldPension } (N5),
 *   hasYoungDependent (N6), quake (N7), oldLongDamage (N7),
 *   spouse: { has, income, elderly } (N8; income は合計所得金額),
 *   specificRelatives: [合計所得金額, ...] (N9),
 *   dependents: { general, specific, elderlyCohab, elderlyOther,
 *                 disabledGeneral, disabledSpecial, disabledCohabSpecial, selfStatus } (N10〜N12),
 *   adjustmentEligible (N13), otherIncome (N14), housing (N15)
 * } */
function compute(t, input) {
  var income = yen0(input.income);
  var social = yen0(input.socialInsurance);
  var small = yen0(input.smallBusiness);
  var withheld = yen0(input.withheld);
  var housing = yen0(input.housing);
  var otherIncome = yen0(input.otherIncome);

  var salaryAfter = salaryAfterDeduction(t, income);
  var adjustment = adjustmentDeduction(t, income, !!input.adjustmentEligible);
  var salaryAfterAdj = salaryAfter - adjustment;
  var totalIncome = salaryAfterAdj + otherIncome;

  var life = lifeDeduction(t, input.life, !!input.hasYoungDependent);
  var quake = earthquakeDeduction(t, input.quake, input.oldLongDamage);
  var spouseIn = input.spouse || {};
  var spouse = spouseDeduction(t, totalIncome, !!spouseIn.has, spouseIn.income, !!spouseIn.elderly);
  var specificList = (input.specificRelatives || []).map(function (v) { return specificRelativeOne(t, v); });
  var specificTotal = specificList.reduce(function (a, b) { return a + b; }, 0);
  var depEtc = dependentEtc(t, input.dependents, totalIncome);
  var selfStatus = selfStatusDeduction(t, input.dependents, totalIncome);
  var basic = basicDeduction(t, totalIncome);

  var deductionsTotal = social + small + life.total + quake + spouse.amount + specificTotal + depEtc + basic;
  var taxableRaw = salaryAfterAdj - deductionsTotal;
  var taxable = Math.max(0, Math.floor(taxableRaw / 1000) * 1000);
  var taxCalc = taxFromTable(t, taxable);
  var afterHousing = Math.max(0, taxCalc - housing);
  /* 年調年税額 = 年調所得税額 × 102.1%（100円未満切り捨て） */
  var annualTax = Math.floor(afterHousing * t.tax_table.reconstruction_rate_per_mille / 100000) * 100;
  var balance = withheld - annualTax;

  return {
    income: income,
    salaryAfter: salaryAfter,
    adjustment: adjustment,
    salaryAfterAdj: salaryAfterAdj,
    totalIncome: totalIncome,
    socialInsurance: social, smallBusiness: small,
    life: life, earthquake: quake, spouse: spouse,
    specificList: specificList, specificTotal: specificTotal,
    dependentEtc: depEtc, selfStatus: selfStatus, basic: basic,
    deductionsTotal: deductionsTotal,
    taxable: taxable,
    taxCalc: taxCalc,
    housing: housing,
    afterHousing: afterHousing,
    annualTax: annualTax,
    withheld: withheld,
    balance: balance,
    overIncomeLimit: income > 20000000
  };
}

var api = {
  compute: compute,
  salaryAfterDeduction: salaryAfterDeduction,
  adjustmentDeduction: adjustmentDeduction,
  bandDeduction: bandDeduction,
  lifeCategory: lifeCategory, lifeDeduction: lifeDeduction,
  earthquakeDeduction: earthquakeDeduction,
  spouseDeduction: spouseDeduction,
  specificRelativeOne: specificRelativeOne,
  dependentEtc: dependentEtc,
  selfStatusDeduction: selfStatusDeduction,
  basicDeduction: basicDeduction,
  taxFromTable: taxFromTable
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.NenchoEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

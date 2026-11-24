/* ふるさと納税 上限・複合版エンジン
 * 仕様: ~/workspace/notes/tax-tools-spec-03-furusato.md（令和8年分改正対応の追記を含む）
 * 簡易モデルは令和8年分（2026年分）の税制改正を反映する:
 * 所得税の基礎控除は合計所得金額で判定（国税庁 No.1199）、給与所得控除の最低保障額は74万円。
 * 総務省の目安表は改正前の前提（基礎控除48万円）のまま更新されていないため、
 * 目安表とは一部年収帯で一致しない（検証: ~/workspace/notes/furusato-2026-reform-impact.md）。
 * 住民税の基礎控除は43万円で変更なし。
 */
(function (global) {
'use strict';

// 所得税の基礎控除（令和8年分。国税庁 No.1199、仕様05 §1.11 と同一の区分表）
var BASIC_IT_YEAR = 2026; // 令和8年分
var BASIC_IT_TABLE = [
  { maxTotal: 4890000, amount: 1040000 },
  { maxTotal: 6550000, amount: 670000 },
  { maxTotal: 23500000, amount: 620000 },
  { maxTotal: 24000000, amount: 480000 },
  { maxTotal: 24500000, amount: 320000 },
  { maxTotal: 25000000, amount: 160000 },
  { maxTotal: Infinity, amount: 0 }
];
var BASIC_IT_BASE = 480000; // 特例分用税率の判定・住宅ローン繰越で使う「基礎控除額 − 48万円」の基準額
function basicDeductionIT(totalIncome) {
  for (var i = 0; i < BASIC_IT_TABLE.length; i++) {
    if (totalIncome <= BASIC_IT_TABLE[i].maxTotal) return BASIC_IT_TABLE[i].amount;
  }
  return 0;
}
var BASIC_RT = 430000;      // 住民税の基礎控除（令和9年度も変更なし）
var SPOUSE_IT = 380000;     // 所得税の配偶者控除
var SPOUSE_RT = 330000;     // 住民税の配偶者控除
var DEP_GEN_IT = 380000, DEP_GEN_RT = 330000;   // 一般扶養
var DEP_SPEC_IT = 630000, DEP_SPEC_RT = 450000; // 特定扶養
// 人的控除差（所得税 − 住民税）
var DIFF_BASIC = 50000, DIFF_SPOUSE = 50000, DIFF_GEN = 50000, DIFF_SPEC = 180000;

var BRACKETS = [
  { upTo: 1950000, rate: 0.05, deduct: 0 },
  { upTo: 3300000, rate: 0.10, deduct: 97500 },
  { upTo: 6950000, rate: 0.20, deduct: 427500 },
  { upTo: 9000000, rate: 0.23, deduct: 636000 },
  { upTo: 18000000, rate: 0.33, deduct: 1536000 },
  { upTo: 40000000, rate: 0.40, deduct: 2796000 },
  { upTo: Infinity, rate: 0.45, deduct: 4796000 }
];

/* 給与所得控除（令和8年分。最低保障額74万円は収入220万円以下に効き、
 * 220万円超の各率は改正なし。所得税・住民税（令和9年度）とも同じ表。
 * 別表第五の4,000円区間の平坦部（219.1万〜220万円）は簡易式では再現しない）
 */
function salaryIncomeOf(revenue) {
  if (revenue <= 0) return 0;
  var ded;
  if (revenue <= 2200000) ded = 740000;
  else if (revenue <= 3600000) ded = revenue * 0.3 + 80000;
  else if (revenue <= 6600000) ded = revenue * 0.2 + 440000;
  else if (revenue <= 8500000) ded = revenue * 0.1 + 1100000;
  else ded = 1950000;
  return Math.max(0, Math.floor(revenue - ded));
}

function bracketOf(taxable) {
  for (var i = 0; i < BRACKETS.length; i++) {
    if (taxable <= BRACKETS[i].upTo) return BRACKETS[i];
  }
  return BRACKETS[BRACKETS.length - 1];
}
function incomeTaxOf(taxable) {
  if (taxable <= 0) return 0;
  var b = bracketOf(taxable);
  return Math.floor((taxable * b.rate - b.deduct) * 1.021);
}
function floor1000(n) { return Math.floor(n / 1000) * 1000; }

/* 簡易モード
 * input: { revenue, hasSpouse, depGeneral, depSpecific,
 *          socialInsurance (null=収入×15%推定), medicalDeduction,
 *          housingCreditAmount, housingEra ('h21'|'h26'|'r4'|null),
 *          otherDonations }
 */
function computeSimple(input) {
  var revenue = +input.revenue || 0;
  var salaryInc = salaryIncomeOf(revenue);
  var social = (input.socialInsurance == null) ? Math.floor(revenue * 0.15) : (+input.socialInsurance || 0);
  var medical = +input.medicalDeduction || 0;
  var depG = +input.depGeneral || 0, depS = +input.depSpecific || 0;
  var spouse = !!input.hasSpouse;

  // 所得税の基礎控除は合計所得金額（本モデルでは給与所得）で判定する
  var basicIT = basicDeductionIT(salaryInc);
  var basicExtra = Math.max(0, basicIT - BASIC_IT_BASE); // 令和8年分の調整額（最大56万円）

  var dedIT = basicIT + (spouse ? SPOUSE_IT : 0) + depG * DEP_GEN_IT + depS * DEP_SPEC_IT + medical;
  var dedRT = BASIC_RT + (spouse ? SPOUSE_RT : 0) + depG * DEP_GEN_RT + depS * DEP_SPEC_RT + medical;
  var diffTotal = DIFF_BASIC + (spouse ? DIFF_SPOUSE : 0) + depG * DIFF_GEN + depS * DIFF_SPEC;

  var taxableIT = Math.max(0, salaryInc - social - dedIT);
  var taxIT = incomeTaxOf(taxableIT);
  var rateIT = taxableIT > 0 ? bracketOf(taxableIT).rate : 0;

  var taxableRT = floor1000(Math.max(0, salaryInc - social - dedRT));
  // 調整控除
  var adj;
  if (taxableRT <= 2000000) adj = Math.min(diffTotal, taxableRT) * 0.05;
  else {
    adj = (diffTotal - (taxableRT - 2000000)) * 0.05;
    adj = adj > 0 ? Math.max(adj, 2500) : 0;
  }
  adj = Math.floor(adj);
  var levyRT = Math.max(0, Math.floor(taxableRT * 0.10) - adj);

  // 特例分用の所得税率（住民税課税総所得 − 人的控除差調整額 −（所得税基礎控除−48万円））
  var rateBase = taxableRT - diffTotal - basicExtra;
  var rateRT = rateBase <= 0 ? 0 : bracketOf(rateBase).rate;

  var limit = levyRT * 0.20 / (0.90 - rateRT * 1.021) + 2000;

  // 住宅ローン控除（§3.2）: 上限額には影響しない。繰越額と所得割残額のみ。
  var housing = null;
  if (input.housingCreditAmount && +input.housingCreditAmount > 0 && input.housingEra) {
    var possible = +input.housingCreditAmount;
    var usedIT = Math.min(possible, taxIT);
    var leftover = possible - usedIT;
    var eraRate = input.housingEra === 'h26' ? 0.07 : 0.05;
    var eraCap = input.housingEra === 'h26' ? 136500 : 97500;
    var carry = Math.min(leftover, Math.floor((taxableIT + basicExtra) * eraRate), eraCap);
    housing = {
      possible: possible, usedInIncomeTax: usedIT, leftover: leftover,
      carryToResident: carry, residentLevyAfter: Math.max(0, levyRT - carry)
    };
  }

  return {
    salaryIncome: salaryInc, socialInsurance: social, basicDeduction: basicIT,
    taxableIncomeTax: taxableIT, incomeTax: taxIT, rateIncomeTax: rateIT,
    taxableResidentTax: taxableRT, adjustmentCredit: adj, residentLevy: levyRT,
    rateForTokurei: rateRT, limitRaw: limit, limit: floor1000(limit),
    housing: housing,
    verifiedRange: revenue >= 3000000 && revenue <= 7000000,
    aboveVerified: revenue >= 7500000
  };
}

/* 寄附予定額への内訳（§3.3）
 * model: computeSimpleの結果, donation: 寄附額P, onestop: bool
 */
function computeBreakdown(model, donation, onestop) {
  var P = +donation || 0;
  if (P <= 2000) return null;
  var base = (P - 2000) * 0.10;
  var tokureiRaw = (P - 2000) * (0.90 - model.rateForTokurei * 1.021);
  var tokurei = Math.min(tokureiRaw, model.residentLevy * 0.20);
  var itCut = 0, shinsei = 0;
  if (onestop) {
    var denom = 0.90 - model.rateForTokurei * 1.021;
    shinsei = denom > 0 ? tokurei * (model.rateForTokurei * 1.021) / denom : 0;
  } else {
    itCut = (P - 2000) * model.rateIncomeTax * 1.021;
  }
  var residentTotal = base + tokurei + shinsei;
  var receivableCap = model.housing ? model.housing.residentLevyAfter : model.residentLevy;
  var overflow = Math.max(0, residentTotal - receivableCap);
  var totalCut = itCut + residentTotal - overflow;
  return {
    donation: P,
    incomeTaxCut: Math.floor(itCut),
    basicCut: Math.floor(base),
    tokureiCut: Math.floor(tokurei),
    shinseiCut: Math.floor(shinsei),
    overflow: Math.floor(overflow),
    selfPay: Math.round(P - totalCut)
  };
}

/* 詳細モード（§3.4）: 所得割額と限界税率を直接入力 */
function computeDetail(input) {
  var levy = +input.residentLevy || 0;
  var rate = +input.marginalRate || 0;
  var limit = levy * 0.20 / (0.90 - rate * 1.021) + 2000;
  var model = {
    residentLevy: levy, rateForTokurei: rate, rateIncomeTax: rate,
    housing: input.housingResidentCredit ? { residentLevyAfter: Math.max(0, levy - (+input.housingResidentCredit || 0)), carryToResident: +input.housingResidentCredit || 0 } : null
  };
  return { limitRaw: limit, limit: floor1000(limit), model: model };
}

var api = { computeSimple: computeSimple, computeBreakdown: computeBreakdown, computeDetail: computeDetail, salaryIncomeOf: salaryIncomeOf, basicDeductionIT: basicDeductionIT };
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.FurusatoEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

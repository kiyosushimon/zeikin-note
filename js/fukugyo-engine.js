/* 副業の税金・申告要否チェッカー エンジン
 * 仕様: ~/workspace/notes/tax-tools-spec-12-fukugyo.md
 * 判定: 所得税法第121条・国税庁タックスアンサー No.1900（令和8年分）。
 *   20万円ルールは所得税だけにあり、住民税にはない（仕様§1.3・§1.5）。
 * 追加税額は差分方式（仕様§1.6）: 副業なし／ありを既存部品で2回計算して差を取る。
 *   所得税     = NenchoEngine の部品（salaryAfterDeduction・basicDeduction・taxFromTable）
 *                ＋ data/nencho/tables-2026.json。控除は社保と基礎控除のみ（標準ケース）。
 *                部品合成の結果は NenchoEngine.compute の annualTax と一致する（仕様§4）。
 *   住民税     = SetaiEngine.residentTax・residentSalaryIncome
 *                ＋ data/juminzei/rules.json（標準税率・1級地・単身）。
 *   社会保険料 = ShahoEngine（data/kenpo/rates-2026.json・data/shaho/params-2026.json）。
 *                月額基礎は（年収 − 賞与年額）÷ 12 の近似（第7・11弾と同じ）。
 * 所得区分（雑所得／事業所得）の判定はしない（仕様§1.2）。金額計算は両区分で同一。
 */
(function (global) {
'use strict';

var NenchoEngine = global.NenchoEngine ||
  (typeof require !== 'undefined' ? require('./nencho-engine.js') : null);
var ShahoEngine = global.ShahoEngine ||
  (typeof require !== 'undefined' ? require('./shaho-engine.js') : null);
var SetaiEngine = global.SetaiEngine ||
  (typeof require !== 'undefined' ? require('./setai-engine.js') : null);

function yen0(n) { return Math.max(0, Math.floor(+n || 0)); }
function count0(n) { return Math.max(0, Math.floor(+n || 0)); }
function optYen(n) { return (n === null || n === undefined || n === '') ? null : yen0(n); }

var SIDE_LIMIT = 200000;        /* 給与・退職以外の所得の申告不要ライン（所法121条・No.1900） */
var SALARY_150_TEST = 1500000;  /* 2か所給与の注記テスト（No.1900 の注） */
var INCOME_2000_LIMIT = 20000000; /* 給与収入2,000万円超は年末調整の対象外（No.1900 の 1） */

/* ---------- 社会保険料（仕様§3-2） ---------- */
/* M6（源泉徴収票の社会保険料等の金額）の入力があればそれを優先する */
function socialInsurance(data, input) {
  var override = optYen(input.socialOverride);
  if (override !== null) return { total: override, fromInput: true, monthlyGross: null };
  var bonusTotal = yen0(input.bonusPer) * count0(input.bonusCount);
  var monthlyGross = Math.max(0, Math.floor((yen0(input.mainIncome) - bonusTotal) / 12));
  var sr = ShahoEngine.compute(
    { kenpo: data.kenpo, params: data.shahoParams },
    {
      prefecture: input.prefecture, ageBand: input.ageBand,
      salaryMode: 'gross', gross: monthlyGross,
      bonusGross: yen0(input.bonusPer), bonusCount: count0(input.bonusCount),
      industry: input.industry, employmentInsured: true, cumulativeBonus: 0
    });
  return { total: sr.annual.totals.insured, fromInput: false, monthlyGross: monthlyGross };
}

/* ---------- 所得税の年税額（部品合成。仕様§1.6・§4） ---------- */
/* salaryIncome: 給与の収入金額（副業が給与の場合は合算後の額）
 * extraIncome: 給与所得に加える副業所得（給与以外のタイプのみ。それ以外は0） */
function incomeTaxCalc(t, salaryIncome, social, extraIncome) {
  var salaryAfter = NenchoEngine.salaryAfterDeduction(t, salaryIncome);
  var totalIncome = salaryAfter + yen0(extraIncome);
  var basic = NenchoEngine.basicDeduction(t, totalIncome);
  var taxable = Math.max(0, Math.floor((totalIncome - social - basic) / 1000) * 1000);
  var taxCalc = NenchoEngine.taxFromTable(t, taxable);
  /* 年税額 = 算出税額 × 102.1%（100円未満切捨て）。NenchoEngine.compute と同じ式 */
  var annualTax = Math.floor(Math.max(0, taxCalc) * t.tax_table.reconstruction_rate_per_mille / 100000) * 100;
  return {
    salaryIncome: yen0(salaryIncome), salaryAfter: salaryAfter,
    totalIncome: totalIncome, basic: basic, taxable: taxable,
    taxCalc: taxCalc, annualTax: annualTax
  };
}

/* ---------- 住民税（差分用。仕様§1.6） ---------- */
function residentTaxCalc(rules, residentSalary, social, extraIncome) {
  var rt = SetaiEngine.residentTax(rules, {
    salary: residentSalary + yen0(extraIncome),
    social: social,
    partnerSalary: 0,
    claimsSpouse: false,
    children: { under16: 0, general: 0, specific: 0 },
    headcount: 1,
    hasDependents: false
  });
  return {
    salary: rt.salary, taxable: rt.taxable, adjustment: rt.adjustment,
    incomeLevy: rt.incomeLevy, perCapita: rt.perCapita, forest: rt.forest,
    tax: rt.tax, nontaxPerCapita: rt.nontaxPerCapita, nontaxIncomeLevy: rt.nontaxIncomeLevy
  };
}

/* ---------- 全体計算（仕様§3） ---------- */
/* data: { tables, rules, kenpo, shahoParams }
 * input: {
 *   mainIncome, prefecture, ageBand, industry, bonusPer, bonusCount,
 *   socialOverride （M6。null 可）,
 *   sideType: 'nonsalary'|'salary'|'other',
 *   sideRevenue, sideExpenses （S2・S3。給与以外のタイプ）,
 *   sideCategory: 'misc'|'business'|'unknown' （S4。計算には使わない）,
 *   sideWithholding （S5。null 可）,
 *   sideSalaryIncome （S6。給与タイプ）, sideYearEndAdjusted （S7）,
 *   willFile （F1）
 * } */
function compute(data, input) {
  var sideType = (input.sideType === 'salary' || input.sideType === 'other') ? input.sideType : 'nonsalary';
  var mainIncome = yen0(input.mainIncome);

  var result = {
    errors: [],
    outOfScope: sideType === 'other',
    sideType: sideType,
    mainIncome: mainIncome,
    social: null,
    sideIncome: null,
    sideSalaryIncome: sideType === 'salary' ? yen0(input.sideSalaryIncome) : null,
    filing: null,
    residentFiling: null,
    incomeTax: null,
    residentTax: null,
    totalDiff: null,
    settlement: null
  };
  if (result.outOfScope) return result;
  if (!(mainIncome > 0)) { result.errors.push('本業の年収（総支給額）を入力してください'); return result; }

  var social = socialInsurance(data, input);
  result.social = social;

  /* 1. 副業所得（仕様§3-1）。給与以外はマイナスなら0（雑所得の損失は損益通算できない） */
  var sideIncome = null;
  if (sideType === 'nonsalary') {
    sideIncome = Math.max(0, yen0(input.sideRevenue) - yen0(input.sideExpenses));
    result.sideIncome = sideIncome;
  }

  /* 2. 確定申告（所得税）の要否（仕様§1.3・§1.4） */
  var filing;
  if (mainIncome > INCOME_2000_LIMIT) {
    filing = { status: 'required', code: 'over-2000man' };
  } else if (input.willFile) {
    filing = { status: 'will-file', code: 'will-file' };
  } else if (sideType === 'nonsalary') {
    filing = sideIncome > SIDE_LIMIT
      ? { status: 'required', code: 'side-over-200k' }
      : { status: 'not-required', code: 'side-within-200k' };
  } else {
    var unadjusted = input.sideYearEndAdjusted ? 0 : yen0(input.sideSalaryIncome);
    if (unadjusted > SIDE_LIMIT) {
      /* No.1900 の注: 給与収入合計 − 所得控除（雑損・医療費・寄附金・基礎控除を除く）
       * が150万円以下で、給与・退職以外の所得（本ツールでは0前提）が20万円以下なら不要。
       * 本ツールの標準ケースで差し引ける控除は社会保険料のみ */
      var testBase = (mainIncome + yen0(input.sideSalaryIncome)) - social.total;
      filing = testBase <= SALARY_150_TEST
        ? { status: 'not-required', code: 'salary-150-test' }
        : { status: 'required', code: 'salary-over-200k' };
    } else {
      filing = { status: 'not-required', code: 'salary-within-200k' };
    }
  }
  result.filing = filing;

  /* 3. 住民税申告の要否（仕様§1.5）。給与タイプは給与支払報告書の理由を優先する */
  if (sideType === 'salary') {
    result.residentFiling = { status: 'not-required', code: 'salary-report' };
  } else if (filing.status !== 'not-required') {
    result.residentFiling = { status: 'not-required', code: 'covered-by-filing' };
  } else {
    result.residentFiling = { status: 'required', code: 'resident-only' };
  }

  /* 4. 追加税額（差分方式。仕様§1.6） */
  var t = data.tables;
  var itWithout, itWith, rtWithout, rtWith;
  if (sideType === 'nonsalary') {
    itWithout = incomeTaxCalc(t, mainIncome, social.total, 0);
    itWith = incomeTaxCalc(t, mainIncome, social.total, sideIncome);
    var rsBase = SetaiEngine.residentSalaryIncome(mainIncome);
    rtWithout = residentTaxCalc(data.rules, rsBase, social.total, 0);
    rtWith = residentTaxCalc(data.rules, rsBase, social.total, sideIncome);
  } else {
    var combined = mainIncome + yen0(input.sideSalaryIncome);
    itWithout = incomeTaxCalc(t, mainIncome, social.total, 0);
    itWith = incomeTaxCalc(t, combined, social.total, 0);
    rtWithout = residentTaxCalc(data.rules, SetaiEngine.residentSalaryIncome(mainIncome), social.total, 0);
    rtWith = residentTaxCalc(data.rules, SetaiEngine.residentSalaryIncome(combined), social.total, 0);
  }
  var itDiff = itWith.annualTax - itWithout.annualTax;
  var rtDiff = rtWith.tax - rtWithout.tax;
  result.incomeTax = {
    without: itWithout, with: itWith, diff: itDiff,
    /* 申告しない場合は所得税は課税されず、金額は参考値として分離する（仕様§1.7） */
    meaning: filing.status === 'not-required' ? 'reference' : 'settle'
  };
  result.residentTax = { without: rtWithout, with: rtWith, diff: rtDiff };
  result.totalDiff = itDiff + rtDiff;

  /* 5. 源泉徴収済み額との精算目安（仕様§1.7。S5 があり、申告する場合のみ） */
  var withheld = optYen(input.sideWithholding);
  if (withheld !== null && filing.status !== 'not-required') {
    var amount = itDiff - withheld;
    result.settlement = { withholding: withheld, amount: amount, isRefund: amount < 0 };
  }
  return result;
}

var api = {
  compute: compute,
  incomeTaxCalc: incomeTaxCalc,
  residentTaxCalc: residentTaxCalc,
  SIDE_LIMIT: SIDE_LIMIT,
  SALARY_150_TEST: SALARY_150_TEST
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.FukugyoEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* 世帯年収の手取りシミュレーター エンジン
 * 仕様: ~/workspace/notes/tax-tools-spec-07-setai.md
 * データ: data/nencho/tables-2026.json（所得税の表。第5弾と共用）
 *         data/juminzei/rules.json（住民税の全国共通ルール。第2弾と共用）
 *         data/kenpo/rates-2026.json（協会けんぽ料率・等級表）
 *         data/shaho/params-2026.json（厚生年金等級表・雇用保険料率・標準賞与額の上限）
 * 部品: NenchoEngine（所得税）・ShahoEngine（社会保険料）を組み合わせて使う（仕様§1.9）。
 * 住民税は JuminzeiEngine.compute が自治体パラメータ前提のため流用せず、
 * rules.json のデータを共用する総額ベースの計算を本ファイルに新設する（仕様§1.6）。
 * 金額の端数処理は浮動小数点誤差を避けるため、可能な限り整数演算で行う。
 */
(function (global) {
'use strict';

var NenchoEngine = global.NenchoEngine ||
  (typeof require !== 'undefined' ? require('./nencho-engine.js') : null);
var ShahoEngine = global.ShahoEngine ||
  (typeof require !== 'undefined' ? require('./shaho-engine.js') : null);

function yen0(n) { return Math.max(0, Math.floor(+n || 0)); }
function count0(n) { return Math.max(0, Math.floor(+n || 0)); }

var DEPENDENT_LINE = 1300000;   // 被扶養者認定の年間収入の線（§1.4(c)）
var RESIDENT_SPOUSE_LINE = 580000; // 住民税の同一生計配偶者の所得要件（rules.json）

/* ---------- 住民税用の給与所得換算（§1.3(b)） ---------- */
/* 給与所得控除額 = max(式の額, 650,000円)。式は自治体公式の給与所得速算表（令和8年度）。 */
function residentSalaryIncome(income) {
  income = yen0(income);
  if (income <= 0) return 0;
  var ded;
  if (income <= 1800000) ded = Math.floor(income * 40 / 100) - 100000;
  else if (income <= 3600000) ded = Math.floor(income * 30 / 100) + 80000;
  else if (income <= 6600000) ded = Math.floor(income * 20 / 100) + 440000;
  else if (income <= 8500000) ded = Math.floor(income * 10 / 100) + 1100000;
  else ded = 1950000;
  if (ded < 650000) ded = 650000;
  return Math.max(0, income - ded);
}

/* ---------- 社会保険料（§1.4） ---------- */
/* ShahoEngine に月額基礎を導出して渡し、本人負担の年額だけを使う。
 * opts: { prefecture, industry, dependent } */
function socialInsurance(data, person, opts) {
  var zero = {
    dependent: !!opts.dependent, monthlyGross: 0,
    standardHealth: null, healthGrade: null, standardPension: null, pensionGrade: null,
    health: 0, care: 0, child: 0, pension: 0, employment: 0, total: 0
  };
  if (opts.dependent || person.income <= 0) return zero;
  var bonusTotal = yen0(person.bonusPer) * count0(person.bonusCount);
  var monthlyGross = Math.max(0, Math.floor((person.income - bonusTotal) / 12));
  var r = ShahoEngine.compute(
    { kenpo: data.kenpo, params: data.shahoParams },
    {
      prefecture: opts.prefecture, ageBand: person.ageBand,
      salaryMode: 'gross', gross: monthlyGross,
      bonusGross: yen0(person.bonusPer), bonusCount: count0(person.bonusCount),
      industry: opts.industry, employmentInsured: true, cumulativeBonus: 0
    });
  var a = r.annual.items;
  return {
    dependent: false, monthlyGross: monthlyGross,
    standardHealth: r.monthly.standardHealth, healthGrade: r.monthly.healthGrade,
    standardPension: r.monthly.standardPension, pensionGrade: r.monthly.pensionGrade,
    health: a.health.insured, care: a.care.insured, child: a.child.insured,
    pension: a.pension.insured, employment: a.employment.insured,
    total: r.annual.totals.insured
  };
}

/* ---------- 住民税（§1.6: rules.json 共用の総額ベース計算） ---------- */
/* args: { salary (住民税用の給与所得=合計所得金額), social, partnerSalary,
 *         claimsSpouse, children: {under16, general, specific} } */
function residentTax(rules, args) {
  var total = args.salary;
  var ded = rules.income_deductions;

  /* 基礎控除 */
  var basic = 0;
  for (var i = 0; i < ded.basic.by_total_income.length; i++) {
    var row = ded.basic.by_total_income[i];
    if (row.total_income_max_yen === null || total <= row.total_income_max_yen) { basic = row.deduction_yen; break; }
  }

  /* 配偶者控除・配偶者特別控除（付ける側のみ。判定は住民税用の所得） */
  var spouseAmount = 0, spouseKind = null;
  if (args.claimsSpouse && total <= 10000000) {
    var tierKey = total <= 9000000 ? 0 : total <= 9500000 ? 1 : 2;
    if (args.partnerSalary <= RESIDENT_SPOUSE_LINE) {
      spouseAmount = ded.spouse.by_taxpayer_total_income[tierKey].general_yen;
      spouseKind = '配偶者控除';
    } else if (args.partnerSalary <= 1330000) {
      var keys = ['taxpayer_le_900man', 'taxpayer_le_950man', 'taxpayer_le_1000man'];
      for (var j = 0; j < ded.spouse_special.table.length; j++) {
        var srow = ded.spouse_special.table[j];
        if (args.partnerSalary <= srow.spouse_income_max_yen) { spouseAmount = srow[keys[tierKey]]; break; }
      }
      spouseKind = '配偶者特別控除';
    }
  }

  /* 扶養控除（16歳未満は0円） */
  var depAmount = args.children.general * 330000 + args.children.specific * 450000;

  var deductionsTotal = args.social + spouseAmount + depAmount + basic;
  var taxable = Math.max(0, Math.floor((total - deductionsTotal) / 1000) * 1000);

  /* 調整控除（§1.6。配偶者特別控除の差額は §7.1-6 により計算に入れない） */
  var diffs = rules.adjustment_deduction.personal_deduction_differences_yen;
  var diffTotal = 0;
  if (total <= 25000000) diffTotal += diffs.basic;
  if (spouseKind === '配偶者控除') {
    var stier = total <= 9000000 ? 0 : total <= 9500000 ? 1 : 2;
    diffTotal += diffs.spouse_by_taxpayer_income[stier].general_yen;
  }
  diffTotal += args.children.general * diffs.dependent.general
             + args.children.specific * diffs.dependent.specific;
  var adjustment = 0;
  if (total <= 25000000) {
    if (taxable <= 2000000) adjustment = Math.floor(Math.min(diffTotal, taxable) * 5 / 100);
    else adjustment = Math.floor(Math.max(diffTotal - (taxable - 2000000), 50000) * 5 / 100);
  }

  /* 非課税判定（1級地。§1.6） */
  var n = args.headcount;
  var hasDep = args.hasDependents;
  var perCapitaLimit = 350000 * n + 100000 + (hasDep ? 210000 : 0);
  var incomeLevyLimit = 350000 * n + 100000 + (hasDep ? 320000 : 0);
  var nontaxPerCapita = total <= perCapitaLimit;
  var nontaxIncomeLevy = total <= incomeLevyLimit;

  var incomeLevy = nontaxIncomeLevy ? 0 : Math.max(0, Math.floor(taxable * 10 / 100) - adjustment);
  var perCapita = nontaxPerCapita ? 0 : rules.standard_rates.per_capita_standard_yen.total;
  var forest = nontaxPerCapita ? 0 : rules.standard_rates.forest_environment_tax_national_yen;
  var tax = Math.floor((incomeLevy + perCapita + forest) / 100) * 100;

  return {
    salary: total, basic: basic,
    spouseAmount: spouseAmount, spouseKind: spouseKind,
    dependentAmount: depAmount, social: args.social,
    deductionsTotal: deductionsTotal, taxable: taxable,
    adjustment: adjustment, incomeLevy: incomeLevy,
    perCapita: perCapita, forest: forest, tax: tax,
    headcount: n, nontaxPerCapita: nontaxPerCapita, nontaxIncomeLevy: nontaxIncomeLevy
  };
}

/* ---------- 1人分の前段（給与所得2種・調整控除・社会保険料） ---------- */
function personStage1(data, person, socialOpts) {
  var t = data.tables;
  var salaryTax = NenchoEngine.salaryAfterDeduction(t, person.income);
  var hasYoung = person.childrenAttached &&
    (person.childrenAttached.under16 + person.childrenAttached.general + person.childrenAttached.specific) > 0;
  var adjustment = NenchoEngine.adjustmentDeduction(t, person.income, !!hasYoung);
  return {
    income: person.income,
    salaryTax: salaryTax,
    salaryResident: residentSalaryIncome(person.income),
    adjustment: adjustment,
    totalTax: salaryTax - adjustment,
    social: socialInsurance(data, person, socialOpts)
  };
}

/* ---------- 1人分の後段（所得税・住民税・手取り） ---------- */
/* args: { stage1, partnerStage1, claimsSpouse, childrenAttached, partnerChildrenCount } */
function personStage2(data, args) {
  var t = data.tables;
  var s1 = args.stage1, p1 = args.partnerStage1;
  var ch = args.childrenAttached || { under16: 0, general: 0, specific: 0 };

  /* 所得税: NenchoEngine.compute を源泉徴収税額0・対象外控除0で流用（§1.5） */
  var nc = NenchoEngine.compute(t, {
    income: s1.income,
    socialInsurance: s1.social.total,
    smallBusiness: 0, withheld: 0, housing: 0, otherIncome: 0,
    life: { newGeneral: 0, oldGeneral: 0, care: 0, newPension: 0, oldPension: 0 },
    hasYoungDependent: false, quake: 0, oldLongDamage: 0,
    spouse: args.claimsSpouse
      ? { has: true, income: p1.totalTax, elderly: false }
      : { has: false, income: 0, elderly: false },
    specificRelatives: [],
    dependents: {
      general: ch.general, specific: ch.specific,
      elderlyCohab: 0, elderlyOther: 0,
      disabledGeneral: 0, disabledSpecial: 0, disabledCohabSpecial: 0,
      selfStatus: 'none'
    },
    adjustmentEligible: (ch.under16 + ch.general + ch.specific) > 0
  });

  /* 住民税の人数: 本人＋同一生計配偶者（相手の住民税用所得58万円以下）＋付けた扶養親族 */
  var spouseCounted = p1.salaryResident <= RESIDENT_SPOUSE_LINE;
  var depCount = ch.under16 + ch.general + ch.specific;
  var rt = residentTax(data.rules, {
    salary: s1.salaryResident,
    social: s1.social.total,
    partnerSalary: p1.salaryResident,
    claimsSpouse: args.claimsSpouse,
    children: ch,
    headcount: 1 + (spouseCounted ? 1 : 0) + depCount,
    hasDependents: spouseCounted || depCount > 0
  });

  return {
    income: s1.income,
    salaryTax: s1.salaryTax, salaryResident: s1.salaryResident,
    adjustment: s1.adjustment, totalTax: s1.totalTax,
    social: s1.social,
    incomeTax: {
      spouseAmount: nc.spouse.amount, spouseKind: nc.spouse.kind,
      dependentAmount: nc.dependentEtc, basic: nc.basic,
      social: s1.social.total, deductionsTotal: nc.deductionsTotal,
      taxable: nc.taxable, taxCalc: nc.taxCalc, tax: nc.annualTax
    },
    residentTax: rt,
    net: s1.income - s1.social.total - nc.annualTax - rt.tax
  };
}

/* ---------- 世帯計算（§3 手順10〜12） ---------- */
/* input: {
 *   self:   { income, ageBand, bonusPer, bonusCount },
 *   spouse: { income, ageBand, bonusPer, bonusCount },
 *   prefecture, industry,
 *   spouseSocial: 'auto'|'join'|'dependent',
 *   children: { under16, general, specific, parent: 'self'|'spouse' }
 * } */
function computeHousehold(data, input) {
  var self = {
    income: yen0(input.self.income), ageBand: input.self.ageBand,
    bonusPer: yen0(input.self.bonusPer), bonusCount: count0(input.self.bonusCount)
  };
  var spouse = {
    income: yen0(input.spouse.income), ageBand: input.spouse.ageBand,
    bonusPer: yen0(input.spouse.bonusPer), bonusCount: count0(input.spouse.bonusCount)
  };
  var children = input.children || { under16: 0, general: 0, specific: 0, parent: 'self' };
  var childCounts = {
    under16: count0(children.under16), general: count0(children.general), specific: count0(children.specific)
  };
  var childParent = children.parent === 'spouse' ? 'spouse' : 'self';
  var noChildren = { under16: 0, general: 0, specific: 0 };
  self.childrenAttached = childParent === 'self' ? childCounts : noChildren;
  spouse.childrenAttached = childParent === 'spouse' ? childCounts : noChildren;

  /* 配偶者控除の付け方（§1.7-1）: 原則は本人。本人の年収0円なら配偶者側へ */
  var claimant = self.income > 0 ? 'self' : 'spouse';

  /* 配偶者の社会保険の扱い（§1.4(c)） */
  var spouseDependent = input.spouseSocial === 'dependent' ||
    (input.spouseSocial !== 'join' && spouse.income < DEPENDENT_LINE);

  var s1Self = personStage1(data, self, { prefecture: input.prefecture, industry: input.industry, dependent: false });
  var s1Spouse = personStage1(data, spouse, { prefecture: input.prefecture, industry: input.industry, dependent: spouseDependent });

  var pSelf = personStage2(data, {
    stage1: s1Self, partnerStage1: s1Spouse,
    claimsSpouse: claimant === 'self', childrenAttached: self.childrenAttached
  });
  var pSpouse = personStage2(data, {
    stage1: s1Spouse, partnerStage1: s1Self,
    claimsSpouse: claimant === 'spouse', childrenAttached: spouse.childrenAttached
  });

  return {
    self: pSelf, spouse: pSpouse,
    spouseDependent: spouseDependent,
    claimant: claimant,
    household: {
      income: self.income + spouse.income,
      social: pSelf.social.total + pSpouse.social.total,
      incomeTax: pSelf.incomeTax.tax + pSpouse.incomeTax.tax,
      residentTax: pSelf.residentTax.tax + pSpouse.residentTax.tax,
      net: pSelf.net + pSpouse.net
    }
  };
}

function compute(data, input) {
  var main = computeHousehold(data, input);
  var total = main.household.income;

  /* (a) 1人で稼ぐ場合（§1.8(a)）: 子供の扶養は本人、配偶者は被扶養者扱い */
  var singleInput = {
    self: { income: total, ageBand: input.self.ageBand, bonusPer: 0, bonusCount: 0 },
    spouse: { income: 0, ageBand: input.spouse.ageBand, bonusPer: 0, bonusCount: 0 },
    prefecture: input.prefecture, industry: input.industry,
    spouseSocial: 'auto',
    children: {
      under16: count0((input.children || {}).under16),
      general: count0((input.children || {}).general),
      specific: count0((input.children || {}).specific),
      parent: 'self'
    }
  };
  var single = computeHousehold(data, singleInput);

  /* (b) 配分プリセット（§1.8(b)）: 賞与なし・子供は本人・配偶者は自動判定 */
  var ratios = [
    { label: '10:0', ratio: 1 },
    { label: '7:3', ratio: 0.7 },
    { label: '5:5', ratio: 0.5 }
  ];
  var presets = ratios.map(function (r) {
    var selfIncome = Math.floor(total * r.ratio);
    var h = computeHousehold(data, {
      self: { income: selfIncome, ageBand: input.self.ageBand, bonusPer: 0, bonusCount: 0 },
      spouse: { income: total - selfIncome, ageBand: input.spouse.ageBand, bonusPer: 0, bonusCount: 0 },
      prefecture: input.prefecture, industry: input.industry,
      spouseSocial: 'auto',
      children: {
        under16: count0((input.children || {}).under16),
        general: count0((input.children || {}).general),
        specific: count0((input.children || {}).specific),
        parent: 'self'
      }
    });
    return {
      label: r.label, selfIncome: selfIncome, spouseIncome: total - selfIncome,
      household: h.household
    };
  });

  return {
    main: main,
    single: single,
    diff: {
      net: main.household.net - single.household.net,
      incomeTax: main.household.incomeTax - single.household.incomeTax,
      residentTax: main.household.residentTax - single.household.residentTax,
      social: main.household.social - single.household.social
    },
    presets: presets
  };
}

var api = {
  compute: compute,
  computeHousehold: computeHousehold,
  residentSalaryIncome: residentSalaryIncome,
  residentTax: residentTax
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.SetaiEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

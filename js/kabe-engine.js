/* 年収の壁チェッカー エンジン
 * 仕様: ~/workspace/notes/tax-tools-spec-08-kabe.md
 * データ: data/nencho/tables-2026.json（所得税の表。第5弾と共用）
 *         data/juminzei/rules.json（住民税の全国共通ルール。第2弾と共用）
 *         data/kenpo/rates-2026.json（協会けんぽ料率・等級表）
 *         data/shaho/params-2026.json（厚生年金等級表・雇用保険料率）
 * 部品: SetaiEngine.computeHousehold（配偶者モードの世帯計算。仕様§1.11 流用可）、
 *       NenchoEngine（所得税の控除表）、ShahoEngine（社会保険料）を組み合わせて使う。
 * 住民税の単身計算は SetaiEngine.residentTax の方式（rules.json 共用・総額ベース）を
 * 本ファイルに写し、特定親族特別控除（住民税）と勤労学生控除（住民税）を足したもの。
 * 金額の端数処理は浮動小数点誤差を避けるため、可能な限り整数演算で行う。
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

/* ---------- 壁の線（給与収入換算。根拠は仕様§1） ---------- */
var RESIDENT_WALL_1 = 1100000;      // K1 住民税の壁（1級地・単身。§1.4）
var RESIDENT_WALL_2 = 1065000;      // K1 2級地（併記用）
var RESIDENT_WALL_3 = 1030000;      // K1 3級地（併記用）
var RESIDENT_LIMIT_SINGLE = 450000; // K1 判定: 合計所得金額（住民税用）45万円（1級地・単身）
var WAGE_MONTHLY_LINE = 88000;      // K2 賃金要件（月額。§1.5）
var WAGE_ANNUAL_GUIDE = 1056000;    // K2 年収換算の目安（8.8万円 × 12）
var DEPENDENT_LINE = 1300000;       // K3 被扶養者の年間収入の線（未満。§1.6）
var DEPENDENT_LINE_YOUNG = 1500000; // K3b 19歳以上23歳未満（未満。§1.6）
var SPOUSE_DED_LINE = 1360000;      // K4 配偶者控除の壁（配偶者の合計所得62万円。§1.7）
var SPOUSE_FULL_LINE = 1690000;     // K5 配偶者特別控除の満額ゾーン上限（同95万円）
var SPOUSE_END_LINE = 2070000;      // K6 配偶者特別控除の消滅（同133万円）
var DEP_DED_LINE = 1360000;         // K7 扶養控除の壁（子の合計所得62万円。§1.8）
var SPEC_REL_END_LINE = 1970000;    // K8 特定親族特別控除の消滅（同123万円）
var INCOME_TAX_WALL = 1780000;      // K9 所得税の壁（令和8年分。§1.3）
var WORKING_STUDENT_LINE = 1630000; // K10 勤労学生控除の壁（本人の合計所得89万円。§1.9）

/* 合計所得金額の線（判定はこちらで行い、表示は給与収入換算。仕様§3-2） */
var SPOUSE_DED_LIMIT = 620000;
var SPOUSE_FULL_LIMIT = 950000;
var SPOUSE_END_LIMIT = 1330000;
var SPEC_REL_END_LIMIT = 1230000;
var WORKING_STUDENT_LIMIT = 890000;
var RESIDENT_DEP_LIMIT = 580000;    // 住民税の扶養親族等の所得要件（rules.json）

/* ---------- 換算 ---------- */
/* 所得税の合計所得金額（給与のみ。所得金額調整控除は本ツールの判定対象者には付かない前提） */
function totalIncomeTax(t, income) { return NenchoEngine.salaryAfterDeduction(t, yen0(income)); }
/* 住民税の合計所得金額（第7弾 §1.3(b) と同一） */
function residentIncome(income) { return SetaiEngine.residentSalaryIncome(income); }

/* ---------- 社会保険料（年額・本人負担） ---------- */
/* 第7弾 §1.4(a) と同じ導出: 月給目安 = 年収 ÷ 12（賞与なし）を等級表に当てはめる */
function zeroSocial() {
  return {
    monthlyGross: 0, standardHealth: null, standardPension: null,
    health: 0, care: 0, child: 0, pension: 0, employment: 0, total: 0
  };
}
function socialAnnual(data, income, ageBand, prefecture, industry) {
  income = yen0(income);
  if (income <= 0) return zeroSocial();
  var monthlyGross = Math.floor(income / 12);
  var r = ShahoEngine.compute(
    { kenpo: data.kenpo, params: data.shahoParams },
    {
      prefecture: prefecture, ageBand: ageBand,
      salaryMode: 'gross', gross: monthlyGross,
      bonusGross: 0, bonusCount: 0,
      industry: industry, employmentInsured: true, cumulativeBonus: 0
    });
  var a = r.annual.items;
  return {
    monthlyGross: monthlyGross,
    standardHealth: r.monthly.standardHealth, standardPension: r.monthly.standardPension,
    health: a.health.insured, care: a.care.insured, child: a.child.insured,
    pension: a.pension.insured, employment: a.employment.insured,
    total: r.annual.totals.insured
  };
}

/* ---------- 住民税（単身〜親子。rules.json 共用の総額ベース計算） ---------- */
/* args: { salary （住民税用の合計所得金額）, social,
 *         depGeneral, depSpecific （扶養控除の人数）,
 *         specialRelativeAmount （特定親族特別控除・住民税の額）,
 *         workingStudent （勤労学生控除の対象者か。控除は所得85万円以下で適用）,
 *         headcount, hasDependents } */
function residentTaxSingle(rules, args) {
  var total = args.salary;
  var ded = rules.income_deductions;

  var basic = 0;
  for (var i = 0; i < ded.basic.by_total_income.length; i++) {
    var row = ded.basic.by_total_income[i];
    if (row.total_income_max_yen === null || total <= row.total_income_max_yen) { basic = row.deduction_yen; break; }
  }

  var depAmount = count0(args.depGeneral) * 330000 + count0(args.depSpecific) * 450000;
  var specRelAmount = yen0(args.specialRelativeAmount);
  var wsAmount = (args.workingStudent && total <= 850000) ? ded.working_student.deduction_yen : 0;

  var deductionsTotal = args.social + depAmount + specRelAmount + wsAmount + basic;
  var taxable = Math.max(0, Math.floor((total - deductionsTotal) / 1000) * 1000);

  /* 調整控除（人的控除額の差。特定親族特別控除の差額は rules.json に表がないため入れない） */
  var diffs = rules.adjustment_deduction.personal_deduction_differences_yen;
  var diffTotal = 0;
  if (total <= 25000000) {
    diffTotal += diffs.basic;
    diffTotal += count0(args.depGeneral) * diffs.dependent.general
               + count0(args.depSpecific) * diffs.dependent.specific;
    if (wsAmount > 0) diffTotal += diffs.working_student;
  }
  var adjustment = 0;
  if (total <= 25000000) {
    if (taxable <= 2000000) adjustment = Math.floor(Math.min(diffTotal, taxable) * 5 / 100);
    else adjustment = Math.floor(Math.max(diffTotal - (taxable - 2000000), 50000) * 5 / 100);
  }

  /* 非課税判定（1級地。第7弾 §1.6 と同じ算式） */
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
    dependentAmount: depAmount, specialRelativeAmount: specRelAmount,
    workingStudentAmount: wsAmount, social: args.social,
    deductionsTotal: deductionsTotal, taxable: taxable,
    adjustment: adjustment, incomeLevy: incomeLevy,
    perCapita: perCapita, forest: forest, tax: tax,
    headcount: n, nontaxPerCapita: nontaxPerCapita, nontaxIncomeLevy: nontaxIncomeLevy
  };
}

/* 住民税の特定親族特別控除額（rules.json の表。子の住民税用所得から） */
function residentSpecialRelative(rules, childResidentIncome) {
  var tbl = rules.income_deductions.special_relative_special.table;
  if (childResidentIncome <= RESIDENT_DEP_LIMIT) return 0;
  for (var i = 0; i < tbl.length; i++) {
    if (childResidentIncome <= tbl[i].relative_income_max_yen) return tbl[i].deduction_yen;
  }
  return 0;
}

/* ---------- 1人分の税計算（学生モードの子・親、自分モード用） ---------- */
/* opts: { income, ageBand, prefecture, industry,
 *         socialMode: 'join'|'dependent'|'kokuho',
 *         student: 勤労学生控除の対象者か（K10。本人の合計所得89万円以下で適用）,
 *         childLink: null | { ageBand: 'under19'|'19to22'|'23plus', totalIncome, residentIncome } } */
function personTax(data, opts) {
  var t = data.tables;
  var income = yen0(opts.income);
  var salaryTax = NenchoEngine.salaryAfterDeduction(t, income);
  var salaryResident = residentIncome(income);
  var totalTax = salaryTax; /* 子供を付けた親の所得金額調整控除は NenchoEngine 側で差し引かれる */

  var social = opts.socialMode === 'join'
    ? socialAnnual(data, income, opts.ageBand, opts.prefecture, opts.industry)
    : zeroSocial();
  var socialDeduction = opts.socialMode === 'kokuho' ? 0 : social.total;

  /* 子の付け方（所得税） */
  var depGeneral = 0, depSpecific = 0, specificRelatives = [];
  var childItKind = null;
  if (opts.childLink) {
    var cl = opts.childLink;
    if (cl.totalIncome <= SPOUSE_DED_LIMIT) {
      if (cl.ageBand === '19to22') { depSpecific = 1; childItKind = '特定扶養控除'; }
      else { depGeneral = 1; childItKind = '扶養控除'; }
    } else if (cl.ageBand === '19to22' && cl.totalIncome <= SPEC_REL_END_LIMIT) {
      specificRelatives = [cl.totalIncome];
      childItKind = '特定親族特別控除';
    }
  }
  var workingStudent = !!opts.student && totalTax <= WORKING_STUDENT_LIMIT;

  var nc = NenchoEngine.compute(t, {
    income: income,
    socialInsurance: socialDeduction,
    smallBusiness: 0, withheld: 0, housing: 0, otherIncome: 0,
    life: { newGeneral: 0, oldGeneral: 0, care: 0, newPension: 0, oldPension: 0 },
    hasYoungDependent: false, quake: 0, oldLongDamage: 0,
    spouse: { has: false, income: 0, elderly: false },
    specificRelatives: specificRelatives,
    dependents: {
      general: depGeneral, specific: depSpecific,
      elderlyCohab: 0, elderlyOther: 0,
      disabledGeneral: 0, disabledSpecial: 0, disabledCohabSpecial: 0,
      selfStatus: workingStudent ? 'workingStudent' : 'none'
    },
    adjustmentEligible: !!opts.childLink && opts.childLink.totalIncome <= SPOUSE_DED_LIMIT &&
      opts.childLink.ageBand !== '23plus'
  });
  totalTax = nc.totalIncome;

  /* 子の付け方（住民税） */
  var rtDepGeneral = 0, rtDepSpecific = 0, rtSpecRel = 0, childRtKind = null;
  if (opts.childLink) {
    var cl2 = opts.childLink;
    if (cl2.residentIncome <= RESIDENT_DEP_LIMIT) {
      if (cl2.ageBand === '19to22') { rtDepSpecific = 1; childRtKind = '特定扶養控除'; }
      else { rtDepGeneral = 1; childRtKind = '扶養控除'; }
    } else if (cl2.ageBand === '19to22' && cl2.residentIncome <= SPEC_REL_END_LIMIT) {
      rtSpecRel = residentSpecialRelative(data.rules, cl2.residentIncome);
      if (rtSpecRel > 0) childRtKind = '特定親族特別控除';
    }
  }
  var childCounted = !!opts.childLink && opts.childLink.residentIncome <= RESIDENT_DEP_LIMIT;
  var rt = residentTaxSingle(data.rules, {
    salary: salaryResident,
    social: socialDeduction,
    depGeneral: rtDepGeneral, depSpecific: rtDepSpecific,
    specialRelativeAmount: rtSpecRel,
    workingStudent: !!opts.student,
    headcount: 1 + (childCounted ? 1 : 0),
    hasDependents: childCounted
  });

  var wsAmount = workingStudent ? t.dependent_amounts.working_student : 0;
  return {
    income: income,
    salaryTax: salaryTax, salaryResident: salaryResident,
    adjustment: nc.adjustment, totalTax: totalTax,
    socialMode: opts.socialMode,
    social: opts.socialMode === 'kokuho' ? null : social,
    socialDeduction: socialDeduction,
    incomeTax: {
      spouseAmount: 0, spouseKind: null,
      dependentAmount: nc.dependentEtc - wsAmount,
      specificRelativeAmount: nc.specificTotal,
      workingStudentAmount: wsAmount,
      childKind: childItKind,
      basic: nc.basic, social: socialDeduction,
      deductionsTotal: nc.deductionsTotal, taxable: nc.taxable, tax: nc.annualTax
    },
    residentTax: {
      tax: rt.tax, incomeLevy: rt.incomeLevy, perCapita: rt.perCapita, forest: rt.forest,
      taxable: rt.taxable, adjustment: rt.adjustment, basic: rt.basic,
      dependentAmount: rt.dependentAmount, specialRelativeAmount: rt.specialRelativeAmount,
      workingStudentAmount: rt.workingStudentAmount,
      childKind: childRtKind, deductionsTotal: rt.deductionsTotal,
      nontaxPerCapita: rt.nontaxPerCapita, nontaxIncomeLevy: rt.nontaxIncomeLevy
    },
    net: income - socialDeduction - nc.annualTax - rt.tax,
    netIsReference: opts.socialMode === 'kokuho'
  };
}

/* ---------- K2: 106万円の壁の判定（§1.5・§3-3） ---------- */
/* input: { weeklyHours: 'lt20'|'ge20'|'full', monthlyWage, employees: '51plus'|'le50'|'unknown', isStudent } */
function judgeK2(input) {
  if (input.weeklyHours === 'full') {
    return { kind: 'full', met: true, missing: [], unknownSize: false };
  }
  var missing = [];
  if (input.weeklyHours !== 'ge20') missing.push('hours');
  if (!(yen0(input.monthlyWage) >= WAGE_MONTHLY_LINE)) missing.push('wage');
  if (input.isStudent) missing.push('student');
  if (input.employees === 'unknown') {
    if (missing.length === 0) return { kind: 'unknown', met: false, missing: [], unknownSize: true };
    return { kind: 'not', met: false, missing: missing, unknownSize: true };
  }
  if (input.employees !== '51plus') missing.push('size');
  return { kind: missing.length ? 'not' : 'join', met: missing.length === 0, missing: missing, unknownSize: false };
}
/* 賃金要件以外の3要件（時間・規模・学生でない）が満たされているか（谷の計算の前提） */
function k2NonWageMet(input) {
  return input.weeklyHours === 'ge20' && input.employees === '51plus' && !input.isStudent;
}

/* 壁オブジェクトの雛形 */
function wall(id, name, line) {
  return {
    id: id, name: name, line: line,
    status: 'within', remaining: null, overBy: null,
    type: null, impact: null, detail: {}
  };
}

/* K1 住民税の壁（単身・1級地。§1.4） */
function wallK1(income) {
  var w = wall('K1', '住民税の壁', RESIDENT_WALL_1);
  var ri = residentIncome(income);
  if (ri > RESIDENT_LIMIT_SINGLE) { w.status = 'over'; w.overBy = yen0(income) - RESIDENT_WALL_1; }
  else { w.status = 'within'; w.remaining = RESIDENT_WALL_1 - yen0(income); }
  w.detail = { residentIncome: ri, limit: RESIDENT_LIMIT_SINGLE, wall2: RESIDENT_WALL_2, wall3: RESIDENT_WALL_3 };
  return w;
}

/* K9 所得税の壁（理論値。§1.3）。theoreticalTax は社保控除等なしの年税額 */
function wallK9(t, income) {
  var w = wall('K9', '所得税の壁', INCOME_TAX_WALL);
  if (yen0(income) > INCOME_TAX_WALL) { w.status = 'over'; w.overBy = yen0(income) - INCOME_TAX_WALL; }
  else { w.status = 'within'; w.remaining = INCOME_TAX_WALL - yen0(income); }
  var nc = NenchoEngine.compute(t, {
    income: yen0(income), socialInsurance: 0, smallBusiness: 0, withheld: 0, housing: 0, otherIncome: 0,
    life: { newGeneral: 0, oldGeneral: 0, care: 0, newPension: 0, oldPension: 0 },
    hasYoungDependent: false, quake: 0, oldLongDamage: 0,
    spouse: { has: false, income: 0, elderly: false }, specificRelatives: [],
    dependents: { general: 0, specific: 0, elderlyCohab: 0, elderlyOther: 0,
      disabledGeneral: 0, disabledSpecial: 0, disabledCohabSpecial: 0, selfStatus: 'none' },
    adjustmentEligible: false
  });
  w.detail = { theoreticalTax: nc.annualTax, salaryTax: nc.salaryAfter, basic: nc.basic };
  return w;
}

/* K2 の壁（§1.5）。valley は { referenceNet, afterNet, diff } | null */
function wallK2(k2, monthlyWage, valley) {
  var w = wall('K2', '106万円の壁（社会保険の加入）', WAGE_ANNUAL_GUIDE);
  w.type = 'cliff';
  if (k2.kind === 'full') w.status = 'na';
  else if (k2.kind === 'join') w.status = 'over';
  else if (k2.kind === 'unknown') w.status = 'unknown';
  else w.status = 'within';
  w.detail = {
    monthlyWage: yen0(monthlyWage), wageLine: WAGE_MONTHLY_LINE,
    wageRemaining: Math.max(0, WAGE_MONTHLY_LINE - yen0(monthlyWage)),
    missing: k2.missing, kind: k2.kind
  };
  if (valley) w.impact = { kind: 'householdNetDiff', amount: valley.diff, referenceNet: valley.referenceNet, afterNet: valley.afterNet };
  return w;
}

/* K3/K3b 被扶養者の壁（§1.6）。line は 130万円 or 150万円 */
function wallK3(income, line, young) {
  var w = wall(young ? 'K3b' : 'K3', young ? '150万円の壁（被扶養者・19〜22歳）' : '130万円の壁（被扶養者）', line);
  w.type = 'cliff';
  if (yen0(income) < line) { w.status = 'within'; w.remaining = line - yen0(income); }
  else { w.status = 'over'; w.overBy = yen0(income) - line; }
  w.detail = { monthlyGuide: Math.floor(line / 12) };
  return w;
}

/* ---------- 配偶者モード ---------- */
function computeSpouse(data, input) {
  var t = data.tables;
  var income = yen0(input.income);
  var supporterIncome = yen0(input.supporterIncome);
  var k2 = judgeK2(input);

  /* 配偶者（働く本人）の社会保険の扱い（§3-7） */
  var route;
  if (k2.kind === 'full' || k2.met) route = 'join';
  else if (income < DEPENDENT_LINE) route = 'dependent';
  else route = 'kokuho';

  function household(spIncome, spRoute) {
    return SetaiEngine.computeHousehold(data, {
      self: { income: supporterIncome, ageBand: input.supporterAgeBand, bonusPer: 0, bonusCount: 0 },
      spouse: { income: yen0(spIncome), ageBand: input.selfAgeBand, bonusPer: 0, bonusCount: 0 },
      prefecture: input.prefecture, industry: 'general',
      spouseSocial: spRoute === 'join' ? 'join' : 'dependent',
      children: { under16: 0, general: 0, specific: 0, parent: 'self' }
    });
  }
  var cur = household(income, route);

  /* 谷・ステップ表・回復点（§1.12）: 賃金以外の要件を満たす場合のみ金額を出す */
  var nonWageMet = k2NonWageMet(input);
  var valley = null, recovery = null, steps = null;
  if (nonWageMet || k2.kind === 'full') {
    var refHousehold = household(1050000, 'dependent');
    var afterHousehold = household(1070000, 'join');
    valley = {
      referenceIncome: 1050000, referenceNet: refHousehold.household.net,
      afterIncome: 1070000, afterNet: afterHousehold.household.net,
      diff: afterHousehold.household.net - refHousehold.household.net
    };
    if (nonWageMet && valley.diff < 0) {
      for (var ri = 1060000; ri <= 3000000; ri += 10000) {
        if (household(ri, 'join').household.net >= valley.referenceNet) { recovery = ri; break; }
      }
    }
  }
  /* ステップ表（§1.12）: 現在＋壁の直前・直後 */
  var stepPoints = [income, 1050000, 1070000, 1290000, 1310000];
  var seen = {};
  steps = [];
  stepPoints.forEach(function (p) {
    if (seen[p]) return;
    seen[p] = true;
    var r2;
    if (p === income) r2 = route;
    else if (k2.kind === 'full') r2 = 'join';
    else if (nonWageMet && Math.floor(p / 12) >= WAGE_MONTHLY_LINE) r2 = 'join';
    else if (p < DEPENDENT_LINE) r2 = 'dependent';
    else if (nonWageMet) r2 = 'join';
    else r2 = 'kokuho';
    var h = household(p, r2);
    steps.push({
      income: p, route: r2,
      spouseSocial: r2 === 'kokuho' ? null : h.spouse.social.total,
      spouseNet: r2 === 'kokuho' ? null : h.spouse.net,
      householdNet: r2 === 'kokuho' ? null : h.household.net,
      current: p === income
    });
  });
  steps.sort(function (a, b) { return a.income - b.income; });

  /* 壁の組み立て */
  var walls = [];
  var w1 = wallK1(income);
  w1.impact = { kind: 'residentTax', amount: cur.spouse.residentTax.tax };
  walls.push(w1);
  walls.push(wallK2(k2, input.monthlyWage, nonWageMet ? valley : null));
  var w3 = wallK3(income, DEPENDENT_LINE, false);
  if (route === 'join') w3.impact = { kind: 'socialCost', amount: cur.spouse.social.total };
  w3.detail.route = route;
  w3.detail.supporterHalf = supporterIncome > 0 ? Math.floor(supporterIncome / 2) : null;
  walls.push(w3);

  var spouseTotal = totalIncomeTax(t, income);
  var supporterTotal = totalIncomeTax(t, supporterIncome);
  var spouseDedNa = supporterIncome <= 0 || supporterTotal > t.spouse.own_limit;
  function spouseWall(id, name, line, limit) {
    var w = wall(id, name, line);
    if (spouseDedNa) { w.status = 'na'; return w; }
    if (spouseTotal <= limit) { w.status = 'within'; w.remaining = line - income; }
    else { w.status = 'over'; w.overBy = income - line; }
    return w;
  }
  var w4 = spouseWall('K4', '配偶者控除の壁', SPOUSE_DED_LINE, SPOUSE_DED_LIMIT);
  w4.type = 'switch';
  if (!spouseDedNa) {
    w4.detail = {
      kindNow: cur.self.incomeTax.spouseKind, amountNow: cur.self.incomeTax.spouseAmount,
      supporterTotal: supporterTotal
    };
  }
  walls.push(w4);
  var w5 = spouseWall('K5', '配偶者特別控除の満額ゾーン上限', SPOUSE_FULL_LINE, SPOUSE_FULL_LIMIT);
  w5.type = 'gradual';
  if (!spouseDedNa) {
    var fullAmount = NenchoEngine.spouseDeduction(t, supporterTotal, true, SPOUSE_FULL_LIMIT, false).amount;
    w5.detail = { amountNow: cur.self.incomeTax.spouseAmount, fullAmount: fullAmount, supporterTotal: supporterTotal };
    if (w5.status === 'over') {
      var atFull = household(SPOUSE_FULL_LINE, 'dependent');
      w5.impact = {
        kind: 'deductionDecrease', amount: fullAmount - cur.self.incomeTax.spouseAmount,
        incomeTaxIncrease: cur.self.incomeTax.tax - atFull.self.incomeTax.tax
      };
    }
  }
  walls.push(w5);
  var w6 = spouseWall('K6', '配偶者特別控除の消滅', SPOUSE_END_LINE, SPOUSE_END_LIMIT);
  w6.type = 'gradual';
  if (!spouseDedNa) {
    w6.detail = { amountNow: cur.self.incomeTax.spouseAmount, supporterTotal: supporterTotal };
    if (w6.status === 'over') {
      var atEnd = household(SPOUSE_END_LINE, 'dependent');
      w6.impact = {
        kind: 'deductionLost', amount: 0,
        incomeTaxIncrease: cur.self.incomeTax.tax - atEnd.self.incomeTax.tax
      };
    }
  }
  walls.push(w6);
  var w9 = wallK9(t, income);
  w9.impact = { kind: 'incomeTax', amount: cur.spouse.incomeTax.tax };
  walls.push(w9);

  var worker = cur.spouse;
  if (route === 'kokuho') worker = Object.assign({}, cur.spouse, { social: null });
  return {
    mode: 'spouse', k2: k2, route: route,
    walls: walls,
    worker: worker, supporter: cur.self,
    household: {
      income: cur.household.income,
      social: route === 'kokuho' ? null : cur.household.social,
      incomeTax: cur.household.incomeTax, residentTax: cur.household.residentTax,
      net: cur.household.net, netIsReference: route === 'kokuho'
    },
    steps: steps, valley: valley,
    recovery: recovery ? { income: recovery, referenceNet: valley.referenceNet, referenceIncome: valley.referenceIncome } : null
  };
}

/* ---------- 学生モード ---------- */
function computeStudent(data, input) {
  var t = data.tables;
  var income = yen0(input.income);
  var childTotal = totalIncomeTax(t, income);
  var childResident = residentIncome(income);
  var young = input.studentAgeBand === '19to22';
  var line = young ? DEPENDENT_LINE_YOUNG : DEPENDENT_LINE;
  var k2 = judgeK2({
    weeklyHours: input.weeklyHours, monthlyWage: input.monthlyWage,
    employees: input.employees, isStudent: true
  });

  var route;
  if (k2.kind === 'full') route = 'join';
  else if (income < line) route = 'dependent';
  else route = 'kokuho';

  var childLink = { ageBand: input.studentAgeBand, totalIncome: childTotal, residentIncome: childResident };
  function childAt(inc, studentFlag) {
    return personTax(data, {
      income: inc, ageBand: input.selfAgeBand, prefecture: input.prefecture, industry: 'general',
      socialMode: inc === income ? route : (k2.kind === 'full' ? 'join' : (inc < line ? 'dependent' : 'kokuho')),
      student: studentFlag, childLink: null
    });
  }
  function parentAt(cInc) {
    return personTax(data, {
      income: yen0(input.supporterIncome), ageBand: '40to64', prefecture: input.prefecture, industry: 'general',
      socialMode: 'join', student: false,
      childLink: { ageBand: input.studentAgeBand, totalIncome: totalIncomeTax(t, cInc), residentIncome: residentIncome(cInc) }
    });
  }
  var child = childAt(income, true);
  var parent = parentAt(income);

  var walls = [];
  var w1 = wallK1(income);
  w1.impact = { kind: 'residentTax', amount: child.residentTax.tax };
  walls.push(w1);
  walls.push(wallK2(k2, input.monthlyWage, null));
  var w3 = wallK3(income, line, young);
  w3.detail.route = route;
  w3.detail.supporterHalf = yen0(input.supporterIncome) > 0 ? Math.floor(yen0(input.supporterIncome) / 2) : null;
  if (route === 'join') w3.impact = { kind: 'socialCost', amount: child.social ? child.social.total : 0 };
  walls.push(w3);

  /* K7 扶養控除の壁 */
  var w7 = wall('K7', '扶養控除の壁（親側）', DEP_DED_LINE);
  w7.type = young ? 'switch' : 'cliff';
  if (childTotal <= SPOUSE_DED_LIMIT) { w7.status = 'within'; w7.remaining = DEP_DED_LINE - income; }
  else { w7.status = 'over'; w7.overBy = income - DEP_DED_LINE; }
  w7.detail = {
    childTotal: childTotal,
    parentAmountNow: parent.incomeTax.dependentAmount + parent.incomeTax.specificRelativeAmount,
    parentKindNow: parent.incomeTax.childKind
  };
  if (w7.status === 'over' && !young) {
    var pAt = parentAt(DEP_DED_LINE);
    w7.impact = {
      kind: 'parentTaxIncrease',
      amount: (parent.incomeTax.tax + parent.residentTax.tax) - (pAt.incomeTax.tax + pAt.residentTax.tax)
    };
  }
  walls.push(w7);

  /* K8 特定親族特別控除の消滅（19〜22歳のみ） */
  if (young) {
    var w8 = wall('K8', '特定親族特別控除の消滅（親側）', SPEC_REL_END_LINE);
    w8.type = 'gradual';
    if (childTotal <= SPEC_REL_END_LIMIT) { w8.status = 'within'; w8.remaining = SPEC_REL_END_LINE - income; }
    else { w8.status = 'over'; w8.overBy = income - SPEC_REL_END_LINE; }
    w8.detail = {
      childTotal: childTotal,
      parentAmountNow: parent.incomeTax.specificRelativeAmount
    };
    if (w8.status === 'over') {
      var pAt8 = parentAt(SPEC_REL_END_LINE);
      w8.impact = {
        kind: 'parentTaxIncrease',
        amount: (parent.incomeTax.tax + parent.residentTax.tax) - (pAt8.incomeTax.tax + pAt8.residentTax.tax)
      };
    }
    walls.push(w8);
  }

  var w9 = wallK9(t, income);
  w9.impact = { kind: 'incomeTax', amount: child.incomeTax.tax };
  walls.push(w9);

  /* K10 勤労学生控除の壁 */
  var w10 = wall('K10', '勤労学生控除の壁', WORKING_STUDENT_LINE);
  w10.type = 'cliff';
  if (childTotal <= WORKING_STUDENT_LIMIT) { w10.status = 'within'; w10.remaining = WORKING_STUDENT_LINE - income; }
  else { w10.status = 'over'; w10.overBy = income - WORKING_STUDENT_LINE; }
  w10.detail = { childTotal: childTotal, amountNow: child.incomeTax.workingStudentAmount };
  if (w10.status === 'over') {
    var cNoWs = childAt(income, false);
    w10.impact = {
      kind: 'ownTaxIncrease',
      amount: (cNoWs.incomeTax.tax + cNoWs.residentTax.tax) - (child.incomeTax.tax + child.residentTax.tax)
    };
  }
  walls.push(w10);

  return {
    mode: 'student', k2: k2, route: route,
    walls: walls,
    worker: child, supporter: parent,
    household: null, steps: null, valley: null, recovery: null,
    childLink: childLink
  };
}

/* ---------- 自分モード ---------- */
function computeSelf(data, input) {
  var t = data.tables;
  var income = yen0(input.income);
  var person = personTax(data, {
    income: income, ageBand: input.selfAgeBand, prefecture: input.prefecture, industry: 'general',
    socialMode: 'join', student: false, childLink: null
  });
  var walls = [];
  var w1 = wallK1(income);
  w1.impact = { kind: 'residentTax', amount: person.residentTax.tax };
  walls.push(w1);
  var w9 = wallK9(t, income);
  w9.impact = { kind: 'incomeTax', amount: person.incomeTax.tax };
  walls.push(w9);
  return {
    mode: 'self', k2: null, route: 'join',
    walls: walls,
    worker: person, supporter: null,
    household: null, steps: null, valley: null, recovery: null
  };
}

/* ---------- 全体 ---------- */
/* input: { mode: 'spouse'|'student'|'self',
 *   income, monthlyWage, weeklyHours, employees, isStudent,
 *   supporterIncome, prefecture, selfAgeBand, supporterAgeBand,
 *   studentAgeBand: 'under19'|'19to22'|'23plus' } */
function compute(data, input) {
  if (input.mode === 'student') return computeStudent(data, input);
  if (input.mode === 'self') return computeSelf(data, input);
  return computeSpouse(data, input);
}

var api = {
  compute: compute,
  judgeK2: judgeK2,
  personTax: personTax,
  residentTaxSingle: residentTaxSingle,
  totalIncomeTax: totalIncomeTax,
  residentIncome: residentIncome,
  LINES: {
    RESIDENT_WALL_1: RESIDENT_WALL_1, RESIDENT_WALL_2: RESIDENT_WALL_2, RESIDENT_WALL_3: RESIDENT_WALL_3,
    WAGE_MONTHLY_LINE: WAGE_MONTHLY_LINE, WAGE_ANNUAL_GUIDE: WAGE_ANNUAL_GUIDE,
    DEPENDENT_LINE: DEPENDENT_LINE, DEPENDENT_LINE_YOUNG: DEPENDENT_LINE_YOUNG,
    SPOUSE_DED_LINE: SPOUSE_DED_LINE, SPOUSE_FULL_LINE: SPOUSE_FULL_LINE, SPOUSE_END_LINE: SPOUSE_END_LINE,
    DEP_DED_LINE: DEP_DED_LINE, SPEC_REL_END_LINE: SPEC_REL_END_LINE,
    INCOME_TAX_WALL: INCOME_TAX_WALL, WORKING_STUDENT_LINE: WORKING_STUDENT_LINE
  }
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.KabeEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

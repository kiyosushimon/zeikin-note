/* 実質時給チェッカー エンジン
 * 仕様: ~/workspace/notes/tax-tools-spec-11-jikyu.md
 * 「実質時給」に法定の定義はないため、本エンジンの数字は仕様§1.1・§1.2の定義による。
 * 所定時給は労働基準法施行規則第19条の換算（第9弾 zangyo-engine と同一方式・50銭ルール）。
 * 手取りは既存部品の合成（仕様§1.4。第7弾 setai-engine の1人分計算と同じ手順）:
 *   社会保険料 = ShahoEngine（data/kenpo/rates-2026.json・data/shaho/params-2026.json）
 *   所得税     = NenchoEngine（data/nencho/tables-2026.json、控除は社保と基礎控除のみ）
 *   住民税     = SetaiEngine.residentTax（data/juminzei/rules.json、標準税率・1級地・単身）
 * 最低賃金チェックは厚生労働省の公式方法（対象賃金 ÷ 1か月平均所定労働時間）で、
 * データは data/jikyu/minimum-wage.json（発効日つき履歴。実行日で切り替える）。
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
function hours0(n) { var v = parseFloat(n); return isNaN(v) || v < 0 ? 0 : v; }
function optYen(n) { return (n === null || n === undefined || n === '') ? null : yen0(n); }

/* 50銭ルール（第9弾 zangyo-engine の round50 と同一。浮動小数点誤差の補正つき） */
function round50(x) {
  if (!(x > 0)) return 0;
  return Math.floor(x + 0.5 + 1e-6);
}
/* 実質時給の表示丸め: 小数第1位まで四捨五入（仕様§1.7。設計判断） */
function round1(x) { return Math.round(x * 10 + 1e-9) / 10; }
/* 最低賃金チェックの時間額の表示丸め: 小数第2位まで切り捨て（仕様§1.5。公式例の表示に合わせる） */
function floor2(x) { return Math.floor(x * 100 + 1e-9) / 100; }

/* 1か月平均所定労働時間数の補助計算（第9弾と共用する式。仕様§1.5・§2 H1）:
 * （365日 − 年間の所定休日日数）× 1日の所定労働時間数 ÷ 12。小数第1位まで */
function avgMonthlyHours(annualHolidays, hoursPerDay) {
  var h = yen0(annualHolidays);
  var d = hours0(hoursPerDay);
  if (d <= 0 || h >= 365) return 0;
  return Math.round((365 - h) * d / 12 * 10) / 10;
}

/* ---------- 最低賃金: 実行日時点で効力のある額を選ぶ（仕様§4） ---------- */
/* dateStr: 'YYYY-MM-DD'。履歴は from の昇順に並んでいる前提で、from <= dateStr の最後の要素 */
function minWageOn(minwage, prefecture, dateStr) {
  var list = (minwage && minwage.prefectures && minwage.prefectures[prefecture]) || [];
  var chosen = null;
  for (var i = 0; i < list.length; i++) {
    if (list[i].from <= dateStr) chosen = list[i];
  }
  return chosen;
}

/* ---------- 最低賃金チェック単体（仕様§1.5・§3-4） ---------- */
/* targetMonthly: 最低賃金の対象となる賃金（月額）。avgHours: 1か月平均所定労働時間数 */
function minWageCheck(minwage, prefecture, targetMonthly, avgHours, dateStr) {
  var mw = minWageOn(minwage, prefecture, dateStr);
  if (!mw || !(avgHours > 0)) return null;
  var raw = yen0(targetMonthly) / avgHours;
  return {
    prefecture: prefecture,
    targetMonthly: yen0(targetMonthly),
    avgHours: avgHours,
    hourlyRaw: raw,
    hourly: floor2(raw),           /* 表示用（小数第2位まで切り捨て） */
    minWage: mw.amount,
    minWageFrom: mw.from,
    ok: raw >= mw.amount,          /* 比較は丸め前の値で行う */
    diff: mw.amount - raw          /* 不足額（ok のときは0以下） */
  };
}

/* ---------- 手取りの合成（方式(b)。仕様§1.4） ---------- */
function netBreakdown(data, annualIncome, bonusPer, bonusCount, opts) {
  var bonusTotal = yen0(bonusPer) * count0(bonusCount);
  var monthlyGross = Math.max(0, Math.floor((annualIncome - bonusTotal) / 12));
  var sr = ShahoEngine.compute(
    { kenpo: data.kenpo, params: data.shahoParams },
    {
      prefecture: opts.prefecture, ageBand: opts.ageBand,
      salaryMode: 'gross', gross: monthlyGross,
      bonusGross: yen0(bonusPer), bonusCount: count0(bonusCount),
      industry: opts.industry, employmentInsured: true, cumulativeBonus: 0
    });
  var a = sr.annual.items;
  var social = sr.annual.totals.insured;

  var nc = NenchoEngine.compute(data.tables, {
    income: annualIncome,
    socialInsurance: social,
    smallBusiness: 0, withheld: 0, housing: 0, otherIncome: 0,
    life: { newGeneral: 0, oldGeneral: 0, care: 0, newPension: 0, oldPension: 0 },
    hasYoungDependent: false, quake: 0, oldLongDamage: 0,
    spouse: { has: false, income: 0, elderly: false },
    specificRelatives: [],
    dependents: {
      general: 0, specific: 0, elderlyCohab: 0, elderlyOther: 0,
      disabledGeneral: 0, disabledSpecial: 0, disabledCohabSpecial: 0,
      selfStatus: 'none'
    },
    adjustmentEligible: false
  });

  var rt = SetaiEngine.residentTax(data.rules, {
    salary: SetaiEngine.residentSalaryIncome(annualIncome),
    social: social,
    partnerSalary: 0,
    claimsSpouse: false,
    children: { under16: 0, general: 0, specific: 0 },
    headcount: 1,
    hasDependents: false
  });

  return {
    monthlyGross: monthlyGross,
    standardHealth: sr.monthly.standardHealth,
    standardPension: sr.monthly.standardPension,
    social: {
      health: a.health.insured, care: a.care.insured, child: a.child.insured,
      pension: a.pension.insured, employment: a.employment.insured,
      total: social
    },
    incomeTax: nc.annualTax,
    incomeTaxDetail: { basic: nc.basic, taxable: nc.taxable, salaryAfter: nc.salaryAfter },
    residentTax: rt.tax,
    residentDetail: { salary: rt.salary, taxable: rt.taxable },
    net: annualIncome - social - nc.annualTax - rt.tax
  };
}

/* ---------- 全体計算（仕様§3） ---------- */
/* data: { tables, rules, kenpo, shahoParams, minwage }
 * input: {
 *   mode: 'a'|'b',
 *   annualGross, aSocial, aIncomeTax, aResidentTax （方式a。税・社保は任意＝null 可）,
 *   prefecture, baseSalary, includeAllowances, excludeAllowances, fixedOvertime,
 *   variableOvertimeAnnual, bonusPer, bonusCount, ageBand, industry,
 *   minWageTarget （方式b。null の場合は算定基礎の月額を初期値として使う）,
 *   avgHours, overtimeHours, holidayHours （労働時間・方式共通）,
 *   commuteMinutes, commuteDays, takeHomeHours （参考値用。通勤は null 可）
 * }
 * today: 'YYYY-MM-DD'（最低賃金の発効日切替え用。省略時は実行日） */
function compute(data, input, today) {
  var mode = input.mode === 'a' ? 'a' : 'b';
  var dateStr = today || (function () {
    var d = new Date();
    function p(n) { return (n < 10 ? '0' : '') + n; }
    return d.getFullYear() + '-' + p(d.getMonth() + 1) + '-' + p(d.getDate());
  })();

  var avgHours = hours0(input.avgHours);
  var overtimeHours = hours0(input.overtimeHours);
  var holidayHours = hours0(input.holidayHours);
  var totalHours = (avgHours + overtimeHours + holidayHours) * 12;

  var errors = [];
  if (!(avgHours > 0)) errors.push('1か月平均所定労働時間数を入力してください');
  if (!(totalHours > 0)) errors.push('労働時間の合計が0時間です');

  var annualIncome = 0;
  var baseMonthly = null, prescribedRate = null;
  var net = null, mwCheck = null, mwUsedDefault = false;

  if (mode === 'a') {
    annualIncome = yen0(input.annualGross);
    if (!(annualIncome > 0)) errors.push('年間総支給額を入力してください');
    var aS = optYen(input.aSocial), aI = optYen(input.aIncomeTax), aR = optYen(input.aResidentTax);
    if (aS !== null && aI !== null && aR !== null) {
      net = {
        social: { total: aS }, incomeTax: aI, residentTax: aR,
        net: annualIncome - aS - aI - aR, fromStatement: true
      };
    }
  } else {
    var base = yen0(input.baseSalary);
    var incl = yen0(input.includeAllowances);
    var excl = yen0(input.excludeAllowances);
    var fixed = yen0(input.fixedOvertime);
    var bonusPer = yen0(input.bonusPer), bonusCount = count0(input.bonusCount);
    annualIncome = (base + incl + excl + fixed) * 12
      + yen0(input.variableOvertimeAnnual) + bonusPer * bonusCount;
    baseMonthly = base + incl;
    if (!(annualIncome > 0)) errors.push('基本給（と手当）を入力してください');
    if (avgHours > 0 && baseMonthly > 0) prescribedRate = round50(baseMonthly / avgHours);

    if (!errors.length) {
      net = netBreakdown(data, annualIncome, bonusPer, bonusCount, {
        prefecture: input.prefecture, ageBand: input.ageBand, industry: input.industry
      });
      net.fromStatement = false;

      var target = optYen(input.minWageTarget);
      mwUsedDefault = target === null;
      if (target === null) target = baseMonthly;
      mwCheck = minWageCheck(data.minwage, input.prefecture, target, avgHours, dateStr);
    }
  }

  var result = {
    mode: mode,
    date: dateStr,
    errors: errors,
    annualIncome: annualIncome,
    avgHours: avgHours, overtimeHours: overtimeHours, holidayHours: holidayHours,
    totalHours: totalHours,
    grossRate: null, grossRateRaw: null,
    baseMonthly: baseMonthly,
    prescribedRate: prescribedRate,
    net: net,
    netRate: null, netRateRaw: null,
    minWage: mwCheck,
    minWageUsedDefault: mwUsedDefault,
    reference: null
  };
  if (errors.length) return result;

  result.grossRateRaw = annualIncome / totalHours;
  result.grossRate = round1(result.grossRateRaw);
  if (net) {
    result.netRateRaw = net.net / totalHours;
    result.netRate = round1(result.netRateRaw);
  }

  /* 参考値（仕様§1.6・§3-6）: 通勤が入力された場合のみ */
  var cm = (input.commuteMinutes === null || input.commuteMinutes === undefined || input.commuteMinutes === '')
    ? null : hours0(input.commuteMinutes);
  var cd = count0(input.commuteDays);
  if (cm !== null && cm > 0 && cd > 0) {
    var monthlyRef = cm * 2 * cd / 60 + hours0(input.takeHomeHours);
    var annualRef = monthlyRef * 12;
    var denom = totalHours + annualRef;
    result.reference = {
      monthlyHours: monthlyRef,
      annualHours: annualRef,
      grossRate: round1(annualIncome / denom), grossRateRaw: annualIncome / denom,
      netRate: net ? round1(net.net / denom) : null,
      netRateRaw: net ? net.net / denom : null
    };
  }
  return result;
}

var api = {
  compute: compute,
  minWageOn: minWageOn,
  minWageCheck: minWageCheck,
  avgMonthlyHours: avgMonthlyHours,
  round50: round50,
  round1: round1,
  floor2: floor2
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.JikyuEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

/* 残業代計算・未払いチェック エンジン
 * 仕様: ~/workspace/notes/tax-tools-spec-09-zangyo.md
 * 根拠: 労働基準法第37条・同法施行規則第19条・第21条、通達（昭和63年3月14日基発第150号）
 * 金額の端数処理は仕様§1.5の採用方式（50銭ルール: 1円未満の端数は50銭未満切捨て・
 * 50銭以上切上げ）を、1時間当たりの賃金と区分ごとの総額に適用する。
 * 時間数の端数処理（月合計の30分丸め）は適用しない（仕様§1.5・§7.1-5）。
 */
(function (global) {
'use strict';

/* 50銭ルール（浮動小数点誤差を避けるため微小な補正を加える） */
function round50(x) {
  if (!(x > 0)) return 0;
  return Math.floor(x + 0.5 + 1e-6);
}
function yen0(n) { return Math.max(0, Math.floor(+n || 0)); }
function hours0(n) { var v = parseFloat(n); return isNaN(v) || v < 0 ? 0 : v; }

/* 区分の定義（仕様§1.1・§1.8）。rate は倍率を分数で持つ */
var CATEGORIES = [
  { key: 'otNormal',      name: '法定時間外労働（60時間以下）',        num: 5,  den: 4,  rateLabel: '1.25倍' },
  { key: 'otOver60',      name: '法定時間外労働（60時間超）',          num: 3,  den: 2,  rateLabel: '1.50倍' },
  { key: 'otNight',       name: '法定時間外労働＋深夜（60時間以下）',  num: 3,  den: 2,  rateLabel: '1.50倍' },
  { key: 'otNightOver60', name: '法定時間外労働＋深夜（60時間超）',    num: 7,  den: 4,  rateLabel: '1.75倍' },
  { key: 'holiday',       name: '法定休日労働',                        num: 27, den: 20, rateLabel: '1.35倍' },
  { key: 'holidayNight',  name: '法定休日労働＋深夜',                  num: 8,  den: 5,  rateLabel: '1.60倍' },
  { key: 'nightOnly',     name: '深夜労働のみ（割増分）',              num: 1,  den: 4,  rateLabel: '0.25倍' },
  { key: 'withinLegal',   name: '法定内残業（割増なし）',              num: 1,  den: 1,  rateLabel: '1.00倍' }
];

/* 1か月平均所定労働時間数の補助計算（仕様§1.3）:
 * （365日 − 年間の所定休日日数）× 1日の所定労働時間数 ÷ 12。小数第1位まで */
function avgMonthlyHours(annualHolidays, hoursPerDay) {
  var h = yen0(annualHolidays);
  var d = hours0(hoursPerDay);
  if (d <= 0 || h >= 365) return 0;
  return Math.round((365 - h) * d / 12 * 10) / 10;
}

/* input: {
 *   payType: 'monthly'|'hourly',
 *   baseSalary: Z2, includeAllowances: Z3, excludeAllowances: Z4（計算には使わない）,
 *   fixedOvertime: Z5, fixedOvertimeHours: Z6（任意・null可）,
 *   avgHours: Z7（月給制）, hourlyWage: Z8（時給制）,
 *   t1..t8: 時間の内訳（仕様§2）, actualPaid: C1（任意・null可）
 * } */
function compute(input) {
  var errors = [];
  var warnings = [];

  var t1 = hours0(input.t1), t2 = hours0(input.t2), t3 = hours0(input.t3),
      t4 = hours0(input.t4), t5 = hours0(input.t5), t6 = hours0(input.t6),
      t7 = hours0(input.t7), t8 = hours0(input.t8);

  /* 入力の整合性チェック（仕様§1.8-2・§3） */
  if (t2 > t1) errors.push('「法定時間外労働のうち深夜の時間」が「法定時間外労働の合計時間」を超えています');
  if (t3 > t1) errors.push('「法定時間外労働のうち月60時間を超えた時間」が「法定時間外労働の合計時間」を超えています');
  if (t4 > Math.min(t3, t2)) errors.push('「月60時間超のうち深夜の時間」が、「60時間超の時間」または「時間外のうち深夜の時間」を超えています');
  if (t6 > t5) errors.push('「法定休日労働のうち深夜の時間」が「法定休日労働の合計時間」を超えています');
  if (t3 > 0 && t1 <= 60) warnings.push('月60時間を超えた時間が入力されていますが、法定時間外労働の合計が60時間以下です。起算日からの累計で集計しているか確認してください');

  /* 1時間当たりの賃金（仕様§1.8-1） */
  var payType = input.payType === 'hourly' ? 'hourly' : 'monthly';
  var baseMonthly = 0, hourlyWage = 0;
  var fixedOvertime = yen0(input.fixedOvertime);
  if (payType === 'hourly') {
    hourlyWage = yen0(input.hourlyWage);
    if (hourlyWage <= 0) errors.push('時間給の金額を入力してください');
  } else {
    baseMonthly = yen0(input.baseSalary) + yen0(input.includeAllowances);
    var avg = hours0(input.avgHours);
    if (baseMonthly <= 0) errors.push('基本給（と算入する手当）を入力してください');
    if (avg <= 0) errors.push('1か月平均所定労働時間数を入力してください');
    if (baseMonthly > 0 && avg > 0) hourlyWage = round50(baseMonthly / avg);
  }

  var result = {
    errors: errors,
    warnings: warnings,
    payType: payType,
    baseMonthly: baseMonthly,
    excludeAllowances: yen0(input.excludeAllowances),
    fixedOvertime: fixedOvertime,
    hourlyWage: hourlyWage,
    categories: [],
    premiumTotal: 0,
    total: 0,
    fixedCheck: null,
    diff: null
  };
  if (errors.length) return result;

  /* 区分ごとの時間の組み立てと金額（仕様§1.8-2・3） */
  var hoursByKey = {
    otNormal: t1 - t2 - t3 + t4,
    otOver60: t3 - t4,
    otNight: t2 - t4,
    otNightOver60: t4,
    holiday: t5 - t6,
    holidayNight: t6,
    nightOnly: t7,
    withinLegal: t8
  };
  CATEGORIES.forEach(function (c) {
    var h = hoursByKey[c.key];
    var amount = round50(hourlyWage * c.num * h / c.den);
    result.categories.push({
      key: c.key, name: c.name, hours: h,
      rate: c.num / c.den, rateLabel: c.rateLabel, amount: amount
    });
    result.total += amount;
    if (c.key !== 'withinLegal') result.premiumTotal += amount;
  });

  /* 固定残業代のチェック（仕様§1.6・§3-3）。
   * 比較対象は割増賃金の法定計算額（法定内残業の通常賃金部分は含めない） */
  if (fixedOvertime > 0) {
    var unit = hourlyWage * 1.25;
    var settingHours = (input.fixedOvertimeHours === null || input.fixedOvertimeHours === undefined || input.fixedOvertimeHours === '')
      ? null : hours0(input.fixedOvertimeHours);
    result.fixedCheck = {
      fixed: fixedOvertime,
      statutory: result.premiumTotal,
      shortfall: Math.max(0, result.premiumTotal - fixedOvertime),
      coveredHours: unit > 0 ? fixedOvertime / unit : 0,
      settingHours: settingHours,
      settingAmount: settingHours === null ? null : round50(hourlyWage * 5 * settingHours / 4),
      overtimeHours: t1 + t5
    };
  }

  /* 明細との差額（仕様§1.8-5・§4）。本来額は割増賃金＋法定内残業の合計 */
  if (input.actualPaid !== null && input.actualPaid !== undefined && input.actualPaid !== '') {
    var paid = yen0(input.actualPaid);
    result.diff = { actualPaid: paid, expected: result.total, diff: result.total - paid };
  }

  return result;
}

var api = {
  compute: compute,
  avgMonthlyHours: avgMonthlyHours,
  round50: round50,
  CATEGORIES: CATEGORIES
};
if (typeof module !== 'undefined' && module.exports) module.exports = api;
global.ZangyoEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);

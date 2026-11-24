/*
 * 検算ランナー: node tests/run.js
 * - data/rules.json と data/rules.js（ミラー）の一致を検証する
 * - 手計算ケース（tests.md に過程を記録）の期待値とエンジン出力を突き合わせる
 */
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.join(__dirname, '..');
const rules = JSON.parse(fs.readFileSync(path.join(root, 'data', 'rules.json'), 'utf8'));

// ミラー一致チェック
const ctx = { window: {} };
vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(root, 'data', 'rules.js'), 'utf8'), ctx);
const mirrorOk = JSON.stringify(rules) === JSON.stringify(ctx.window.TAX_RULES);
console.log('rules.js mirror identical to rules.json:', mirrorOk);

const engine = require(path.join(root, 'js', 'engine.js'));

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log((ok ? '  OK  ' : '  FAIL') + ' ' + label + ': expected=' + expected + ' actual=' + actual);
}
function rowFor(result, dcYear) {
  return result.rows.find((r) => r.dcYear === dcYear);
}

/* ケース(a): 控除で全額消えて税額0 */
{
  const res = engine.computeAll(rules, {
    serviceStart: '2016-04', serviceEnd: '2026-03',
    retirementIncome: 3000000, disability: false, officerYears: 0, retirementYear: 2026,
    dcPeriods: [{ start: '2001-04', end: '2011-03' }], dcIncome: 2000000
  });
  const row = rowFor(res, 2011);
  console.log('case (a) dcYear=2011 pattern=' + row.pattern);
  check('a.retirement.deduction', row.retirement.deduction, 4000000);
  check('a.dc.deduction', row.dc.deduction, 4000000);
  check('a.totalTax', row.totalTax, 0);
  check('a.netTotal', row.netTotal, 5000000);
}

/* ケース(b): DC先行・9年ウィンドウ発動 */
{
  const res = engine.computeAll(rules, {
    serviceStart: '2002-04', serviceEnd: '2032-03',
    retirementIncome: 30000000, disability: false, officerYears: 0, retirementYear: 2032,
    dcPeriods: [{ start: '2002-04', end: '2026-03' }], dcIncome: 12345678
  });
  const row = rowFor(res, 2026);
  console.log('case (b) dcYear=2026 pattern=' + row.pattern);
  check('b.windowFired', row.explanation.fired, true);
  check('b.windowYears', row.explanation.windowYears, 9);
  check('b.deemed', row.explanation.deemed, null);
  check('b.overlapYears', row.explanation.overlapYears, 24);
  check('b.dc.taxable', row.dc.taxable, 772000);
  check('b.dc.incomeTax', row.dc.incomeTax, 39410);
  check('b.dc.residentMunicipal', row.dc.residentMunicipal, 46300);
  check('b.dc.residentPrefectural', row.dc.residentPrefectural, 30800);
  check('b.dc.tax', row.dc.tax, 116510);
  check('b.retirement.deductionBefore', row.retirement.deductionBefore, 15000000);
  check('b.retirement.overlapEquivalent', row.retirement.overlapEquivalent, 10800000);
  check('b.retirement.deduction', row.retirement.deduction, 4200000);
  check('b.retirement.taxable', row.retirement.taxable, 12900000);
  check('b.retirement.incomeTax', row.retirement.incomeTax, 2778141);
  check('b.retirement.residentMunicipal', row.retirement.residentMunicipal, 774000);
  check('b.retirement.residentPrefectural', row.retirement.residentPrefectural, 516000);
  check('b.retirement.tax', row.retirement.tax, 4068141);
  check('b.totalTax', row.totalTax, 4184651);
  check('b.netTotal', row.netTotal, 38161027);
}

/* ケース(c): 同年受給 */
{
  const res = engine.computeAll(rules, {
    serviceStart: '2008-04', serviceEnd: '2028-03',
    retirementIncome: 18000000, disability: false, officerYears: 0, retirementYear: 2028,
    dcPeriods: [{ start: '2008-04', end: '2028-03' }], dcIncome: 6000000
  });
  const row = rowFor(res, 2028);
  console.log('case (c) dcYear=2028 pattern=' + row.pattern);
  check('c.reference', row.reference, false);
  check('c.combined.years', row.combined.years, 20);
  check('c.combined.deduction', row.combined.deduction, 8000000);
  check('c.combined.taxable', row.combined.taxable, 8000000);
  check('c.combined.incomeTax', row.combined.incomeTax, 1229284);
  check('c.combined.residentMunicipal', row.combined.residentMunicipal, 480000);
  check('c.combined.residentPrefectural', row.combined.residentPrefectural, 320000);
  check('c.totalTax', row.totalTax, 2029284);
  check('c.netTotal', row.netTotal, 21970716);
}

/* ケース(d): 短期退職手当（勤続3年・300万円超部分）が絡む別年ケース */
{
  const res = engine.computeAll(rules, {
    serviceStart: '2023-04', serviceEnd: '2026-03',
    retirementIncome: 6000000, disability: false, officerYears: 0, retirementYear: 2026,
    dcPeriods: [{ start: '2016-04', end: '2026-03' }], dcIncome: 5000000
  });
  const row = rowFor(res, 2046);
  console.log('case (d) dcYear=2046 pattern=' + row.pattern);
  check('d.windowFired', row.explanation.fired, false);
  check('d.windowYears', row.explanation.windowYears, 19);
  check('d.retirement.category', row.retirement.category, 'short');
  check('d.retirement.deduction', row.retirement.deduction, 1200000);
  check('d.retirement.taxable', row.retirement.taxable, 3300000);
  check('d.retirement.incomeTax', row.retirement.incomeTax, 237382);
  check('d.retirement.residentMunicipal', row.retirement.residentMunicipal, 198000);
  check('d.retirement.residentPrefectural', row.retirement.residentPrefectural, 132000);
  check('d.retirement.tax', row.retirement.tax, 567382);
  check('d.dc.deduction', row.dc.deduction, 4000000);
  check('d.dc.taxable', row.dc.taxable, 500000);
  check('d.dc.incomeTax', row.dc.incomeTax, 25525);
  check('d.dc.tax', row.dc.tax, 75525);
  check('d.totalTax', row.totalTax, 642907);
  check('d.netTotal', row.netTotal, 10357093);
}

/* ケース(e): みなし期間（前の受取額が控除額に満たない） */
{
  const res = engine.computeAll(rules, {
    serviceStart: '2000-04', serviceEnd: '2026-03',
    retirementIncome: 2000000, disability: false, officerYears: 0, retirementYear: 2026,
    dcPeriods: [{ start: '2010-04', end: '2030-03' }], dcIncome: 10000000
  });
  const row = rowFor(res, 2030);
  console.log('case (e) dcYear=2030 pattern=' + row.pattern);
  check('e.windowFired', row.explanation.fired, true);
  check('e.windowYears', row.explanation.windowYears, 19);
  check('e.deemed.years', row.explanation.deemed && row.explanation.deemed.years, 5);
  check('e.overlapYears', row.explanation.overlapYears, 0);
  check('e.retirement.tax', row.retirement.tax, 0);
  check('e.dc.deduction', row.dc.deduction, 8000000);
  check('e.dc.taxable', row.dc.taxable, 1000000);
  check('e.dc.incomeTax', row.dc.incomeTax, 51050);
  check('e.dc.residentMunicipal', row.dc.residentMunicipal, 60000);
  check('e.dc.residentPrefectural', row.dc.residentPrefectural, 40000);
  check('e.dc.tax', row.dc.tax, 151050);
  check('e.totalTax', row.totalTax, 151050);
  check('e.netTotal', row.netTotal, 11848950);
}

console.log(failures === 0 && mirrorOk ? 'ALL CHECKS PASSED' : 'FAILURES: ' + failures + (mirrorOk ? '' : ' + mirror mismatch'));
process.exit(failures === 0 && mirrorOk ? 0 : 1);

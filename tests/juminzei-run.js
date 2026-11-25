/* 住民税エンジンの検算: 公式計算例（名古屋市・新潟市）との照合 */
const fs = require('fs');
eval(fs.readFileSync(__dirname + '/../js/kokuho-engine.js', 'utf8'));
eval(fs.readFileSync(__dirname + '/../js/juminzei-engine.js', 'utf8'));
const rules = JSON.parse(fs.readFileSync(__dirname + '/../data/juminzei/rules.json', 'utf8'));
const cities = JSON.parse(fs.readFileSync(__dirname + '/../data/juminzei/cities.json', 'utf8')).cities;
const byName = {}; cities.forEach(c => byName[c.city] = c);
let fails = 0;
function check(name, got, exp) {
  const ok = got === exp;
  console.log((ok ? 'PASS' : 'FAIL') + ' ' + name + ' = ' + got + (ok ? '' : ' expected ' + exp));
  if (!ok) fails++;
}
// 名古屋市 公式計算例: 課税総所得1,562,000円・人的控除差330,000円 → 年税額140,200円
let r = JuminzeiEngine.compute(rules, byName['名古屋市'], { totalIncome: 2822000, spouse: null, dependents: { specific: 1, elderly: 1 }, socialInsurance: 0, selfStatus: 'none' });
check('nagoya taxable', r.taxable, 1562000);
check('nagoya diffTotal', r.diffTotal, 330000);
check('nagoya total', r.total, 140200);
// 新潟市 公式計算例1: 給与収入500万円・配偶者・一般扶養1・年少扶養1・社会保険料50万円 → 194,500円
const inc = KokuhoEngine.salaryIncome(5000000);
let r2 = JuminzeiEngine.compute(rules, byName['新潟市'], { totalIncome: inc, spouse: { income: 0, elderly: false }, dependents: { general: 1, young: 1 }, socialInsurance: 500000, selfStatus: 'none' });
check('niigata total', r2.total, 194500);
// 新潟市 公式計算例2: 同条件＋住宅ローン控除75,000円 → 119,500円
let r3 = JuminzeiEngine.compute(rules, byName['新潟市'], { totalIncome: inc, spouse: { income: 0, elderly: false }, dependents: { general: 1, young: 1 }, socialInsurance: 500000, selfStatus: 'none', housingCredit: 75000 });
check('niigata+housing total', r3.total, 119500);
// 非課税判定: 単身・合計所得45万円・1級地 → 0円
let r4 = JuminzeiEngine.compute(rules, byName['札幌市'], { totalIncome: 450000, spouse: null, dependents: {}, socialInsurance: 0, selfStatus: 'none' });
check('nontaxable single', r4.total, 0);
// 障害者・合計所得135万円 → 特別非課税で0円
let r5 = JuminzeiEngine.compute(rules, byName['福岡市'], { totalIncome: 1350000, spouse: null, dependents: {}, socialInsurance: 0, selfStatus: 'disability_general' });
check('special exempt', r5.total, 0);
/* 非課税判定の人数: 配偶者は同一生計配偶者の所得要件（令和8年度58万円）を
 * 満たす場合だけ数える（2026-11-24 監査対応 LOG-03）。
 * 本人所得70万円・配偶者所得200万円では、配偶者を数えると限度額が広がり
 * 非課税になってしまうのが誤り。数えなければ課税され29,500円になる */
let r6 = JuminzeiEngine.compute(rules, byName['新潟市'], { totalIncome: 700000, spouse: { income: 2000000, elderly: false }, dependents: {}, socialInsurance: 0, selfStatus: 'none' });
check('spouse over line not counted: householdSize', r6.householdSize, 1);
check('spouse over line not counted: perCapitaExempt', r6.perCapitaExempt, false);
check('spouse over line not counted: incomeLevyExempt', r6.incomeLevyExempt, false);
check('spouse over line not counted: total', r6.total, 29500);
/* 年度切替: 配偶者所得60万円は令和8年度（58万円）では数えないが、
 * 令和9年度（62万円・複合版の経路）では数えて配偶者控除も付く */
let r7 = JuminzeiEngine.compute(rules, byName['新潟市'], { totalIncome: 700000, spouse: { income: 600000, elderly: false }, dependents: {}, socialInsurance: 0, selfStatus: 'none' });
check('spouse 60man R8: householdSize', r7.householdSize, 1);
check('spouse 60man R8: spouse deduction', r7.deductions.spouse, 0);
let r8 = JuminzeiEngine.compute(rules, byName['新潟市'], { totalIncome: 700000, spouse: { income: 600000, elderly: false }, dependents: {}, socialInsurance: 0, selfStatus: 'none', spouseIncomeLimit: 620000 });
check('spouse 60man R9: householdSize', r8.householdSize, 2);
check('spouse 60man R9: spouse deduction', r8.deductions.spouse, 330000);
/* さいたま市 公式計算例1〜3（2026-11-25 照合。tools/verify_juminzei_examples.js と同じケース） */
{
  const inc1 = KokuhoEngine.salaryIncome(3000000);
  let s1 = JuminzeiEngine.compute(rules, byName['さいたま市'], { totalIncome: inc1, spouse: null, dependents: {}, socialInsurance: 400000, selfStatus: 'none' });
  check('saitama ex1 total', s1.total, 121500);
  const inc2 = KokuhoEngine.salaryIncome(5000000);
  let s2 = JuminzeiEngine.compute(rules, byName['さいたま市'], { totalIncome: inc2, spouse: { income: 0, elderly: false }, dependents: { general: 1, young: 1 }, socialInsurance: 400000 + 32500, selfStatus: 'none' });
  check('saitama ex2 total', s2.total, 203000);
  const inc3 = KokuhoEngine.pensionIncome(2500000, 68);
  let s3 = JuminzeiEngine.compute(rules, byName['さいたま市'], { totalIncome: inc3, spouse: { income: 0, elderly: false }, dependents: {}, socialInsurance: 200000, selfStatus: 'none' });
  check('saitama ex3 total', s3.total, 44000);
}
/* 仙台市 通し計算例（夫婦・こども3人、2026-11-25 照合） */
{
  const inc = KokuhoEngine.salaryIncome(5000000);
  let s = JuminzeiEngine.compute(rules, byName['仙台市'], { totalIncome: inc, spouse: { income: 0, elderly: false }, dependents: { specific: 1, general: 1, young: 1 }, socialInsurance: 500000, selfStatus: 'none' });
  check('sendai full total', s.total, 141700);
  check('sendai full taxable', s.taxable, 1520000);
  check('sendai full adjustment', s.adjustment, 16500);
}
console.log(fails === 0 ? 'ALL JUMINZEI CHECKS PASSED' : fails + ' FAILURES');
process.exitCode = fails ? 1 : 0;

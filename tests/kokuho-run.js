/*
 * 国保エンジン検算: 名古屋市公式計算例10件（tools/verify_nagoya.py のケースを移植）
 * 公式出典: 名古屋市「令和8年度 国民健康保険料計算例」
 * 実行: node tests/kokuho-run.js
 */
const fs = require('fs');
const path = require('path');
const Engine = require('../js/kokuho-engine.js');

const nagoya = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data', 'kokuho', 'nagoya.json'), 'utf8'));

function M(age, income, o) {
  o = o || {};
  return {
    age: age,
    income: income,
    judgementIncome: o.j !== undefined ? o.j : income,
    earner: !!o.earner,
    preschool: !!o.preschool,
    depNd: o.depNd || 0,
    depD: o.depD || 0,
    selfCredit: !!o.selfCredit
  };
}

const CASES = [
  ['ケース1 20歳単身・給与所得20万円・7割減額', [M(20, 200000, { earner: true })], 18450, { medical: 13170, support: 4730, care: 0, child: 550 }],
  ['ケース2 68歳単身・年金所得50万円・7割減額', [M(68, 500000, { j: 350000, earner: true })], 26630, { medical: 19350, support: 6540, care: 0, child: 740 }],
  ['ケース3 51歳単身・給与所得244万円・減額なし', [M(51, 2440000, { earner: true })], 365940, { medical: 228070, support: 67640, care: 63150, child: 7080 }],
  ['ケース4 45歳+38歳・世帯主276万円・本人障害+扶養1', [M(45, 2760000, { earner: true, depNd: 1, selfCredit: true }), M(38, 0)], 303890, { medical: 196540, support: 59430, care: 41390, child: 6530 }],
  ['ケース5 25歳+22歳・世帯主132万円・障害扶養1・2割減額', [M(25, 1320000, { earner: true, depD: 1 }), M(22, 0, { selfCredit: true })], 108660, { medical: 79590, support: 26020, care: 0, child: 3050 }],
  ['ケース6 72歳+70歳・年金190万円/0円・扶養1', [M(72, 1900000, { j: 1750000, earner: true, depNd: 1 }), M(70, 0, { j: 0 })], 269510, { medical: 201840, support: 60980, care: 0, child: 6690 }],
  ['ケース7 73歳+69歳・年金210万円/30万円・本人障害+扶養1', [M(73, 2100000, { j: 1950000, earner: true, depNd: 1, selfCredit: true }), M(69, 300000, { j: 150000, earner: true })], 185470, { medical: 138260, support: 42400, care: 0, child: 4810 }],
  ['ケース8 38歳+子10歳+子5歳(未就学)・202万円・寡婦+扶養2・2割減額', [M(38, 2020000, { earner: true, depNd: 2, selfCredit: true }), M(10, 0), M(5, 0, { preschool: true })], 129390, { medical: 96060, support: 31820, care: 0, child: 1510 }],
  ['ケース9 45歳+42歳+子12歳・事業276万円/給与260万円・扶養1', [M(45, 2760000, { depNd: 1 }), M(42, 2600000, { earner: true }), M(12, 0)], 819280, { medical: 519980, support: 154930, care: 129810, child: 14560 }],
  ['ケース10 38歳単身・譲渡所得200万円-繰越100万円・2割減額', [M(38, 1000000)], 119100, { medical: 88800, support: 27330, care: 0, child: 2970 }]
];

let okTotal = 0, okComp = 0, nComp = 0;
for (const [name, members, expected, expComp] of CASES) {
  const r = Engine.compute(nagoya, { roundingUnit: 10 }, { members });
  const match = r.total === expected;
  okTotal += match ? 1 : 0;
  const parts = [];
  for (const k of Object.keys(expComp)) {
    nComp++;
    const cm = r.components[k] === expComp[k];
    okComp += cm ? 1 : 0;
    parts.push(`${k}:${r.components[k].toLocaleString()}(${cm ? 'OK' : 'NG 公式' + expComp[k].toLocaleString()})`);
  }
  console.log(`[${match ? '一致' : '不一致'}] ${name}`);
  console.log(`    減額判定=${r.reductionRate}  合計 自前:${r.total.toLocaleString()} / 公式:${expected.toLocaleString()}`);
  console.log(`    区分別: ${parts.join(' ')}`);
}
console.log(`\n照合結果: 合計 ${okTotal}/${CASES.length} 件一致 / 区分別小計 ${okComp}/${nComp} 件一致`);
if (okTotal !== CASES.length || okComp !== nComp) {
  console.log('KOKUHO CHECKS FAILED');
  process.exit(1);
}
console.log('ALL KOKUHO CHECKS PASSED');

/* ---------- 収入→所得の換算（給与所得控除の法定表） ---------- */
/* 令和7年分の法定表（所得税法別表第五・令和7年分改正）: 最低保障65万円。
 * 国保・住民税は前年（令和7年分）の所得が根拠のため、既定は令和7年分の表。
 * 2026-11-24 の監査修正で、旧表（最低保障55万円・令和6年分以前）から差し替えた。
 * あわせて令和8年分の表（最低保障74万円）の照合点も固定する。 */
const conv = [
  [1000000, 350000], [1625000, 975000], [1800000, 1150000], [1900000, 1250000], [3000000, 2020000],
  [5000000, 3560000], [6000000, 4360000], [7000000, 5200000], [8500000, 6550000], [10000000, 8050000]
];
for (const [rev, exp] of conv) {
  const got = KokuhoEngine.salaryIncome(rev);
  console.log((got === exp ? 'PASS' : 'FAIL') + ' salaryIncome(' + rev + ') = ' + got + (got === exp ? '' : ' expected ' + exp));
  if (got !== exp) process.exitCode = 1;
}
const convR8 = [
  [1000000, 260000], [1500000, 760000], [2200000, 1460000], [5000000, 3560000], [10000000, 8050000]
];
for (const [rev, exp] of convR8) {
  const got = KokuhoEngine.salaryIncome(rev, 'r8');
  console.log((got === exp ? 'PASS' : 'FAIL') + ' salaryIncome(' + rev + ", 'r8') = " + got + (got === exp ? '' : ' expected ' + exp));
  if (got !== exp) process.exitCode = 1;
}
const pc = KokuhoEngine.pensionIncome(2600000, 70);
console.log((pc === 1500000 ? 'PASS' : 'FAIL') + ' pensionIncome(2600000,70) = ' + pc);
if (pc !== 1500000) process.exitCode = 1;

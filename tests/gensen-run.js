/* 源泉徴収税額チェッカー エンジンの検算
 * 基準: 仕様書 tax-tools-spec-10-gensen.md §6（検算ケース9件）
 * ケース1・2は国税庁「給与所得の源泉徴収税額の求め方」の公式設例、
 * ケース3は国税庁 No.2523 の公式計算例に出てくる税額、
 * ケース4〜8は既存JSON（公式Excelの機械変換）からのデータ照合値。
 * ケース9は対象外の計算方式（電算機計算の特例）の参考値のため、回帰テストの対象外。
 */
const fs = require('fs');
const path = require('path');
const E = require('../js/gensen-engine.js');
const table = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/bonus/monthly-table-2026.json'), 'utf8'));

let fails = 0;
function eq(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: expected=${expected} actual=${actual}`);
}
function directIn(over) {
  return Object.assign({
    mode: 'direct', afterDirect: 0, gross: 0, commute: 0, insurance: 0,
    column: 'kou', dependents: 0, statementTax: null
  }, over || {});
}
function taxOf(over) { return E.compute(table, directIn(over)).tax; }

/* ---------- §6.1 ケース1: 国税庁の公式設例（甲欄） ---------- */
{
  const r = E.compute(table, directIn({
    mode: 'gross', gross: 420000, commute: 0, insurance: 63400,
    column: 'kou', dependents: 2
  }));
  eq('ケース1 控除後の金額', r.afterAmount, 356600);
  eq('ケース1 税額（公式設例）', r.tax, 7020);
  eq('ケース1 ゾーンは表', r.zone, 'table');
  eq('ケース1 当てはめた行の下限', r.row.min, 356000);
  eq('ケース1 当てはめた行の上限', r.row.max, 359000);
  /* 方式(a) でも同じ結果になること */
  eq('ケース1 方式(a)でも一致', taxOf({ afterDirect: 356600, dependents: 2 }), 7020);
}

/* ---------- §6.2 ケース2: 国税庁の公式設例（乙欄・105,000円未満） ---------- */
{
  const r = E.compute(table, directIn({ afterDirect: 80750, column: 'otsu' }));
  eq('ケース2 税額（公式設例）', r.tax, 2473);
  eq('ケース2 ゾーンは下限', r.zone, 'under');
}

/* ---------- §6.3 ケース3: 国税庁 No.2523 の公式計算例の税額3点 ---------- */
{
  eq('ケース3 444,541円・甲1人', taxOf({ afterDirect: 444541, dependents: 1 }), 16100);
  eq('ケース3 166,531円・甲1人', taxOf({ afterDirect: 166531, dependents: 1 }), 1510);
  eq('ケース3 128,216円・甲0人', taxOf({ afterDirect: 128216, dependents: 0 }), 1300);
}

/* ---------- §6.4 ケース4: 基本ケース（300,000円） ---------- */
{
  eq('ケース4 甲0人', taxOf({ afterDirect: 300000, dependents: 0 }), 7930);
  eq('ケース4 甲1人', taxOf({ afterDirect: 300000, dependents: 1 }), 6320);
  eq('ケース4 甲2人', taxOf({ afterDirect: 300000, dependents: 2 }), 4700);
  eq('ケース4 甲3人', taxOf({ afterDirect: 300000, dependents: 3 }), 3080);
  eq('ケース4 乙欄', taxOf({ afterDirect: 300000, column: 'otsu' }), 53600);
}

/* ---------- §6.5 ケース5: 基本ケース（250,000円） ---------- */
{
  eq('ケース5 甲0人', taxOf({ afterDirect: 250000, dependents: 0 }), 6110);
  eq('ケース5 甲1人', taxOf({ afterDirect: 250000, dependents: 1 }), 4490);
  eq('ケース5 甲2人', taxOf({ afterDirect: 250000, dependents: 2 }), 2880);
  eq('ケース5 甲3人', taxOf({ afterDirect: 250000, dependents: 3 }), 1260);
  eq('ケース5 乙欄', taxOf({ afterDirect: 250000, column: 'otsu' }), 35500);
}

/* ---------- §6.6 ケース6: 下限の境界 ---------- */
{
  eq('ケース6 104,999円・甲0人', taxOf({ afterDirect: 104999, dependents: 0 }), 0);
  eq('ケース6 104,999円・乙欄', taxOf({ afterDirect: 104999, column: 'otsu' }), 3216);
  eq('ケース6 105,000円・甲0人', taxOf({ afterDirect: 105000, dependents: 0 }), 170);
  eq('ケース6 105,000円・乙欄', taxOf({ afterDirect: 105000, column: 'otsu' }), 3800);
  eq('ケース6 105,000円・甲7人', taxOf({ afterDirect: 105000, dependents: 7 }), 0);
}

/* ---------- §6.7 ケース7: 上限の算式 ---------- */
{
  const lastRow = E.compute(table, directIn({ afterDirect: 739999, dependents: 0 }));
  eq('ケース7 739,999円・甲0人（表の最後の行）', lastRow.tax, 71380);
  eq('ケース7 739,999円は表ゾーン', lastRow.zone, 'table');
  const atBase = E.compute(table, directIn({ afterDirect: 740000, dependents: 0 }));
  eq('ケース7 740,000円・甲0人（基準額ちょうど）', atBase.tax, 71680);
  eq('ケース7 740,000円は算式ゾーン', atBase.zone, 'over');
  eq('ケース7 740,000円・乙欄（基準額ちょうど）', taxOf({ afterDirect: 740000, column: 'otsu' }), 259200);
  eq('ケース7 750,000円・甲0人', taxOf({ afterDirect: 750000, dependents: 0 }), 73722);
  eq('ケース7 800,000円・甲0人', taxOf({ afterDirect: 800000, dependents: 0 }), 84238);
  eq('ケース7 800,000円・乙欄', taxOf({ afterDirect: 800000, column: 'otsu' }), 283704);
  eq('ケース7 4,000,000円・甲0人', taxOf({ afterDirect: 4000000, dependents: 0 }), 1354995);
  /* 乙欄の率の切替え境界（1,710,000円） */
  eq('ケース7 1,709,999円・乙欄', taxOf({ afterDirect: 1709999, column: 'otsu' }), 655347);
  eq('ケース7 1,710,000円・乙欄（基準税額）', taxOf({ afterDirect: 1710000, column: 'otsu' }), 655400);
}

/* ---------- §6.8 ケース8: 扶養親族等の数が7人を超える場合 ---------- */
{
  const r = E.compute(table, directIn({ afterDirect: 500000, dependents: 9 }));
  eq('ケース8 7人の税額', r.taxAt7, 4830);
  eq('ケース8 控除額（1,610円×2人）', r.over7Deduction, 3220);
  eq('ケース8 9人の税額', r.tax, 1610);
  const floor0 = E.compute(table, directIn({ afterDirect: 400000, dependents: 8 }));
  eq('ケース8 境界 7人の税額', floor0.taxAt7, 660);
  eq('ケース8 境界 マイナスになる場合は0円', floor0.tax, 0);
  /* 7人ちょうどは控除なし */
  const seven = E.compute(table, directIn({ afterDirect: 500000, dependents: 7 }));
  eq('ケース8 7人ちょうどは控除なし', seven.over7Deduction, 0);
  eq('ケース8 7人ちょうどの税額', seven.tax, 4830);
  /* 算式ゾーンでも7人超の控除が効くこと */
  eq('ケース8 算式ゾーン・8人', taxOf({ afterDirect: 740000, dependents: 8 }), 26410 - 1610);
}

/* ---------- 境界: 金額0以下（仕様§3-1・§7.1-4） ---------- */
{
  const zero = E.compute(table, directIn({ afterDirect: 0 }));
  eq('境界 金額0は税額0', zero.tax, 0);
  eq('境界 金額0は nonPositive', zero.nonPositive, true);
  const neg = E.compute(table, directIn({
    mode: 'gross', gross: 100000, commute: 0, insurance: 120000
  }));
  eq('境界 社保が給与を超えたら控除後はマイナス', neg.afterAmount, -20000);
  eq('境界 その場合の税額は0', neg.tax, 0);
  eq('境界 乙欄でも税額0', E.compute(table, directIn({
    mode: 'gross', gross: 100000, insurance: 120000, column: 'otsu'
  })).tax, 0);
}

/* ---------- 境界: 方式(b) の内訳 ---------- */
{
  const r = E.compute(table, directIn({
    mode: 'gross', gross: 450000, commute: 10000, insurance: 65000,
    column: 'kou', dependents: 0
  }));
  eq('方式(b) 給与等の金額（通勤手当を除く）', r.salaryAmount, 440000);
  eq('方式(b) 控除後の金額', r.afterAmount, 375000);
  eq('方式(b) 税額', r.tax, 13690);
}

/* ---------- 差額表示（仕様§4・G7） ---------- */
{
  const r = E.compute(table, directIn({ afterDirect: 356600, dependents: 2, statementTax: 7000 }));
  eq('差額 税額表の額', r.diff && r.tax, 7020);
  eq('差額 明細より20円多い', r.diff.diff, 20);
  const same = E.compute(table, directIn({ afterDirect: 356600, dependents: 2, statementTax: 7020 }));
  eq('差額 一致すれば0', same.diff.diff, 0);
  const none = E.compute(table, directIn({ afterDirect: 356600, dependents: 2 }));
  eq('差額 未入力ならnull', none.diff, null);
}

/* ---------- 整数演算の確認 ---------- */
{
  eq('整数演算 乙欄3.063%（80,750円）', E.applyRate(80750, 0.03063), 2473);
  eq('整数演算 45.945%（500,000円）', E.applyRate(500000, 0.45945), 229725);
  eq('整数演算 20.42%（10,000円）', E.applyRate(10000, 0.2042), 2042);
}

console.log(fails === 0 ? 'ALL GENSEN CHECKS PASSED' : `${fails} FAILURES`);
process.exit(fails ? 1 : 0);

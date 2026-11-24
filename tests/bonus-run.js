/* 賞与の手取り計算エンジンの検算
 * 基準: 仕様書 tax-tools-spec-04-bonus.md §6
 * §6.2 国税庁 No.2523 公式計算例3件（公式照合）／§6.3 自前ケース4件（期待値）
 * 月額表は国税庁の公式Excelから変換したデータ（data/bonus/monthly-table-2026.json）。
 */
const fs = require('fs');
const path = require('path');
const E = require('../js/bonus-engine.js');
const data = {
  kenpo: JSON.parse(fs.readFileSync(path.join(__dirname, '../data/kenpo/rates-2026.json'), 'utf8')),
  rateTable: JSON.parse(fs.readFileSync(path.join(__dirname, '../data/bonus/bonus-rate-table-2026.json'), 'utf8')),
  monthlyTable: JSON.parse(fs.readFileSync(path.join(__dirname, '../data/bonus/monthly-table-2026.json'), 'utf8'))
};
let fails = 0;
function eq(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: expected=${expected} actual=${actual}`);
}

/* ---------- 月額表データの整合性と照合点 ---------- */
{
  const rows = data.monthlyTable.rows;
  eq('月額表 行数', rows.length, 231);
  eq('月額表 先頭の下限', rows[0].min, 105000);
  eq('月額表 末尾の上限', rows[rows.length - 1].max, 740000);
  let continuous = true;
  for (let i = 0; i + 1 < rows.length; i++) if (rows[i].max !== rows[i + 1].min) continuous = false;
  eq('月額表 区間の連続性', continuous, true);
  // No.2523 具体例に出てくる月額表の税額（§6.2）
  eq('月額表 444,541円・甲1人', E.monthlyTax(data.monthlyTable, 444541, 'kou', 1), 16100);
  eq('月額表 166,531円・甲1人', E.monthlyTax(data.monthlyTable, 166531, 'kou', 1), 1510);
  eq('月額表 128,216円・甲0人', E.monthlyTax(data.monthlyTable, 128216, 'kou', 0), 1300);
  // 税額表の使い方の設例
  eq('月額表 356,600円・甲2人', E.monthlyTax(data.monthlyTable, 356600, 'kou', 2), 7020);
  // 表の境界（740,000円ちょうど・乙欄の基準額）
  eq('月額表 740,000円・甲0人', E.monthlyTax(data.monthlyTable, 740000, 'kou', 0), 71680);
  eq('月額表 740,000円・乙', E.monthlyTax(data.monthlyTable, 740000, 'otsu', 0), 259200);
  eq('月額表 1,710,000円・乙', E.monthlyTax(data.monthlyTable, 1710000, 'otsu', 0), 655400);
  eq('月額表 105,000円未満・甲0人', E.monthlyTax(data.monthlyTable, 104999, 'kou', 0), 0);
}

/* ---------- 算出率の表の整合性 ---------- */
{
  const rt = data.rateTable;
  eq('算出率の段数', rt.rates_percent.length, 21);
  for (const dep of ['0', '1', '2', '3', '4', '5', '6', '7']) {
    const b = rt.kou_lower_thousand[dep];
    let inc = b.length === 21;
    for (let i = 0; i + 1 < b.length; i++) if (!(b[i] < b[i + 1])) inc = false;
    eq(`算出率 ${dep}人の下限の単調増加`, inc, true);
  }
  eq('算出率 285,454円・3人', E.bonusRate(rt, 'kou', 3, 285454).ratePct, 2.042);
  eq('算出率 309,000円・0人', E.bonusRate(rt, 'kou', 0, 309000).ratePct, 8.168);
  eq('算出率 100,000円・乙', E.bonusRate(rt, 'otsu', 0, 100000).ratePct, 10.21);
}

/* ---------- §6.2 国税庁 No.2523 公式計算例3件 ---------- */
{
  const c1 = E.incomeTax(data, { bonusAfter: 389558, prevAfter: 285454, column: 'kou', dependents: 3, divisor: 6 });
  eq('No.2523 例1（通常）方式', c1.method, 'rate');
  eq('No.2523 例1（通常）税額', c1.tax, 7954);
  const c2 = E.incomeTax(data, { bonusAfter: 1668062, prevAfter: 166531, column: 'kou', dependents: 1, divisor: 6 });
  eq('No.2523 例2（10倍超）方式', c2.method, 'monthly-over10');
  eq('No.2523 例2（10倍超）税額', c2.tax, 87540);
  const c3 = E.incomeTax(data, { bonusAfter: 769300, prevAfter: null, column: 'kou', dependents: 0, divisor: 6 });
  eq('No.2523 例3（前月なし）方式', c3.method, 'monthly-none');
  eq('No.2523 例3（前月なし）税額', c3.tax, 7800);
}

/* ---------- §6.3 自前ケース ---------- */
function baseInput(over) {
  return Object.assign({
    gross: 0, prefecture: '東京都', ageBand: 'under40', industry: 'general',
    employmentInsured: true, column: 'kou', dependents: 0,
    prevMode: 'after', prevAfter: 0, prevGross: 0, prevInsurance: 0,
    periodOver6: false, cumulativeBonus: 0
  }, over);
}
{
  const a = E.compute(data, baseInput({ gross: 600000, prevAfter: 309000 }));
  eq('A 健康保険料', a.health, 29550);
  eq('A 支援金', a.child, 690);
  eq('A 厚生年金', a.pension, 54900);
  eq('A 雇用保険', a.employment, 3000);
  eq('A 社会保険料等合計', a.socialTotal, 88140);
  eq('A 所得税', a.incomeTax, 41808);
  eq('A 手取り', a.net, 470052);
}
{
  const b = E.compute(data, baseInput({ gross: 800000, prefecture: '大阪府', ageBand: '40to64', dependents: 2, prevAfter: 280000 }));
  eq('B 健康保険料', b.health, 40520);
  eq('B 介護保険料', b.care, 6480);
  eq('B 支援金', b.child, 920);
  eq('B 厚生年金', b.pension, 73200);
  eq('B 雇用保険', b.employment, 4000);
  eq('B 社会保険料等合計', b.socialTotal, 125120);
  eq('B 所得税', b.incomeTax, 27562);
  eq('B 手取り', b.net, 647318);
}
{
  const f = E.compute(data, baseInput({ gross: 2000000, dependents: 1, prevAfter: 500000 }));
  eq('F 標準賞与額（健保）', f.standardHealth, 2000000);
  eq('F 標準賞与額（厚年）', f.standardPension, 1500000);
  eq('F 健康保険料', f.health, 98500);
  eq('F 支援金', f.child, 2300);
  eq('F 厚生年金', f.pension, 137250);
  eq('F 雇用保険', f.employment, 10000);
  eq('F 社会保険料等合計', f.socialTotal, 248050);
  eq('F 所得税', f.incomeTax, 286198);
  eq('F 手取り', f.net, 1465752);
}
{
  const g = E.compute(data, baseInput({ gross: 455800, prevAfter: 200000 }));
  eq('G 標準賞与額', g.standardHealth, 455000);
  eq('G 健康保険料（75銭は切り上げ）', g.health, 22409);
  eq('G 支援金（25銭は切り捨て）', g.child, 523);
  eq('G 厚生年金（50銭ちょうどは切り捨て）', g.pension, 41632);
  eq('G 雇用保険（総支給額ベース）', g.employment, 2279);
  eq('G 社会保険料等合計', g.socialTotal, 66843);
  eq('G 所得税', g.incomeTax, 15885);
  eq('G 手取り', g.net, 373072);
}

/* ---------- §6.3 参考照合（福岡・50万円） ---------- */
{
  const u40 = E.compute(data, baseInput({ gross: 500000, prefecture: '福岡県', prevAfter: 300000 }));
  eq('福岡50万 40歳未満 社会保険料等合計', u40.socialTotal, 74100);
  const o40 = E.compute(data, baseInput({ gross: 500000, prefecture: '福岡県', ageBand: '40to64', prevAfter: 300000 }));
  eq('福岡50万 40〜64歳 介護保険料', o40.care, 4050);
  eq('福岡50万 40〜64歳 社会保険料等合計', o40.socialTotal, 78150);
}

/* ---------- 方式(c): 前月の社会保険料等の自動計算 ---------- */
{
  const c = E.prevMonthInsurance(data.kenpo, '東京都', 'under40', 'general', true, 350000);
  eq('方式c 標準報酬月額', c.standard, 360000);
  eq('方式c 健康保険料', c.health, 17730);
  eq('方式c 支援金', c.child, 414);
  eq('方式c 厚生年金', c.pension, 32940);
  eq('方式c 雇用保険', c.employment, 1750);
  eq('方式c 合計', c.total, 52834);
  const full = E.compute(data, baseInput({ gross: 600000, prevMode: 'grossOnly', prevGross: 350000 }));
  eq('方式c 前月控除後給与', full.prevAfter, 297166);
}

/* ---------- 境界: 健保の年度累計上限・雇用保険なし ---------- */
{
  const cap = E.compute(data, baseInput({ gross: 600000, cumulativeBonus: 5500000, prevAfter: 309000 }));
  eq('健保上限 標準賞与額', cap.standardHealth, 230000);
  eq('健保上限 フラグ', cap.healthCapped, true);
  const noEmp = E.compute(data, baseInput({ gross: 600000, employmentInsured: false, prevAfter: 309000 }));
  eq('雇用保険 被保険者でない場合は0', noEmp.employment, 0);
}

/* ---------- 年齢区分（2026-11-24 監査対応） ----------
 * 65〜69歳は従来どおり全額計算。70〜74歳は厚生年金を課金しない（健康保険は継続）。
 * 75歳以上は後期高齢者医療制度のため対象外フラグを返す。
 * 基準値（賞与100万円・東京・前月控除後30万円）は修正前の65歳以上の実測と同一。 */
{
  const a = E.compute(data, baseInput({ gross: 1000000, ageBand: '65to69', prevAfter: 300000 }));
  eq('65〜69歳 健康保険料', a.health, 49250);
  eq('65〜69歳 厚生年金', a.pension, 91500);
  eq('65〜69歳 対象外でない', a.outOfScope, false);
  const b = E.compute(data, baseInput({ gross: 1000000, ageBand: '70to74', prevAfter: 300000 }));
  eq('70〜74歳 健康保険料は継続', b.health, 49250);
  eq('70〜74歳 厚生年金は0', b.pension, 0);
  eq('70〜74歳 pensionApplied', b.pensionApplied, false);
  eq('70〜74歳 社保合計', b.socialTotal, 55400);
  eq('70〜74歳 手取り', b.net, 886734);
  const c = E.compute(data, baseInput({ gross: 1000000, ageBand: '75over', prevAfter: 300000 }));
  eq('75歳以上 対象外フラグ', c.outOfScope, true);
  /* 前月の社会保険料を等級表から出す方式でも、70歳以上は厚生年金を入れない */
  const d = E.compute(data, baseInput({ gross: 600000, ageBand: '70to74', prevMode: 'grossOnly', prevGross: 350000 }));
  eq('方式c 70〜74歳 前月計算の厚生年金は0', d.prevComputed.pension, 0);
}

console.log(fails === 0 ? 'ALL BONUS CHECKS PASSED' : `${fails} FAILURES`);
process.exit(fails ? 1 : 0);

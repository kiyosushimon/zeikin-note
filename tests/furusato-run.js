/* ふるさと納税エンジンの検算
 * 基準: 仕様書 tax-tools-spec-03-furusato.md §6＋令和8年分改正対応の追記
 * 2026-11-24 の改修で、照合基準を「総務省目安表（改正前の前提）」から
 * 「令和8年分（2026年分）の改正後モデルで独立計算した期待値」に切り替えた。
 * 検証の経緯と新旧対照は ~/workspace/notes/furusato-2026-reform-impact.md。
 * 目安表との旧照合（12件）は仕様 §6.1 に記録として残る。
 */
const E = require('../js/furusato-engine.js');
let fails = 0;
function eq(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: expected=${expected} actual=${actual}`);
}
function near(name, actual, expected, tol) {
  const ok = Math.abs(actual - expected) <= tol;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: expected≈${expected} actual=${actual}`);
}

// 改正後モデルの期待値（簡易モデル、社会保険料=収入×15%）
// 旧・目安表照合12件のうち変わったのは 500万・独身（61,000→58,000）のみ。他は不変。
// その後 LOG-02（調整控除の下限2,500円の是正。地方税法第314条の6）で 500万・独身が
// 58,000→57,000 に変わった。他のケースは所得割が2,500円下がるが、上限の1,000円未満
// 切り捨てに吸収されて表示値は不変（600万・独身の limitRaw は 77,949→77,323）。
const table = [
  [{ revenue: 3000000 }, 28000, '300万・独身（不変）'],
  [{ revenue: 4000000 }, 42000, '400万・独身（不変）'],
  [{ revenue: 5000000 }, 57000, '500万・独身（旧61,000→58,000→57,000。LOG-02で調整控除の下限を是正）'],
  [{ revenue: 6000000 }, 77000, '600万・独身（不変）'],
  [{ revenue: 7000000 }, 108000, '700万・独身（不変）'],
  [{ revenue: 3000000, hasSpouse: true }, 19000, '300万・夫婦（不変）'],
  [{ revenue: 5000000, hasSpouse: true }, 49000, '500万・夫婦（不変）'],
  [{ revenue: 7000000, hasSpouse: true }, 86000, '700万・夫婦（不変）'],
  [{ revenue: 4000000, hasSpouse: true, depGeneral: 1 }, 25000, '400万・夫婦+子1(高校生)（不変）'],
  [{ revenue: 5000000, hasSpouse: true, depGeneral: 1 }, 40000, '500万・夫婦+子1(高校生)（不変）'],
  [{ revenue: 5000000, hasSpouse: true, depGeneral: 1, depSpecific: 1 }, 28000, '500万・夫婦+子2(大学生と高校生)（不変）'],
  [{ revenue: 5000000, depSpecific: 1 }, 44000, '500万・共働き+子1(大学生)（不変）'],
];
for (const [input, expected, name] of table) {
  eq('改正後モデル ' + name, E.computeSimple(input).limit, expected);
}

// 改正で新しく効く帯（検証レポート §2 のケース）
{
  eq('境目 510万・独身（旧63,000→59,000）', E.computeSimple({ revenue: 5100000 }).limit, 59000);
  const r660 = E.computeSimple({ revenue: 6600000 });
  eq('境目 660万・独身（旧100,000→87,000）', r660.limit, 87000);
  eq('境目 660万・独身 特例分用税率（20％→10％）', r660.rateForTokurei, 0.10);
  eq('低収入 200万・独身（旧15,000→13,000、住民税側の是正）', E.computeSimple({ revenue: 2000000 }).limit, 13000);
  eq('低収入 150万・独身（旧8,000→3,000）', E.computeSimple({ revenue: 1500000 }).limit, 3000);
  eq('低収入 150万・独身 所得割額（旧27,000→8,000）', E.computeSimple({ revenue: 1500000 }).residentLevy, 8000);
}

// 基礎控除の区分表（令和8年分・国税庁 No.1199）
{
  eq('基礎控除 合計所得489万円以下', E.basicDeductionIT(4890000), 1040000);
  eq('基礎控除 489万円超〜655万円', E.basicDeductionIT(4890001), 670000);
  eq('基礎控除 655万円ちょうど', E.basicDeductionIT(6550000), 670000);
  eq('基礎控除 655万円超〜2,350万円', E.basicDeductionIT(6550001), 620000);
  eq('基礎控除 2,350万円超〜2,400万円', E.basicDeductionIT(24000000), 480000);
  eq('基礎控除 2,450万円超〜2,500万円', E.basicDeductionIT(25000000), 160000);
  eq('基礎控除 2,500万円超', E.basicDeductionIT(25000001), 0);
}

// 給与所得控除（令和8年分）: 年末調整仕様の照合点と一致すること
{
  eq('給与所得 200万円（最低保障74万円）', E.salaryIncomeOf(2000000), 1260000);
  eq('給与所得 220万円', E.salaryIncomeOf(2200000), 1460000);
  eq('給与所得 500万円', E.salaryIncomeOf(5000000), 3560000);
  eq('給与所得 897万円', E.salaryIncomeOf(8970000), 7020000);
  eq('給与所得 70万円（所得0）', E.salaryIncomeOf(700000), 0);
}

// §6.3 ケースM（医療費控除）: 夫婦・500万円（改正後も表示不変）
{
  const noMed = E.computeSimple({ revenue: 5000000, hasSpouse: true });
  eq('M 所得割額（医療費なし）', noMed.residentLevy, 202500);
  eq('M 上限（医療費なし）', noMed.limit, 49000);
  const med = E.computeSimple({ revenue: 5000000, hasSpouse: true, medicalDeduction: 200000 });
  eq('M 住民税課税総所得（医療費20万）', med.taxableResidentTax, 1850000);
  eq('M 所得割額（医療費20万）', med.residentLevy, 180000);
  eq('M 上限（医療費20万）', med.limit, 44000);
}

// §6.3 ケースH（住宅ローン控除）: 独身・600万円、可能額30万円、7%枠
// 上限は不変。所得税額と繰越額は改正で変わった（基礎控除104万円で所得税が減り、
// 引ききれない額が増えて繰越が上限136,500円に到達する）。
{
  const h = E.computeSimple({ revenue: 6000000, housingCreditAmount: 300000, housingEra: 'h26' });
  eq('H 所得税額（旧204,710→147,534）', h.incomeTax, 147534);
  eq('H 繰越額（旧95,290→136,500でキャップ）', h.housing.carryToResident, 136500);
  eq('H 上限（住宅ローン有無で不変）', h.limit, 77000);
  near('H 上限 raw（LOG-02で所得割303,000→300,500円のため 77,949→77,323）', h.limitRaw, 77323, 2);
}

// 内訳: 上限いっぱいの寄附で自己負担2,000円になること（独身500万・確定申告）
{
  const m = E.computeSimple({ revenue: 5000000 });
  const b = E.computeBreakdown(m, m.limit, false);
  eq('内訳 自己負担（上限額ちょうど）', b.selfPay, 2000);
  const over = E.computeBreakdown(m, 200000, false);
  if (!(over.selfPay > 2000)) { fails++; console.log('FAIL 内訳 上限超過で自己負担>2000:', over.selfPay); }
  else console.log('PASS 内訳 上限超過で自己負担>2000:', over.selfPay);
  const one = E.computeBreakdown(m, m.limit, true);
  eq('内訳 ワンストップ自己負担（上限額ちょうど）', one.selfPay, 2000);
  // 旧上限61,000円まで寄附すると自己負担は4,988円になる
  // （LOG-02で所得割が238,000→235,500円になり、特例分の頭打ちも所得割2割=47,100円に下がった）
  const b61 = E.computeBreakdown(m, 61000, false);
  eq('内訳 旧上限61,000円寄附の所得税控除（税率5％）', b61.incomeTaxCut, 3011);
  eq('内訳 旧上限61,000円寄附の特例分（所得割2割で頭打ち）', b61.tokureiCut, 47100);
  eq('内訳 旧上限61,000円寄附の自己負担', b61.selfPay, 4988);
}

// 詳細モード: 所得割額202,500円・税率5% → 49,000円（ケースM医療費なしと一致するはず。計算式は改正で無変更）
{
  const d = E.computeDetail({ residentLevy: 202500, marginalRate: 0.05 });
  eq('詳細モード 上限', d.limit, 49000);
}

// 境界: 収入0・寄附2,000円以下
{
  const z = E.computeSimple({ revenue: 0 });
  if (!isFinite(z.limitRaw)) { fails++; console.log('FAIL 収入0で有限でない'); } else console.log('PASS 収入0でも有限');
  eq('寄附2000円は内訳なし', E.computeBreakdown(z, 2000, false), null);
}


// 境界値: 上限の前後・住宅ローン併用・年収0
// 上限が61,000円→58,000円（令和8年分改正）→57,000円（LOG-02）と変わったため、
// 前後テストの寄附額は57,000（上限ちょうど）／58,000／59,000で固定する。
{
  const m = E.computeSimple({ revenue: 5000000 });
  eq('境界 新上限', m.limit, 57000);
  eq('境界 寄附57,000（上限ちょうど）自己負担', E.computeBreakdown(m, 57000, false).selfPay, 2000);
  eq('境界 寄附58,000（上限超過）自己負担', E.computeBreakdown(m, 58000, false).selfPay, 2441);
  eq('境界 寄附59,000（上限超過）自己負担', E.computeBreakdown(m, 59000, false).selfPay, 3290);
  const h = E.computeSimple({ revenue: 5000000, housingCreditAmount: 300000, housingEra: 'h26' });
  eq('境界 住宅ローン併用でも上限不変', h.limit, m.limit);
  eq('境界 住宅ローン繰越は上限136,500でキャップ', h.housing.carryToResident, 136500);
  const z = E.computeSimple({ revenue: 0 });
  eq('境界 年収0の所得割額', z.residentLevy, 0);
  eq('境界 年収0で1万円寄附は全額自己負担', E.computeBreakdown(z, 10000, false).selfPay, 10000);
}

// LOG-02回帰: 調整控除の下限2,500円（地方税法第314条の6）
// 課税所得200万円超で「人的控除差の合計 −（課税所得 − 200万円）」がマイナスになる場合も、
// 5万円を下回るときは5万円として5%を掛けるため、控除額は2,500円になる。
// 500万・独身は人的控除差が基礎控除の5万円のみで、素の算出額は (50,000−380,000)×5% と
// 大きくマイナスになるケース。旧処理は0円にしていた（所得割238,000円・上限58,000円）。
{
  const m = E.computeSimple({ revenue: 5000000 });
  eq('LOG-02 調整控除（下限2,500円）', m.adjustmentCredit, 2500);
  eq('LOG-02 所得割額（238,000→235,500）', m.residentLevy, 235500);
  // 合計所得金額2,500万円超は調整控除の対象外（控除0円のまま）
  eq('LOG-02 合計所得2,500万円超は対象外', E.computeSimple({ revenue: 30000000 }).adjustmentCredit, 0);
}

console.log(fails === 0 ? 'ALL FURUSATO CHECKS PASSED' : `${fails} FAILURES`);
process.exit(fails ? 1 : 0);

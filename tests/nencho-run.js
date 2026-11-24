/* 年末調整・還付シミュレーション エンジンの検算
 * 基準: 仕様書 tax-tools-spec-05-nencho.md §6
 * §6.1 公式計算例1（源泉徴収簿の通し計算・11段）／§6.2 公式計算例2（過不足額の精算の設例・11段）
 * §6.3 別表第五の照合点11件／§6.4 生命保険料の部品照合6件／§6.5 自前ケース2件（還付・徴収）
 * 別表第五の4,000円区間は、印刷表の値（各区間の下限収入に給与所得控除の計算式を適用した額）と
 * 再現規則を全区間で突合する（仕様書§1.2・§6.3の注記に基づく）。
 */
const fs = require('fs');
const path = require('path');
const E = require('../js/nencho-engine.js');
const T = JSON.parse(fs.readFileSync(path.join(__dirname, '../data/nencho/tables-2026.json'), 'utf8'));
let fails = 0;
function eq(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: expected=${expected} actual=${actual}`);
}

/* ---------- §6.3 別表第五の照合点11件（公式抽出値） ---------- */
for (const cp of T.salary.checkpoints) {
  eq(`別表第五 照合点 収入${cp.income.toLocaleString()}円`, E.salaryAfterDeduction(T, cp.income), cp.value);
}

/* ---------- 別表第五 4,000円区間の全件突合 ----------
 * 印刷表の値は「各4,000円区間の下限収入 A に給与所得控除の計算式を適用した額」。
 * 独立に書いた標準の給与所得控除式（30%+8万円／20%+44万円）と再現規則を全1,100区間で突合する。 */
{
  function standardDeduction(A) {
    if (A <= 3600000) return A * 30 / 100 + 80000;
    return A * 20 / 100 + 440000;
  }
  let bad = 0;
  for (let A = 2200000; A < 6600000; A += 4000) {
    // 区間内の収入（下限・中間・上限直前）で、表の値 A − 控除額(A) と一致すること
    for (const inc of [A, A + 2000, A + 3999]) {
      if (E.salaryAfterDeduction(T, inc) !== A - standardDeduction(A)) bad++;
    }
  }
  eq('別表第五 4,000円区間の全件突合（1,100区間×3点）不一致数', bad, 0);
  // 全域で単調非減少（表として破綻していないこと）
  let monoBad = 0;
  let prev = E.salaryAfterDeduction(T, 0);
  for (let inc = 1000; inc <= 20000000; inc += 1000) {
    const v = E.salaryAfterDeduction(T, inc);
    if (v < prev) monoBad++;
    prev = v;
  }
  eq('別表第五 全域の単調性違反数', monoBad, 0);
  // 平坦3区間の境界
  eq('別表第五 2,190,999円', E.salaryAfterDeduction(T, 2190999), 1450999);
  eq('別表第五 2,195,999円', E.salaryAfterDeduction(T, 2195999), 1453000);
  eq('別表第五 2,199,999円', E.salaryAfterDeduction(T, 2199999), 1456000);
}

/* ---------- §6.4 生命保険料控除の部品照合6件 ---------- */
eq('生保 旧一般50,200円', E.lifeCategory(T, 0, 50200, false).amount, 37550);
eq('生保 新年金56,000円', E.lifeCategory(T, 56000, 0, false).amount, 34000);
eq('生保 新一般100,000円・特例なし', E.lifeCategory(T, 100000, 0, false).amount, 40000);
eq('生保 新一般100,000円・特例あり', E.lifeCategory(T, 100000, 0, true).amount, 55000);
eq('生保 新30,000円+旧50,200円・特例なし', E.lifeCategory(T, 30000, 50200, false).amount, 40000);
eq('生保 新30,000円+旧50,200円・特例あり', E.lifeCategory(T, 30000, 50200, true).amount, 60000);
// 3区分の合計上限12万円
eq('生保 合計上限12万円', E.lifeDeduction(T, { newGeneral: 100000, oldGeneral: 0, care: 100000, newPension: 100000, oldPension: 0 }, false).total, 120000);
// 地震保険料控除
eq('地震 45,000円は全額', E.earthquakeDeduction(T, 45000, 0), 45000);
eq('地震 80,000円は上限50,000円', E.earthquakeDeduction(T, 80000, 0), 50000);
eq('地震 旧長期20,000円超は15,000円', E.earthquakeDeduction(T, 0, 30000), 15000);
eq('地震 旧長期15,000円', E.earthquakeDeduction(T, 0, 15000), 12500);
eq('地震 両方の合計上限50,000円', E.earthquakeDeduction(T, 40000, 30000), 50000);

/* ---------- 部品: 所得金額調整控除・基礎控除・配偶者・特定親族・速算表 ---------- */
eq('調整控除 897万円・該当', E.adjustmentDeduction(T, 8970000, true), 47000);
eq('調整控除 850万円ちょうどは0', E.adjustmentDeduction(T, 8500000, true), 0);
eq('調整控除 非該当は0', E.adjustmentDeduction(T, 8970000, false), 0);
eq('調整控除 上限15万円', E.adjustmentDeduction(T, 20000000, true), 150000);
eq('調整控除 1円未満切り上げ', E.adjustmentDeduction(T, 8500001, true), 1);
eq('基礎控除 489万円ちょうど', E.basicDeduction(T, 4890000), 1040000);
eq('基礎控除 489万円超', E.basicDeduction(T, 4890001), 670000);
eq('基礎控除 655万円ちょうど', E.basicDeduction(T, 6550000), 670000);
eq('基礎控除 655万円超', E.basicDeduction(T, 6550001), 620000);
eq('基礎控除 2,500万円超は0', E.basicDeduction(T, 25000001), 0);
eq('配偶者控除 本人900万円以下・配偶者所得0', E.spouseDeduction(T, 3070400, true, 0, false).amount, 380000);
eq('配偶者控除 老人・本人950万円以下', E.spouseDeduction(T, 9400000, true, 500000, true).amount, 320000);
eq('配偶者特別控除 配偶者所得100万円・本人区分I', E.spouseDeduction(T, 5000000, true, 1000000, false).amount, 360000);
eq('配偶者特別控除 配偶者所得133万円・本人区分III', E.spouseDeduction(T, 9900000, true, 1330000, false).amount, 10000);
eq('配偶者控除等 本人1,000万円超は0', E.spouseDeduction(T, 10000001, true, 0, false).amount, 0);
eq('配偶者控除等 配偶者所得133万円超は0', E.spouseDeduction(T, 5000000, true, 1330001, false).amount, 0);
eq('特定親族 所得62万円ちょうどは0', E.specificRelativeOne(T, 620000), 0);
eq('特定親族 所得62万円超は63万円', E.specificRelativeOne(T, 620001), 630000);
eq('特定親族 所得98万円は41万円', E.specificRelativeOne(T, 980000), 410000);
eq('特定親族 所得123万円ちょうどは3万円', E.specificRelativeOne(T, 1230000), 30000);
eq('特定親族 所得123万円超は0', E.specificRelativeOne(T, 1230001), 0);
eq('速算表 課税1,805万円（上限行）', E.taxFromTable(T, 18050000), 4424000);
eq('速算表 課税195万円', E.taxFromTable(T, 1950000), 97500);

/* ---------- §6.1 公式計算例1（源泉徴収簿の通し計算・11段） ----------
 * 公式設例の「転記額」は、内訳が一致する生の入力で再現する:
 * 生命保険料控除120,000円 = 新一般100,000+介護医療100,000+新年金100,000（各40,000円・合計上限）
 * 扶養控除等1,860,000円 = 一般38万+特定扶養63万+同居老親等58万+一般の障害者27万
 * 特定親族特別控除410,000円 = 特定親族1人（合計所得金額98万円） */
{
  const r = E.compute(T, {
    income: 8970000, socialInsurance: 1386102, smallBusiness: 0, withheld: 156670,
    life: { newGeneral: 100000, oldGeneral: 0, care: 100000, newPension: 100000, oldPension: 0 },
    hasYoungDependent: true, quake: 50000, oldLongDamage: 0,
    spouse: { has: true, income: 0, elderly: false },
    specificRelatives: [980000],
    dependents: { general: 1, specific: 1, elderlyCohab: 1, elderlyOther: 0, disabledGeneral: 1, disabledSpecial: 0, disabledCohabSpecial: 0, selfStatus: 'none' },
    adjustmentEligible: true, otherIncome: 0, housing: 76500
  });
  eq('公式例1 段1 給与所得控除後の金額', r.salaryAfter, 7020000);
  eq('公式例1 段2 所得金額調整控除額', r.adjustment, 47000);
  eq('公式例1 段3 調整控除後の金額', r.salaryAfterAdj, 6973000);
  eq('公式例1 段4 基礎控除額', r.basic, 620000);
  eq('公式例1 段5 扶養控除等の合計', r.dependentEtc, 1860000);
  eq('公式例1 参考 生命保険料控除額', r.life.total, 120000);
  eq('公式例1 参考 配偶者控除額', r.spouse.amount, 380000);
  eq('公式例1 参考 特定親族特別控除額', r.specificTotal, 410000);
  eq('公式例1 段6 所得控除額の合計額', r.deductionsTotal, 4826102);
  eq('公式例1 段7 課税給与所得金額', r.taxable, 2146000);
  eq('公式例1 段8 算出所得税額', r.taxCalc, 117100);
  eq('公式例1 段9 年調所得税額', r.afterHousing, 40600);
  eq('公式例1 段10 年調年税額', r.annualTax, 41400);
  eq('公式例1 段11 過不足額（還付）', r.balance, 115270);
}

/* ---------- §6.2 公式計算例2（過不足額の精算の設例・11段） ---------- */
{
  const r = E.compute(T, {
    income: 4390000, socialInsurance: 641525, smallBusiness: 0, withheld: 51845,
    life: { newGeneral: 0, oldGeneral: 50200, care: 0, newPension: 56000, oldPension: 0 },
    hasYoungDependent: false, quake: 45000, oldLongDamage: 0,
    spouse: { has: true, income: 0, elderly: false },
    specificRelatives: [],
    dependents: { general: 1, specific: 0, elderlyCohab: 0, elderlyOther: 0, disabledGeneral: 0, disabledSpecial: 0, disabledCohabSpecial: 0, selfStatus: 'none' },
    adjustmentEligible: false, otherIncome: 0, housing: 0
  });
  eq('公式例2 段1 給与所得控除後の金額', r.salaryAfter, 3070400);
  eq('公式例2 段2 生命保険料控除額', r.life.total, 71550);
  eq('公式例2 段3 地震保険料控除額', r.earthquake, 45000);
  eq('公式例2 段4 配偶者控除額', r.spouse.amount, 380000);
  eq('公式例2 段5 扶養控除額', r.dependentEtc, 380000);
  eq('公式例2 段6 基礎控除額', r.basic, 1040000);
  eq('公式例2 段7 所得控除額の合計額', r.deductionsTotal, 2558075);
  eq('公式例2 段8 課税給与所得金額', r.taxable, 512000);
  eq('公式例2 段9 算出所得税額', r.taxCalc, 25600);
  eq('公式例2 段10 年調年税額', r.annualTax, 26100);
  eq('公式例2 段11 過不足額（還付）', r.balance, 25745);
}

/* ---------- §6.5 自前ケースC（還付・独身） ---------- */
{
  const r = E.compute(T, {
    income: 5000000, socialInsurance: 750000, smallBusiness: 0, withheld: 120000,
    life: { newGeneral: 60000, oldGeneral: 0, care: 40000, newPension: 0, oldPension: 0 },
    hasYoungDependent: false, quake: 0, oldLongDamage: 0,
    spouse: { has: false, income: 0, elderly: false },
    specificRelatives: [],
    dependents: { general: 0, specific: 0, elderlyCohab: 0, elderlyOther: 0, disabledGeneral: 0, disabledSpecial: 0, disabledCohabSpecial: 0, selfStatus: 'none' },
    adjustmentEligible: false, otherIncome: 0, housing: 0
  });
  eq('ケースC 給与所得控除後の金額', r.salaryAfter, 3560000);
  eq('ケースC 生命保険料控除額', r.life.total, 65000);
  eq('ケースC 基礎控除額', r.basic, 1040000);
  eq('ケースC 所得控除額の合計額', r.deductionsTotal, 1855000);
  eq('ケースC 課税給与所得金額', r.taxable, 1705000);
  eq('ケースC 算出所得税額', r.taxCalc, 85250);
  eq('ケースC 年調年税額', r.annualTax, 87000);
  eq('ケースC 過不足額（還付33,000円）', r.balance, 33000);
}

/* ---------- §6.5 自前ケースD（徴収・不足） ---------- */
{
  const r = E.compute(T, {
    income: 7200000, socialInsurance: 1080000, smallBusiness: 0, withheld: 290000,
    life: { newGeneral: 0, oldGeneral: 0, care: 0, newPension: 0, oldPension: 0 },
    hasYoungDependent: false, quake: 0, oldLongDamage: 0,
    spouse: { has: false, income: 0, elderly: false },
    specificRelatives: [],
    dependents: { general: 0, specific: 0, elderlyCohab: 0, elderlyOther: 0, disabledGeneral: 0, disabledSpecial: 0, disabledCohabSpecial: 0, selfStatus: 'none' },
    adjustmentEligible: false, otherIncome: 0, housing: 0
  });
  eq('ケースD 給与所得控除後の金額', r.salaryAfter, 5380000);
  eq('ケースD 基礎控除額', r.basic, 670000);
  eq('ケースD 所得控除額の合計額', r.deductionsTotal, 1750000);
  eq('ケースD 課税給与所得金額', r.taxable, 3630000);
  eq('ケースD 算出所得税額', r.taxCalc, 298500);
  eq('ケースD 年調年税額', r.annualTax, 304700);
  eq('ケースD 過不足額（徴収14,700円）', r.balance, -14700);
}

/* ---------- 監査対応（2026-11-24）: 本人区分の所得要件・2,000万円超の対象外 ---------- */
function baseInput(over) {
  return Object.assign({
    income: 0, socialInsurance: 0, smallBusiness: 0, withheld: 0,
    life: { newGeneral: 0, oldGeneral: 0, care: 0, newPension: 0, oldPension: 0 },
    hasYoungDependent: false, quake: 0, oldLongDamage: 0,
    spouse: { has: false, income: 0, elderly: false },
    specificRelatives: [],
    dependents: { general: 0, specific: 0, elderlyCohab: 0, elderlyOther: 0, disabledGeneral: 0, disabledSpecial: 0, disabledCohabSpecial: 0, selfStatus: 'none' },
    adjustmentEligible: false, otherIncome: 0, housing: 0
  }, over);
}
function withStatus(status) {
  return { general: 0, specific: 0, elderlyCohab: 0, elderlyOther: 0, disabledGeneral: 0, disabledSpecial: 0, disabledCohabSpecial: 0, selfStatus: status };
}
{
  /* ひとり親: 合計所得500万円以下が要件。1,005万円では適用されない（修正前は無条件に35万円が付いた） */
  const r = E.compute(T, baseInput({ income: 12000000, dependents: withStatus('singleParent') }));
  eq('ひとり親 所得要件超 合計所得', r.totalIncome, 10050000);
  eq('ひとり親 所得要件超 控除は付かない', r.dependentEtc, 0);
  eq('ひとり親 所得要件超 applied', r.selfStatus.applied, false);
  /* 境界: 合計所得ちょうど500万円では適用される */
  const rb = E.compute(T, baseInput({ income: 6600000, otherIncome: 160000, dependents: withStatus('singleParent') }));
  eq('ひとり親 境界500万円 合計所得', rb.totalIncome, 5000000);
  eq('ひとり親 境界500万円 控除35万円', rb.dependentEtc, 350000);
  eq('ひとり親 境界500万円 applied', rb.selfStatus.applied, true);
  /* 寡婦: 合計所得515.5万円では適用されない */
  const rw = E.compute(T, baseInput({ income: 6950000, dependents: withStatus('widow') }));
  eq('寡婦 所得要件超 控除は付かない', rw.dependentEtc, 0);
  eq('寡婦 所得要件超 applied', rw.selfStatus.applied, false);
  /* 勤労学生: 令和8年分の要件は合計所得89万円以下（国税庁 No.1175）。
   * 95万円では付かず、80万円では付く */
  const rs1 = E.compute(T, baseInput({ income: 1690000, dependents: withStatus('workingStudent') }));
  eq('勤労学生 合計所得95万円', rs1.totalIncome, 950000);
  eq('勤労学生 95万円 控除は付かない', rs1.dependentEtc, 0);
  const rs2 = E.compute(T, baseInput({ income: 1540000, dependents: withStatus('workingStudent') }));
  eq('勤労学生 合計所得80万円', rs2.totalIncome, 800000);
  eq('勤労学生 80万円 控除27万円', rs2.dependentEtc, 270000);
  /* 給与収入2,000万円超は年末調整の対象外（アプリは overIncomeLimit で対象外表示に切り替える） */
  const ro = E.compute(T, baseInput({ income: 25000000, withheld: 500000 }));
  eq('2,000万円超 overIncomeLimit', ro.overIncomeLimit, true);
  const rn = E.compute(T, baseInput({ income: 20000000, withheld: 500000 }));
  eq('2,000万円ちょうど overIncomeLimit でない', rn.overIncomeLimit, false);
}

console.log(fails === 0 ? 'ALL NENCHO CHECKS PASSED' : `${fails} FAILURES`);
process.exit(fails ? 1 : 0);

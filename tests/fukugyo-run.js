/* 副業の税金・申告要否チェッカー エンジンの検算
 * 基準: 仕様書 tax-tools-spec-12-fukugyo.md §6（検算ケース6件）
 * ケース1〜6の税額は既存エンジン（第5・6・7弾で検証済み）の合成による実測値であり、
 * 本テストでは合成した部品の出力が仕様の値と一致することを確認する。
 * あわせて §4 の整合確認（部品合成 = NenchoEngine.compute の annualTax）と、
 * 判定の境界（20万円ちょうど／200,001円、150万円テスト、2,000万円）を確認する。
 */
const fs = require('fs');
const path = require('path');
const E = require('../js/fukugyo-engine.js');
const NenchoEngine = require('../js/nencho-engine.js');

function load(p) { return JSON.parse(fs.readFileSync(path.join(__dirname, p), 'utf8')); }
const DATA = {
  tables: load('../data/nencho/tables-2026.json'),
  rules: load('../data/juminzei/rules.json'),
  kenpo: load('../data/kenpo/rates-2026.json'),
  shahoParams: load('../data/shaho/params-2026.json')
};

let fails = 0;
function eq(name, actual, expected) {
  const ok = actual === expected;
  if (!ok) fails++;
  console.log(`${ok ? 'PASS' : 'FAIL'} ${name}: expected=${expected} actual=${actual}`);
}
/* 共通条件: 本業1か所・単身・東京都・40歳未満・一般の事業・賞与なし */
function base(over) {
  return Object.assign({
    mainIncome: 5000000, prefecture: '東京都', ageBand: 'under40', industry: 'general',
    bonusPer: 0, bonusCount: 0, socialOverride: null,
    sideType: 'nonsalary', sideRevenue: 0, sideExpenses: 0, sideCategory: 'misc',
    sideWithholding: null, sideSalaryIncome: 0, sideYearEndAdjusted: false,
    willFile: false
  }, over || {});
}

/* ---------- §4 整合確認: 部品合成 = NenchoEngine.compute ---------- */
{
  const part = E.incomeTaxCalc(DATA.tables, 5000000, 723132, 0);
  const full = NenchoEngine.compute(DATA.tables, {
    income: 5000000, socialInsurance: 723132, smallBusiness: 0, withheld: 0,
    housing: 0, otherIncome: 0,
    life: { newGeneral: 0, oldGeneral: 0, care: 0, newPension: 0, oldPension: 0 },
    hasYoungDependent: false, quake: 0, oldLongDamage: 0,
    spouse: { has: false, income: 0, elderly: false },
    specificRelatives: [],
    dependents: {
      general: 0, specific: 0, elderlyCohab: 0, elderlyOther: 0,
      disabledGeneral: 0, disabledSpecial: 0, disabledCohabSpecial: 0, selfStatus: 'none'
    },
    adjustmentEligible: false
  });
  eq('整合 部品合成の年税額', part.annualTax, 91600);
  eq('整合 NenchoEngine.compute と一致', part.annualTax, full.annualTax);
}

/* ---------- §6.1 ケース1: 基本ケース（雑所得30万円） ---------- */
{
  const r = E.compute(DATA, base({ sideRevenue: 500000, sideExpenses: 200000 }));
  eq('ケース1 エラーなし', r.errors.length, 0);
  eq('ケース1 社会保険料（ShahoEngine実測）', r.social.total, 723132);
  eq('ケース1 副業所得', r.sideIncome, 300000);
  eq('ケース1 確定申告は必要', r.filing.status, 'required');
  eq('ケース1 判定理由', r.filing.code, 'side-over-200k');
  eq('ケース1 住民税申告は不要（確定申告が兼ねる）', r.residentFiling.status, 'not-required');
  eq('ケース1 住民税の理由', r.residentFiling.code, 'covered-by-filing');
  eq('ケース1 所得税 課税所得（なし）', r.incomeTax.without.taxable, 1796000);
  eq('ケース1 所得税 年税額（なし）', r.incomeTax.without.annualTax, 91600);
  eq('ケース1 所得税 課税所得（あり）', r.incomeTax.with.taxable, 2096000);
  eq('ケース1 所得税 年税額（あり）', r.incomeTax.with.annualTax, 114400);
  eq('ケース1 追加の所得税', r.incomeTax.diff, 22800);
  eq('ケース1 所得税の意味づけ（精算される追加額）', r.incomeTax.meaning, 'settle');
  eq('ケース1 住民税 課税所得（なし）', r.residentTax.without.taxable, 2406000);
  eq('ケース1 住民税（なし）', r.residentTax.without.tax, 243100);
  eq('ケース1 住民税 課税所得（あり）', r.residentTax.with.taxable, 2706000);
  eq('ケース1 住民税（あり）', r.residentTax.with.tax, 273100);
  eq('ケース1 追加の住民税', r.residentTax.diff, 30000);
  eq('ケース1 追加税額の合計', r.totalDiff, 52800);
}

/* ---------- §6.2 ケース2: 境界（副業所得ちょうど20万円） ---------- */
{
  const r = E.compute(DATA, base({ sideRevenue: 350000, sideExpenses: 150000 }));
  eq('ケース2 副業所得', r.sideIncome, 200000);
  eq('ケース2 確定申告は不要（超えていない）', r.filing.status, 'not-required');
  eq('ケース2 判定理由', r.filing.code, 'side-within-200k');
  eq('ケース2 住民税申告は必要', r.residentFiling.status, 'required');
  eq('ケース2 住民税の理由', r.residentFiling.code, 'resident-only');
  eq('ケース2 住民税（あり）', r.residentTax.with.tax, 263100);
  eq('ケース2 追加の住民税（実際に課税される）', r.residentTax.diff, 20000);
  eq('ケース2 所得税は参考値として分離', r.incomeTax.meaning, 'reference');
  eq('ケース2 参考値 年税額（あり）', r.incomeTax.with.annualTax, 104200);
  eq('ケース2 参考値 追加の所得税', r.incomeTax.diff, 12600);
}

/* ---------- §6.3 ケース3: 経費を引いたら20万円以下 ---------- */
{
  const r = E.compute(DATA, base({ sideRevenue: 450000, sideExpenses: 280000 }));
  eq('ケース3 副業所得（判定は所得で行う）', r.sideIncome, 170000);
  eq('ケース3 確定申告は不要', r.filing.status, 'not-required');
  eq('ケース3 住民税申告は必要', r.residentFiling.status, 'required');
  eq('ケース3 住民税（あり）', r.residentTax.with.tax, 260100);
  eq('ケース3 追加の住民税', r.residentTax.diff, 17000);
  eq('ケース3 参考値 追加の所得税', r.incomeTax.diff, 9500);
}

/* ---------- §6.4 ケース4: 境界（副業所得200,001円） ---------- */
{
  const r = E.compute(DATA, base({ sideRevenue: 200001, sideExpenses: 0 }));
  eq('ケース4 副業所得', r.sideIncome, 200001);
  eq('ケース4 1円超えで確定申告が必要', r.filing.status, 'required');
  eq('ケース4 追加の所得税（ケース2と同額）', r.incomeTax.diff, 12600);
  eq('ケース4 追加の住民税（ケース2と同額）', r.residentTax.diff, 20000);
}

/* ---------- §6.5 ケース5: 副業が給与（2か所給与） ---------- */
{
  const r = E.compute(DATA, base({
    sideType: 'salary', sideSalaryIncome: 250000, sideYearEndAdjusted: false
  }));
  eq('ケース5 確定申告は必要', r.filing.status, 'required');
  eq('ケース5 判定理由', r.filing.code, 'salary-over-200k');
  eq('ケース5 住民税申告は不要', r.residentFiling.status, 'not-required');
  eq('ケース5 住民税の理由（給与支払報告書）', r.residentFiling.code, 'salary-report');
  eq('ケース5 合算後の給与所得', r.incomeTax.with.salaryAfter, 3758400);
  eq('ケース5 所得税 課税所得（あり）', r.incomeTax.with.taxable, 1995000);
  eq('ケース5 所得税 年税額（あり）', r.incomeTax.with.annualTax, 104100);
  eq('ケース5 追加の所得税', r.incomeTax.diff, 12500);
  eq('ケース5 住民税（あり）', r.residentTax.with.tax, 263100);
  eq('ケース5 追加の住民税', r.residentTax.diff, 20000);
}

/* ---------- §6.6 ケース6: 住民税だけが発生（非課税ライン跨ぎ） ---------- */
{
  const r = E.compute(DATA, base({
    mainIncome: 1100000, sideRevenue: 200000, sideExpenses: 50000
  }));
  eq('ケース6 社会保険料（ShahoEngine実測）', r.social.total, 155340);
  eq('ケース6 副業所得', r.sideIncome, 150000);
  eq('ケース6 確定申告は不要', r.filing.status, 'not-required');
  eq('ケース6 住民税申告は必要', r.residentFiling.status, 'required');
  eq('ケース6 給与所得（所得税・最低保障74万円）', r.incomeTax.without.salaryAfter, 360000);
  eq('ケース6 追加の所得税は0円', r.incomeTax.diff, 0);
  eq('ケース6 住民税（なし）は非課税で0円', r.residentTax.without.tax, 0);
  eq('ケース6 住民税 課税所得（あり）', r.residentTax.with.taxable, 14000);
  eq('ケース6 住民税 調整控除（あり）', r.residentTax.with.adjustment, 700);
  eq('ケース6 住民税 所得割（あり）', r.residentTax.with.incomeLevy, 700);
  eq('ケース6 住民税（あり）', r.residentTax.with.tax, 5700);
  eq('ケース6 追加の住民税（簡易計算では出ない数字）', r.residentTax.diff, 5700);
}

/* ---------- 判定の境界・分岐 ---------- */
{
  /* 医療費控除などで申告予定あり → 20万円以下でも「する」に切り替わる（§1.4） */
  const r = E.compute(DATA, base({ sideRevenue: 350000, sideExpenses: 150000, willFile: true }));
  eq('分岐 申告予定ありは will-file', r.filing.status, 'will-file');
  eq('分岐 その場合の所得税は精算される追加額', r.incomeTax.meaning, 'settle');
  eq('分岐 住民税申告は確定申告が兼ねる', r.residentFiling.code, 'covered-by-filing');

  /* 本業の給与収入2,000万円超 → 副業なしでも必要（§1.3） */
  const r2 = E.compute(DATA, base({ mainIncome: 20000001, sideRevenue: 0, sideExpenses: 0 }));
  eq('分岐 2,000万円超は必要', r2.filing.status, 'required');
  eq('分岐 2,000万円超の理由', r2.filing.code, 'over-2000man');

  /* 副業が赤字 → 所得0として扱い、税額に影響させない（§1.2） */
  const r3 = E.compute(DATA, base({ sideRevenue: 100000, sideExpenses: 150000 }));
  eq('分岐 赤字は所得0', r3.sideIncome, 0);
  eq('分岐 赤字で追加税額は0', r3.totalDiff, 0);
  eq('分岐 赤字でも住民税申告は必要（原則）', r3.residentFiling.status, 'required');

  /* 2か所給与: 副業先で年末調整を受けた → 未調整額0で不要 */
  const r4 = E.compute(DATA, base({
    sideType: 'salary', sideSalaryIncome: 250000, sideYearEndAdjusted: true
  }));
  eq('分岐 副業先で年末調整済みなら不要', r4.filing.status, 'not-required');
  eq('分岐 その理由', r4.filing.code, 'salary-within-200k');
  eq('分岐 住民税は給与支払報告書で不要', r4.residentFiling.code, 'salary-report');

  /* 2か所給与: 150万円テスト（社会保険料を入力で固定して境界を確認） */
  const r5 = E.compute(DATA, base({
    mainIncome: 1000000, sideType: 'salary', sideSalaryIncome: 600000,
    sideYearEndAdjusted: false, socialOverride: 100000
  }));
  eq('分岐 150万円テスト ちょうど150万円は不要', r5.filing.status, 'not-required');
  eq('分岐 150万円テストの理由', r5.filing.code, 'salary-150-test');
  const r6 = E.compute(DATA, base({
    mainIncome: 1000000, sideType: 'salary', sideSalaryIncome: 600000,
    sideYearEndAdjusted: false, socialOverride: 99999
  }));
  eq('分岐 150万円テスト 1円超えは必要', r6.filing.status, 'required');
  eq('分岐 150万円テスト超えの理由', r6.filing.code, 'salary-over-200k');

  /* その他の所得 → 対象外 */
  const r7 = E.compute(DATA, base({ sideType: 'other' }));
  eq('分岐 その他は対象外フラグ', r7.outOfScope, true);
}

/* ---------- 源泉徴収済み額との精算目安（§1.7） ---------- */
{
  const r = E.compute(DATA, base({
    sideRevenue: 500000, sideExpenses: 200000, sideWithholding: 30630
  }));
  eq('精算 源泉徴収済み額', r.settlement.withholding, 30630);
  eq('精算 還付の目安（22,800 − 30,630）', r.settlement.amount, -7830);
  eq('精算 マイナスは還付', r.settlement.isRefund, true);

  const r2 = E.compute(DATA, base({
    sideRevenue: 500000, sideExpenses: 200000, sideWithholding: 10000
  }));
  eq('精算 納付の目安（22,800 − 10,000）', r2.settlement.amount, 12800);
  eq('精算 プラスは納付', r2.settlement.isRefund, false);

  /* 申告不要のときは精算表示を出さない */
  const r3 = E.compute(DATA, base({
    sideRevenue: 350000, sideExpenses: 150000, sideWithholding: 10000
  }));
  eq('精算 申告不要なら精算は出さない', r3.settlement, null);

  /* 社会保険料の入力優先（M6） */
  const r4 = E.compute(DATA, base({ sideRevenue: 500000, sideExpenses: 200000, socialOverride: 700000 }));
  eq('入力 社会保険料は入力値が優先', r4.social.total, 700000);
  eq('入力 社会保険料 fromInput', r4.social.fromInput, true);
}

console.log(fails === 0 ? 'ALL FUKUGYO CHECKS PASSED' : `${fails} FAILURES`);
process.exit(fails ? 1 : 0);
